/**
 * OData query parameter parser and applier for NeDB collections.
 *
 * Supported operations:
 *   $filter   — field eq 'value', field gt 123, contains(field,'val'), and, or, parentheses
 *   $orderby  — field asc, field2 desc
 *   $top      — integer limit
 *   $skip     — integer offset
 *   $count    — 'true' to include total count
 *   $select   — comma-separated field list
 */

import { parseFilter as parseFilterAst } from 'odata-filter-to-ast';

// ---------------------------------------------------------------------------
// $filter parsing — AST-based via odata-filter-to-ast
// ---------------------------------------------------------------------------

const nedbOps = { EqExpr: null, NeExpr: '$ne', GtExpr: '$gt', GeExpr: '$gte', LtExpr: '$lt', LeExpr: '$lte' };

/**
 * Convert an OData AST node to a NeDB query object.
 */
function astToNedb(node) {
  if (!node) return {};

  switch (node.type) {
    case 'AndExpr': {
      const left = astToNedb(node.left);
      const right = astToNedb(node.right);
      // Merge flat objects when possible, otherwise use $and
      const leftHasLogical = '$or' in left || '$and' in left;
      const rightHasLogical = '$or' in right || '$and' in right;
      if (!leftHasLogical && !rightHasLogical) {
        const overlap = Object.keys(left).some((k) => k in right);
        if (!overlap) return { ...left, ...right };
      }
      return { $and: [left, right] };
    }

    case 'OrExpr':
      return { $or: [astToNedb(node.left), astToNedb(node.right)] };

    case 'EqExpr': case 'NeExpr': case 'GtExpr': case 'GeExpr': case 'LtExpr': case 'LeExpr': {
      const field = node.left?.value;
      const value = node.right?.value ?? node.right;
      const op = nedbOps[node.type];

      // NeDB null handling: { field: null } only matches explicit null, not missing fields.
      if (value === null && op === null) {
        return { $or: [{ [field]: null }, { [field]: { $exists: false } }] };
      }
      if (value === null && op === '$ne') {
        return { [field]: { $exists: true, $ne: null } };
      }
      if (op === null) return { [field]: value };
      return { [field]: { [op]: value } };
    }

    case 'FunctionExpr': {
      const fnName = node.name?.toLowerCase();
      const field = node.arguments?.[0]?.value;
      const val = node.arguments?.[1]?.value;
      if (!field || val == null) return {};

      const escaped = String(val).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let pattern;
      switch (fnName) {
        case 'contains': pattern = escaped; break;
        case 'startswith': pattern = `^${escaped}`; break;
        case 'endswith': pattern = `${escaped}$`; break;
        default: return {};
      }
      return { [field]: { $regex: new RegExp(pattern, 'i') } };
    }

    default:
      return {};
  }
}

/**
 * Parse a $filter string into a NeDB query object.
 * Supports: and, or, parentheses, eq/ne/gt/ge/lt/le, contains/startswith/endswith, null.
 */
export function parseFilter(filterStr) {
  if (!filterStr) return {};
  try {
    const ast = parseFilterAst(filterStr);
    return astToNedb(ast);
  } catch {
    return {};
  }
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

  // $summary: compute sums across ALL matching records (ignoring $top/$skip)
  let summaryData;
  if (query.$summary) {
    const summaryFields = query.$summary.split(',').map(s => s.trim()).filter(Boolean);
    if (summaryFields.length > 0) {
      const allMatching = await collection.find(filter);
      summaryData = {};
      for (const field of summaryFields) {
        summaryData[field] = allMatching.reduce((sum, doc) => sum + (Number(doc[field]) || 0), 0);
      }
    }
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
  return { results, totalCount, summaryData };
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
export function formatResponse(items, totalCount, hasCount, summaryData) {
  if (hasCount) {
    const envelope = { '@odata.count': totalCount, value: items };
    if (summaryData) envelope['@odata.summary'] = summaryData;
    return envelope;
  }
  return items;
}
