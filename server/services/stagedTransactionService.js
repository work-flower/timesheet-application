import { stagedTransactions, transactions } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';
import * as transactionService from './transactionService.js';

export async function getAll(query = {}) {
  const baseFilter = {};

  if (query.importJobId) {
    baseFilter.importJobId = query.importJobId;
  }

  if (query.action) {
    baseFilter.action = query.action;
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
    action: data.action || 'unmarked',
    createdAt: now,
    updatedAt: now,
  });
}

export async function createBulk(items) {
  const now = new Date().toISOString();
  const docs = items.map((item) => ({
    ...item,
    action: item.action || 'unmarked',
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

export async function submit(importJobId, fieldMapping) {
  const staged = await stagedTransactions.find({ importJobId });
  const transformed = [];
  const deleted = [];
  const errors = [];

  for (const record of staged) {
    try {
      if (record.action === 'transform') {
        // Apply field mapping
        const mapped = {};
        for (const [sourceField, targetField] of Object.entries(fieldMapping)) {
          if (targetField && record[sourceField] !== undefined) {
            mapped[targetField] = record[sourceField];
          }
        }

        const date = mapped.date || record.date || null;
        const description = mapped.description || record.description || '';
        const amount = mapped.amount != null ? Number(mapped.amount) : (record.amount != null ? Number(record.amount) : 0);
        const balance = mapped.balance != null ? Number(mapped.balance) : null;

        if (!date) throw new Error('Date is required for transformation');
        if (!description) throw new Error('Description is required for transformation');

        const transaction = await transactionService.create({
          date,
          description,
          amount,
          balance,
          importJobId: record.importJobId,
          source: record,
        });

        await stagedTransactions.remove({ _id: record._id });
        transformed.push(transaction);
      } else if (record.action === 'delete') {
        await stagedTransactions.remove({ _id: record._id });
        deleted.push(record._id);
      }
      // unmarked: skip
    } catch (err) {
      errors.push({ id: record._id, error: err.message });
    }
  }

  return { transformed, deleted, errors };
}

export async function checkDuplicates(importJobId) {
  const staged = await stagedTransactions.find({ importJobId });
  if (staged.length === 0) return {};

  const stagedHashes = {};
  for (const s of staged) {
    if (s.compositeHash) {
      stagedHashes[s.compositeHash] = stagedHashes[s.compositeHash] || [];
      stagedHashes[s.compositeHash].push(s._id);
    }
  }

  if (Object.keys(stagedHashes).length === 0) return {};

  // Find transactions with matching composite hashes
  const allTransactions = await transactions.find({});
  const existingHashes = new Set();
  for (const tx of allTransactions) {
    if (tx.source?.compositeHash) {
      existingHashes.add(tx.source.compositeHash);
    }
  }

  const duplicateMap = {};
  for (const [hash, stagedIds] of Object.entries(stagedHashes)) {
    if (existingHashes.has(hash)) {
      for (const sid of stagedIds) {
        duplicateMap[sid] = true;
      }
    }
  }

  return duplicateMap;
}
