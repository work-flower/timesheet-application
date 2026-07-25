/**
 * Authorisation registry — single source of truth for table and action names.
 * Shared between server (role validation, enforcement) and frontends (Roles editor).
 * Pure data, no imports.
 */

// Every pipeline-wrapped collection. A role may only grant privileges on these.
export const TABLES = [
  'clients',
  'projects',
  'timesheets',
  'settings',
  'documents',
  'expenses',
  'invoices',
  'transactions',
  'importJobs',
  'stagedTransactions',
  'notebooks',
  'dailyPlans',
  'todos',
  'calendarSources',
  'calendarEvents',
  'ticketSources',
  'tickets',
  'users',
  'roles',
];

// Named non-CRUD lifecycle actions per table. Default deny applies to actions too.
export const ACTIONS = {
  invoices: ['confirm', 'post', 'unconfirm', 'updatePayment'],
  stagedTransactions: ['submit'],
  importJobs: ['abandon'],
  calendarSources: ['refresh'],
  ticketSources: ['refresh'],
  // impersonate: act as another user for a session (System Admin capability).
  // Holders cannot themselves be impersonated (guard rail in identity.js/me.js).
  users: ['impersonate'],
};

// Reads every functional role needs — list enrichment resolves names/rates from
// these tables and fails hard (403) without them. Surfaced as a hint in the Roles editor.
export const BASELINE_READ_TABLES = ['clients', 'projects', 'settings'];

export function isKnownTable(name) {
  return TABLES.includes(name);
}

export function knownActionsFor(table) {
  return ACTIONS[table] || [];
}
