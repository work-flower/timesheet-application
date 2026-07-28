import { TABLES } from '../../../../shared/authz/registry.js';
import { validatePrivileges, opValue } from '../../../../shared/authz/filterValidate.js';

export const FILTER_OPS = ['read', 'update', 'delete'];
export const MODES = { none: 'No access', all: 'All records', filtered: 'Filtered' };

export function emptyOp() {
  return { mode: 'none', filter: '', fls: [] };
}

export function emptyEntry() {
  return { read: emptyOp(), update: emptyOp(), delete: emptyOp(), create: false, createFls: [], actions: [] };
}

// role.privileges (API shape) → editor state. Every registry table is present
// so the matrix always shows all rows; unset tables stay all-none and are
// omitted again on save (default deny). Op values may be plain (true|filter)
// or the fls wrapper { access, fls } — opValue() normalises. Unknown tables
// (hand-edited store) are skipped rather than crashing the page.
export function buildEditorState(privileges = {}) {
  const state = Object.fromEntries(TABLES.map((t) => [t, emptyEntry()]));
  for (const [table, priv] of Object.entries(privileges)) {
    if (!TABLES.includes(table)) continue;
    const create = opValue(priv.create);
    const entry = { create: create.access === true, createFls: create.fls, actions: priv.actions || [] };
    for (const op of FILTER_OPS) {
      const { access, fls } = opValue(priv[op]);
      if (access === true) entry[op] = { mode: 'all', filter: '', fls };
      else if (access && typeof access === 'object') entry[op] = { mode: 'filtered', filter: JSON.stringify(access, null, 2), fls };
      else entry[op] = { ...emptyOp(), fls };
    }
    state[table] = entry;
  }
  return state;
}

// editor state → role.privileges; returns { privileges } or { error }.
// All-none tables produce an empty priv and are dropped (default deny). The
// { access, fls } wrapper is emitted ONLY when fls is non-empty so roles
// without field-level security keep the plain legacy shape (zero migration).
export function fromEditorState(state) {
  const privileges = {};
  for (const [table, entry] of Object.entries(state)) {
    const priv = {};
    for (const op of FILTER_OPS) {
      const { mode, filter, fls } = entry[op];
      let access;
      if (mode === 'all') access = true;
      else if (mode === 'filtered') {
        try {
          access = JSON.parse(filter || '');
        } catch {
          return { error: `${table}.${op}: filter is not valid JSON` };
        }
      }
      if (access === undefined) continue;
      // delete never carries fls (whole-record operation)
      priv[op] = op !== 'delete' && fls.length > 0 ? { access, fls } : access;
    }
    if (entry.create) {
      priv.create = entry.createFls.length > 0 ? { access: true, fls: entry.createFls } : true;
    }
    if (entry.actions.length > 0) priv.actions = entry.actions;
    if (Object.keys(priv).length > 0) privileges[table] = priv;
  }
  const { ok, errors } = validatePrivileges(privileges);
  if (!ok) return { error: errors.join('; ') };
  return { privileges };
}
