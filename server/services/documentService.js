import { documents } from '../db/index.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, unlinkSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const documentsDir = join(__dirname, '..', '..', 'data', 'documents');

export async function getAll(query = {}) {
  const filter = {};
  if (query.clientId) filter.clientId = query.clientId;
  if (query.projectId) filter.projectId = query.projectId;
  return documents.find(filter).sort({ createdAt: -1 });
}

export async function getById(id) {
  return documents.findOne({ _id: id });
}

export async function save(pdfBuffer, metadata) {
  const { clientId, projectId, periodStart, periodEnd, granularity } = metadata;
  const filename = `timesheet-${projectId}-${periodStart}-to-${periodEnd}.pdf`;
  const filePath = join(documentsDir, filename);

  writeFileSync(filePath, pdfBuffer);

  const doc = await documents.insert({
    clientId,
    projectId,
    periodStart,
    periodEnd,
    granularity,
    filename,
    filePath,
    createdAt: new Date().toISOString(),
  });

  return doc;
}

export async function remove(id) {
  const doc = await documents.findOne({ _id: id });
  if (!doc) throw new Error('Document not found');

  try {
    unlinkSync(doc.filePath);
  } catch (e) {
    // File may already be deleted, continue with DB removal
  }

  await documents.remove({ _id: id });
  return { success: true };
}
