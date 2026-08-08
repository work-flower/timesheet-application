import { clients, projects, timesheets, expenses } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';
import { applyExpand } from '../expand.js';
import { removeAllAttachments } from './expenseAttachmentService.js';
import { removeByClientId as removeInvoicesByClientId } from './invoiceService.js';
import { assertNotLocked } from './lockCheck.js';

export async function getAll(query = {}) {
  const { results, totalCount } = await buildQuery(clients, query, { companyName: 1 });

  await applyExpand('clients', results, query.$expand);

  const items = applySelect(results, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
}

// Lean read model: stored fields only. Related records (projects, timesheets,
// expenses, invoices) come from their own list endpoints with ?clientId= —
// see the $expand relationship map in server/expand.js.
export async function getById(id) {
  return clients.findOne({ _id: id });
}

export async function create(data) {
  const now = new Date().toISOString();
  const client = await clients.insert({
    companyName: data.companyName || '',
    primaryContactName: data.primaryContactName || '',
    primaryContactEmail: data.primaryContactEmail || '',
    primaryContactPhone: data.primaryContactPhone || '',
    defaultRate: data.defaultRate || 0,
    currency: data.currency || 'GBP',
    workingHoursPerDay: data.workingHoursPerDay ?? 8,
    invoicingEntityName: data.invoicingEntityName || '',
    invoicingEntityAddress: data.invoicingEntityAddress || '',
    notes: data.notes || '',
    createdAt: now,
    updatedAt: now,
  });

  // Auto-create default project
  await projects.insert({
    clientId: client._id,
    endClientId: null,
    name: 'Default Project',
    ir35Status: data.ir35Status || 'OUTSIDE_IR35',
    rate: null,
    workingHoursPerDay: null,
    vatPercent: data.vatPercent != null ? Number(data.vatPercent) : 20,
    isDefault: true,
    status: 'active',
    notes: '',
    createdAt: now,
    updatedAt: now,
  });

  return client;
}

export async function update(id, data) {
  const existing = await clients.findOne({ _id: id });
  assertNotLocked(existing);

  const now = new Date().toISOString();
  const updateData = { ...data, updatedAt: now };
  delete updateData._id;
  delete updateData.createdAt;
  delete updateData.isLocked;
  delete updateData.isLockedReason;
  // Read-model echoes — persisting them stores unscoped snapshots of related
  // records on the client doc, which then leak past row-level security
  delete updateData.projects;
  delete updateData.timesheets;
  delete updateData.expenses;
  delete updateData.invoices;
  delete updateData.clientName;
  await clients.update({ _id: id }, { $set: updateData });
  return clients.findOne({ _id: id });
}

export async function remove(id) {
  const existing = await clients.findOne({ _id: id });
  assertNotLocked(existing);

  // Cascade: delete all timesheets for this client's projects, then projects, then client
  const clientProjects = await projects.find({ clientId: id });
  const projectIds = clientProjects.map((p) => p._id);

  if (projectIds.length > 0) {
    await timesheets.remove({ projectId: { $in: projectIds } }, { multi: true });
    // Cascade delete expenses + attachment files
    const clientExpenses = await expenses.find({ projectId: { $in: projectIds } });
    for (const exp of clientExpenses) {
      await removeAllAttachments(exp._id);
    }
    await expenses.remove({ projectId: { $in: projectIds } }, { multi: true });
  }
  await projects.remove({ clientId: id }, { multi: true });
  // Cascade delete invoices (unlocks any locked items first)
  await removeInvoicesByClientId(id);
  return clients.remove({ _id: id });
}
