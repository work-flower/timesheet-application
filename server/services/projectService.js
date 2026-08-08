import { randomUUID } from 'node:crypto';
import { clients, projects, timesheets, expenses } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';
import { applyExpand } from '../expand.js';
import { removeAllAttachments } from './expenseAttachmentService.js';
import { assertNotLocked } from './lockCheck.js';

// Resource items are stored embedded on the project. dailyRate and userEmail are
// snapshots taken at add/edit time — they do not track later project-rate or
// user-email changes.
function normalizeResources(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const r of input) {
    if (!r || typeof r !== 'object' || !r.userId) continue;
    const userId = String(r.userId);
    if (seen.has(userId)) continue;
    seen.add(userId);
    const rate = r.dailyRate == null || r.dailyRate === '' ? null : Number(r.dailyRate);
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : randomUUID(),
      userId,
      userEmail: typeof r.userEmail === 'string' ? r.userEmail : '',
      dailyRate: Number.isFinite(rate) ? rate : null,
      engagement: r.engagement === 'PART_TIME' ? 'PART_TIME' : 'FULL_TIME',
      description: typeof r.description === 'string' ? r.description : '',
    });
  }
  return out;
}

export async function getAll(query = {}) {
  const baseFilter = {};
  if (query.clientId) baseFilter.clientId = query.clientId;

  const { results, totalCount } = await buildQuery(projects, query, { name: 1 }, baseFilter);

  // Existing enrichment (always applied)
  const allClients = await clients.find({});
  const clientMap = Object.fromEntries(allClients.map(c => [c._id, c]));
  const enriched = results.map(p => ({
    ...p,
    clientName: clientMap[p.clientId]?.companyName || 'Unknown',
    effectiveRate: p.rate != null ? p.rate : (clientMap[p.clientId]?.defaultRate || 0),
    effectiveWorkingHours: p.workingHoursPerDay != null
      ? p.workingHoursPerDay : (clientMap[p.clientId]?.workingHoursPerDay || 8),
  }));

  await applyExpand('projects', enriched, query.$expand);

  const items = applySelect(enriched, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
}

// Lean read model: stored fields + scalar enrichment only. Related records
// (timesheets, expenses, documents) come from their own list endpoints with
// ?projectId= — see the $expand relationship map in server/expand.js.
export async function getById(id) {
  const project = await projects.findOne({ _id: id });
  if (!project) return null;

  const client = await clients.findOne({ _id: project.clientId });

  return {
    ...project,
    clientName: client?.companyName || 'Unknown',
    effectiveRate: project.rate != null ? project.rate : (client?.defaultRate || 0),
    effectiveWorkingHours: project.workingHoursPerDay != null
      ? project.workingHoursPerDay : (client?.workingHoursPerDay || 8),
  };
}

export async function create(data) {
  const now = new Date().toISOString();
  return projects.insert({
    clientId: data.clientId,
    endClientId: data.endClientId || null,
    name: data.name || '',
    ir35Status: data.ir35Status || 'OUTSIDE_IR35',
    rate: data.rate != null && data.rate !== '' ? Number(data.rate) : null,
    workingHoursPerDay: data.workingHoursPerDay != null && data.workingHoursPerDay !== ''
      ? Number(data.workingHoursPerDay) : null,
    vatPercent: data.vatPercent != null && data.vatPercent !== '' ? Number(data.vatPercent) : null,
    resources: normalizeResources(data.resources),
    isDefault: false,
    status: data.status || 'active',
    notes: data.notes || '',
    createdAt: now,
    updatedAt: now,
  });
}

export async function update(id, data) {
  const existing = await projects.findOne({ _id: id });
  assertNotLocked(existing);

  const now = new Date().toISOString();
  const updateData = { ...data, updatedAt: now };
  delete updateData._id;
  delete updateData.createdAt;
  delete updateData.isLocked;
  delete updateData.isLockedReason;
  // Read-model echoes — persisting them stores unscoped snapshots of related
  // records on the project doc, which then leak past row-level security
  delete updateData.clientName;
  delete updateData.effectiveRate;
  delete updateData.effectiveWorkingHours;
  delete updateData.timesheets;
  delete updateData.expenses;
  delete updateData.client;
  delete updateData.documents;

  // Handle rate — allow setting back to null for inheritance
  if (updateData.rate === '' || updateData.rate === undefined) {
    updateData.rate = null;
  } else if (updateData.rate != null) {
    updateData.rate = Number(updateData.rate);
  }

  // Handle workingHoursPerDay — same null inheritance pattern as rate
  if (updateData.workingHoursPerDay === '' || updateData.workingHoursPerDay === undefined) {
    updateData.workingHoursPerDay = null;
  } else if (updateData.workingHoursPerDay != null) {
    updateData.workingHoursPerDay = Number(updateData.workingHoursPerDay);
  }

  // Handle vatPercent — null means no VAT (exempt)
  if (updateData.vatPercent === '' || updateData.vatPercent === undefined) {
    updateData.vatPercent = null;
  } else if (updateData.vatPercent != null) {
    updateData.vatPercent = Number(updateData.vatPercent);
  }

  // Only normalize when present so partial PUTs don't wipe the array
  if ('resources' in updateData) {
    updateData.resources = normalizeResources(updateData.resources);
  }

  await projects.update({ _id: id }, { $set: updateData });
  return getById(id);
}

export async function remove(id) {
  const project = await projects.findOne({ _id: id });
  if (!project) return 0;
  assertNotLocked(project);

  if (project.isDefault) {
    throw new Error('Cannot delete the default project');
  }

  // Cascade: delete all timesheets and expenses for this project
  await timesheets.remove({ projectId: id }, { multi: true });
  const projectExpenses = await expenses.find({ projectId: id });
  for (const exp of projectExpenses) {
    await removeAllAttachments(exp._id);
  }
  await expenses.remove({ projectId: id }, { multi: true });
  return projects.remove({ _id: id });
}
