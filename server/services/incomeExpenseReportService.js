import { invoices, expenses, clients } from '../db/index.js';
import { getMonthsInRange } from '../utils/periods.js';
import { toCSV } from '../utils/csv.js';

const NAVY = '#1B2A4A';
const GREY_TEXT = '#555555';
const LIGHT_GREY = '#F7F7F7';

const fmtGBP = (v) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(v || 0);

/**
 * Get income & expense data for a given period.
 */
export async function getIncomeExpenseData(startDate, endDate) {
  const [allInvoices, allExpenses, allClients] = await Promise.all([
    invoices.find({
      invoiceDate: { $gte: startDate, $lte: endDate },
      status: { $in: ['confirmed', 'posted'] },
    }),
    expenses.find({
      date: { $gte: startDate, $lte: endDate },
    }),
    clients.find({}),
  ]);

  const months = getMonthsInRange(startDate, endDate);
  const clientMap = Object.fromEntries(allClients.map(c => [c._id, c.companyName]));

  // Income by client by month
  const incomeByClient = {};
  for (const inv of allInvoices) {
    const cName = clientMap[inv.clientId] || inv.clientId;
    if (!incomeByClient[cName]) incomeByClient[cName] = { total: 0, vat: 0, months: {} };
    incomeByClient[cName].total += inv.subtotal || 0;
    incomeByClient[cName].vat += inv.totalVat || 0;
    for (const m of months) {
      if (inv.invoiceDate >= m.start && inv.invoiceDate <= m.end) {
        incomeByClient[cName].months[m.label] = (incomeByClient[cName].months[m.label] || 0) + (inv.subtotal || 0);
      }
    }
  }

  // Expenses by type by month
  const expensesByType = {};
  for (const exp of allExpenses) {
    const type = exp.expenseType || 'Other';
    if (!expensesByType[type]) expensesByType[type] = { total: 0, vat: 0, months: {} };
    expensesByType[type].total += exp.amount || 0;
    expensesByType[type].vat += exp.vatAmount || 0;
    for (const m of months) {
      if (exp.date >= m.start && exp.date <= m.end) {
        expensesByType[type].months[m.label] = (expensesByType[type].months[m.label] || 0) + (exp.amount || 0);
      }
    }
  }

  const totalIncome = Object.values(incomeByClient).reduce((s, c) => s + c.total, 0);
  const totalIncomeVat = Object.values(incomeByClient).reduce((s, c) => s + c.vat, 0);
  const totalExpense = Object.values(expensesByType).reduce((s, t) => s + t.total, 0);
  const totalExpenseVat = Object.values(expensesByType).reduce((s, t) => s + t.vat, 0);

  return {
    months,
    incomeByClient,
    expensesByType,
    totalIncome,
    totalIncomeVat,
    totalExpense,
    totalExpenseVat,
    netProfit: totalIncome - totalExpense,
  };
}

/**
 * Build Income & Expense PDF document definition.
 */
export async function buildIncomeExpensePdf(startDate, endDate) {
  const data = await getIncomeExpenseData(startDate, endDate);
  const { months, incomeByClient, expensesByType } = data;

  const monthLabels = months.map(m => m.label);
  const colCount = monthLabels.length + 2; // name + months + total

  // Dynamic column widths
  const colWidths = ['*', ...monthLabels.map(() => 55), 65];

  function buildSectionTable(title, items, isExpense) {
    const headerRow = [
      { text: title, style: 'tableHeader' },
      ...monthLabels.map(l => ({ text: l.split(' ')[0], style: 'tableHeader', alignment: 'right' })),
      { text: 'Total', style: 'tableHeader', alignment: 'right' },
    ];

    const rows = Object.entries(items).sort(([a], [b]) => a.localeCompare(b)).map(([name, item], i) => [
      { text: name, fontSize: 8 },
      ...monthLabels.map(l => ({
        text: fmtGBP(item.months[l] || 0),
        alignment: 'right',
        fontSize: 8,
      })),
      { text: fmtGBP(item.total), alignment: 'right', fontSize: 8, bold: true },
    ]);

    const totalRow = [
      { text: `Total ${title}`, bold: true, fontSize: 8 },
      ...monthLabels.map(l => {
        const monthTotal = Object.values(items).reduce((s, item) => s + (item.months[l] || 0), 0);
        return { text: fmtGBP(monthTotal), alignment: 'right', fontSize: 8, bold: true };
      }),
      {
        text: fmtGBP(Object.values(items).reduce((s, item) => s + item.total, 0)),
        alignment: 'right',
        fontSize: 8,
        bold: true,
      },
    ];

    return {
      table: {
        headerRows: 1,
        widths: colWidths,
        body: [headerRow, ...rows, totalRow],
      },
      layout: {
        fillColor: (rowIndex) => {
          if (rowIndex === 0) return NAVY;
          if (rowIndex === rows.length + 1) return LIGHT_GREY;
          return rowIndex % 2 === 0 ? LIGHT_GREY : null;
        },
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => '#E0E0E0',
      },
      margin: [0, 0, 0, 16],
    };
  }

  const periodLabel = `${months[0]?.label || startDate} – ${months[months.length - 1]?.label || endDate}`;

  return {
    pageSize: 'A4',
    pageOrientation: monthLabels.length > 6 ? 'landscape' : 'portrait',
    pageMargins: [40, 40, 40, 40],
    styles: {
      tableHeader: {
        bold: true,
        fontSize: 8,
        color: 'white',
        fillColor: NAVY,
      },
    },
    content: [
      { text: 'INCOME & EXPENSE REPORT', style: { fontSize: 16, bold: true, color: NAVY } },
      { text: `Period: ${periodLabel}`, style: { fontSize: 10, color: GREY_TEXT }, margin: [0, 4, 0, 16] },

      buildSectionTable('Income', incomeByClient, false),
      buildSectionTable('Expenses', expensesByType, true),

      // VAT Summary
      {
        table: {
          widths: ['*', 100],
          body: [
            [{ text: 'VAT Summary', bold: true, fontSize: 9 }, ''],
            [{ text: 'Output VAT (from invoices)', fontSize: 8 }, { text: fmtGBP(data.totalIncomeVat), alignment: 'right', fontSize: 8 }],
            [{ text: 'Input VAT (from expenses)', fontSize: 8 }, { text: fmtGBP(data.totalExpenseVat), alignment: 'right', fontSize: 8 }],
            [
              { text: 'Net VAT Position', fontSize: 8, bold: true },
              { text: fmtGBP(data.totalIncomeVat - data.totalExpenseVat), alignment: 'right', fontSize: 8, bold: true },
            ],
          ],
        },
        layout: {
          hLineWidth: (i, node) => (i === 0 || i === node.table.body.length) ? 1 : 0.5,
          vLineWidth: () => 0,
          hLineColor: () => '#E0E0E0',
          fillColor: (i) => i === 0 ? LIGHT_GREY : null,
        },
        margin: [0, 0, 0, 16],
      },

      // Net Profit
      {
        table: {
          widths: ['*', 100],
          body: [
            [
              { text: 'NET PROFIT', fontSize: 10, bold: true, color: NAVY },
              { text: fmtGBP(data.netProfit), alignment: 'right', fontSize: 10, bold: true, color: NAVY },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 0,
          hLineColor: () => NAVY,
        },
      },
    ],
  };
}

/**
 * Generate CSV content for Income & Expense report.
 */
export async function buildIncomeExpenseCsv(startDate, endDate) {
  const data = await getIncomeExpenseData(startDate, endDate);
  const { months, incomeByClient, expensesByType } = data;

  const monthLabels = months.map(m => m.label);
  const rows = [];

  // Income section
  rows.push({ category: 'INCOME', name: '', ...Object.fromEntries(monthLabels.map(l => [l, ''])), total: '' });
  for (const [name, item] of Object.entries(incomeByClient).sort(([a], [b]) => a.localeCompare(b))) {
    const row = { category: 'Income', name };
    for (const l of monthLabels) row[l] = (item.months[l] || 0).toFixed(2);
    row.total = item.total.toFixed(2);
    rows.push(row);
  }

  // Expense section
  rows.push({ category: 'EXPENSES', name: '', ...Object.fromEntries(monthLabels.map(l => [l, ''])), total: '' });
  for (const [name, item] of Object.entries(expensesByType).sort(([a], [b]) => a.localeCompare(b))) {
    const row = { category: 'Expense', name };
    for (const l of monthLabels) row[l] = (item.months[l] || 0).toFixed(2);
    row.total = item.total.toFixed(2);
    rows.push(row);
  }

  // Summary
  rows.push({ category: 'Summary', name: 'Total Income', ...Object.fromEntries(monthLabels.map(l => [l, ''])), total: data.totalIncome.toFixed(2) });
  rows.push({ category: 'Summary', name: 'Total Expenses', ...Object.fromEntries(monthLabels.map(l => [l, ''])), total: data.totalExpense.toFixed(2) });
  rows.push({ category: 'Summary', name: 'Net Profit', ...Object.fromEntries(monthLabels.map(l => [l, ''])), total: data.netProfit.toFixed(2) });
  rows.push({ category: 'Summary', name: 'Output VAT', ...Object.fromEntries(monthLabels.map(l => [l, ''])), total: data.totalIncomeVat.toFixed(2) });
  rows.push({ category: 'Summary', name: 'Input VAT', ...Object.fromEntries(monthLabels.map(l => [l, ''])), total: data.totalExpenseVat.toFixed(2) });

  const columns = [
    { key: 'category', label: 'Category' },
    { key: 'name', label: 'Name' },
    ...monthLabels.map(l => ({ key: l, label: l })),
    { key: 'total', label: 'Total' },
  ];

  return toCSV(rows, columns);
}
