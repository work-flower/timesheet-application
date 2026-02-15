import { importJobs, stagedTransactions } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';
import { assertNotLocked } from './lockCheck.js';
import { unlinkSync, existsSync, rmSync } from 'fs';
import { dirname } from 'path';
import { createHash } from 'crypto';
import * as stagedTransactionService from './stagedTransactionService.js';
import { parseFile } from './aiParserService.js';

export async function getAll(query = {}) {
  const baseFilter = {};

  if (query.status) {
    baseFilter.status = query.status;
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
    userPrompt: data.userPrompt || 'Parse the attached bank statement.',
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  });
}

export async function update(id, data) {
  const existing = await importJobs.findOne({ _id: id });
  if (!existing) return null;
  assertNotLocked(existing);

  const now = new Date().toISOString();
  const updateData = { ...data, updatedAt: now };
  delete updateData._id;
  delete updateData.createdAt;
  delete updateData.filePath;
  delete updateData.filename;
  delete updateData.isLocked;
  delete updateData.isLockedReason;

  await importJobs.update({ _id: id }, { $set: updateData });
  return getById(id);
}

export async function remove(id) {
  const existing = await importJobs.findOne({ _id: id });
  if (!existing) return null;

  // Terminal jobs are locked but deletable — skip lock check here
  const allowedStatuses = ['abandoned', 'failed'];
  if (!allowedStatuses.includes(existing.status)) {
    throw new Error(`Cannot delete import job with status "${existing.status}". Only ${allowedStatuses.join(', ')} jobs can be deleted.`);
  }

  // Cascade-delete staged transactions for this job
  await stagedTransactions.remove({ importJobId: id }, { multi: true });

  // Delete uploaded file and its directory from disk
  if (existing.filePath && existsSync(existing.filePath)) {
    const dir = dirname(existing.filePath);
    rmSync(dir, { recursive: true, force: true });
  }

  return importJobs.remove({ _id: id });
}

export async function processFile(jobId) {
  try {
    const job = await importJobs.findOne({ _id: jobId });
    if (!job) throw new Error('Import job not found');

    const { rows, stopReason } = await parseFile(job.filePath, job.filename, job.userPrompt);

    // Build staged transactions with composite hash
    const ID_KEY_PATTERNS = [/id$/i, /reference/i, /number$/i, /^ref$/i, /^txn/i];
    const stagedItems = rows.map((row) => {
      let hashInput = `${job.filename}-${row.date || ''}-${row.description || ''}-${row.amount || ''}`;
      // Append any identifier-like fields for stronger dedup
      for (const key of Object.keys(row)) {
        if (ID_KEY_PATTERNS.some((p) => p.test(key)) && row[key] != null && row[key] !== '') {
          hashInput += `-${row[key]}`;
        }
      }
      const compositeHash = createHash('md5').update(hashInput).digest('hex');
      return {
        importJobId: jobId,
        compositeHash,
        ...row,
      };
    });

    await stagedTransactionService.createBulk(stagedItems);

    const now = new Date().toISOString();
    await importJobs.update({ _id: jobId }, {
      $set: {
        status: 'ready_for_review',
        aiStopReason: stopReason,
        updatedAt: now,
      },
    });
  } catch (err) {
    const now = new Date().toISOString();
    await importJobs.update({ _id: jobId }, {
      $set: {
        status: 'failed',
        error: err.message,
        updatedAt: now,
      },
    });
  }
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

  // Update job status and lock
  await importJobs.update({ _id: id }, {
    $set: {
      status: 'abandoned',
      completedAt: now,
      updatedAt: now,
      isLocked: true,
      isLockedReason: 'Abandoned import job',
    },
  });

  return getById(id);
}
