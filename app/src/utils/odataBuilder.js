/**
 * Build an OData $filter string from an array of filter descriptors.
 *
 * Each filter: { field, operator, value, type }
 *   type: 'string' | 'date' | 'number' | 'boolean'
 *
 * Empty/null values are skipped. Strings and dates are single-quoted.
 * Returns empty string when no active filters.
 */
export function buildFilterString(filters) {
  const clauses = [];

  for (const { field, operator, value, type } of filters) {
    if (value == null || value === '') continue;

    let formatted;
    if (type === 'number' || type === 'boolean') {
      formatted = String(value);
    } else {
      // string / date — single-quote
      formatted = `'${String(value).replace(/'/g, "''")}'`;
    }

    clauses.push(`${field} ${operator} ${formatted}`);
  }

  return clauses.join(' and ');
}
