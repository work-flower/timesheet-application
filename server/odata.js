/**
 * OData query parameter parser and applier for NeDB collections.
 *
 * Supported operations:
 *   $filter   — field eq 'value', field gt 123, contains(field,'val'), and
 *   $orderby  — field asc, field2 desc
 *   $top      — integer limit
 *   $skip     — integer offset
 *   $count    — 'true' to include total count
 *   $select   — comma-separated field list
 */

// ---------------------------------------------------------------------------
// $filter parsing
// ---------------------------------------------------------------------------

/**
 * Split a $filter string on top-level ` and ` tokens, respecting quoted strings.
 */
function splitOnAnd(filterStr) {
  const parts = [];
  let current = '';
  let inQuote = false;
  let i = 0;

  while (i < filterStr.length) {
    const ch = filterStr[i];

    if (ch === "'" && !inQuote) {
      inQuote = true;
      current += ch;
      i++;
    } else if (ch === "'" && inQuote) {
      inQuote = false;
      current += ch;
      i++;
    } else if (
      !inQuote &&
      filterStr.slice(i, i + 5).toLowerCase() === ' and '
    ) {
      parts.push(current.trim());
      current = '';
      i += 5;
    } else {
      current += ch;
      i++;
    }
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Parse a raw value token into its JS type.
 *   'string' → string (quotes stripped)
 *   123 / 123.5 → number
 *   true / false → boolean
 *   null → null
 */
function parseValue(raw) {
  if (raw === 'null') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^'.*'$/.test(raw)) return raw.slice(1, -1);
  const num = Number(raw);
  if (!isNaN(num) && raw !== '') return num;
  return raw;
}

const comparisonOps = {
  eq: null,   // direct match
  ne: '$ne',
  gt: '$gt',
  ge: '$gte',
  lt: '$lt',
  le: '$lte',
};

// Regex for string functions: contains(field,'val'), startswith(field,'val'), endswith(field,'val')
const stringFnRe = /^(contains|startswith|endswith)\(\s*(\w+)\s*,\s*'([^']*)'\s*\)$/i;

// Regex for comparison: field op value
const comparisonRe = /^(\w+)\s+(eq|ne|gt|ge|lt|le)\s+(.+)$/i;

/**
 * Parse a $filter string into a NeDB query object.
 */
export function parseFilter(filterStr) {
  if (!filterStr) return {};

  const conditions = splitOnAnd(filterStr);
  const query = {};

  for (const cond of conditions) {
    // Try string function first
    const fnMatch = cond.match(stringFnRe);
    if (fnMatch) {
      const [, fn, field, val] = fnMatch;
      const escaped = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let pattern;
      switch (fn.toLowerCase()) {
        case 'contains':
          pattern = escaped;
          break;
        case 'startswith':
          pattern = `^${escaped}`;
          break;
        case 'endswith':
          pattern = `${escaped}$`;
          break;
      }
      query[field] = { $regex: new RegExp(pattern, 'i') };
      continue;
    }

    // Try comparison
    const cmpMatch = cond.match(comparisonRe);
    if (cmpMatch) {
      const [, field, op, rawVal] = cmpMatch;
      const value = parseValue(rawVal.trim());
      const nedbOp = comparisonOps[op.toLowerCase()];

      if (nedbOp === null) {
        // eq — direct match
        query[field] = value;
      } else {
        query[field] = { ...(query[field] || {}), [nedbOp]: value };
      }
    }
  }

  return query;
}

// ---------------------------------------------------------------------------
// $orderby parsing
// ---------------------------------------------------------------------------

/**
 * Parse a $orderby string into a NeDB sort object.
 * Example: "name asc, createdAt desc" → { name: 1, createdAt: -1 }
 */
export function parseOrderBy(orderByStr) {
  if (!orderByStr) return null;

  const sort = {};
  const parts = orderByStr.split(',').map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    const [field, dir] = part.split(/\s+/);
    sort[field] = dir?.toLowerCase() === 'desc' ? -1 : 1;
  }

  return sort;
}

// ---------------------------------------------------------------------------
// buildQuery — orchestrates filter + sort + pagination against a collection
// ---------------------------------------------------------------------------

/**
 * Execute a query against a NeDB collection with OData parameters.
 *
 * @param {object} collection   NeDB datastore
 * @param {object} query        Parsed query-string object (req.query)
 * @param {object} defaultSort  Fallback sort if no $orderby provided
 * @param {object} [baseFilter] Additional filter to merge (from legacy params)
 * @returns {{ results: object[], totalCount?: number }}
 */
export async function buildQuery(collection, query = {}, defaultSort = {}, baseFilter = {}) {
  const odataFilter = parseFilter(query.$filter);
  const filter = { ...baseFilter, ...odataFilter };

  let totalCount;
  if (query.$count === 'true') {
    totalCount = await collection.count(filter);
  }

  const sort = parseOrderBy(query.$orderby) || defaultSort;
  let cursor = collection.find(filter).sort(sort);

  if (query.$skip) {
    cursor = cursor.skip(parseInt(query.$skip, 10));
  }
  if (query.$top) {
    cursor = cursor.limit(parseInt(query.$top, 10));
  }

  const results = await cursor;
  return { results, totalCount };
}

// ---------------------------------------------------------------------------
// $select — post-query field projection
// ---------------------------------------------------------------------------

/**
 * Filter items to only include selected fields (+ _id always).
 */
export function applySelect(items, selectStr) {
  if (!selectStr) return items;

  const fields = selectStr.split(',').map(s => s.trim()).filter(Boolean);
  if (fields.length === 0) return items;

  const fieldSet = new Set(fields);
  fieldSet.add('_id');

  return items.map(item => {
    const picked = {};
    for (const key of fieldSet) {
      if (key in item) picked[key] = item[key];
    }
    return picked;
  });
}

// ---------------------------------------------------------------------------
// Response formatting
// ---------------------------------------------------------------------------

/**
 * Format the response: plain array or OData envelope with count.
 */
export function formatResponse(items, totalCount, hasCount) {
  if (hasCount) {
    return { '@odata.count': totalCount, value: items };
  }
  return items;
}
