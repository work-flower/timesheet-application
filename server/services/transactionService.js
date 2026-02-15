import { transactions, clients, projects } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';
import { assertNotLocked } from './lockCheck.js';

export async function getAll(query = {}) {
  const baseFilter = {};

  if (query.status) {
    baseFilter.status = query.status;
  }
  if (query.accountName) {
    baseFilter.accountName = query.accountName;
  }
  if (query.importJobId) {
    baseFilter.importJobId = query.importJobId;
  }
  if (query.startDate || query.endDate) {
    baseFilter.date = {};
    if (query.startDate) baseFilter.date.$gte = query.startDate;
    if (query.endDate) baseFilter.date.$lte = query.endDate;
  }

  const { results: entries, totalCount } = await buildQuery(
    transactions, query, { date: -1 }, baseFilter
  );

  // Enrich with client and project names
  const allClients = await clients.find({});
  const allProjects = await projects.find({});
  const clientMap = Object.fromEntries(allClients.map((c) => [c._id, c]));
  const projectMap = Object.fromEntries(allProjects.map((p) => [p._id, p]));

  const enriched = entries.map((entry) => {
    const client = entry.clientId ? clientMap[entry.clientId] : null;
    const project = entry.projectId ? projectMap[entry.projectId] : null;

    return {
      ...entry,
      clientName: client?.companyName || null,
      projectName: project?.name || null,
    };
  });

  const items = applySelect(enriched, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
}

export async function getById(id) {
  const entry = await transactions.findOne({ _id: id });
  if (!entry) return null;

  const client = entry.clientId ? await clients.findOne({ _id: entry.clientId }) : null;
  const project = entry.projectId ? await projects.findOne({ _id: entry.projectId }) : null;

  return {
    ...entry,
    clientName: client?.companyName || null,
    projectName: project?.name || null,
  };
}

export async function create(data) {
  if (!data.date) throw new Error('Date is required');
  if (!data.description) throw new Error('Description is required');
  if (data.amount == null) throw new Error('Amount is required');
  if (!data.importJobId) throw new Error('Import job ID is required');

  const now = new Date().toISOString();
  return transactions.insert({
    accountName: data.accountName || '',
    accountNumber: data.accountNumber || '',
    date: data.date,
    description: data.description,
    amount: Number(data.amount),
    balance: data.balance != null ? Number(data.balance) : null,
    reference: data.reference || null,
    importJobId: data.importJobId,
    source: data.source || null,
    status: 'unmatched',
    ignoreReason: null,
    invoiceId: data.invoiceId || null,
    expenseId: data.expenseId || null,
    clientId: data.clientId || null,
    projectId: data.projectId || null,
    isLocked: true,
    isLockedReason: 'Transactions are read-only by default',
    createdAt: now,
    updatedAt: now,
  });
}

export async function update(id, data) {
  const existing = await transactions.findOne({ _id: id });
  if (!existing) return null;
  assertNotLocked(existing);

  const now = new Date().toISOString();
  const updateData = { ...data, updatedAt: now };
  delete updateData._id;
  delete updateData.createdAt;
  delete updateData.isLocked;
  delete updateData.isLockedReason;
  delete updateData.source;
  delete updateData.importJobId;

  // Validate ignoreReason when setting status to ignored
  if (updateData.status === 'ignored' && !updateData.ignoreReason && !existing.ignoreReason) {
    throw new Error('Ignore reason is required when status is ignored');
  }

  await transactions.update({ _id: id }, { $set: updateData });
  return getById(id);
}

export async function remove(id) {
  const existing = await transactions.findOne({ _id: id });
  if (!existing) return null;
  assertNotLocked(existing);
  return transactions.remove({ _id: id });
}
