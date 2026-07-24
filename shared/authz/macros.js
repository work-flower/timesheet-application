/**
 * Macro resolution for stored role pre-filter queries.
 *
 * Filters are stored as JSON in role records and may contain macros:
 *   Identity:  "$$user.id", "$$user.email"
 *   Temporal:  "$$now", "$$today", "$$startOfWeek", "$$startOfMonth",
 *              "$$startOfYear", "$$today+Nd" / "$$today-Nd"
 *
 * Temporal macros resolve to YYYY-MM-DD strings (the app's date format), except
 * "$$now" which resolves to a full ISO timestamp. "$$idsOf(...)" is reserved for
 * future lookup macros and is rejected.
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
        throw new Error(`Lookup macros are reserved and not yet supported: ${value}`);
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
