import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import { readFileSync, readdirSync, statSync, unlinkSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import logConfig from '../db/logConfig.js';
import { LOG_DIR, setLogLevel, setMaxFileSize, setMessageFilter, setLogPayloads } from '../logging/logHook.js';
import { parseFilter, parseOrderBy, applySelect, formatResponse } from '../odata.js';

function maskSecret(value) {
  if (!value || value.length <= 4) return value ? '****' : '';
  return '*'.repeat(value.length - 4) + value.slice(-4);
}

function buildS3Client(config) {
  return new S3Client({
    region: 'auto',
    endpoint: config.r2Endpoint,
    credentials: {
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey,
    },
  });
}

// --- Config CRUD ---

export async function getConfig() {
  const docs = await logConfig.find({});
  const doc = docs[0] || null;
  if (doc && doc.r2SecretAccessKey) {
    return { ...doc, r2SecretAccessKey: maskSecret(doc.r2SecretAccessKey) };
  }
  return doc;
}

export async function getRawConfig() {
  const docs = await logConfig.find({});
  return docs[0] || null;
}

export async function updateConfig(data) {
  const now = new Date().toISOString();
  const existing = await logConfig.find({});
  const updateData = { ...data, updatedAt: now };
  delete updateData._id;

  // If secret contains asterisks, retain existing stored value
  if (updateData.r2SecretAccessKey && updateData.r2SecretAccessKey.includes('*')) {
    if (existing.length > 0 && existing[0].r2SecretAccessKey) {
      updateData.r2SecretAccessKey = existing[0].r2SecretAccessKey;
    }
  }

  let result;
  if (existing.length > 0) {
    delete updateData.createdAt;
    await logConfig.update({ _id: existing[0]._id }, { $set: updateData });
    result = await logConfig.findOne({ _id: existing[0]._id });
  } else {
    updateData.createdAt = now;
    result = await logConfig.insert(updateData);
  }

  // Apply runtime config changes
  if (updateData.logLevel) setLogLevel(updateData.logLevel);
  if (updateData.maxFileSize) setMaxFileSize(updateData.maxFileSize);
  setMessageFilter(updateData.messageFilter ?? '');
  setLogPayloads(updateData.logPayloads ?? false);

  // Handle uploader changes
  try {
    const { startUploader, stopUploader } = await import('../logging/logUploader.js');
    if (result.uploadEnabled && result.uploadIntervalMinutes > 0) {
      startUploader(result.uploadIntervalMinutes);
    } else {
      stopUploader();
    }
  } catch {
    // Uploader may not be available
  }

  return { ...result, r2SecretAccessKey: maskSecret(result.r2SecretAccessKey) };
}

// --- Test Connection ---

export async function testConnection(data) {
  let secretAccessKey = data.r2SecretAccessKey;
  if (secretAccessKey && secretAccessKey.includes('*')) {
    const stored = await getRawConfig();
    if (stored) secretAccessKey = stored.r2SecretAccessKey;
  }

  const s3 = buildS3Client({ ...data, r2SecretAccessKey: secretAccessKey });
  await s3.send(new ListObjectsV2Command({
    Bucket: data.r2BucketName,
    MaxKeys: 1,
  }));
  return { success: true };
}

// --- Local file operations ---

export function listLocalFiles() {
  try {
    const files = readdirSync(LOG_DIR)
      .filter((f) => f.endsWith('.log'))
      .map((filename) => {
        const filePath = join(LOG_DIR, filename);
        const stats = statSync(filePath);
        return {
          filename,
          size: stats.size,
          lastModified: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.lastModified.localeCompare(a.lastModified));
    return files;
  } catch {
    return [];
  }
}

export function readLogFile(filename, { level, source, keyword, skip = 0, limit = 100 } = {}) {
  const filePath = join(LOG_DIR, filename);
  // Prevent path traversal
  if (filename.includes('..') || filename.includes('/')) {
    throw new Error('Invalid filename');
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(Boolean);

  let entries = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (level && entry.level !== level) continue;
      if (source && entry.source !== source) continue;
      if (keyword && !entry.message.toLowerCase().includes(keyword.toLowerCase())) continue;
      entries.push(entry);
    } catch {
      // Skip malformed lines
    }
  }

  const total = entries.length;
  entries = entries.slice(skip, skip + limit);
  return { total, entries };
}

function loadEntries({ startDate, endDate, level, source, keyword, traceId } = {}) {
  const files = readdirSync(LOG_DIR)
    .filter((f) => f.startsWith('app-') && f.endsWith('.log'))
    .sort();

  // Filter files by date range
  const filteredFiles = files.filter((f) => {
    const match = f.match(/app-(\d{4}-\d{2}-\d{2})/);
    if (!match) return false;
    const fileDate = match[1];
    if (startDate && fileDate < startDate) return false;
    if (endDate && fileDate > endDate) return false;
    return true;
  });

  const entries = [];
  for (const filename of filteredFiles) {
    const filePath = join(LOG_DIR, filename);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (level && entry.level !== level) continue;
          if (source && entry.source !== source) continue;
          if (traceId && entry.traceId !== traceId) continue;
          if (keyword && !entry.message.toLowerCase().includes(keyword.toLowerCase())) continue;
          entries.push(entry);
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return entries;
}

function matchesFilter(entry, filter) {
  for (const [field, condition] of Object.entries(filter)) {
    const value = entry[field];
    if (condition === null || condition === undefined || typeof condition !== 'object') {
      // Direct eq match
      if (value !== condition) return false;
    } else {
      if ('$ne' in condition && value === condition.$ne) return false;
      if ('$gt' in condition && !(value > condition.$gt)) return false;
      if ('$gte' in condition && !(value >= condition.$gte)) return false;
      if ('$lt' in condition && !(value < condition.$lt)) return false;
      if ('$lte' in condition && !(value <= condition.$lte)) return false;
      if ('$regex' in condition && !condition.$regex.test(String(value || ''))) return false;
    }
  }
  return true;
}

export function searchLogs(query = {}) {
  // 1. Load entries using entity-specific params
  const entries = loadEntries({
    startDate: query.startDate,
    endDate: query.endDate,
    level: query.level,
    source: query.source,
    keyword: query.keyword,
    traceId: query.traceId,
  });

  // 2. Apply OData $filter to in-memory array
  const odataFilter = parseFilter(query.$filter);
  let filtered = entries;
  if (Object.keys(odataFilter).length > 0) {
    filtered = entries.filter(entry => matchesFilter(entry, odataFilter));
  }

  // 3. Apply $orderby
  const sort = parseOrderBy(query.$orderby) || { timestamp: -1 };
  filtered.sort((a, b) => {
    for (const [field, dir] of Object.entries(sort)) {
      if (a[field] < b[field]) return -1 * dir;
      if (a[field] > b[field]) return 1 * dir;
    }
    return 0;
  });

  // 4. Count before pagination
  const totalCount = filtered.length;

  // 5. Apply $skip / $top (fall back to legacy skip/limit)
  const skip = parseInt(query.$skip ?? query.skip, 10) || 0;
  const top = parseInt(query.$top ?? query.limit, 10) || 0;
  if (skip || top) {
    filtered = filtered.slice(skip, top ? skip + top : undefined);
  }

  // 6. Apply $select
  const items = applySelect(filtered, query.$select);

  // 7. Return — OData envelope when $count=true, legacy format otherwise
  if (query.$count === 'true') {
    return formatResponse(items, totalCount, true);
  }
  return { total: totalCount, entries: items };
}

// --- R2 operations ---

function validateFilename(filename) {
  if (filename.includes('..') || filename.includes('/')) {
    throw new Error('Invalid filename');
  }
}

function md5File(filePath) {
  const content = readFileSync(filePath);
  return createHash('md5').update(content).digest('hex');
}

/**
 * Verify that a local log file has an identical copy in R2.
 * Checks: existence (by name), file size, and MD5 hash.
 *
 * @returns {{ exists, matches, localSize, localMd5, r2Size, r2Md5 }}
 */
async function verifyR2Match(filename) {
  const config = await getRawConfig();
  if (!config || !config.r2BucketName) {
    return { exists: false, matches: false, error: 'R2 is not configured' };
  }

  const filePath = join(LOG_DIR, filename);
  const localSize = statSync(filePath).size;
  const localMd5 = md5File(filePath);

  const s3 = buildS3Client(config);
  const prefix = (config.r2LogPath || 'logs').replace(/\/+$/, '');
  const key = `${prefix}/${filename}`;

  try {
    const head = await s3.send(new HeadObjectCommand({
      Bucket: config.r2BucketName,
      Key: key,
    }));

    const r2Size = head.ContentLength;
    // R2 returns ETag as quoted MD5 for non-multipart uploads
    const r2Md5 = (head.ETag || '').replace(/"/g, '');

    const matches = localSize === r2Size && localMd5 === r2Md5;

    return { exists: true, matches, localSize, localMd5, r2Size, r2Md5 };
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return { exists: false, matches: false, localSize, localMd5 };
    }
    throw err;
  }
}

const MISMATCH_MSG = 'A file with the same name already exists in R2 but differs from the local copy (size or content mismatch). Resolve this manually by renaming or deleting the R2 copy.';

function assertNotActiveFile(filename) {
  const today = new Date().toISOString().slice(0, 10);
  if (filename === `app-${today}.log`) {
    throw new Error(
      `Cannot operate on "${filename}" — it is the active log file currently being written to. Wait until tomorrow or trigger a rotation by adjusting the max file size.`
    );
  }
}

export async function uploadToR2(filename) {
  const config = await getRawConfig();
  if (!config) throw new Error('Log upload not configured');

  validateFilename(filename);
  assertNotActiveFile(filename);
  const filePath = join(LOG_DIR, filename);

  const verification = await verifyR2Match(filename);

  if (verification.exists) {
    if (verification.matches) {
      // Identical copy in R2 — safe to remove local
      unlinkSync(filePath);
      return { success: true, skipped: true };
    }
    // Name collision with different content — block
    throw new Error(MISMATCH_MSG);
  }

  // File does not exist in R2 — upload
  const s3 = buildS3Client(config);
  const prefix = (config.r2LogPath || 'logs').replace(/\/+$/, '');
  const key = `${prefix}/${filename}`;

  const body = readFileSync(filePath);
  await s3.send(new PutObjectCommand({
    Bucket: config.r2BucketName,
    Key: key,
    Body: body,
    ContentType: 'application/x-ndjson',
  }));

  // Verify the upload before deleting local
  const postVerification = await verifyR2Match(filename);
  if (!postVerification.matches) {
    throw new Error('Upload completed but verification failed — local file retained. Try again or investigate.');
  }

  unlinkSync(filePath);
  return { success: true, key };
}

export async function downloadFromR2(filename) {
  const config = await getRawConfig();
  if (!config) throw new Error('R2 is not configured');

  validateFilename(filename);

  const filePath = join(LOG_DIR, filename);
  if (existsSync(filePath)) {
    return { success: true, alreadyLocal: true };
  }

  const s3 = buildS3Client(config);
  const prefix = (config.r2LogPath || 'logs').replace(/\/+$/, '');
  const key = `${prefix}/${filename}`;

  const response = await s3.send(new GetObjectCommand({
    Bucket: config.r2BucketName,
    Key: key,
  }));

  const body = await response.Body.transformToByteArray();
  writeFileSync(filePath, Buffer.from(body));

  return { success: true };
}

export async function safeDeleteLocalFile(filename) {
  validateFilename(filename);
  assertNotActiveFile(filename);

  const filePath = join(LOG_DIR, filename);
  if (!existsSync(filePath)) {
    throw new Error('File not found');
  }

  const verification = await verifyR2Match(filename);

  if (!verification.exists) {
    throw new Error('This log file has not been uploaded to R2. Upload it first before deleting locally.');
  }

  if (!verification.matches) {
    throw new Error(
      `R2 copy differs from local file (local: ${verification.localSize} bytes / ${verification.localMd5}, R2: ${verification.r2Size} bytes / ${verification.r2Md5}). Delete aborted — resolve the inconsistency manually.`
    );
  }

  unlinkSync(filePath);
  return { success: true };
}

export async function listR2Logs() {
  const config = await getRawConfig();
  if (!config) return [];

  const s3 = buildS3Client(config);
  const prefix = (config.r2LogPath || 'logs').replace(/\/+$/, '');
  const response = await s3.send(new ListObjectsV2Command({
    Bucket: config.r2BucketName,
    Prefix: `${prefix}/`,
  }));

  if (!response.Contents) return [];

  return response.Contents
    .map((obj) => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified,
    }))
    .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
}

