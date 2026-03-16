import { clients, projects, expenses, transactions } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';
import { removeAllAttachments } from './expenseAttachmentService.js';
import { assertNotLocked } from './lockCheck.js';
import { computeVat } from '../../shared/expenseVatCalc.js';

export async function getAll(query = {}) {
  // Build base filter from legacy params
  const baseFilter = {};

  if (query.projectId) {
    baseFilter.projectId = query.projectId;
  } else if (query.clientId) {
    const clientProjects = await projects.find({ clientId: query.clientId });
    const projectIds = clientProjects.map((p) => p._id);
    baseFilter.projectId = { $in: projectIds };
  }

  if (query.startDate || query.endDate) {
    baseFilter.date = {};
    if (query.startDate) baseFilter.date.$gte = query.startDate;
    if (query.endDate) baseFilter.date.$lte = query.endDate;
  }

  if (query.expenseType) {
    baseFilter.expenseType = query.expenseType;
  }

  // Virtual isLinked filter — intercept from $filter before OData parsing
  let queryForOData = query;
  if (query.$filter) {
    const m = query.$filter.match(/\bisLinked\s+eq\s+(true|false)\b/i);
    if (m) {
      if (m[1].toLowerCase() === 'true') {
        baseFilter['transactions.0'] = { $exists: true };
      } else {
        baseFilter['transactions.0'] = { $exists: false };
      }
      // Strip isLinked clause from $filter
      const cleaned = query.$filter
        .replace(/\s+and\s+isLinked\s+eq\s+(?:true|false)/gi, '')
        .replace(/isLinked\s+eq\s+(?:true|false)\s+and\s+/gi, '')
        .replace(/isLinked\s+eq\s+(?:true|false)/gi, '')
        .trim();
      queryForOData = { ...query, $filter: cleaned || undefined };
    }
  }

  // OData query merged with base filter
  const { results: entries, totalCount, summaryData } = await buildQuery(
    expenses, queryForOData, { date: -1 }, baseFilter
  );

  // Enrich with project and client info
  const allProjects = await projects.find({});
  const allClients = await clients.find({});
  const projectMap = Object.fromEntries(allProjects.map((p) => [p._id, p]));
  const clientMap = Object.fromEntries(allClients.map((c) => [c._id, c]));

  const enriched = entries.map((entry) => {
    const project = projectMap[entry.projectId];
    const client = project ? clientMap[project.clientId] : null;

    return {
      ...entry,
      projectName: project?.name || 'Unknown',
      clientName: client?.companyName || 'Unknown',
      clientId: project?.clientId || null,
    };
  });

  // $expand
  if (query.$expand) {
    const expands = query.$expand.split(',').map(s => s.trim());
    for (const item of enriched) {
      if (expands.includes('project')) {
        item.project = projectMap[item.projectId] || null;
      }
      if (expands.includes('client')) {
        const project = projectMap[item.projectId];
        item.client = project ? (clientMap[project.clientId] || null) : null;
      }
    }
  }

  const items = applySelect(enriched, queryForOData.$select);
  return formatResponse(items, totalCount, queryForOData.$count === 'true', summaryData);
}

export async function getById(id) {
  const entry = await expenses.findOne({ _id: id });
  if (!entry) return null;

  const project = await projects.findOne({ _id: entry.projectId });
  const client = project ? await clients.findOne({ _id: project.clientId }) : null;

  // Enrich with linked transactions
  const txIds = entry.transactions || [];
  let linkedTransactions = [];
  let transactionsTotal = 0;
  if (txIds.length > 0) {
    const txDocs = await transactions.find({ _id: { $in: txIds } });
    linkedTransactions = txDocs.map(tx => ({
      _id: tx._id,
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      status: tx.status,
    }));
    transactionsTotal = linkedTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  }
  const remainingBalance = (entry.amount || 0) + transactionsTotal;

  return {
    ...entry,
    projectName: project?.name || 'Unknown',
    clientName: client?.companyName || 'Unknown',
    clientId: project?.clientId || null,
    linkedTransactions,
    transactionsTotal,
    remainingBalance,
  };
}

export async function create(data) {
  // Validation
  const today = new Date().toISOString().split('T')[0];
  if (data.date > today) {
    throw new Error('Expense date cannot be in the future');
  }

  const project = await projects.findOne({ _id: data.projectId });
  if (!project) throw new Error('Project not found');
  const client = await clients.findOne({ _id: project.clientId });

  const amount = Number(data.amount) || 0;
  const vat = computeVat(amount, Number(data.vatAmount) || 0, Number(data.vatPercent) || 0);
  const { vatAmount, vatPercent, netAmount } = vat;

  const now = new Date().toISOString();
  return expenses.insert({
    projectId: data.projectId,
    clientId: project.clientId,
    date: data.date,
    expenseType: data.expenseType || '',
    description: data.description || '',
    amount,
    vatAmount,
    vatPercent,
    netAmount,
    billable: data.billable !== false,
    currency: data.currency || client?.currency || 'GBP',
    externalReference: data.externalReference || '',
    attachments: [],
    transactions: [],
    notes: data.notes || '',
    createdAt: now,
    updatedAt: now,
  });
}

export async function update(id, data) {
  const existing = await expenses.findOne({ _id: id });
  assertNotLocked(existing);

  const now = new Date().toISOString();
  const updateData = { ...data, updatedAt: now };
  delete updateData._id;
  delete updateData.createdAt;
  delete updateData.attachments;
  delete updateData.isLocked;
  delete updateData.isLockedReason;

  // Type coercion
  if (updateData.amount !== undefined) updateData.amount = Number(updateData.amount);
  if (updateData.vatAmount !== undefined) updateData.vatAmount = Number(updateData.vatAmount);

  // Validation
  if (updateData.date) {
    const today = new Date().toISOString().split('T')[0];
    if (updateData.date > today) {
      throw new Error('Expense date cannot be in the future');
    }
  }

  // Sync clientId when projectId changes
  if (updateData.projectId) {
    const project = await projects.findOne({ _id: updateData.projectId });
    if (!project) throw new Error('Project not found');
    updateData.clientId = project.clientId;
  }

  // Recompute VAT fields and netAmount when amount/vatAmount/vatPercent changes
  if (updateData.amount !== undefined || updateData.vatAmount !== undefined || updateData.vatPercent !== undefined) {
    const finalAmount = updateData.amount ?? existing.amount ?? 0;
    const vat = computeVat(
      finalAmount,
      Number(updateData.vatAmount ?? existing.vatAmount ?? 0),
      Number(updateData.vatPercent ?? existing.vatPercent ?? 0),
    );
    updateData.vatAmount = vat.vatAmount;
    updateData.vatPercent = vat.vatPercent;
    updateData.netAmount = vat.netAmount;
  }

  await expenses.update({ _id: id }, { $set: updateData });
  return getById(id);
}

export async function remove(id) {
  const existing = await expenses.findOne({ _id: id });
  assertNotLocked(existing);
  await removeAllAttachments(id);
  return expenses.remove({ _id: id });
}

export async function linkTransaction(id, transactionId) {
  const expense = await expenses.findOne({ _id: id });
  if (!expense) throw new Error('Expense not found');
  const txList = expense.transactions || [];
  if (txList.includes(transactionId)) {
    return getById(id);
  }
  await expenses.update({ _id: id }, {
    $set: {
      transactions: [...txList, transactionId],
      updatedAt: new Date().toISOString(),
    },
  });
  return getById(id);
}

export async function unlinkTransaction(id, transactionId) {
  const expense = await expenses.findOne({ _id: id });
  if (!expense) throw new Error('Expense not found');
  const txList = (expense.transactions || []).filter((t) => t !== transactionId);
  await expenses.update({ _id: id }, {
    $set: {
      transactions: txList,
      updatedAt: new Date().toISOString(),
    },
  });
  return getById(id);
}

export async function getDistinctTypes() {
  const all = await expenses.find({});
  const types = [...new Set(all.map((e) => e.expenseType).filter(Boolean))];
  return types.sort();
}
