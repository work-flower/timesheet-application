import { Router } from 'express';
import als from '../logging/asyncContext.js';
import * as projectService from '../services/projectService.js';
import * as timesheetService from '../services/timesheetService.js';
import * as expenseService from '../services/expenseService.js';
import * as calendarService from '../services/calendarService.js';

const router = Router();

// -- Tool definitions --------------------------------------------------------

const tools = [
  {
    name: 'list_projects',
    description:
      `List active projects. IMPORTANT: Call this FIRST before every create_timesheet or create_expense call to get the correct projectId. Never reuse a projectId from a previous session.
Returns: projectId, name, clientName, workingHoursPerDay.`,
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Filter projects by name or client name' },
      },
    },
  },
  {
    name: 'create_timesheet',
    description:
      `Create a timesheet entry. The API computes days and amount automatically.

Follow this flow for EVERY entry (each entry is an independent session — never reuse projectId from a previous entry):
1. Call list_projects to find the project. Never skip this step.
2. Confirm the project with the user before proceeding.
3. Default date is today. Default hours is the project's workingHoursPerDay (typically 7.5 or 8).
4. Notes/description is mandatory — ask the user what they worked on.
5. Present a summary of what will be logged (project, date, hours, notes) and only submit after the user confirms.`,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (from list_projects)' },
        date: { type: 'string', description: 'YYYY-MM-DD (default: today)' },
        hours: { type: 'number', description: 'Hours worked, 0.25-24 in 0.25 increments' },
        notes: { type: 'string', description: 'What was worked on' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'create_expense',
    description:
      `Create an expense entry. The API computes vatPercent, netAmount, and inherits currency automatically.

Follow this flow (each entry is an independent session — never reuse projectId from a previous entry):
1. If the user shared a receipt photo, read it with vision to extract: date, amount, VAT, description, expense type, and external reference (invoice number, order ID, receipt number, or any reference identifier visible on the document).
2. Call list_projects to find the project. Never skip this step.
3. Present extracted/provided data for user confirmation before submitting.
4. Only submit when the user confirms the details are correct.
5. After creation, if the user shared a receipt image, use the "Upload Expense Image Skill" skill to upload the image to the attachment URL returned in the response. If the skill is not available, provide the attachment URL to the user so they can upload manually.`,
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (from list_projects)' },
        date: { type: 'string', description: 'YYYY-MM-DD (default: today)' },
        amount: { type: 'number', description: 'Gross total paid including VAT' },
        expenseType: { type: 'string', description: 'Type (e.g. Travel, Equipment, Meals)' },
        description: { type: 'string', description: 'Client-facing description' },
        vatAmount: { type: 'number', description: 'VAT portion included in amount (default: 0)' },
        billable: { type: 'boolean', description: 'Billable to client (default: true)' },
        externalReference: { type: 'string', description: 'Invoice number, order ID, receipt number, or other external reference from the source document' },
        notes: { type: 'string', description: 'Internal notes (not visible to client)' },
      },
      required: ['projectId', 'amount'],
    },
  },
  {
    name: 'list_recent_timesheets',
    description: 'List recent timesheet entries with project and client names, plus totals summary.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days to look back (default: 7)' },
      },
    },
  },
  {
    name: 'list_recent_expenses',
    description: 'List recent expense entries with project and client names, plus billable/total split.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days to look back (default: 30)' },
      },
    },
  },
  {
    name: 'list_calendar_events',
    description: 'List calendar events for a date range. Useful for checking your schedule before logging time.',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'YYYY-MM-DD start of range (default: today)' },
        endDate: { type: 'string', description: 'YYYY-MM-DD end of range (default: same as startDate)' },
      },
    },
  },
];

// -- Tool handlers -----------------------------------------------------------

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function fmtGBP(n) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
}

// Normalise OData response shape
function rows(response) {
  return Array.isArray(response) ? response : (response.value || []);
}

const handlers = {
  async list_projects({ search } = {}) {
    const params = { $filter: "status eq 'active'" };
    if (search) {
      params.$filter += ` and (contains(name,'${search}') or contains(clientName,'${search}'))`;
    }
    const data = rows(await projectService.getAll(params));
    const projects = data.map(p => [
      `${p.name} (${p.clientName}) — ${p.effectiveWorkingHours}h/day`,
      `  projectId: ${p._id}`,
    ].join('\n')).join('\n\n');

    return projects || 'No active projects found.';
  },

  async create_timesheet({ projectId, date, hours, notes } = {}) {
    const result = await timesheetService.create({
      projectId,
      date: date || today(),
      hours: hours || 8,
      notes: notes || '',
    });

    let msg = `Timesheet created: ${result.hours} hours (${result.days.toFixed(2)} days) on ${result.date}. Notes: ${result.notes || '—'}`;
    if (result.warnings?.length) {
      msg += `\n⚠️ ${result.warnings.join('\n⚠️ ')}`;
    }
    return msg;
  },

  async create_expense({ projectId, date, amount, expenseType, description, vatAmount, billable, externalReference, notes } = {}) {
    const data = { projectId, date: date || today(), amount };
    if (expenseType != null) data.expenseType = expenseType;
    if (description != null) data.description = description;
    if (vatAmount != null) data.vatAmount = vatAmount;
    if (billable != null) data.billable = billable;
    if (externalReference != null) data.externalReference = externalReference;
    if (notes != null) data.notes = notes;

    const result = await expenseService.create(data);

    return `Expense created (ID: ${result._id}): ${fmtGBP(result.amount)} (VAT ${fmtGBP(result.vatAmount)}, net ${fmtGBP(result.netAmount)}) on ${result.date}. Type: ${result.expenseType || '—'}. Description: ${result.description || '—'}.\nReceipt upload page: /expenses/${result._id}/attachments/upload`;
  },

  async list_recent_timesheets({ days: lookback } = {}) {
    const n = lookback || 7;
    const startDate = daysAgo(n);
    const endDate = today();
    const data = rows(await timesheetService.getAll({ startDate, endDate, $orderby: 'date desc' }));

    if (data.length === 0) return `No timesheet entries in the last ${n} days.`;

    const totalHours = data.reduce((s, e) => s + (e.hours || 0), 0);
    const totalDays = data.reduce((s, e) => s + (e.days || 0), 0);

    const lines = data.map(e =>
      `  ${e.date} | ${e.projectName} (${e.clientName}) | ${e.hours}h (${(e.days || 0).toFixed(2)}d) | ${e.notes || '—'}`
    );

    return [
      `Timesheets from ${startDate} to ${endDate}:`,
      ...lines,
      '',
      `Totals: ${totalHours}h (${totalDays.toFixed(2)} days)`,
    ].join('\n');
  },

  async list_calendar_events({ startDate, endDate } = {}) {
    const start = startDate || today();
    const end = endDate || start;
    const data = rows(await calendarService.getEvents({ startDate: start, endDate: end }));

    if (data.length === 0) return `No calendar events from ${start} to ${end}.`;

    const lines = data.map(e => {
      const time = e.allDay ? 'All day' : `${e.start.slice(11, 16)}–${e.end.slice(11, 16)}`;
      const loc = e.location ? ` | ${e.location}` : '';
      return `  ${e.start.slice(0, 10)} | ${time} | ${e.summary} (${e.sourceName})${loc}`;
    });

    return [
      `Calendar events from ${start} to ${end}:`,
      ...lines,
    ].join('\n');
  },

  async list_recent_expenses({ days: lookback } = {}) {
    const n = lookback || 30;
    const startDate = daysAgo(n);
    const endDate = today();
    const data = rows(await expenseService.getAll({ startDate, endDate, $orderby: 'date desc' }));

    if (data.length === 0) return `No expenses in the last ${n} days.`;

    const billable = data.filter(e => e.billable);
    const nonBillable = data.filter(e => !e.billable);
    const billableTotal = billable.reduce((s, e) => s + (e.amount || 0), 0);
    const nonBillableTotal = nonBillable.reduce((s, e) => s + (e.amount || 0), 0);

    const lines = data.map(e =>
      `  ${e.date} | ${e.projectName} (${e.clientName}) | ${e.expenseType || '—'} | ${fmtGBP(e.amount)} | ${e.billable ? 'billable' : 'non-billable'} | ${e.description || '—'}`
    );

    return [
      `Expenses from ${startDate} to ${endDate}:`,
      ...lines,
      '',
      `Totals: ${fmtGBP(billableTotal + nonBillableTotal)} (billable: ${fmtGBP(billableTotal)}, non-billable: ${fmtGBP(nonBillableTotal)})`,
    ].join('\n');
  },
};

// -- JSON-RPC 2.0 handler ----------------------------------------------------

function jsonrpc(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonrpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

router.post('/', async (req, res) => {
  const { jsonrpc: version, id, method, params } = req.body;

  if (version !== '2.0') {
    return res.json(jsonrpcError(id, -32600, 'Invalid JSON-RPC version'));
  }

  if (method === 'initialize') {
    return res.json(jsonrpc(id, {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'timesheet', version: '1.0.0' },
      capabilities: { tools: {} },
    }));
  }

  if (method === 'notifications/initialized') {
    return res.status(204).end();
  }

  if (method === 'tools/list') {
    return res.json(jsonrpc(id, { tools }));
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const toolArgs = params?.arguments || {};
    const handler = handlers[toolName];

    // Enrich ALS context with tool name
    const store = als.getStore();
    if (store) store.toolName = toolName;

    if (!handler) {
      return res.json(jsonrpc(id, {
        content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
        isError: true,
      }));
    }

    try {
      const text = await handler(toolArgs);
      return res.json(jsonrpc(id, {
        content: [{ type: 'text', text }],
      }));
    } catch (err) {
      console.error(err.message);
      return res.json(jsonrpc(id, {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      }));
    }
  }

  return res.json(jsonrpcError(id, -32601, `Unknown method: ${method}`));
});

export default router;
