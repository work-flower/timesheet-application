import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import archiver from 'archiver';
import * as tar from 'tar';
import { PassThrough } from 'stream';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import backupConfig from '../db/backupConfig.js';
import { clients, projects, timesheets, settings, documents } from '../db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function getDataDir() { return process.env.DATA_DIR || join(__dirname, '..', '..', 'data'); }
function getBackupPrefix() { return process.env.BACKUP_PREFIX || 'backups'; }
function getDocumentsDir() { return join(getDataDir(), 'documents'); }

let operationLock = false;

function buildS3Client(config) {
  return new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function maskSecret(value) {
  if (!value || value.length <= 4) return value ? '****' : '';
  return '*'.repeat(value.length - 4) + value.slice(-4);
}

// --- Config CRUD ---

export async function getConfig() {
  const docs = await backupConfig.find({});
  const doc = docs[0] || null;
  if (doc && doc.secretAccessKey) {
    return { ...doc, secretAccessKey: maskSecret(doc.secretAccessKey) };
  }
  return doc;
}

export async function updateConfig(data) {
  const now = new Date().toISOString();
  const existing = await backupConfig.find({});
  const updateData = { ...data, updatedAt: now };
  delete updateData._id;

  // If secret contains asterisks, retain existing stored value
  if (updateData.secretAccessKey && updateData.secretAccessKey.includes('*')) {
    if (existing.length > 0 && existing[0].secretAccessKey) {
      updateData.secretAccessKey = existing[0].secretAccessKey;
    }
  }

  if (existing.length > 0) {
    delete updateData.createdAt;
    await backupConfig.update({ _id: existing[0]._id }, { $set: updateData });
    const updated = await backupConfig.findOne({ _id: existing[0]._id });
    return { ...updated, secretAccessKey: maskSecret(updated.secretAccessKey) };
  } else {
    updateData.createdAt = now;
    const created = await backupConfig.insert(updateData);
    return { ...created, secretAccessKey: maskSecret(created.secretAccessKey) };
  }
}

// --- Get raw config (unmasked, for internal use) ---

async function getRawConfig() {
  const docs = await backupConfig.find({});
  return docs[0] || null;
}

// --- Test Connection ---

export async function testConnection(config) {
  // If secret is masked, get from stored config
  let secretAccessKey = config.secretAccessKey;
  if (secretAccessKey && secretAccessKey.includes('*')) {
    const stored = await getRawConfig();
    if (stored) secretAccessKey = stored.secretAccessKey;
  }

  const s3 = buildS3Client({ ...config, secretAccessKey });
  await s3.send(new ListObjectsV2Command({
    Bucket: config.bucketName,
    MaxKeys: 1,
  }));
  return { success: true };
}

// --- Create Backup ---

export async function createBackup() {
  if (operationLock) throw new Error('Another backup or restore operation is in progress');
  operationLock = true;

  try {
    const config = await getRawConfig();
    if (!config) throw new Error('Backup not configured');

    const s3 = buildS3Client(config);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const folderName = `timesheet-backup-${timestamp}`;
    const key = `${getBackupPrefix()}/${folderName}.tar.gz`;

    // Export all collections
    const [clientDocs, projectDocs, timesheetDocs, settingsDocs, documentDocs] = await Promise.all([
      clients.find({}),
      projects.find({}),
      timesheets.find({}),
      settings.find({}),
      documents.find({}),
    ]);

    const metadata = {
      createdAt: new Date().toISOString(),
      version: '1.0',
      totalRecords: {
        clients: clientDocs.length,
        projects: projectDocs.length,
        timesheets: timesheetDocs.length,
        settings: settingsDocs.length,
        documents: documentDocs.length,
      },
    };

    // Create tar.gz archive in memory via streaming
    const archive = archiver('tar', { gzip: true });
    const chunks = [];

    const passThrough = new PassThrough();
    passThrough.on('data', (chunk) => chunks.push(chunk));

    archive.pipe(passThrough);

    // Add JSON files
    archive.append(JSON.stringify(metadata, null, 2), { name: `${folderName}/metadata.json` });
    archive.append(JSON.stringify(clientDocs, null, 2), { name: `${folderName}/clients.json` });
    archive.append(JSON.stringify(projectDocs, null, 2), { name: `${folderName}/projects.json` });
    archive.append(JSON.stringify(timesheetDocs, null, 2), { name: `${folderName}/timesheets.json` });
    archive.append(JSON.stringify(settingsDocs, null, 2), { name: `${folderName}/settings.json` });
    archive.append(JSON.stringify(documentDocs, null, 2), { name: `${folderName}/documents.json` });

    // Add PDF documents directory
    const docsDir = getDocumentsDir();
    if (existsSync(docsDir)) {
      const files = readdirSync(docsDir);
      for (const file of files) {
        const filePath = join(docsDir, file);
        archive.file(filePath, { name: `${folderName}/documents/${file}` });
      }
    }

    await archive.finalize();
    // Wait for all data to be collected
    await new Promise((resolve, reject) => {
      passThrough.on('end', resolve);
      passThrough.on('error', reject);
    });

    const buffer = Buffer.concat(chunks);

    // Upload to R2
    await s3.send(new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: buffer,
      ContentType: 'application/gzip',
    }));

    return { success: true, key, size: buffer.length };
  } finally {
    operationLock = false;
  }
}

// --- List Backups ---

export async function listBackups() {
  const config = await getRawConfig();
  if (!config) return [];

  const s3 = buildS3Client(config);
  const response = await s3.send(new ListObjectsV2Command({
    Bucket: config.bucketName,
    Prefix: `${getBackupPrefix()}/`,
  }));

  if (!response.Contents) return [];

  return response.Contents
    .filter((obj) => obj.Key.endsWith('.tar.gz'))
    .map((obj) => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified,
    }))
    .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
}

// --- Restore from Backup ---

export async function restoreFromBackup(backupKey) {
  if (operationLock) throw new Error('Another backup or restore operation is in progress');
  operationLock = true;

  const restoreDir = join(getDataDir(), '_restore_tmp');

  try {
    const config = await getRawConfig();
    if (!config) throw new Error('Backup not configured');

    const s3 = buildS3Client(config);

    // Download archive
    const response = await s3.send(new GetObjectCommand({
      Bucket: config.bucketName,
      Key: backupKey,
    }));

    // Write to temp file then extract
    mkdirSync(restoreDir, { recursive: true });
    const archivePath = join(restoreDir, 'backup.tar.gz');
    const writeStream = createWriteStream(archivePath);
    await pipeline(response.Body, writeStream);

    // Extract
    await tar.x({
      file: archivePath,
      cwd: restoreDir,
    });

    // Find the extracted folder (first directory inside restoreDir)
    const entries = readdirSync(restoreDir).filter(e => e !== 'backup.tar.gz');
    const extractedFolder = entries.find(e => {
      try { return readdirSync(join(restoreDir, e)).includes('metadata.json'); } catch { return false; }
    });
    if (!extractedFolder) throw new Error('Invalid backup archive: metadata.json not found');

    const extractDir = join(restoreDir, extractedFolder);

    // Validate metadata
    const metadata = JSON.parse(readFileSync(join(extractDir, 'metadata.json'), 'utf-8'));
    if (!metadata.version || !metadata.totalRecords) {
      throw new Error('Invalid backup metadata');
    }

    // Restore each collection
    const collections = [
      { name: 'clients', db: clients },
      { name: 'projects', db: projects },
      { name: 'timesheets', db: timesheets },
      { name: 'settings', db: settings },
      { name: 'documents', db: documents },
    ];

    for (const { name, db } of collections) {
      const filePath = join(extractDir, `${name}.json`);
      if (existsSync(filePath)) {
        const data = JSON.parse(readFileSync(filePath, 'utf-8'));
        await db.remove({}, { multi: true });
        if (data.length > 0) {
          await db.insert(data);
        }
      }
    }

    // Restore PDF documents
    const documentsDir = getDocumentsDir();
    const restoreDocsDir = join(extractDir, 'documents');
    if (existsSync(restoreDocsDir)) {
      // Clear existing documents directory
      const existingFiles = existsSync(documentsDir) ? readdirSync(documentsDir) : [];
      for (const file of existingFiles) {
        rmSync(join(documentsDir, file), { force: true });
      }
      // Copy restored documents
      mkdirSync(documentsDir, { recursive: true });
      const restoredFiles = readdirSync(restoreDocsDir);
      for (const file of restoredFiles) {
        const src = readFileSync(join(restoreDocsDir, file));
        writeFileSync(join(documentsDir, file), src);
      }
    }

    return { success: true, metadata };
  } finally {
    // Clean up temp directory
    rmSync(restoreDir, { recursive: true, force: true });
    operationLock = false;
  }
}

// --- Delete Backup ---

export async function deleteBackup(backupKey) {
  const config = await getRawConfig();
  if (!config) throw new Error('Backup not configured');

  const s3 = buildS3Client(config);
  await s3.send(new DeleteObjectCommand({
    Bucket: config.bucketName,
    Key: backupKey,
  }));

  return { success: true };
}
