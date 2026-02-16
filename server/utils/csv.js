/**
 * Simple CSV generation utility. No external dependencies.
 */

/**
 * Convert an array of objects to a CSV string.
 * @param {Array<Object>} data - Array of row objects
 * @param {Array<{ key: string, label: string }>} columns - Column definitions
 * @returns {string} CSV content
 */
export function toCSV(data, columns) {
  const headers = columns.map(c => escapeCSV(c.label));
  const rows = data.map(row =>
    columns.map(c => escapeCSV(String(row[c.key] ?? ''))).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

function escapeCSV(value) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
