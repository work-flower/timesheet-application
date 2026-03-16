import { clients, projects, timesheets } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';
import { assertNotLocked } from './lockCheck.js';

export async function getAll(query = {}) {
  // Build base filter from legacy params
  const baseFilter = {};

  if (query.projectId) {
    baseFilter.projectId = query.projectId;
  }

  if (query.startDate || query.endDate) {
    baseFilter.date = {};
    if (query.startDate) baseFilter.date.$gte = query.startDate;
    if (query.endDate) baseFilter.date.$lte = query.endDate;
  }

  // OData query merged with base filter
  const { results: entries, totalCount, summaryData } = await buildQuery(
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
  return formatResponse(items, totalCount, query.$count === 'true', summaryData);
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

  const warnings = [];
  if (data.effectiveWorkingHours != null && data.effectiveWorkingHours !== effectiveWorkingHours) {
    warnings.push(`effectiveWorkingHours ${data.effectiveWorkingHours} provided by client ignored — project value ${effectiveWorkingHours} used`);
  }
  if (data.effectiveRate != null && data.effectiveRate !== effectiveRate) {
    warnings.push(`effectiveRate ${data.effectiveRate} provided by client ignored — project value ${effectiveRate} used`);
  }

  const now = new Date().toISOString();
  const inserted = await timesheets.insert({
    projectId: data.projectId,
    clientId: project.clientId,
    date: data.date,
    hours,
    days,
    amount,
    notes: data.notes || '',
    createdAt: now,
    updatedAt: now,
  });

  if (warnings.length) inserted.warnings = warnings;
  return inserted;
}

export async function update(id, data) {
  const existing = await timesheets.findOne({ _id: id });
  assertNotLocked(existing);

  const now = new Date().toISOString();
  const updateData = { ...data, updatedAt: now };
  delete updateData._id;
  delete updateData.createdAt;
  delete updateData.isLocked;
  delete updateData.isLockedReason;

  // Type coercion
  if (updateData.hours !== undefined) updateData.hours = Number(updateData.hours);

  // Validation
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

  // Detect mismatched override fields
  const warnings = [];

  // Recompute days and amount only when hours or project changed
  if (updateData.hours != null || updateData.projectId != null) {
    const finalHours = updateData.hours ?? existing.hours;
    const finalProjectId = updateData.projectId ?? existing.projectId;
    const project = await projects.findOne({ _id: finalProjectId });
    if (!project) throw new Error('Project not found');
    const client = await clients.findOne({ _id: project.clientId });
    const effectiveRate = project.rate != null ? project.rate : (client?.defaultRate || 0);
    const effectiveWorkingHours = project.workingHoursPerDay != null
      ? project.workingHoursPerDay : (client?.workingHoursPerDay || 8);

    if (updateData.effectiveWorkingHours != null && updateData.effectiveWorkingHours !== effectiveWorkingHours) {
      warnings.push(`effectiveWorkingHours ${updateData.effectiveWorkingHours} provided by client ignored — project value ${effectiveWorkingHours} used`);
    }
    if (updateData.effectiveRate != null && updateData.effectiveRate !== effectiveRate) {
      warnings.push(`effectiveRate ${updateData.effectiveRate} provided by client ignored — project value ${effectiveRate} used`);
    }

    updateData.clientId = project.clientId;
    updateData.days = finalHours / effectiveWorkingHours;
    updateData.amount = updateData.days * effectiveRate;
  }

  // Strip non-stored fields
  delete updateData.effectiveRate;
  delete updateData.effectiveWorkingHours;

  await timesheets.update({ _id: id }, { $set: updateData });
  const result = await getById(id);
  if (warnings.length) result.warnings = warnings;
  return result;
}

export async function remove(id) {
  const existing = await timesheets.findOne({ _id: id });
  assertNotLocked(existing);
  return timesheets.remove({ _id: id });
}
