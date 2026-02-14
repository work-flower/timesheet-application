import { importJobs, stagedTransactions, transactions } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';
import { unlinkSync, existsSync } from 'fs';

export async function getAll(query = {}) {
  const baseFilter = {};

  if (query.status) {
    baseFilter.status = query.status;
  }
  if (query.accountName) {
    baseFilter.accountName = query.accountName;
  }

  const { results, totalCount } = await buildQuery(
    importJobs, query, { createdAt: -1 }, baseFilter
  );

  const items = applySelect(results, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
}

export async function getById(id) {
  return importJobs.findOne({ _id: id });
}

export async function create(data) {
  const now = new Date().toISOString();
  return importJobs.insert({
    filename: data.filename || '',
    filePath: data.filePath || '',
    status: 'processing',
    error: null,
    accountName: data.accountName || '',
    stagedCount: 0,
    committedCount: 0,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  });
}

export async function update(id, data) {
  const existing = await importJobs.findOne({ _id: id });
  if (!existing) return null;

  const now = new Date().toISOString();
  const updateData = { ...data, updatedAt: now };
  delete updateData._id;
  delete updateData.createdAt;
  delete updateData.filePath;
  delete updateData.filename;

  await importJobs.update({ _id: id }, { $set: updateData });
  return getById(id);
}

export async function remove(id) {
  const existing = await importJobs.findOne({ _id: id });
  if (!existing) return null;

  const allowedStatuses = ['committed', 'abandoned', 'failed'];
  if (!allowedStatuses.includes(existing.status)) {
    throw new Error(`Cannot delete import job with status "${existing.status}". Only ${allowedStatuses.join(', ')} jobs can be deleted.`);
  }

  // Cascade-delete staged transactions for this job
  await stagedTransactions.remove({ importJobId: id }, { multi: true });

  // Delete uploaded file from disk
  if (existing.filePath && existsSync(existing.filePath)) {
    unlinkSync(existing.filePath);
  }

  return importJobs.remove({ _id: id });
}

export async function commit(id) {
  const existing = await importJobs.findOne({ _id: id });
  if (!existing) throw new Error('Import job not found');
  if (existing.status !== 'ready_for_review') {
    throw new Error(`Cannot commit import job with status "${existing.status}". Job must be "ready_for_review".`);
  }

  // Get all staged transactions for this job
  const staged = await stagedTransactions.find({ importJobId: id });

  const now = new Date().toISOString();

  // Move each staged transaction to the transactions collection
  for (const item of staged) {
    const { _id, importJobId, createdAt: _ca, updatedAt: _ua, ...fields } = item;
    await transactions.insert({
      accountName: existing.accountName || '',
      date: fields.date || '',
      description: fields.description || '',
      amount: fields.amount != null ? Number(fields.amount) : 0,
      balance: fields.balance != null ? Number(fields.balance) : null,
      importJobId: id,
      source: item, // Full staged record as audit trail
      status: 'unmatched',
      ignoreReason: null,
      invoiceId: null,
      expenseId: null,
      clientId: null,
      projectId: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Delete staged records
  await stagedTransactions.remove({ importJobId: id }, { multi: true });

  // Update job status
  await importJobs.update({ _id: id }, {
    $set: {
      status: 'committed',
      committedCount: staged.length,
      completedAt: now,
      updatedAt: now,
    },
  });

  return getById(id);
}

export async function abandon(id) {
  const existing = await importJobs.findOne({ _id: id });
  if (!existing) throw new Error('Import job not found');
  if (existing.status !== 'ready_for_review' && existing.status !== 'processing') {
    throw new Error(`Cannot abandon import job with status "${existing.status}".`);
  }

  const now = new Date().toISOString();

  // Delete all staged transactions for this job
  await stagedTransactions.remove({ importJobId: id }, { multi: true });

  // Update job status
  await importJobs.update({ _id: id }, {
    $set: {
      status: 'abandoned',
      completedAt: now,
      updatedAt: now,
    },
  });

  return getById(id);
}
