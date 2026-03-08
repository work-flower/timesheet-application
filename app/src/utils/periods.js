/**
 * UK financial period utilities (client-side).
 *
 * Three independent calendars:
 *   - Company Year: ARD-based (e.g. 1 Apr – 31 Mar)
 *   - Tax Year: 6 Apr – 5 Apr (fixed by law)
 *   - VAT Quarter: stagger-group-dependent
 *   - Calendar Year: 1 Jan – 31 Dec
 */

function toDateStr(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function getCompanyYear(date, ard) {
  if (!ard) return getCalendarYear(date);
  const d = typeof date === 'string' ? new Date(date) : date;
  const [ardMonth, ardDay] = ard.split('-').map(Number);

  const yearEndSameYear = new Date(d.getFullYear(), ardMonth - 1, ardDay);

  let yearEnd, yearStart;
  if (d <= yearEndSameYear) {
    yearEnd = yearEndSameYear;
    yearStart = new Date(d.getFullYear() - 1, ardMonth - 1, ardDay + 1);
  } else {
    yearEnd = new Date(d.getFullYear() + 1, ardMonth - 1, ardDay);
    yearStart = new Date(d.getFullYear(), ardMonth - 1, ardDay + 1);
  }

  return { start: toDateStr(yearStart), end: toDateStr(yearEnd) };
}

export function getTaxYear(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const apr6 = new Date(d.getFullYear(), 3, 6);

  let start, end;
  if (d < apr6) {
    start = new Date(d.getFullYear() - 1, 3, 6);
    end = new Date(d.getFullYear(), 3, 5);
  } else {
    start = new Date(d.getFullYear(), 3, 6);
    end = new Date(d.getFullYear() + 1, 3, 5);
  }

  return { start: toDateStr(start), end: toDateStr(end) };
}

export function getCalendarYear(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return {
    start: `${d.getFullYear()}-01-01`,
    end: `${d.getFullYear()}-12-31`,
  };
}

const VAT_QUARTER_END_MONTHS = {
  1: [3, 6, 9, 12],
  2: [1, 4, 7, 10],
  3: [2, 5, 8, 11],
};

export function getVatQuarter(date, staggerGroup) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const month = d.getMonth() + 1;
  const endMonths = VAT_QUARTER_END_MONTHS[staggerGroup] || VAT_QUARTER_END_MONTHS[1];

  let quarterEndMonth = endMonths[endMonths.length - 1];
  let quarterEndYear = d.getFullYear();

  for (const em of endMonths) {
    if (month <= em) {
      quarterEndMonth = em;
      break;
    }
  }

  if (month > endMonths[endMonths.length - 1]) {
    quarterEndMonth = endMonths[0];
    quarterEndYear = d.getFullYear() + 1;
  }

  const qEnd = new Date(quarterEndYear, quarterEndMonth, 0);
  let qStartMonth = quarterEndMonth - 2;
  let qStartYear = quarterEndYear;
  if (qStartMonth <= 0) {
    qStartMonth += 12;
    qStartYear -= 1;
  }
  const qStart = new Date(qStartYear, qStartMonth - 1, 1);

  return { start: toDateStr(qStart), end: toDateStr(qEnd) };
}

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

export function formatPeriodLabel(start, end) {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const s = new Date(start);
  const e = new Date(end);
  return `${monthNames[s.getMonth()]} ${s.getFullYear()} – ${monthNames[e.getMonth()]} ${e.getFullYear()}`;
}
