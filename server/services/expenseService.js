import { clients, projects, expenses } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';
import { removeAllAttachments } from './expenseAttachmentService.js';
import { assertNotLocked } from './lockCheck.js';

export async function getAll(query = {}) {
  // Build base filter from legacy params
  const baseFilter = {};

  if (query.projectId) {
    baseFilter.projectId = query.projectId;
  } else if (query.clientId) {
    const clientProjects = await projects.find({ clientId: query.clientId });
    const projectIds = clientProjects.map((p) => p._id);
    baseFilter.projectId = { $in: projectIds };
  }

  if (query.startDate || query.endDate) {
    baseFilter.date = {};
    if (query.startDate) baseFilter.date.$gte = query.startDate;
    if (query.endDate) baseFilter.date.$lte = query.endDate;
  }

  if (query.expenseType) {
    baseFilter.expenseType = query.expenseType;
  }

  // OData query merged with base filter
  const { results: entries, totalCount } = await buildQuery(
    expenses, query, { date: -1 }, baseFilter
  );

  // Enrich with project and client info
  const allProjects = await projects.find({});
  const allClients = await clients.find({});
  const projectMap = Object.fromEntries(allProjects.map((p) => [p._id, p]));
  const clientMap = Object.fromEntries(allClients.map((c) => [c._id, c]));

  const enriched = entries.map((entry) => {
    const project = projectMap[entry.projectId];
    const client = project ? clientMap[project.clientId] : null;

    return {
      ...entry,
      projectName: project?.name || 'Unknown',
      clientName: client?.companyName || 'Unknown',
      clientId: project?.clientId || null,
    };
  });

  // $expand
  if (query.$expand) {
    const expands = query.$expand.split(',').map(s => s.trim());
    for (const item of enriched) {
      if (expands.includes('project')) {
        item.project = projectMap[item.projectId] || null;
      }
      if (expands.includes('client')) {
        const project = projectMap[item.projectId];
        item.client = project ? (clientMap[project.clientId] || null) : null;
      }
    }
  }

  const items = applySelect(enriched, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
}

export async function getById(id) {
  const entry = await expenses.findOne({ _id: id });
  if (!entry) return null;

  const project = await projects.findOne({ _id: entry.projectId });
  const client = project ? await clients.findOne({ _id: project.clientId }) : null;

  return {
    ...entry,
    projectName: project?.name || 'Unknown',
    clientName: client?.companyName || 'Unknown',
    clientId: project?.clientId || null,
  };
}

export async function create(data) {
  // Validation
  const today = new Date().toISOString().split('T')[0];
  if (data.date > today) {
    throw new Error('Expense date cannot be in the future');
  }

  const project = await projects.findOne({ _id: data.projectId });
  if (!project) throw new Error('Project not found');
  const client = await clients.findOne({ _id: project.clientId });

  const amount = Number(data.amount) || 0;
  const vatAmount = Number(data.vatAmount) || 0;
  const vatPercent = amount > 0 ? Math.round((vatAmount / amount) * 10000) / 100 : 0;

  const now = new Date().toISOString();
  return expenses.insert({
    projectId: data.projectId,
    date: data.date,
    expenseType: data.expenseType || '',
    description: data.description || '',
    amount,
    vatAmount,
    vatPercent,
    billable: data.billable !== false,
    currency: data.currency || client?.currency || 'GBP',
    attachments: [],
    notes: data.notes || '',
    createdAt: now,
    updatedAt: now,
  });
}

export async function update(id, data) {
  const existing = await expenses.findOne({ _id: id });
  assertNotLocked(existing);

  const now = new Date().toISOString();
  const updateData = { ...data, updatedAt: now };
  delete updateData._id;
  delete updateData.createdAt;
  delete updateData.attachments;
  delete updateData.isLocked;
  delete updateData.isLockedReason;

  // Type coercion
  if (updateData.amount !== undefined) updateData.amount = Number(updateData.amount);
  if (updateData.vatAmount !== undefined) updateData.vatAmount = Number(updateData.vatAmount);

  // Validation
  if (updateData.date) {
    const today = new Date().toISOString().split('T')[0];
    if (updateData.date > today) {
      throw new Error('Expense date cannot be in the future');
    }
  }

  // Recompute vatPercent when amount or vatAmount changes
  if (updateData.amount !== undefined || updateData.vatAmount !== undefined) {
    const finalAmount = updateData.amount ?? existing.amount ?? 0;
    const finalVat = updateData.vatAmount ?? existing.vatAmount ?? 0;
    updateData.vatPercent = finalAmount > 0 ? Math.round((finalVat / finalAmount) * 10000) / 100 : 0;
  }

  await expenses.update({ _id: id }, { $set: updateData });
  return getById(id);
}

export async function remove(id) {
  const existing = await expenses.findOne({ _id: id });
  assertNotLocked(existing);
  await removeAllAttachments(id);
  return expenses.remove({ _id: id });
}

export async function getDistinctTypes() {
  const all = await expenses.find({});
  const types = [...new Set(all.map((e) => e.expenseType).filter(Boolean))];
  return types.sort();
}
