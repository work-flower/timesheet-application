import { clients, projects, timesheets } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';

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

  // OData query merged with base filter
  const { results: entries, totalCount } = await buildQuery(
    timesheets, query, { date: -1 }, baseFilter
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
      days: entry.days ?? null,
      amount: entry.amount ?? null,
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

  // Group if requested (applied after OData pipeline)
  if (query.groupBy) {
    return groupEntries(enriched, query.groupBy);
  }

  const items = applySelect(enriched, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
}

function groupEntries(entries, groupBy) {
  const groups = {};

  for (const entry of entries) {
    let key;
    if (groupBy === 'week') {
      const d = new Date(entry.date);
      const dayOfWeek = d.getDay() || 7;
      const monday = new Date(d);
      monday.setDate(d.getDate() - dayOfWeek + 1);
      key = monday.toISOString().split('T')[0];
    } else if (groupBy === 'month') {
      key = entry.date.substring(0, 7);
    } else if (groupBy === 'year') {
      key = entry.date.substring(0, 4);
    } else {
      key = entry.date;
    }

    if (!groups[key]) {
      groups[key] = { period: key, totalHours: 0, totalDays: 0, totalAmount: 0, entries: [] };
    }
    groups[key].totalHours += entry.hours;
    groups[key].totalDays += entry.days || 0;
    groups[key].totalAmount += entry.amount || 0;
    groups[key].entries.push(entry);
  }

  return Object.values(groups).sort((a, b) => b.period.localeCompare(a.period));
}

export async function getById(id) {
  const entry = await timesheets.findOne({ _id: id });
  if (!entry) return null;

  const project = await projects.findOne({ _id: entry.projectId });
  const client = project ? await clients.findOne({ _id: project.clientId }) : null;
  const effectiveRate = project
    ? (project.rate != null ? project.rate : (client?.defaultRate || 0))
    : 0;

  const effectiveWorkingHours = project
    ? (project.workingHoursPerDay != null ? project.workingHoursPerDay : (client?.workingHoursPerDay || 8))
    : 8;

  return {
    ...entry,
    projectName: project?.name || 'Unknown',
    clientName: client?.companyName || 'Unknown',
    clientId: project?.clientId || null,
    effectiveRate,
    effectiveWorkingHours,
    days: entry.days ?? null,
    amount: entry.amount ?? null,
  };
}

export async function create(data) {
  // Validation
  const today = new Date().toISOString().split('T')[0];
  if (data.date > today) {
    throw new Error('Timesheet date cannot be in the future');
  }

  const hours = Number(data.hours);
  if (hours < 0.25 || hours > 24) {
    throw new Error('Hours must be between 0.25 and 24');
  }
  if (hours % 0.25 !== 0) {
    throw new Error('Hours must be in 0.25 increments');
  }

  // Compute days and amount from project/client rates
  const project = await projects.findOne({ _id: data.projectId });
  if (!project) throw new Error('Project not found');
  const client = await clients.findOne({ _id: project.clientId });
  const effectiveRate = project.rate != null ? project.rate : (client?.defaultRate || 0);
  const effectiveWorkingHours = project.workingHoursPerDay != null
    ? project.workingHoursPerDay : (client?.workingHoursPerDay || 8);
  const days = hours / effectiveWorkingHours;
  const amount = days * effectiveRate;

  const now = new Date().toISOString();
  return timesheets.insert({
    projectId: data.projectId,
    date: data.date,
    hours,
    days,
    amount,
    notes: data.notes || '',
    createdAt: now,
    updatedAt: now,
  });
}

export async function update(id, data) {
  const now = new Date().toISOString();

  // Only persist known timesheet fields
  const updateData = { updatedAt: now };
  if (data.projectId !== undefined) updateData.projectId = data.projectId;
  if (data.date !== undefined) updateData.date = data.date;
  if (data.hours !== undefined) updateData.hours = Number(data.hours);
  if (data.notes !== undefined) updateData.notes = data.notes;

  if (updateData.date) {
    const today = new Date().toISOString().split('T')[0];
    if (updateData.date > today) {
      throw new Error('Timesheet date cannot be in the future');
    }
  }

  if (updateData.hours != null) {
    if (updateData.hours < 0.25 || updateData.hours > 24) {
      throw new Error('Hours must be between 0.25 and 24');
    }
    if (updateData.hours % 0.25 !== 0) {
      throw new Error('Hours must be in 0.25 increments');
    }
  }

  // Recompute days and amount only when hours or project changed
  if (updateData.hours != null || updateData.projectId != null) {
    const existing = await timesheets.findOne({ _id: id });
    const finalHours = updateData.hours ?? existing.hours;
    const finalProjectId = updateData.projectId ?? existing.projectId;
    const project = await projects.findOne({ _id: finalProjectId });
    if (!project) throw new Error('Project not found');
    const client = await clients.findOne({ _id: project.clientId });
    const effectiveRate = project.rate != null ? project.rate : (client?.defaultRate || 0);
    const effectiveWorkingHours = project.workingHoursPerDay != null
      ? project.workingHoursPerDay : (client?.workingHoursPerDay || 8);
    updateData.days = finalHours / effectiveWorkingHours;
    updateData.amount = updateData.days * effectiveRate;
  }

  await timesheets.update({ _id: id }, { $set: updateData });
  return getById(id);
}

export async function remove(id) {
  return timesheets.remove({ _id: id });
}
