/**
 * Macro resolution for stored role pre-filter queries.
 *
 * Filters are stored as JSON in role records and may contain macros:
 *   Identity:  "$$user.id", "$$user.email"
 *   Temporal:  "$$now", "$$today", "$$startOfWeek", "$$startOfMonth",
 *              "$$startOfYear", "$$today+Nd" / "$$today-Nd"
 *
 * Temporal macros resolve to YYYY-MM-DD strings (the app's date format), except
 * "$$now" which resolves to a full ISO timestamp.
 *
 * Lookup macro (object form, resolved server-side by resolveLookups):
 *   { "field": { "$$idsOf": { "table": "projects", "select": "clientId",
 *                             "filter": { "resources.userId": "$$user.id" } } } }
 * collapses to { "field": { "$in": [ ...distinct select values... ] } } at grant
 * resolution. The legacy string form "$$idsOf(...)" is rejected.
 *
 * JSON cannot store a RegExp and NeDB throws on string $regex patterns, so regex
 * conditions use the convention { "$regex": "pattern", "$flags": "i" } — resolved
 * here into a real RegExp (the $flags key is consumed).
 *
 * Pure module — shared between server enforcement and frontend validation.
 */

const TODAY_OFFSET = /^\$\$today([+-]\d+)d$/;

export const SIMPLE_MACROS = [
  '$$user.id',
  '$$user.email',
  '$$now',
  '$$today',
  '$$startOfWeek',
  '$$startOfMonth',
  '$$startOfYear',
];

function pad(n) {
  return String(n).padStart(2, '0');
}

function toDateString(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function resolveString(value, user, now) {
  switch (value) {
    case '$$user.id':
      return user.userId;
    case '$$user.email':
      return user.email;
    case '$$now':
      return now.toISOString();
    case '$$today':
      return toDateString(now);
    case '$$startOfWeek': {
      const d = new Date(now);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
      return toDateString(d);
    }
    case '$$startOfMonth':
      return toDateString(new Date(now.getFullYear(), now.getMonth(), 1));
    case '$$startOfYear':
      return toDateString(new Date(now.getFullYear(), 0, 1));
    default: {
      const offset = value.match(TODAY_OFFSET);
      if (offset) {
        const d = new Date(now);
        d.setDate(d.getDate() + Number(offset[1]));
        return toDateString(d);
      }
      if (value.startsWith('$$idsOf(')) {
        throw new Error(`Lookup macros use the object form { "$$idsOf": { table, select, filter } }, not a string: ${value}`);
      }
      throw new Error(`Unknown macro: ${value}`);
    }
  }
}

/**
 * Resolve all macros in a stored filter into concrete values.
 * Returns a new object — the stored filter is never mutated.
 *
 * @param {object} filter - Stored Mongo-style filter (JSON)
 * @param {object} user   - { userId, email }
 * @param {Date}   [now]  - Injectable clock for testing
 * @returns {object} filter ready to pass to NeDB
 */
export const LOOKUP_KEY = '$$idsOf';

/**
 * Resolve $$idsOf lookup nodes into concrete { $in: [...] } conditions.
 * Runs AFTER resolveMacros, so the node's inner filter already holds concrete
 * identity/temporal values. Returns a new object — input is never mutated.
 *
 * The lookup executor is injected (this module is shared with the frontend and
 * has no DB access): async ({ table, select, filter }) => [ids].
 *
 * @param {object} filter - Macro-resolved filter, possibly containing $$idsOf nodes
 * @param {function} lookup - async ({ table, select, filter }) => array of values
 * @returns {Promise<object>} filter with lookups collapsed, ready for NeDB
 */
export async function resolveLookups(filter, lookup) {
  async function walk(node) {
    if (Array.isArray(node)) return Promise.all(node.map(walk));
    if (node && typeof node === 'object' && !(node instanceof RegExp)) {
      const out = {};
      for (const [k, v] of Object.entries(node)) {
        if (k === LOOKUP_KEY) {
          const ids = await lookup(v);
          out.$in = ids;
        } else {
          out[k] = await walk(v);
        }
      }
      return out;
    }
    return node;
  }
  return walk(filter);
}

export function resolveMacros(filter, user, now = new Date()) {
  function walk(node) {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      if (typeof node.$regex === 'string') {
        const { $regex, $flags, ...rest } = node;
        const out = {};
        for (const [k, v] of Object.entries(rest)) out[k] = walk(v);
        out.$regex = new RegExp($regex, $flags || '');
        return out;
      }
      const out = {};
      for (const [k, v] of Object.entries(node)) out[k] = walk(v);
      return out;
    }
    if (typeof node === 'string' && node.startsWith('$$')) {
      return resolveString(node, user, now);
    }
    return node;
  }
  return walk(filter);
}
