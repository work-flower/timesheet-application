import als from '../logging/asyncContext.js';
import { isAuthEnabled } from '../pipeline/authFlag.js';
import agentToolDefs from '../db/agentToolDefs.js';
import * as projectService from './projectService.js';
import * as timesheetService from './timesheetService.js';
import * as expenseService from './expenseService.js';
import * as calendarService from './calendarService.js';
import * as ticketService from './ticketService.js';
import * as invoiceService from './invoiceService.js';
import * as clientService from './clientService.js';
import * as transactionService from './transactionService.js';
import * as pageContentStore from './pageContentStore.js';

/**
 * Provider-neutral application tool registry — shared by BOTH consumers:
 *   - the MCP endpoint (server/routes/mcp.js) exposes tools over JSON-RPC
 *   - the agent layer grants them to cards and executes them in-loop
 *
 * Split model:
 *
 * HANDLERS are code. The `handlers` object maps handlerName → { kind, access,
 * fn } where fn is a named function declared below. kind/access are platform
 * safety metadata the model never sees:
 *   kind   — 'read' executes immediately in an agent loop; 'write' becomes an
 *            action-card proposal requiring user confirmation.
 *   access — { table, op } the tool ultimately exercises; used to pre-filter
 *            tools the caller's roles could never use (the pipeline still
 *            enforces at execution — this only avoids dead-end offers).
 * Adding/removing a handler is a code change here (+ restart). The admin
 * handlers API is derived from this object's keys, so the served list can
 * never drift from the code.
 *
 * DEFINITIONS are data. Admin-managed { name, description, inputSchema,
 * handlerName, enabled } records in agent-tools.db (admin → Agents → App
 * Tools; CRUD in agentToolService.js). reloadTools() hydrates them into the
 * `tools` / `toolsByName` live-binding cache — at boot and after every admin
 * mutation: enabled definitions are merged with their handler's kind/access;
 * a stale handlerName (handler removed from code) or a disabled definition is
 * warn+excluded, so MCP tools/list, grant resolution and the routing corpus
 * all self-heal. Execution always resolves definition → handlerName → fn,
 * never handlers[toolName] directly (N definitions may map to one handler).
 *
 * Handlers call pipeline-wrapped services, so they run under whatever identity
 * is in the ALS scope — caller-scoped from HTTP requests, system from
 * background jobs. See the "Adding / retiring a tool" runbook in
 * .claude/docs/agents.md for the downstream chain.
 */

// -- Handler registry (code) -------------------------------------------------

export const handlers = {
  list_projects: { kind: 'read', access: { table: 'projects', op: 'read' }, fn: listProjects },
  create_timesheet: { kind: 'write', access: { table: 'timesheets', op: 'create' }, fn: createTimesheet },
  create_expense: { kind: 'write', access: { table: 'expenses', op: 'create' }, fn: createExpense },
  list_recent_timesheets: { kind: 'read', access: { table: 'timesheets', op: 'read' }, fn: listRecentTimesheets },
  list_recent_expenses: { kind: 'read', access: { table: 'expenses', op: 'read' }, fn: listRecentExpenses },
  list_calendar_events: { kind: 'read', access: { table: 'calendarEvents', op: 'read' }, fn: listCalendarEvents },
  list_tickets: { kind: 'read', access: { table: 'tickets', op: 'read' }, fn: listTickets },
  list_invoices: { kind: 'read', access: { table: 'invoices', op: 'read' }, fn: listInvoices },
  get_invoice: { kind: 'read', access: { table: 'invoices', op: 'read' }, fn: getInvoice },
  // Also reads expenses/clients; access is only the dead-end pre-filter (the
  // pipeline enforces every read at execution) — timesheets is the tightest
  // single-table proxy.
  list_unbilled_items: { kind: 'read', access: { table: 'timesheets', op: 'read' }, fn: listUnbilledItems },
  // No table — reads the caller's own in-memory page snapshot; access: null
  // means canUseTool always passes it.
  get_page_content: { kind: 'read', access: null, fn: getPageContent },
};

// -- Seed definitions --------------------------------------------------------

// Inserted into agent-tools.db by agentToolService.ensureDefaults() — any seed
// whose name is absent from the store is inserted at boot, so defaults are
// guaranteed present (admins opt out by DISABLING a definition, not deleting
// it). handlerName === name keeps existing card grants, transcripts, proposals
// and eval examples working.
export const seedDefinitions = [
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
    handlerName: 'list_projects',
    enabled: true,
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
    handlerName: 'create_timesheet',
    enabled: true,
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
    handlerName: 'create_expense',
    enabled: true,
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
    handlerName: 'list_recent_timesheets',
    enabled: true,
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
    handlerName: 'list_recent_expenses',
    enabled: true,
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
    handlerName: 'list_calendar_events',
    enabled: true,
  },
  {
    name: 'list_tickets',
    description: 'List tickets from configured Jira and Azure DevOps sources. Returns cached ticket data.',
    inputSchema: {
      type: 'object',
      properties: {
        state: { type: 'string', description: 'Filter by ticket state/status' },
        assignedTo: { type: 'string', description: 'Filter by assigned person (partial match)' },
        search: { type: 'string', description: 'Search in ticket title' },
      },
    },
    handlerName: 'list_tickets',
    enabled: true,
  },
  {
    name: 'list_invoices',
    description:
      `List invoices with client name, dates, lifecycle status, payment status and totals, plus a gross/outstanding summary line.
Filter by status (draft/confirmed/posted), paymentStatus (unpaid/paid/overdue — only meaningful on posted invoices), client (a clientId or partial company name), or invoice date range.
Each row includes an invoiceId — drafts have no invoice number yet, so use the invoiceId with get_invoice for details.`,
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: "Filter by lifecycle status: 'draft', 'confirmed' or 'posted'" },
        paymentStatus: { type: 'string', description: "Filter by payment status: 'unpaid', 'paid' or 'overdue'" },
        client: { type: 'string', description: 'Filter by client: a clientId or a (partial) company name' },
        startDate: { type: 'string', description: 'YYYY-MM-DD — invoices dated on/after this' },
        endDate: { type: 'string', description: 'YYYY-MM-DD — invoices dated on/before this' },
      },
    },
    handlerName: 'list_invoices',
    enabled: true,
  },
  {
    name: 'get_invoice',
    description:
      `Get one invoice in full: header (number, client, dates, status, payment status), all line items, totals, linked payment transactions and remaining balance.
Accepts EITHER an invoiceId OR a human invoice number like "JBL00012" (case-insensitive) — users normally quote the number.
Unnumbered drafts have no invoice number: find their invoiceId with list_invoices first.`,
    inputSchema: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', description: 'Invoice record ID (from list_invoices)' },
        invoiceNumber: { type: 'string', description: 'Invoice number, e.g. JBL00012 (case-insensitive)' },
      },
    },
    handlerName: 'get_invoice',
    enabled: true,
  },
  {
    name: 'list_unbilled_items',
    description:
      `List a client's unbilled (not yet invoiced) timesheets and expenses with per-section totals — useful before drafting an invoice to see what can be billed.
Provide the client as a clientId or a (partial) company name. If the name matches several clients the tool returns the candidates so you can ask the user which one they mean.
Expenses are marked billable/non-billable — only billable expenses belong on an invoice. Optionally restrict by date range.`,
    inputSchema: {
      type: 'object',
      properties: {
        client: { type: 'string', description: 'Client ID or (partial) company name' },
        startDate: { type: 'string', description: 'YYYY-MM-DD — items on/after this date' },
        endDate: { type: 'string', description: 'YYYY-MM-DD — items on/before this date' },
      },
      required: ['client'],
    },
    handlerName: 'list_unbilled_items',
    enabled: true,
  },
  {
    name: 'get_page_content',
    description:
      `Get the content of the application page the user is currently viewing, as compact markdown: route, title, capture time, grids as markdown tables, form fields as "Label [input: value]" markers — including values the user has typed but not saved.
Call this when the user refers to what they are looking at ("this page", "this invoice", "here", "what am I looking at?") or when their request lacks context that the current screen would supply.
The snapshot exists only while the user's chat pane is open; { ok: false, reason: 'page_view_unavailable' } means no page view is available right now — answer without it.`,
    inputSchema: { type: 'object', properties: {} },
    handlerName: 'get_page_content',
    enabled: true,
  },
];

// -- Effective tool cache ----------------------------------------------------

// Live bindings: reassigned by reloadTools(), importers see the new values.
// Each entry = enabled definition + its handler's kind/access:
//   { name, description, inputSchema, handlerName, kind, access }
export let tools = [];
export let toolsByName = new Map();

/**
 * Rebuild the effective tool cache from agent-tools.db. Called at boot
 * (agentToolService.ensureDefaults) and after every definition mutation —
 * definition edits are runtime data, no restart needed.
 */
export async function reloadTools() {
  const docs = await agentToolDefs.find({ enabled: { $ne: false } });
  const next = [];
  for (const def of docs) {
    const handler = handlers[def.handlerName];
    if (!handler) {
      console.warn(`Tool definition "${def.name}": handler "${def.handlerName}" is not in the code registry — excluded (removed?).`);
      continue;
    }
    // Self-heal schemas a provider would reject (Anthropic requires a
    // top-level type: 'object' and fails the whole request otherwise).
    let inputSchema = def.inputSchema;
    if (typeof inputSchema !== 'object' || inputSchema === null || Array.isArray(inputSchema)) {
      if (inputSchema != null) console.warn(`Tool definition "${def.name}": stored inputSchema is not an object — using an empty object schema.`);
      inputSchema = { type: 'object', properties: {} };
    } else if (Object.keys(inputSchema).length === 0) {
      inputSchema = { type: 'object', properties: {} };
    } else if (inputSchema.type === undefined) {
      inputSchema = { type: 'object', ...inputSchema };
    }
    next.push({
      name: def.name,
      description: def.description,
      inputSchema,
      handlerName: def.handlerName,
      kind: handler.kind,
      access: handler.access,
    });
  }
  next.sort((a, b) => a.name.localeCompare(b.name));
  tools = next;
  toolsByName = new Map(next.map((t) => [t.name, t]));
}

/**
 * Pre-flight privilege check: can the CURRENT ALS identity ever use this tool?
 * Mirrors the requireAction predicate (pipeline/authorisation.js) — pass when
 * auth is off, execution is system/superuser, or the caller holds a truthy
 * grant for the tool's { table, op }. Tools without access metadata always
 * pass. The pipeline still enforces (with record scoping) at execution time;
 * this only avoids offering tools that are guaranteed to be denied.
 */
export function canUseTool(tool) {
  if (!tool?.access) return true;
  if (!isAuthEnabled()) return true;
  const auth = als.getStore()?.auth;
  if (auth?.system || auth?.superuser) return true;
  const grant = auth?.grants?.[tool.access.table]?.[tool.access.op];
  return grant !== undefined && grant !== false;
}

// -- Handler functions -------------------------------------------------------

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

async function listProjects({ search } = {}) {
  // Static $filter only — interpolating the search here both risked a parse
  // failure (unescaped quotes silently drop the WHOLE filter, active guard
  // included) and never matched clientName, which is enrichment-only, not a
  // stored field. Search the enriched rows instead.
  let data = rows(await projectService.getAll({ $filter: "status eq 'active'" }));
  if (search) {
    const q = String(search).toLowerCase();
    data = data.filter(p =>
      (p.name || '').toLowerCase().includes(q) || (p.clientName || '').toLowerCase().includes(q)
    );
  }
  const projects = data.map(p => [
    `${p.name} (${p.clientName}) — ${p.effectiveWorkingHours}h/day`,
    `  projectId: ${p._id}`,
  ].join('\n')).join('\n\n');

  return projects || 'No active projects found.';
}

async function createTimesheet({ projectId, date, hours, notes } = {}) {
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
}

async function createExpense({ projectId, date, amount, expenseType, description, vatAmount, billable, externalReference, notes } = {}) {
  const data = { projectId, date: date || today(), amount };
  if (expenseType != null) data.expenseType = expenseType;
  if (description != null) data.description = description;
  if (vatAmount != null) data.vatAmount = vatAmount;
  if (billable != null) data.billable = billable;
  if (externalReference != null) data.externalReference = externalReference;
  if (notes != null) data.notes = notes;

  const result = await expenseService.create(data);

  return `Expense created (ID: ${result._id}): ${fmtGBP(result.amount)} (VAT ${fmtGBP(result.vatAmount)}, net ${fmtGBP(result.netAmount)}) on ${result.date}. Type: ${result.expenseType || '—'}. Description: ${result.description || '—'}.\nReceipt upload page: /expenses/${result._id}/attachments/upload`;
}

async function listRecentTimesheets({ days: lookback } = {}) {
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
}

async function listCalendarEvents({ startDate, endDate } = {}) {
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
}

async function listRecentExpenses({ days: lookback } = {}) {
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
}

async function listTickets({ state, assignedTo, search } = {}) {
  const params = { $orderby: 'updated desc', $top: '50' };
  if (state) params.state = state;
  if (assignedTo) params.assignedTo = assignedTo;

  const data = rows(await ticketService.getTickets(params));

  let filtered = data;
  if (search) {
    const q = search.toLowerCase();
    filtered = data.filter(t => (t.title || '').toLowerCase().includes(q) || (t.externalId || '').toLowerCase().includes(q));
  }

  if (filtered.length === 0) return 'No tickets found matching the criteria.';

  const lines = filtered.map(t =>
    `  ${t.externalId} | ${t.title} | ${t.state} | ${t.assignedTo || '—'} | Sprint: ${t.sprint || '—'} | ${t.areaPath} (${t.sourceName})`
  );

  return [
    `Tickets (${filtered.length}):`,
    ...lines,
  ].join('\n');
}

// Resolve a client argument (clientId or partial company name) to a unique
// client. Returns { client } on a unique match, else { message } — handlers
// return that text directly so the agent can relay or disambiguate.
async function resolveClient(client) {
  if (!client) return { message: 'Provide a client (clientId or company name).' };
  const all = rows(await clientService.getAll({}));
  const exact = all.find(c => c._id === client);
  const matches = exact ? [exact] : all.filter(c => (c.companyName || '').toLowerCase().includes(String(client).toLowerCase()));
  if (matches.length === 1) return { client: matches[0] };
  const list = (matches.length ? matches : all).map(c => `  ${c.companyName} (clientId: ${c._id})`).join('\n');
  if (matches.length === 0) return { message: `No client matching "${client}". Known clients:\n${list}` };
  return { message: `"${client}" matches ${matches.length} clients — be more specific or use a clientId:\n${list}` };
}

async function listInvoices({ status, paymentStatus, client, startDate, endDate } = {}) {
  const params = { $orderby: 'invoiceDate desc' };
  if (status) params.status = status;
  if (paymentStatus) params.paymentStatus = paymentStatus;
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (client) {
    const resolved = await resolveClient(client);
    if (!resolved.client) return resolved.message;
    params.clientId = resolved.client._id;
  }

  const data = rows(await invoiceService.getAll(params));
  if (data.length === 0) return 'No invoices found matching the criteria.';

  const lines = data.map(inv => [
    `  ${inv.invoiceNumber || 'Draft'} | ${inv.invoiceDate} | ${inv.clientName} | ${inv.status}/${inv.paymentStatus} | ${fmtGBP(inv.total || 0)} | due ${inv.dueDate}`,
    `    invoiceId: ${inv._id}`,
  ].join('\n'));

  const gross = data.reduce((s, i) => s + (i.total || 0), 0);
  const outstanding = data
    .filter(i => i.status === 'posted' && i.paymentStatus !== 'paid')
    .reduce((s, i) => s + (i.total || 0), 0);

  return [
    `Invoices (${data.length}):`,
    ...lines,
    '',
    `Totals: ${fmtGBP(gross)} gross | outstanding (posted, unpaid): ${fmtGBP(outstanding)}`,
  ].join('\n');
}

async function getInvoice({ invoiceId, invoiceNumber } = {}) {
  let id = invoiceId;
  if (!id && invoiceNumber) {
    const wanted = String(invoiceNumber).trim().toUpperCase();
    // Charset guard keeps the value safe to embed in the $filter string.
    const match = /^[A-Z0-9-]+$/.test(wanted)
      ? rows(await invoiceService.getAll({ $filter: `invoiceNumber eq '${wanted}'` }))[0]
      : null;
    if (!match) return `No invoice with number ${wanted}. Use list_invoices to see existing invoices (drafts have no number yet).`;
    id = match._id;
  }
  if (!id) return 'Provide an invoiceId or an invoice number (e.g. JBL00012).';

  const inv = await invoiceService.getById(id);
  if (!inv) return `Invoice ${id} not found.`;

  const out = [
    `Invoice ${inv.invoiceNumber || 'Draft (no number)'} — ${inv.clientName}`,
    `Status: ${inv.status} | Payment: ${inv.paymentStatus}${inv.paidDate ? ` (paid ${inv.paidDate})` : ''}`,
    `Invoice date: ${inv.invoiceDate} | Due: ${inv.dueDate}`,
    `Service period: ${inv.servicePeriodStart || '—'} to ${inv.servicePeriodEnd || '—'}`,
    '',
    `Lines (${(inv.lines || []).length}):`,
    ...(inv.lines || []).map(l =>
      `  ${l.date || '—'} | ${l.type} | ${l.description || '—'} | ${l.quantity} ${l.unit} × ${fmtGBP(l.unitPrice || 0)} | net ${fmtGBP(l.netAmount || 0)} | VAT ${fmtGBP(l.vatAmount || 0)} | ${fmtGBP(l.grossAmount || 0)}`
    ),
    '',
    `Subtotal ${fmtGBP(inv.subtotal || 0)} | VAT ${fmtGBP(inv.totalVat || 0)} | Total ${fmtGBP(inv.total || 0)}`,
  ];

  // Linked payments resolve via the transactions list (?ids=) — the invoice
  // read model no longer embeds them. Runs under the caller's identity; a
  // caller without transactions read fails loud like every other handler.
  const txs = inv.transactions?.length
    ? rows(await transactionService.getAll({ ids: inv.transactions.join(',') }))
    : [];
  const transactionsTotal = txs.reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
  const remaining = (inv.total || 0) - transactionsTotal;
  if (txs.length) {
    out.push('', `Linked payments (${txs.length}):`);
    out.push(...txs.map(tx => `  ${tx.date} | ${tx.description} | ${fmtGBP(Math.abs(tx.amount || 0))}`));
    out.push(`Payments received: ${fmtGBP(transactionsTotal)} | Remaining balance: ${fmtGBP(remaining)}`);
  } else {
    out.push('', `No linked payments. Remaining balance: ${fmtGBP(remaining)}`);
  }

  return out.join('\n');
}

async function listUnbilledItems({ client, startDate, endDate } = {}) {
  const resolved = await resolveClient(client);
  if (!resolved.client) return resolved.message;
  const { _id: clientId, companyName } = resolved.client;

  // invoiceId eq null compiles to a null-or-absent $or in the OData layer —
  // unbilled filtering happens at the DB, not here.
  const params = { clientId, $filter: 'invoiceId eq null', $orderby: 'date asc' };
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;

  const ts = rows(await timesheetService.getAll({ ...params }));
  const ex = rows(await expenseService.getAll({ ...params }));

  const range = startDate || endDate ? ` (${startDate || '…'} to ${endDate || '…'})` : '';
  if (ts.length === 0 && ex.length === 0) {
    return `No unbilled items for ${companyName}${range}.`;
  }

  const out = [`Unbilled items for ${companyName} (clientId: ${clientId})${range}:`];

  out.push('', `Timesheets (${ts.length}):`);
  if (ts.length) {
    out.push(...ts.map(e =>
      `  ${e.date} | ${e.projectName} | ${e.hours}h (${(e.days || 0).toFixed(2)}d) | ${fmtGBP(e.amount || 0)} | ${e.notes || '—'}`
    ));
    const totalHours = ts.reduce((s, e) => s + (e.hours || 0), 0);
    const totalDays = ts.reduce((s, e) => s + (e.days || 0), 0);
    const tsTotal = ts.reduce((s, e) => s + (e.amount || 0), 0);
    out.push(`  Subtotal: ${totalHours}h (${totalDays.toFixed(2)} days) — ${fmtGBP(tsTotal)} net`);
  } else {
    out.push('  None.');
  }

  out.push('', `Expenses (${ex.length}):`);
  if (ex.length) {
    out.push(...ex.map(e =>
      `  ${e.date} | ${e.projectName} | ${e.expenseType || '—'} | ${fmtGBP(e.amount || 0)} | ${e.billable ? 'billable' : 'non-billable'} | ${e.description || '—'}`
    ));
    const billableTotal = ex.filter(e => e.billable).reduce((s, e) => s + (e.amount || 0), 0);
    const nonBillableTotal = ex.filter(e => !e.billable).reduce((s, e) => s + (e.amount || 0), 0);
    out.push(`  Subtotal: ${fmtGBP(billableTotal + nonBillableTotal)} gross (billable: ${fmtGBP(billableTotal)}, non-billable: ${fmtGBP(nonBillableTotal)})`);
  } else {
    out.push('  None.');
  }

  return out.join('\n');
}

// Current-page snapshot pushed by the caller's own browser (Copilot pane).
// Identity comes from ALS ONLY — the schema has no userId on purpose, so a
// prompt injection can never read another user's page. The snapshot itself
// is already role/fls-filtered: the browser only ever held what this caller
// was allowed to see.
async function getPageContent() {
  const entry = await pageContentStore.get(pageContentStore.identityKey());
  if (!entry) {
    return JSON.stringify({
      ok: false,
      reason: 'page_view_unavailable',
      hint: 'The user has no chat pane open on an app page right now — answer without the page view.',
    });
  }
  return JSON.stringify({
    ok: true,
    route: entry.route,
    title: entry.title,
    capturedAt: entry.capturedAt,
    content: entry.content,
  });
}
