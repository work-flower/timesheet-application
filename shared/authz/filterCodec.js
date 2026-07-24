/**
 * Storage codec for role pre-filter queries.
 *
 * NeDB forbids stored document keys that BEGIN with '$' or CONTAIN '.', but
 * Mongo-style filters are made of exactly such keys ($gte, $in, "a.b" paths).
 * Role records therefore store filters with those characters escaped to their
 * fullwidth Unicode equivalents, and every reader decodes before use:
 *
 *   '$gte'            ⇄ '＄gte'   (U+FF04 at key start)
 *   'transactions.0'  ⇄ 'transactions．0'  (U+FF0E anywhere in key)
 *
 * encodePrivileges is applied on role save (roleService); decodePrivileges on
 * every role read (roleService responses, accessService grant resolution).
 * Values are never touched — only object keys.
 */

const FW_DOLLAR = '＄'; // ＄
const FW_DOT = '．'; // ．

function mapKeys(node, mapKey) {
  if (Array.isArray(node)) return node.map((item) => mapKeys(item, mapKey));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      out[mapKey(key)] = mapKeys(value, mapKey);
    }
    return out;
  }
  return node;
}

function encodeKey(key) {
  let out = key.startsWith('$') ? FW_DOLLAR + key.slice(1) : key;
  return out.split('.').join(FW_DOT);
}

function decodeKey(key) {
  let out = key.startsWith(FW_DOLLAR) ? '$' + key.slice(1) : key;
  return out.split(FW_DOT).join('.');
}

export function encodePrivileges(privileges) {
  return mapKeys(privileges, encodeKey);
}

export function decodePrivileges(privileges) {
  return mapKeys(privileges, decodeKey);
}
