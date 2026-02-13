import { clients, projects, timesheets, documents, expenses } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';
import { removeAllAttachments } from './expenseAttachmentService.js';

export async function getAll(query = {}) {
  const { results, totalCount } = await buildQuery(projects, query, { name: 1 });

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

  // $expand
  if (query.$expand) {
    const expands = query.$expand.split(',').map(s => s.trim());
    for (const item of enriched) {
      if (expands.includes('client')) {
        item.client = clientMap[item.clientId] || null;
      }
      if (expands.includes('timesheets')) {
        item.timesheets = await timesheets.find({ projectId: item._id });
      }
      if (expands.includes('documents')) {
        item.documents = await documents.find({ projectId: item._id });
      }
      if (expands.includes('expenses')) {
        item.expenses = await expenses.find({ projectId: item._id });
      }
    }
  }

  const items = applySelect(enriched, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
}

export async function getById(id) {
  const project = await projects.findOne({ _id: id });
  if (!project) return null;

  const client = await clients.findOne({ _id: project.clientId });
  const effectiveRate = project.rate != null ? project.rate : (client?.defaultRate || 0);

  const projectTimesheets = await timesheets.find({ projectId: id }).sort({ date: -1 });
  const projectExpenses = await expenses.find({ projectId: id }).sort({ date: -1 });

  const effectiveWorkingHours = project.workingHoursPerDay != null
    ? project.workingHoursPerDay : (client?.workingHoursPerDay || 8);

  return {
    ...project,
    clientName: client?.companyName || 'Unknown',
    effectiveRate,
    effectiveWorkingHours,
    timesheets: projectTimesheets,
    expenses: projectExpenses,
  };
}

export async function getByClientId(clientId) {
  const clientProjects = await projects.find({ clientId }).sort({ isDefault: -1, name: 1 });
  const client = await clients.findOne({ _id: clientId });

  return clientProjects.map((p) => ({
    ...p,
    clientName: client?.companyName || 'Unknown',
    effectiveRate: p.rate != null ? p.rate : (client?.defaultRate || 0),
    effectiveWorkingHours: p.workingHoursPerDay != null
      ? p.workingHoursPerDay : (client?.workingHoursPerDay || 8),
  }));
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
    isDefault: false,
    status: data.status || 'active',
    notes: data.notes || '',
    createdAt: now,
    updatedAt: now,
  });
}

export async function update(id, data) {
  const now = new Date().toISOString();
  const updateData = { ...data, updatedAt: now };
  delete updateData._id;
  delete updateData.createdAt;

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

  await projects.update({ _id: id }, { $set: updateData });
  return getById(id);
}

export async function remove(id) {
  const project = await projects.findOne({ _id: id });
  if (!project) return 0;

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
