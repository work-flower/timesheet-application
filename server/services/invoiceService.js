import { clients, projects, timesheets, expenses, invoices, settings } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';

export async function getAll(query = {}) {
  const baseFilter = {};

  if (query.clientId) baseFilter.clientId = query.clientId;
  if (query.status) baseFilter.status = query.status;
  if (query.startDate || query.endDate) {
    baseFilter.invoiceDate = {};
    if (query.startDate) baseFilter.invoiceDate.$gte = query.startDate;
    if (query.endDate) baseFilter.invoiceDate.$lte = query.endDate;
  }

  const { results, totalCount } = await buildQuery(invoices, query, { createdAt: -1 }, baseFilter);

  const allClients = await clients.find({});
  const clientMap = Object.fromEntries(allClients.map(c => [c._id, c]));

  const enriched = results.map(inv => ({
    ...inv,
    clientName: clientMap[inv.clientId]?.companyName || 'Unknown',
  }));

  if (query.$expand) {
    const expands = query.$expand.split(',').map(s => s.trim());
    for (const item of enriched) {
      if (expands.includes('client')) {
        item.client = clientMap[item.clientId] || null;
      }
    }
  }

  const items = applySelect(enriched, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
}

export async function getById(id) {
  const invoice = await invoices.findOne({ _id: id });
  if (!invoice) return null;

  const client = await clients.findOne({ _id: invoice.clientId });
  const allProjects = await projects.find({ clientId: invoice.clientId });

  const clientProjects = allProjects.map(p => ({
    _id: p._id,
    name: p.name,
    effectiveRate: p.rate != null ? p.rate : (client?.defaultRate || 0),
    vatPercent: p.vatPercent ?? null,
  }));

  return {
    ...invoice,
    clientName: client?.companyName || 'Unknown',
    client,
    clientProjects,
  };
}

export async function create(data) {
  const client = await clients.findOne({ _id: data.clientId });
  if (!client) throw new Error('Client not found');

  const settingsDoc = await settings.findOne({});
  const paymentTermDays = settingsDoc?.defaultPaymentTermDays || 10;

  const invoiceDate = data.invoiceDate || new Date().toISOString().split('T')[0];
  const dueDate = data.dueDate || computeDueDate(invoiceDate, paymentTermDays);

  const lines = Array.isArray(data.lines) ? data.lines : [];
  const { subtotal, totalVat, total } = computeTotalsFromLines(lines);

  const now = new Date().toISOString();
  const invoice = {
    clientId: data.clientId,
    status: 'draft',
    invoiceNumber: null,
    invoiceDate,
    dueDate,
    servicePeriodStart: data.servicePeriodStart || '',
    servicePeriodEnd: data.servicePeriodEnd || '',
    additionalNotes: data.additionalNotes || '',
    lines,
    includeTimesheetReport: data.includeTimesheetReport || false,
    includeExpenseReport: data.includeExpenseReport || false,
    paymentStatus: 'unpaid',
    paidDate: null,
    subtotal,
    totalVat,
    total,
    createdAt: now,
    updatedAt: now,
  };

  const created = await invoices.insert(invoice);
  return getById(created._id);
}

export async function update(id, data) {
  const existing = await invoices.findOne({ _id: id });
  if (!existing) throw new Error('Invoice not found');
  if (existing.status === 'posted') throw new Error('Posted invoices cannot be edited');

  const now = new Date().toISOString();
  const updateData = { ...data, updatedAt: now };
  delete updateData._id;
  delete updateData.createdAt;
  // Protected fields — cannot be changed via update
  delete updateData.status;
  delete updateData.invoiceNumber;
  delete updateData.paymentStatus;
  delete updateData.paidDate;

  if (updateData.clientId && existing.status === 'confirmed' && updateData.clientId !== existing.clientId) {
    throw new Error('Client cannot be changed on confirmed invoices');
  }

  // Recompute totals when lines change
  if (updateData.lines) {
    const { subtotal, totalVat, total } = computeTotalsFromLines(updateData.lines);
    updateData.subtotal = subtotal;
    updateData.totalVat = totalVat;
    updateData.total = total;
  }

  await invoices.update({ _id: id }, { $set: updateData });
  return getById(id);
}

export async function remove(id) {
  const invoice = await invoices.findOne({ _id: id });
  if (!invoice) throw new Error('Invoice not found');
  if (invoice.status !== 'draft') throw new Error('Only draft invoices can be deleted');

  return invoices.remove({ _id: id });
}

export async function confirm(id) {
  const invoice = await invoices.findOne({ _id: id });
  if (!invoice) throw new Error('Invoice not found');
  if (invoice.status !== 'draft') throw new Error('Only draft invoices can be confirmed');

  // Consistency check must pass
  const conflicts = await consistencyCheck(id);
  if (conflicts.length > 0) {
    throw new Error('Consistency check failed: ' + conflicts.map(c => c.message).join('; '));
  }

  // Assign invoice number
  const settingsDoc = await settings.findOne({});
  const currentSeed = settingsDoc?.invoiceNumberSeed || 0;
  const nextNumber = currentSeed + 1;
  const invoiceNumber = `JBL${String(nextNumber).padStart(5, '0')}`;
  await settings.update({ _id: settingsDoc._id }, { $set: { invoiceNumberSeed: nextNumber } });

  // Lock timesheets and expenses
  const tsIds = getSourceIds(invoice.lines, 'timesheet');
  const expIds = getSourceIds(invoice.lines, 'expense');

  if (tsIds.length) {
    await timesheets.update(
      { _id: { $in: tsIds } },
      { $set: { invoiceId: id } },
      { multi: true }
    );
  }
  if (expIds.length) {
    await expenses.update(
      { _id: { $in: expIds } },
      { $set: { invoiceId: id } },
      { multi: true }
    );
  }

  const now = new Date().toISOString();
  await invoices.update({ _id: id }, {
    $set: { status: 'confirmed', invoiceNumber, updatedAt: now }
  });

  return getById(id);
}

export async function post(id) {
  const invoice = await invoices.findOne({ _id: id });
  if (!invoice) throw new Error('Invoice not found');
  if (invoice.status !== 'confirmed') throw new Error('Only confirmed invoices can be posted');

  const now = new Date().toISOString();
  await invoices.update({ _id: id }, { $set: { status: 'posted', updatedAt: now } });
  return getById(id);
}

export async function unconfirm(id) {
  const invoice = await invoices.findOne({ _id: id });
  if (!invoice) throw new Error('Invoice not found');
  if (invoice.status !== 'confirmed') throw new Error('Only confirmed invoices can be unconfirmed');

  // Unlock items
  const tsIds = getSourceIds(invoice.lines, 'timesheet');
  const expIds = getSourceIds(invoice.lines, 'expense');

  if (tsIds.length) {
    await timesheets.update(
      { _id: { $in: tsIds } },
      { $unset: { invoiceId: true } },
      { multi: true }
    );
  }
  if (expIds.length) {
    await expenses.update(
      { _id: { $in: expIds } },
      { $unset: { invoiceId: true } },
      { multi: true }
    );
  }

  // Release invoice number
  const settingsDoc = await settings.findOne({});
  if (settingsDoc?.invoiceNumberSeed > 0) {
    await settings.update({ _id: settingsDoc._id }, {
      $set: { invoiceNumberSeed: settingsDoc.invoiceNumberSeed - 1 }
    });
  }

  const now = new Date().toISOString();
  await invoices.update({ _id: id }, {
    $set: { status: 'draft', invoiceNumber: null, updatedAt: now }
  });

  return getById(id);
}

export async function updatePayment(id, data) {
  const invoice = await invoices.findOne({ _id: id });
  if (!invoice) throw new Error('Invoice not found');
  if (invoice.status !== 'posted') throw new Error('Payment status can only be changed on posted invoices');

  const updateData = { updatedAt: new Date().toISOString() };
  if (data.paymentStatus) updateData.paymentStatus = data.paymentStatus;
  if (data.paidDate !== undefined) updateData.paidDate = data.paidDate;

  await invoices.update({ _id: id }, { $set: updateData });
  return getById(id);
}

export async function recalculate(id) {
  const invoice = await invoices.findOne({ _id: id });
  if (!invoice) throw new Error('Invoice not found');

  const allProjects = await projects.find({});
  const projectMap = Object.fromEntries(allProjects.map(p => [p._id, p]));
  const allClients = await clients.find({});
  const clientMap = Object.fromEntries(allClients.map(c => [c._id, c]));

  const updatedLines = [];

  for (const line of (invoice.lines || [])) {
    if (line.type === 'timesheet' && line.sourceId) {
      const ts = await timesheets.findOne({ _id: line.sourceId });
      if (!ts) {
        // Source deleted — keep line but flag
        updatedLines.push({ ...line, _sourceDeleted: true });
        continue;
      }
      const project = projectMap[ts.projectId];
      const client = project ? clientMap[project.clientId] : null;
      const effectiveRate = project?.rate != null ? project.rate : (client?.defaultRate || 0);
      const vatPercent = project?.vatPercent ?? null;
      const netAmount = ts.amount || 0;
      const vatAmount = vatPercent != null ? round2(netAmount * (vatPercent / 100)) : 0;

      updatedLines.push({
        ...line,
        projectId: ts.projectId,
        description: project?.name || line.description,
        date: ts.date,
        hours: ts.hours,
        quantity: ts.days || 0,
        unitPrice: effectiveRate,
        vatPercent,
        netAmount,
        vatAmount,
        grossAmount: round2(netAmount + vatAmount),
      });
    } else if (line.type === 'expense' && line.sourceId) {
      const exp = await expenses.findOne({ _id: line.sourceId });
      if (!exp) {
        updatedLines.push({ ...line, _sourceDeleted: true });
        continue;
      }
      const netAmount = round2((exp.amount || 0) - (exp.vatAmount || 0));

      updatedLines.push({
        ...line,
        projectId: exp.projectId,
        description: [exp.expenseType, exp.description].filter(Boolean).join(' - '),
        date: exp.date,
        expenseType: exp.expenseType,
        quantity: 1,
        unit: 'item',
        unitPrice: netAmount,
        vatPercent: exp.vatPercent || 0,
        netAmount,
        vatAmount: exp.vatAmount || 0,
        grossAmount: exp.amount || 0,
      });
    } else {
      // Write-in: recompute from quantity x unitPrice
      const netAmount = round2((line.quantity || 0) * (line.unitPrice || 0));
      const vatAmount = line.vatPercent != null ? round2(netAmount * (line.vatPercent / 100)) : 0;

      updatedLines.push({
        ...line,
        netAmount,
        vatAmount,
        grossAmount: round2(netAmount + vatAmount),
      });
    }
  }

  const { subtotal, totalVat, total } = computeTotalsFromLines(updatedLines);

  await invoices.update({ _id: id }, {
    $set: {
      lines: updatedLines,
      subtotal,
      totalVat,
      total,
      updatedAt: new Date().toISOString(),
    }
  });

  return getById(id);
}

export async function consistencyCheck(id) {
  const invoice = await invoices.findOne({ _id: id });
  if (!invoice) throw new Error('Invoice not found');

  const allProjects = await projects.find({});
  const projectMap = Object.fromEntries(allProjects.map(p => [p._id, p]));
  const allClients = await clients.find({});
  const clientMap = Object.fromEntries(allClients.map(c => [c._id, c]));

  const conflicts = [];

  for (const line of (invoice.lines || [])) {
    if (line.type === 'timesheet' && line.sourceId) {
      const ts = await timesheets.findOne({ _id: line.sourceId });
      if (!ts) {
        conflicts.push({
          lineId: line.id, type: 'timesheet', sourceId: line.sourceId,
          message: `Timesheet (${line.date || 'unknown date'}) has been deleted`,
        });
        continue;
      }

      // Check locking
      if (ts.invoiceId && ts.invoiceId !== id) {
        const otherInvoice = await invoices.findOne({ _id: ts.invoiceId });
        conflicts.push({
          lineId: line.id, type: 'timesheet', sourceId: line.sourceId,
          message: `Timesheet ${ts.date} is locked to invoice ${otherInvoice?.invoiceNumber || 'Draft'}`,
        });
      }

      // Check value drift
      const project = projectMap[ts.projectId];
      const client = project ? clientMap[project.clientId] : null;
      const effectiveRate = project?.rate != null ? project.rate : (client?.defaultRate || 0);
      const currentNet = ts.amount || 0;
      const currentVatPct = project?.vatPercent ?? null;

      if (Math.abs((line.netAmount || 0) - currentNet) > 0.01) {
        conflicts.push({
          lineId: line.id, type: 'timesheet', sourceId: line.sourceId,
          field: 'amount',
          message: `Timesheet ${ts.date}: amount changed from £${(line.netAmount || 0).toFixed(2)} to £${currentNet.toFixed(2)}`,
        });
      }
      if (line.vatPercent !== currentVatPct) {
        conflicts.push({
          lineId: line.id, type: 'timesheet', sourceId: line.sourceId,
          field: 'vatPercent',
          message: `Timesheet ${ts.date}: VAT rate changed from ${line.vatPercent ?? 'N/A'}% to ${currentVatPct ?? 'N/A'}%`,
        });
      }
      if (Math.abs((line.unitPrice || 0) - effectiveRate) > 0.01) {
        conflicts.push({
          lineId: line.id, type: 'timesheet', sourceId: line.sourceId,
          field: 'rate',
          message: `Timesheet ${ts.date}: rate changed from £${(line.unitPrice || 0).toFixed(2)} to £${effectiveRate.toFixed(2)}`,
        });
      }
    } else if (line.type === 'expense' && line.sourceId) {
      const exp = await expenses.findOne({ _id: line.sourceId });
      if (!exp) {
        conflicts.push({
          lineId: line.id, type: 'expense', sourceId: line.sourceId,
          message: `Expense (${line.date || 'unknown date'}) has been deleted`,
        });
        continue;
      }

      // Check locking
      if (exp.invoiceId && exp.invoiceId !== id) {
        const otherInvoice = await invoices.findOne({ _id: exp.invoiceId });
        conflicts.push({
          lineId: line.id, type: 'expense', sourceId: line.sourceId,
          message: `Expense ${exp.date} is locked to invoice ${otherInvoice?.invoiceNumber || 'Draft'}`,
        });
      }

      // Check value drift
      if (Math.abs((line.grossAmount || 0) - (exp.amount || 0)) > 0.01) {
        conflicts.push({
          lineId: line.id, type: 'expense', sourceId: line.sourceId,
          field: 'amount',
          message: `Expense ${exp.date}: amount changed from £${(line.grossAmount || 0).toFixed(2)} to £${(exp.amount || 0).toFixed(2)}`,
        });
      }
      if (Math.abs((line.vatAmount || 0) - (exp.vatAmount || 0)) > 0.01) {
        conflicts.push({
          lineId: line.id, type: 'expense', sourceId: line.sourceId,
          field: 'vatAmount',
          message: `Expense ${exp.date}: VAT changed from £${(line.vatAmount || 0).toFixed(2)} to £${(exp.vatAmount || 0).toFixed(2)}`,
        });
      }
    }
  }

  return conflicts;
}

export async function getNextInvoiceNumber() {
  const settingsDoc = await settings.findOne({});
  const nextNumber = (settingsDoc?.invoiceNumberSeed || 0) + 1;
  return `JBL${String(nextNumber).padStart(5, '0')}`;
}

// Remove all invoices for a client (cascade delete)
export async function removeByClientId(clientId) {
  const clientInvoices = await invoices.find({ clientId });
  for (const inv of clientInvoices) {
    if (inv.status === 'confirmed' || inv.status === 'posted') {
      const tsIds = getSourceIds(inv.lines, 'timesheet');
      const expIds = getSourceIds(inv.lines, 'expense');
      if (tsIds.length) {
        await timesheets.update(
          { _id: { $in: tsIds } },
          { $unset: { invoiceId: true } },
          { multi: true }
        );
      }
      if (expIds.length) {
        await expenses.update(
          { _id: { $in: expIds } },
          { $unset: { invoiceId: true } },
          { multi: true }
        );
      }
    }
  }
  return invoices.remove({ clientId }, { multi: true });
}

// --- Helpers ---

function getSourceIds(lines, type) {
  return (lines || [])
    .filter(l => l.type === type && l.sourceId)
    .map(l => l.sourceId);
}

function computeTotalsFromLines(lines) {
  let subtotal = 0;
  let totalVat = 0;
  for (const line of (lines || [])) {
    subtotal += line.netAmount || 0;
    totalVat += line.vatAmount || 0;
  }
  return {
    subtotal: round2(subtotal),
    totalVat: round2(totalVat),
    total: round2(subtotal + totalVat),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function computeDueDate(invoiceDate, days) {
  const d = new Date(invoiceDate + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
