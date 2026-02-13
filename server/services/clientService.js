import { clients, projects, timesheets, expenses, invoices } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';
import { removeAllAttachments } from './expenseAttachmentService.js';
import { removeByClientId as removeInvoicesByClientId } from './invoiceService.js';

export async function getAll(query = {}) {
  const { results, totalCount } = await buildQuery(clients, query, { companyName: 1 });

  // $expand
  if (query.$expand) {
    const expands = query.$expand.split(',').map(s => s.trim());
    for (const item of results) {
      if (expands.includes('projects')) {
        item.projects = await projects.find({ clientId: item._id });
      }
      if (expands.includes('timesheets')) {
        const clientProjects = item.projects || await projects.find({ clientId: item._id });
        const projectIds = clientProjects.map(p => p._id);
        item.timesheets = await timesheets.find({ projectId: { $in: projectIds } });
      }
      if (expands.includes('expenses')) {
        const clientProjects = item.projects || await projects.find({ clientId: item._id });
        const projectIds = clientProjects.map(p => p._id);
        item.expenses = await expenses.find({ projectId: { $in: projectIds } });
      }
      if (expands.includes('invoices')) {
        item.invoices = await invoices.find({ clientId: item._id });
      }
    }
  }

  const items = applySelect(results, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
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

  // Expenses for all client projects
  const clientExpenses = await expenses.find({ projectId: { $in: projectIds } }).sort({ date: -1 });
  const enrichedExpenses = clientExpenses.map((exp) => ({
    ...exp,
    projectName: projectMap[exp.projectId]?.name || 'Unknown',
  }));

  // Invoices for this client
  const clientInvoices = await invoices.find({ clientId: id }).sort({ createdAt: -1 });

  return { ...client, projects: clientProjects, timesheets: enrichedTimesheets, expenses: enrichedExpenses, invoices: clientInvoices };
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
    invoicingEntityName: data.invoicingEntityName || '',
    invoicingEntityAddress: data.invoicingEntityAddress || '',
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
    vatPercent: data.vatPercent != null ? Number(data.vatPercent) : 20,
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
    // Cascade delete expenses + attachment files
    const clientExpenses = await expenses.find({ projectId: { $in: projectIds } });
    for (const exp of clientExpenses) {
      await removeAllAttachments(exp._id);
    }
    await expenses.remove({ projectId: { $in: projectIds } }, { multi: true });
  }
  await projects.remove({ clientId: id }, { multi: true });
  // Cascade delete invoices (unlocks any locked items first)
  await removeInvoicesByClientId(id);
  return clients.remove({ _id: id });
}
