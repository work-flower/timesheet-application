/**
 * UK financial period utilities.
 *
 * Three independent calendars:
 *   - Company Year: ARD-based (e.g. 1 Apr – 31 Mar)
 *   - Tax Year: 6 Apr – 5 Apr (fixed by law)
 *   - VAT Quarter: stagger-group-dependent
 *   - Calendar Year: 1 Jan – 31 Dec
 */

/**
 * Parse a date string or Date to a plain YYYY-MM-DD string.
 */
function toDateStr(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * Get the company year containing a given date.
 * @param {string|Date} date - The date to check
 * @param {string} ard - Accounting Reference Date as "MM-DD" (e.g. "03-31" for 31 March)
 * @returns {{ start: string, end: string }} - YYYY-MM-DD boundaries
 */
export function getCompanyYear(date, ard) {
  if (!ard) return getCalendarYear(date);
  const d = typeof date === 'string' ? new Date(date) : date;
  const [ardMonth, ardDay] = ard.split('-').map(Number); // "03-31" → month=3, day=31

  // Year-end date in the same calendar year as d
  const yearEndSameYear = new Date(d.getFullYear(), ardMonth - 1, ardDay);

  let yearEnd, yearStart;
  if (d <= yearEndSameYear) {
    // We're before or on the ARD this calendar year, so the year-end is this year
    yearEnd = yearEndSameYear;
    yearStart = new Date(d.getFullYear() - 1, ardMonth - 1, ardDay + 1);
  } else {
    // We're after the ARD, so the year-end is next year
    yearEnd = new Date(d.getFullYear() + 1, ardMonth - 1, ardDay);
    yearStart = new Date(d.getFullYear(), ardMonth - 1, ardDay + 1);
  }

  return { start: toDateStr(yearStart), end: toDateStr(yearEnd) };
}

/**
 * Get the UK tax year containing a given date.
 * Tax year runs 6 April to 5 April.
 * @param {string|Date} date
 * @returns {{ start: string, end: string }}
 */
export function getTaxYear(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const apr6 = new Date(d.getFullYear(), 3, 6); // April 6 this year

  let start, end;
  if (d < apr6) {
    // Before Apr 6 → tax year started previous Apr 6
    start = new Date(d.getFullYear() - 1, 3, 6);
    end = new Date(d.getFullYear(), 3, 5);
  } else {
    // On or after Apr 6 → tax year starts this Apr 6
    start = new Date(d.getFullYear(), 3, 6);
    end = new Date(d.getFullYear() + 1, 3, 5);
  }

  return { start: toDateStr(start), end: toDateStr(end) };
}

/**
 * Get the calendar year containing a given date.
 * @param {string|Date} date
 * @returns {{ start: string, end: string }}
 */
export function getCalendarYear(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return {
    start: `${d.getFullYear()}-01-01`,
    end: `${d.getFullYear()}-12-31`,
  };
}

/**
 * VAT stagger group quarter start months.
 * Group 1: Mar, Jun, Sep, Dec  (quarters end Mar, Jun, Sep, Dec)
 * Group 2: Jan, Apr, Jul, Oct  (quarters end Jan, Apr, Jul, Oct)
 * Group 3: Feb, May, Aug, Nov  (quarters end Feb, May, Aug, Nov)
 */
const VAT_QUARTER_END_MONTHS = {
  1: [3, 6, 9, 12],   // Mar, Jun, Sep, Dec
  2: [1, 4, 7, 10],   // Jan, Apr, Jul, Oct
  3: [2, 5, 8, 11],   // Feb, May, Aug, Nov
};

/**
 * Get the VAT quarter containing a given date.
 * @param {string|Date} date
 * @param {number} staggerGroup - 1, 2, or 3
 * @returns {{ start: string, end: string }}
 */
export function getVatQuarter(date, staggerGroup) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const month = d.getMonth() + 1; // 1-based
  const endMonths = VAT_QUARTER_END_MONTHS[staggerGroup] || VAT_QUARTER_END_MONTHS[1];

  // Find which quarter end month this date falls into
  let quarterEndMonth = endMonths[endMonths.length - 1]; // default to last
  let quarterEndYear = d.getFullYear();

  for (const em of endMonths) {
    if (month <= em) {
      quarterEndMonth = em;
      break;
    }
  }

  // If month > last end month, the quarter end is in the first end month of next year
  if (month > endMonths[endMonths.length - 1]) {
    quarterEndMonth = endMonths[0];
    quarterEndYear = d.getFullYear() + 1;
  }

  // Quarter end = last day of quarterEndMonth
  const qEnd = new Date(quarterEndYear, quarterEndMonth, 0); // day 0 of next month = last day
  // Quarter start = first day of (quarterEndMonth - 2)
  const startMonth = quarterEndMonth - 2;
  let qStartYear = quarterEndYear;
  let qStartMonth = startMonth;
  if (qStartMonth <= 0) {
    qStartMonth += 12;
    qStartYear -= 1;
  }
  const qStart = new Date(qStartYear, qStartMonth - 1, 1);

  return { start: toDateStr(qStart), end: toDateStr(qEnd) };
}

/**
 * Get all 4 VAT quarters for a given year (by calendar year of the first quarter end).
 * @param {number} year - The year reference
 * @param {number} staggerGroup - 1, 2, or 3
 * @returns {Array<{ start: string, end: string }>}
 */
export function getVatQuarters(year, staggerGroup) {
  const endMonths = VAT_QUARTER_END_MONTHS[staggerGroup] || VAT_QUARTER_END_MONTHS[1];
  return endMonths.map((em) => {
    const qEnd = new Date(year, em, 0);
    let startMonth = em - 2;
    let startYear = year;
    if (startMonth <= 0) {
      startMonth += 12;
      startYear -= 1;
    }
    const qStart = new Date(startYear, startMonth - 1, 1);
    return { start: toDateStr(qStart), end: toDateStr(qEnd) };
  });
}

/**
 * Get an array of month ranges between two dates.
 * @param {string} start - YYYY-MM-DD
 * @param {string} end - YYYY-MM-DD
 * @returns {Array<{ start: string, end: string, label: string }>}
 */
export function getMonthsInRange(start, end) {
  const months = [];
  const startD = new Date(start);
  const endD = new Date(end);

  let current = new Date(startD.getFullYear(), startD.getMonth(), 1);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  while (current <= endD) {
    const mStart = new Date(current.getFullYear(), current.getMonth(), 1);
    const mEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);

    months.push({
      start: toDateStr(mStart),
      end: toDateStr(mEnd),
      label: `${monthNames[current.getMonth()]} ${current.getFullYear()}`,
    });

    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }

  return months;
}

/**
 * Format a period label like "Apr 2025 – Mar 2026".
 * @param {string} start - YYYY-MM-DD
 * @param {string} end - YYYY-MM-DD
 * @returns {string}
 */
export function formatPeriodLabel(start, end) {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const s = new Date(start);
  const e = new Date(end);
  return `${monthNames[s.getMonth()]} ${s.getFullYear()} – ${monthNames[e.getMonth()]} ${e.getFullYear()}`;
}
