/**
 * Validation for stored role pre-filter queries and role privilege maps.
 * Shared between server (role save) and admin frontend (Roles editor on-blur checks).
 */
import { SIMPLE_MACROS, LOOKUP_KEY } from './macros.js';
import { isKnownTable, knownActionsFor, PROTECTED_FIELDS } from './registry.js';

const TODAY_OFFSET = /^\$\$today([+-]\d+)d$/;
const REGEX_FLAGS = /^[gimsuy]*$/;
const PRIVILEGE_KEYS = ['read', 'create', 'update', 'delete', 'actions'];

/**
 * An op value with field-level security is stored as { access, fls } — the
 * wrapper form is only written when fls is non-empty, so the presence of an
 * `fls` array IS the discriminator (a plain filter object never has one).
 */
function isFlsWrapper(value) {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray(value.fls)
  );
}

/**
 * Normalise an op's stored value to { access, fls }.
 * Legacy plain values (true / filter / bool) become { access: value, fls: [] }.
 * Shared by accessService (grant resolution) and the admin Roles editor.
 */
export function opValue(value) {
  if (isFlsWrapper(value)) return { access: value.access, fls: value.fls };
  return { access: value, fls: [] };
}

function validateFlsList(fls, label, errors) {
  if (!Array.isArray(fls)) {
    errors.push(`${label}: must be an array of field names`);
    return;
  }
  for (const field of fls) {
    if (typeof field !== 'string' || field.trim() === '') {
      errors.push(`${label}: field names must be non-empty strings`);
    } else if (field.startsWith('$')) {
      errors.push(`${label}: "${field}" — field names cannot start with $`);
    } else if (field.includes('.')) {
      errors.push(`${label}: "${field}" — only top-level field names are supported`);
    } else if (PROTECTED_FIELDS.includes(field)) {
      errors.push(`${label}: "${field}" is protected and cannot be hidden`);
    }
  }
}

function validateWrapperShape(value, label, errors) {
  for (const key of Object.keys(value)) {
    if (key !== 'access' && key !== 'fls') {
      errors.push(`${label}: unknown key "${key}" (expected access, fls)`);
    }
  }
}

function containsLookup(node) {
  if (Array.isArray(node)) return node.some(containsLookup);
  if (node && typeof node === 'object') {
    return Object.entries(node).some(([k, v]) => k === LOOKUP_KEY || containsLookup(v));
  }
  return false;
}

// { "$$idsOf": { table, select, filter } } — collapses to { $in: [...] } at
// grant resolution, so it must sit in operator position under a field key.
function validateLookupNode(value, path, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${path}: $$idsOf must be an object { table, select, filter }`);
    return;
  }
  for (const key of Object.keys(value)) {
    if (!['table', 'select', 'filter'].includes(key)) {
      errors.push(`${path}: unknown key "${key}" (expected table, select, filter)`);
    }
  }
  if (!isKnownTable(value.table)) {
    errors.push(`${path}.table: unknown table "${value.table}"`);
  }
  if (typeof value.select !== 'string' || value.select.trim() === '') {
    errors.push(`${path}.select: must be a field name`);
  } else if (value.select.startsWith('$') || value.select.includes('.')) {
    errors.push(`${path}.select: must be a top-level field name`);
  }
  if (containsLookup(value.filter)) {
    errors.push(`${path}.filter: nested $$idsOf lookups are not supported`);
  } else {
    const inner = validateFilter(value.filter);
    if (!inner.ok) errors.push(...inner.errors.map((e) => `${path}.filter: ${e}`));
  }
}

/**
 * Validate a single stored filter object.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateFilter(filter) {
  const errors = [];

  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
    return { ok: false, errors: ['Filter must be a JSON object'] };
  }

  function walk(node, path) {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (node instanceof RegExp) {
      errors.push(`${path}: store regex as { "$regex": "pattern", "$flags": "i" }, not a RegExp`);
      return;
    }
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        const p = path ? `${path}.${key}` : key;
        if (key === '$where') {
          errors.push(`${p}: $where is not allowed in stored filters`);
          continue;
        }
        if (key === LOOKUP_KEY) {
          if (path === '') {
            errors.push(`${p}: $$idsOf must be nested under a field (e.g. {"_id": {"$$idsOf": {...}}})`);
          } else {
            validateLookupNode(value, p, errors);
          }
          continue;
        }
        if (key === '$regex') {
          if (typeof value !== 'string') {
            errors.push(`${p}: $regex must be a string pattern`);
          } else {
            const flags = typeof node.$flags === 'string' ? node.$flags : '';
            if (!REGEX_FLAGS.test(flags)) {
              errors.push(`${p}: invalid $flags "${node.$flags}"`);
            } else {
              try {
                new RegExp(value, flags);
              } catch (e) {
                errors.push(`${p}: invalid regex — ${e.message}`);
              }
            }
          }
          continue;
        }
        if (key === '$flags') continue; // validated alongside $regex
        walk(value, p);
      }
      return;
    }
    if (typeof node === 'string' && node.startsWith('$$')) {
      if (node.startsWith('$$idsOf(')) {
        errors.push(`${path}: $$idsOf uses the object form {"$$idsOf": {"table": ..., "select": ..., "filter": ...}}, not a string`);
      } else if (!SIMPLE_MACROS.includes(node) && !TODAY_OFFSET.test(node)) {
        errors.push(`${path}: unknown macro "${node}"`);
      }
    }
  }

  walk(filter, '');
  return { ok: errors.length === 0, errors };
}

/**
 * Validate a role's full privileges map: { [table]: { read, create, update, delete, actions } }.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validatePrivileges(privileges) {
  const errors = [];

  if (!privileges || typeof privileges !== 'object' || Array.isArray(privileges)) {
    return { ok: false, errors: ['Privileges must be an object keyed by table name'] };
  }

  for (const [table, priv] of Object.entries(privileges)) {
    if (!isKnownTable(table)) {
      errors.push(`Unknown table "${table}"`);
      continue;
    }
    if (!priv || typeof priv !== 'object' || Array.isArray(priv)) {
      errors.push(`${table}: privileges must be an object`);
      continue;
    }
    for (const key of Object.keys(priv)) {
      if (!PRIVILEGE_KEYS.includes(key)) errors.push(`${table}.${key}: unknown privilege key`);
    }
    for (const op of ['read', 'update', 'delete']) {
      const raw = priv[op];
      if (raw === undefined) continue;
      if (isFlsWrapper(raw)) {
        // Field-level security does not apply to delete — whole-record operation.
        if (op === 'delete') {
          errors.push(`${table}.delete: field-level security (fls) does not apply to delete`);
          continue;
        }
        validateWrapperShape(raw, `${table}.${op}`, errors);
        validateFlsList(raw.fls, `${table}.${op}.fls`, errors);
      }
      const { access } = opValue(raw);
      if (access === undefined || typeof access === 'boolean') continue;
      const result = validateFilter(access);
      if (!result.ok) errors.push(...result.errors.map((e) => `${table}.${op}: ${e}`));
    }
    if (priv.create !== undefined) {
      const raw = priv.create;
      if (isFlsWrapper(raw)) {
        validateWrapperShape(raw, `${table}.create`, errors);
        validateFlsList(raw.fls, `${table}.create.fls`, errors);
      }
      const { access } = opValue(raw);
      if (access !== undefined && typeof access !== 'boolean') {
        errors.push(`${table}.create: must be a boolean`);
      }
    }
    if (priv.actions !== undefined) {
      if (!Array.isArray(priv.actions)) {
        errors.push(`${table}.actions: must be an array`);
      } else {
        const known = knownActionsFor(table);
        for (const action of priv.actions) {
          if (!known.includes(action)) errors.push(`${table}.actions: unknown action "${action}"`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
