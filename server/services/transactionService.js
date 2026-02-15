import { transactions } from '../db/index.js';
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

  const items = applySelect(entries, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
}

export async function getById(id) {
  const entry = await transactions.findOne({ _id: id });
  if (!entry) return null;
  return entry;
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
    reference: data.reference || null,
    importJobId: data.importJobId,
    source: data.source || null,
    status: 'unmatched',
    ignoreReason: null,
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

export async function updateMapping(id, data) {
  const existing = await transactions.findOne({ _id: id });
  if (!existing) return null;

  // Only allow status and ignoreReason
  const updateData = { updatedAt: new Date().toISOString() };
  if (data.status != null) updateData.status = data.status;
  if (data.ignoreReason !== undefined) updateData.ignoreReason = data.ignoreReason;

  // Validate ignoreReason required when status is ignored
  const newStatus = updateData.status ?? existing.status;
  const newIgnoreReason = updateData.ignoreReason !== undefined ? updateData.ignoreReason : existing.ignoreReason;
  if (newStatus === 'ignored' && !newIgnoreReason) {
    throw new Error('Ignore reason is required when status is ignored');
  }

  // Clear ignoreReason when status is not ignored
  if (newStatus !== 'ignored') {
    updateData.ignoreReason = null;
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
