/**
 * Validation for stored role pre-filter queries and role privilege maps.
 * Shared between server (role save) and admin frontend (Roles editor on-blur checks).
 */
import { SIMPLE_MACROS } from './macros.js';
import { isKnownTable, knownActionsFor } from './registry.js';

const TODAY_OFFSET = /^\$\$today([+-]\d+)d$/;
const REGEX_FLAGS = /^[gimsuy]*$/;
const PRIVILEGE_KEYS = ['read', 'create', 'update', 'delete', 'actions'];

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
        errors.push(`${path}: lookup macros ($$idsOf) are reserved and not yet supported`);
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
      const value = priv[op];
      if (value === undefined || typeof value === 'boolean') continue;
      const result = validateFilter(value);
      if (!result.ok) errors.push(...result.errors.map((e) => `${table}.${op}: ${e}`));
    }
    if (priv.create !== undefined && typeof priv.create !== 'boolean') {
      errors.push(`${table}.create: must be a boolean`);
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
