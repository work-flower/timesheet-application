import { invoices, expenses, settings as settingsDb } from '../db/index.js';
import { toCSV } from '../utils/csv.js';

const NAVY = '#1B2A4A';
const GREY_TEXT = '#555555';
const LIGHT_GREY = '#F7F7F7';

const fmtGBP = (v) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(v || 0);

/**
 * Get VAT report data for a given period.
 */
export async function getVatData(startDate, endDate) {
  const [allInvoices, allExpenses] = await Promise.all([
    invoices.find({
      invoiceDate: { $gte: startDate, $lte: endDate },
      status: { $in: ['confirmed', 'posted'] },
    }),
    expenses.find({
      date: { $gte: startDate, $lte: endDate },
    }),
  ]);

  // Output VAT — from invoice lines, grouped by VAT rate
  const outputByRate = {};
  for (const inv of allInvoices) {
    for (const line of (inv.lines || [])) {
      const rate = line.vatPercent ?? 0;
      const key = rate === null || rate === undefined ? 'exempt' : String(rate);
      if (!outputByRate[key]) outputByRate[key] = { rate, net: 0, vat: 0, gross: 0, items: [] };
      outputByRate[key].net += line.netAmount || 0;
      outputByRate[key].vat += line.vatAmount || 0;
      outputByRate[key].gross += line.grossAmount || 0;
      outputByRate[key].items.push({
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        description: line.description,
        net: line.netAmount || 0,
        vat: line.vatAmount || 0,
        gross: line.grossAmount || 0,
      });
    }
  }

  // Input VAT — from expenses
  let totalInputVat = 0;
  let totalExpenseGross = 0;
  const expenseItems = [];
  for (const exp of allExpenses) {
    totalInputVat += exp.vatAmount || 0;
    totalExpenseGross += exp.amount || 0;
    expenseItems.push({
      date: exp.date,
      type: exp.expenseType || 'Other',
      description: exp.description || '',
      gross: exp.amount || 0,
      vat: exp.vatAmount || 0,
      net: (exp.amount || 0) - (exp.vatAmount || 0),
    });
  }

  const totalOutputVat = Object.values(outputByRate).reduce((s, r) => s + r.vat, 0);
  const totalOutputNet = Object.values(outputByRate).reduce((s, r) => s + r.net, 0);

  return {
    outputByRate,
    totalOutputNet,
    totalOutputVat,
    totalInputVat,
    totalExpenseGross,
    totalExpenseNet: totalExpenseGross - totalInputVat,
    netVatPosition: totalOutputVat - totalInputVat,
    expenseItems,
    invoiceCount: allInvoices.length,
    expenseCount: allExpenses.length,
  };
}

/**
 * Build VAT Report PDF document definition.
 */
export async function buildVatPdf(startDate, endDate) {
  const data = await getVatData(startDate, endDate);
  const { outputByRate } = data;

  const content = [
    { text: 'VAT REPORT', style: { fontSize: 16, bold: true, color: NAVY } },
    { text: `Period: ${startDate} to ${endDate}`, style: { fontSize: 10, color: GREY_TEXT }, margin: [0, 4, 0, 16] },

    // Output VAT summary
    { text: 'Output VAT (Sales)', style: { fontSize: 12, bold: true, color: NAVY }, margin: [0, 0, 0, 8] },
  ];

  // Table for each VAT rate group
  const outputRows = [];
  for (const [key, group] of Object.entries(outputByRate).sort((a, b) => Number(b[1].rate) - Number(a[1].rate))) {
    const rateLabel = key === 'exempt' ? 'Exempt' : `${group.rate}%`;
    outputRows.push([
      { text: rateLabel, fontSize: 9 },
      { text: fmtGBP(group.net), alignment: 'right', fontSize: 9 },
      { text: fmtGBP(group.vat), alignment: 'right', fontSize: 9 },
      { text: fmtGBP(group.gross), alignment: 'right', fontSize: 9 },
    ]);
  }

  outputRows.push([
    { text: 'Total Output', bold: true, fontSize: 9 },
    { text: fmtGBP(data.totalOutputNet), alignment: 'right', fontSize: 9, bold: true },
    { text: fmtGBP(data.totalOutputVat), alignment: 'right', fontSize: 9, bold: true },
    { text: fmtGBP(data.totalOutputNet + data.totalOutputVat), alignment: 'right', fontSize: 9, bold: true },
  ]);

  content.push({
    table: {
      headerRows: 1,
      widths: ['*', 80, 80, 80],
      body: [
        [
          { text: 'VAT Rate', style: 'tableHeader' },
          { text: 'Net', style: 'tableHeader', alignment: 'right' },
          { text: 'VAT', style: 'tableHeader', alignment: 'right' },
          { text: 'Gross', style: 'tableHeader', alignment: 'right' },
        ],
        ...outputRows,
      ],
    },
    layout: {
      fillColor: (i) => i === 0 ? NAVY : (i === outputRows.length ? LIGHT_GREY : (i % 2 === 0 ? LIGHT_GREY : null)),
      hLineWidth: () => 0.5,
      vLineWidth: () => 0,
      hLineColor: () => '#E0E0E0',
    },
    margin: [0, 0, 0, 16],
  });

  // Input VAT summary
  content.push(
    { text: 'Input VAT (Purchases)', style: { fontSize: 12, bold: true, color: NAVY }, margin: [0, 8, 0, 8] },
    {
      table: {
        widths: ['*', 80, 80, 80],
        body: [
          [
            { text: '', style: 'tableHeader' },
            { text: 'Net', style: 'tableHeader', alignment: 'right' },
            { text: 'VAT', style: 'tableHeader', alignment: 'right' },
            { text: 'Gross', style: 'tableHeader', alignment: 'right' },
          ],
          [
            { text: 'Total Expenses', fontSize: 9, bold: true },
            { text: fmtGBP(data.totalExpenseNet), alignment: 'right', fontSize: 9, bold: true },
            { text: fmtGBP(data.totalInputVat), alignment: 'right', fontSize: 9, bold: true },
            { text: fmtGBP(data.totalExpenseGross), alignment: 'right', fontSize: 9, bold: true },
          ],
        ],
      },
      layout: {
        fillColor: (i) => i === 0 ? NAVY : LIGHT_GREY,
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => '#E0E0E0',
      },
      margin: [0, 0, 0, 16],
    },
  );

  // Net VAT Position
  content.push({
    table: {
      widths: ['*', 120],
      body: [
        [
          { text: 'NET VAT POSITION', fontSize: 12, bold: true, color: NAVY },
          {
            text: fmtGBP(Math.abs(data.netVatPosition)),
            alignment: 'right',
            fontSize: 12,
            bold: true,
            color: NAVY,
          },
        ],
        [
          { text: data.netVatPosition >= 0 ? 'Amount owed to HMRC' : 'Amount reclaimable from HMRC', fontSize: 9, color: GREY_TEXT },
          '',
        ],
      ],
    },
    layout: {
      hLineWidth: (i, node) => (i === 0 || i === 1) ? 1 : 0,
      vLineWidth: () => 0,
      hLineColor: () => NAVY,
    },
    margin: [0, 8, 0, 0],
  });

  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40],
    styles: {
      tableHeader: {
        bold: true,
        fontSize: 8,
        color: 'white',
        fillColor: NAVY,
      },
    },
    content,
  };
}

/**
 * Generate CSV content for VAT report.
 */
export async function buildVatCsv(startDate, endDate) {
  const data = await getVatData(startDate, endDate);
  const rows = [];

  // Output VAT detail
  for (const [key, group] of Object.entries(data.outputByRate)) {
    const rateLabel = key === 'exempt' ? 'Exempt' : `${group.rate}%`;
    for (const item of group.items) {
      rows.push({
        section: 'Output VAT',
        vatRate: rateLabel,
        date: item.invoiceDate,
        reference: item.invoiceNumber,
        description: item.description,
        net: item.net.toFixed(2),
        vat: item.vat.toFixed(2),
        gross: item.gross.toFixed(2),
      });
    }
  }

  // Input VAT detail
  for (const item of data.expenseItems) {
    rows.push({
      section: 'Input VAT',
      vatRate: '',
      date: item.date,
      reference: item.type,
      description: item.description,
      net: item.net.toFixed(2),
      vat: item.vat.toFixed(2),
      gross: item.gross.toFixed(2),
    });
  }

  // Summary
  rows.push({ section: 'Summary', vatRate: '', date: '', reference: '', description: 'Total Output VAT', net: '', vat: data.totalOutputVat.toFixed(2), gross: '' });
  rows.push({ section: 'Summary', vatRate: '', date: '', reference: '', description: 'Total Input VAT', net: '', vat: data.totalInputVat.toFixed(2), gross: '' });
  rows.push({ section: 'Summary', vatRate: '', date: '', reference: '', description: 'Net VAT Position', net: '', vat: data.netVatPosition.toFixed(2), gross: '' });

  const columns = [
    { key: 'section', label: 'Section' },
    { key: 'vatRate', label: 'VAT Rate' },
    { key: 'date', label: 'Date' },
    { key: 'reference', label: 'Reference' },
    { key: 'description', label: 'Description' },
    { key: 'net', label: 'Net' },
    { key: 'vat', label: 'VAT' },
    { key: 'gross', label: 'Gross' },
  ];

  return toCSV(rows, columns);
}
