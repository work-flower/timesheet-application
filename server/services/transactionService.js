import { transactions } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';
import { assertNotLocked } from './lockCheck.js';
import transactionSchema, { buildRecord, validateRequired } from '../schemas/transaction.js';

export { transactionSchema };

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
  // Fetch a known id set (e.g. an invoice/expense's stored transactions array)
  if (query.ids) {
    baseFilter._id = { $in: query.ids.split(',').map((s) => s.trim()).filter(Boolean) };
  }
  if (query.startDate || query.endDate) {
    baseFilter.date = {};
    if (query.startDate) baseFilter.date.$gte = query.startDate;
    if (query.endDate) baseFilter.date.$lte = query.endDate;
  }

  const { results: entries, totalCount, summaryData } = await buildQuery(
    transactions, query, { date: -1 }, baseFilter
  );

  // Enhance summary with transaction-specific aggregations (credits, debits, unmatched)
  let finalSummary = summaryData;
  if (query.$summary) {
    const { results: allMatching } = await buildQuery(
      transactions, { $filter: query.$filter }, { date: -1 }, baseFilter
    );
    const credits = allMatching.filter((t) => (t.amount || 0) > 0).reduce((sum, t) => sum + t.amount, 0);
    const debits = allMatching.filter((t) => (t.amount || 0) < 0).reduce((sum, t) => sum + t.amount, 0);
    const unmatched = allMatching.filter((t) => t.status === 'unmatched').length;
    finalSummary = { ...(summaryData || {}), credits, debits, unmatched };
  }

  const items = applySelect(entries, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true', finalSummary);
}

export async function getDistinctAccounts() {
  const all = await transactions.find({});
  const names = [...new Set(all.map((t) => t.accountName).filter(Boolean))];
  names.sort();
  return names;
}

// Lean read model: stored fields only. Linked invoices/expenses resolve via
// their list endpoints with ?transactionId= (array containment reverse lookup).
export async function getById(id) {
  return transactions.findOne({ _id: id });
}

export async function create(data) {
  validateRequired(data);

  const now = new Date().toISOString();
  const record = buildRecord(data);

  return transactions.insert({
    ...record,
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
  // Read-model echoes from getById — never stored
  delete updateData.linkedInvoices;
  delete updateData.linkedExpenses;
  delete updateData.invoicesTotal;
  delete updateData.expensesTotal;
  delete updateData.remainingBalance;

  // Fail closed on unknown status values (bad payload never reaches storage)
  if (updateData.status != null && !VALID_STATUSES.includes(updateData.status)) {
    throw new Error(`Invalid transaction status "${updateData.status}"`);
  }

  // Validate ignoreReason when setting status to ignored
  if (updateData.status === 'ignored' && !updateData.ignoreReason && !existing.ignoreReason) {
    throw new Error('Ignore reason is required when status is ignored');
  }

  await transactions.update({ _id: id }, { $set: updateData });
  return getById(id);
}

const VALID_STATUSES = ['unmatched', 'matched', 'ignored'];

export async function updateMapping(id, data) {
  const existing = await transactions.findOne({ _id: id });
  if (!existing) return null;

  // Only allow status and ignoreReason
  const updateData = { updatedAt: new Date().toISOString() };
  if (data.status != null) updateData.status = data.status;
  if (data.ignoreReason !== undefined) updateData.ignoreReason = data.ignoreReason;

  // Validate ignoreReason required when status is ignored
  const newStatus = updateData.status ?? existing.status;
  // Fail closed on unknown status (bad payload, or existing.status unreadable
  // for this caller) — the branches below must never run against garbage
  if (!VALID_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid or unavailable transaction status "${newStatus}"`);
  }
  const newIgnoreReason = updateData.ignoreReason !== undefined ? updateData.ignoreReason : existing.ignoreReason;
  if (newStatus === 'ignored' && !newIgnoreReason) {
    throw new Error('Ignore reason is required when status is ignored');
  }

  // Clear ignoreReason when status is not ignored
  if (newStatus !== 'ignored') {
    updateData.ignoreReason = null;
  }

  // Lock/unlock based on ignored status
  if (newStatus === 'ignored') {
    updateData.isLocked = true;
    updateData.isLockedReason = `Ignored: ${newIgnoreReason}`;
  } else if (existing.status === 'ignored' && newStatus !== 'ignored') {
    updateData.isLocked = true;
    updateData.isLockedReason = 'Transactions are read-only by default';
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
