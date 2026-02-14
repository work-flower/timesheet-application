import { stagedTransactions } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';

export async function getAll(query = {}) {
  const baseFilter = {};

  if (query.importJobId) {
    baseFilter.importJobId = query.importJobId;
  }

  const { results, totalCount } = await buildQuery(
    stagedTransactions, query, { date: 1 }, baseFilter
  );

  const items = applySelect(results, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
}

export async function getById(id) {
  return stagedTransactions.findOne({ _id: id });
}

export async function create(data) {
  if (!data.importJobId) throw new Error('Import job ID is required');

  const now = new Date().toISOString();
  return stagedTransactions.insert({
    ...data,
    createdAt: now,
    updatedAt: now,
  });
}

export async function createBulk(items) {
  const now = new Date().toISOString();
  const docs = items.map((item) => ({
    ...item,
    createdAt: now,
    updatedAt: now,
  }));

  // NeDB insert accepts an array
  return stagedTransactions.insert(docs);
}

export async function update(id, data) {
  const existing = await stagedTransactions.findOne({ _id: id });
  if (!existing) return null;

  const now = new Date().toISOString();
  const updateData = { ...data, updatedAt: now };
  delete updateData._id;
  delete updateData.createdAt;
  delete updateData.importJobId;

  await stagedTransactions.update({ _id: id }, { $set: updateData });
  return getById(id);
}

export async function remove(id) {
  return stagedTransactions.remove({ _id: id });
}

export async function removeByJobId(jobId) {
  return stagedTransactions.remove({ importJobId: jobId }, { multi: true });
}
