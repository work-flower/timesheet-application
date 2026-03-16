import { parseFilter } from 'odata-filter-to-ast';

// Map AST node types to OData operators
const typeToOp = {
  EqExpr: 'eq',
  NeExpr: 'ne',
  GtExpr: 'gt',
  GeExpr: 'ge',
  LtExpr: 'lt',
  LeExpr: 'le',
};

/**
 * Extract UI filter values from a $filter string.
 *
 * @param {string} filterString - OData $filter string (e.g. "date ge '2026-03-09' and clientId eq 'abc'")
 * @param {Array} filterDefs - Array of { id, field, operator } filter definitions
 * @returns {Object} Map of { filterId: extractedValue } for matched clauses
 */
export function extractFilterValues(filterString, filterDefs) {
  if (!filterString) return {};

  let ast;
  try {
    ast = parseFilter(filterString);
  } catch {
    return {};
  }

  // Flatten AndExpr tree into a list of comparison nodes
  const comparisons = [];
  function flatten(node) {
    if (!node) return;
    if (node.type === 'AndExpr') {
      flatten(node.left);
      flatten(node.right);
    } else if (typeToOp[node.type]) {
      comparisons.push(node);
    }
  }
  flatten(ast);

  // Match each comparison to a filter def by (field, operator)
  const result = {};
  for (const comp of comparisons) {
    const field = comp.left?.value;
    const op = typeToOp[comp.type];
    if (!field || !op) continue;

    const def = filterDefs.find(
      (d) => d.field === field && d.operator === op
    );
    if (def) {
      result[def.id] = comp.right?.value ?? comp.right;
    }
  }

  return result;
}
