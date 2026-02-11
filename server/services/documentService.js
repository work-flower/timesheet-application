import { clients, projects, documents } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, unlinkSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = process.env.DATA_DIR || join(__dirname, '..', '..', 'data');
const documentsDir = join(dataDir, 'documents');

export async function getAll(query = {}) {
  // Build base filter from legacy params
  const baseFilter = {};
  if (query.clientId) baseFilter.clientId = query.clientId;
  if (query.projectId) baseFilter.projectId = query.projectId;

  const { results, totalCount } = await buildQuery(
    documents, query, { createdAt: -1 }, baseFilter
  );

  // $expand
  if (query.$expand) {
    const allClients = await clients.find({});
    const allProjects = await projects.find({});
    const clientMap = Object.fromEntries(allClients.map(c => [c._id, c]));
    const projectMap = Object.fromEntries(allProjects.map(p => [p._id, p]));

    const expands = query.$expand.split(',').map(s => s.trim());
    for (const item of results) {
      if (expands.includes('client')) {
        item.client = clientMap[item.clientId] || null;
      }
      if (expands.includes('project')) {
        item.project = projectMap[item.projectId] || null;
      }
    }
  }

  const items = applySelect(results, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
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
