import { clients, projects, timesheets } from '../db/index.js';

export async function getAll() {
  return clients.find({}).sort({ companyName: 1 });
}

export async function getById(id) {
  const client = await clients.findOne({ _id: id });
  if (!client) return null;

  const clientProjects = await projects.find({ clientId: id }).sort({ isDefault: -1, name: 1 });
  const projectIds = clientProjects.map((p) => p._id);
  const clientTimesheets = await timesheets.find({ projectId: { $in: projectIds } }).sort({ date: -1 });

  // Enrich timesheets with project info
  const projectMap = Object.fromEntries(clientProjects.map((p) => [p._id, p]));
  const enrichedTimesheets = clientTimesheets.map((ts) => ({
    ...ts,
    projectName: projectMap[ts.projectId]?.name || 'Unknown',
  }));

  return { ...client, projects: clientProjects, timesheets: enrichedTimesheets };
}

export async function create(data) {
  const now = new Date().toISOString();
  const client = await clients.insert({
    companyName: data.companyName || '',
    primaryContactName: data.primaryContactName || '',
    primaryContactEmail: data.primaryContactEmail || '',
    primaryContactPhone: data.primaryContactPhone || '',
    defaultRate: data.defaultRate || 0,
    currency: data.currency || 'GBP',
    workingHoursPerDay: data.workingHoursPerDay ?? 8,
    notes: data.notes || '',
    createdAt: now,
    updatedAt: now,
  });

  // Auto-create default project
  await projects.insert({
    clientId: client._id,
    endClientId: null,
    name: 'Default Project',
    ir35Status: data.ir35Status || 'OUTSIDE_IR35',
    rate: null,
    workingHoursPerDay: null,
    isDefault: true,
    status: 'active',
    notes: '',
    createdAt: now,
    updatedAt: now,
  });

  return client;
}

export async function update(id, data) {
  const now = new Date().toISOString();
  const updateData = { ...data, updatedAt: now };
  delete updateData._id;
  delete updateData.createdAt;
  await clients.update({ _id: id }, { $set: updateData });
  return clients.findOne({ _id: id });
}

export async function remove(id) {
  // Cascade: delete all timesheets for this client's projects, then projects, then client
  const clientProjects = await projects.find({ clientId: id });
  const projectIds = clientProjects.map((p) => p._id);

  if (projectIds.length > 0) {
    await timesheets.remove({ projectId: { $in: projectIds } }, { multi: true });
  }
  await projects.remove({ clientId: id }, { multi: true });
  return clients.remove({ _id: id });
}
