import { clients, invoices, settings } from '../db/index.js';

const NAVY = '#1B2A4A';
const GREY_TEXT = '#555555';
const LIGHT_GREY = '#F7F7F7';

const fmtGBP = (v) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(v || 0);

export async function buildInvoicePdf(invoiceId) {
  const invoice = await invoices.findOne({ _id: invoiceId });
  if (!invoice) throw new Error('Invoice not found');

  const [settingsDoc, client] = await Promise.all([
    settings.findOne({}),
    clients.findOne({ _id: invoice.clientId }),
  ]);
  if (!client) throw new Error('Client not found');

  const lineItems = buildLineItems(invoice.lines || []);

  const businessName = settingsDoc?.businessName || settingsDoc?.name || '';
  const addressParts = [
    ...(settingsDoc?.address || '').split('\n').filter(Boolean),
    settingsDoc?.phone,
  ].filter(Boolean);

  const billToName = client.invoicingEntityName || client.companyName;
  const billToLines = (client.invoicingEntityAddress || '').split('\n').filter(Boolean);

  const content = [];

  // ── Header: Company name + INVOICE ──
  content.push({
    columns: [
      {
        width: '*',
        stack: [
          { text: businessName, style: 'businessName' },
          ...addressParts.map(line => ({ text: line, style: 'businessDetail' })),
        ],
      },
      { text: 'INVOICE', style: 'invoiceLabel', width: 'auto', alignment: 'right' },
    ],
    margin: [8, 0, 8, 24],
  });

  // ── Billing block: To (left) + Invoice meta (right) ──
  const metaLines = [];
  metaLines.push({ text: '', margin: [0, 0, 0, 0] });
  metaLines.push({ text: `Invoice Date: ${formatDate(invoice.invoiceDate)}`, style: 'metaLabel', alignment: 'right' });
  if (invoice.invoiceNumber) {
    metaLines.push({ text: `Invoice Number: ${invoice.invoiceNumber}`, style: 'metaLabel', alignment: 'right' });
  }
  metaLines.push({ text: `DUE DATE: ${formatDate(invoice.dueDate)}`, style: 'metaLabelBold', alignment: 'right' });

  const toStack = [
    { text: 'To:', style: 'sectionLabel', margin: [0, 0, 0, 4] },
    { text: billToName, style: 'billToName' },
    ...billToLines.map(line => ({ text: line, style: 'billToAddress' })),
  ];

  content.push({
    table: {
      widths: ['*', '*'],
      body: [[
        { stack: toStack, margin: [8, 8, 8, 8] },
        { stack: metaLines, fillColor: LIGHT_GREY, margin: [8, 8, 8, 8], alignment: 'right' },
      ]],
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 16],
  });

  // ── Service period line ──
  if (invoice.servicePeriodStart && invoice.servicePeriodEnd) {
    content.push({
      text: `Service Period: ${formatPeriodLabel(invoice.servicePeriodStart, invoice.servicePeriodEnd)}`,
      style: 'servicePeriod',
      margin: [0, 0, 0, 16],
    });
  }

  // ── Line items table ──
  const tableBody = [
    [
      { text: 'Description', style: 'tableHeader' },
      { text: 'Qty', style: 'tableHeader', alignment: 'right' },
      { text: 'Unit', style: 'tableHeader' },
      { text: 'Unit Price', style: 'tableHeader', alignment: 'right' },
      { text: 'VAT %', style: 'tableHeader', alignment: 'right' },
      { text: 'Amount', style: 'tableHeader', alignment: 'right' },
      { text: 'VAT', style: 'tableHeader', alignment: 'right' },
      { text: 'Total', style: 'tableHeader', alignment: 'right' },
    ],
  ];

  let rowIndex = 0;
  let isFirstGroup = true;
  for (const group of lineItems) {
    if (!isFirstGroup) {
      tableBody.push([
        { text: '', colSpan: 8, margin: [0, 4, 0, 4] },
        '', '', '', '', '', '', '',
      ]);
      rowIndex++;
    }
    isFirstGroup = false;

    for (const line of group.lines) {
      const vatDisplay = line.vatPercent != null ? `${line.vatPercent}%` : 'Exempt';
      const vatAmount = line.vatPercent != null ? fmtGBP(line.vatAmount) : '—';
      const fill = rowIndex % 2 === 1 ? LIGHT_GREY : null;

      const netAmount = round2(line.total - (line.vatAmount || 0));

      tableBody.push([
        { text: line.description, style: 'tableCell', bold: true, fillColor: fill },
        { text: line.qty, style: 'tableCell', alignment: 'right', fillColor: fill },
        { text: line.unit, style: 'tableCell', fillColor: fill },
        { text: fmtGBP(line.unitPrice), style: 'tableCell', alignment: 'right', fillColor: fill },
        { text: vatDisplay, style: 'tableCell', alignment: 'right', fillColor: fill },
        { text: fmtGBP(netAmount), style: 'tableCell', alignment: 'right', fillColor: fill },
        { text: vatAmount, style: 'tableCell', alignment: 'right', fillColor: fill },
        { text: fmtGBP(line.total), style: 'tableCell', alignment: 'right', fillColor: fill },
      ]);
      rowIndex++;

      if (line.detail) {
        tableBody.push([
          { text: `  ${line.detail}`, colSpan: 8, style: 'detailLine', fillColor: fill },
          '', '', '', '', '', '', '',
        ]);
      }
    }
  }

  // Wrap line items table in a bordered rectangle (single-cell outer table)
  content.push({
    table: {
      widths: ['*'],
      heights: [265],
      body: [[
        {
          table: {
            headerRows: 1,
            widths: ['*', 25, 28, 48, 28, 48, 42, 52],
            body: tableBody,
          },
          layout: {
            hLineWidth: (i, node) => (i === 0 || i === 1) ? 1 : 0,
            vLineWidth: () => 0,
            hLineColor: () => NAVY,
            paddingTop: () => 4,
            paddingBottom: () => 4,
            paddingLeft: () => 6,
            paddingRight: () => 6,
          },
          margin: [0, 0, 0, 20],
        },
      ]],
    },
    layout: {
      hLineWidth: () => 1,
      vLineWidth: () => 1,
      hLineColor: () => NAVY,
      vLineColor: () => NAVY,
      paddingTop: () => 0,
      paddingBottom: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
    },
    margin: [0, 0, 0, 0],
  });

  // ── Totals block (right-aligned, below the bordered rectangle) ──
  const totalsBody = [
    [
      { text: 'Sub Total:', style: 'totalLabel', alignment: 'right' },
      { text: fmtGBP(invoice.subtotal), style: 'totalValue', alignment: 'right' },
    ],
    [
      { text: 'Total VAT:', style: 'totalLabel', alignment: 'right' },
      { text: fmtGBP(invoice.totalVat), style: 'totalValue', alignment: 'right' },
    ],
    [
      { text: 'Total Due:', style: 'grandTotalLabel', alignment: 'right' },
      { text: fmtGBP(invoice.total), style: 'grandTotalValue', alignment: 'right' },
    ],
  ];

  content.push({
    columns: [
      { text: '', width: '*' },
      {
        width: 'auto',
        table: {
          widths: ['auto', 'auto'],
          body: totalsBody,
        },
        layout: {
          hLineWidth: (i, node) => (i === node.table.body.length - 1) ? 1 : 0,
          vLineWidth: () => 0,
          hLineColor: () => NAVY,
          paddingTop: () => 3,
          paddingBottom: () => 3,
          paddingLeft: () => 8,
          paddingRight: () => 0,
        },
      },
    ],
    margin: [0, 12, 0, 24],
  });

  // ── Build page footer (pinned to bottom of every page) ──
  const regAddressParts = [settingsDoc?.address].filter(Boolean);
  if (settingsDoc?.vatNumber) regAddressParts.push(`VAT No. ${settingsDoc.vatNumber}`);
  const contactLines = [settingsDoc?.name, settingsDoc?.phone, settingsDoc?.email].filter(Boolean);
  const bankRows = [];
  if (settingsDoc?.bankName) bankRows.push(['Bank Name', settingsDoc.bankName]);
  if (settingsDoc?.bankSortCode) bankRows.push(['Sort-Code', settingsDoc.bankSortCode]);
  if (settingsDoc?.bankAccountNumber) bankRows.push(['Account No.', settingsDoc.bankAccountNumber]);
  if (settingsDoc?.bankAccountOwner) bankRows.push(['Acc. Owner', settingsDoc.bankAccountOwner]);

  const footerStack = [];

  // "Thank you" text
  footerStack.push({
    text: 'Thank you for your business!',
    fontSize: 10, italics: true, color: GREY_TEXT,
    alignment: 'center',
    margin: [40, 0, 40, 10],
  });

  // Horizontal line below "Thank you"
  footerStack.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#CCCCCC' }],
    margin: [40, 0, 40, 8],
  });

  // Company number — bold
  if (settingsDoc?.companyRegistration) {
    footerStack.push({
      text: `Company Number: ${settingsDoc.companyRegistration}`,
      fontSize: 8, bold: true, color: '#333333',
      margin: [40, 0, 40, 10],
    });
  }

  // Three-column layout
  footerStack.push({
    columns: [
      {
        width: '*',
        stack: [
          { text: 'Registered Address:', fontSize: 8, bold: true, color: '#333333', margin: [0, 0, 0, 2] },
          {
            table: {
              widths: ['*'],
              body: regAddressParts.map(line => [{ text: line, fontSize: 7, color: GREY_TEXT }]),
            },
            layout: 'noBorders',
          },
        ],
      },
      {
        width: '*',
        stack: [
          { text: 'Contact Information', fontSize: 8, bold: true, color: '#333333', margin: [0, 0, 0, 2] },
          {
            table: {
              widths: ['*'],
              body: contactLines.map(line => [{ text: line, fontSize: 7, color: GREY_TEXT }]),
            },
            layout: 'noBorders',
          },
        ],
      },
      {
        width: '*',
        stack: [
          { text: 'Payment Details', fontSize: 8, bold: true, color: '#333333', margin: [0, 0, 0, 2] },
          {
            table: {
              widths: ['auto', 'auto'],
              body: bankRows.map(([label, value]) => [
                { text: label, fontSize: 7, color: GREY_TEXT },
                { text: value, fontSize: 7, color: GREY_TEXT },
              ]),
            },
            layout: 'noBorders',
          },
        ],
      },
    ],
    margin: [40, 0, 40, 0],
  });

  return {
    content,
    footer: { stack: footerStack },
    styles: {
      businessName: { fontSize: 16, bold: true, color: NAVY, margin: [0, 0, 0, 4] },
      businessDetail: { fontSize: 9, color: GREY_TEXT, margin: [0, 4, 0, 0] },
      invoiceLabel: { fontSize: 20, bold: true, color: NAVY },
      sectionLabel: { fontSize: 9, bold: true, color: GREY_TEXT },
      billToName: { fontSize: 10, bold: true, color: '#333333', margin: [0, 4, 0, 0] },
      billToAddress: { fontSize: 9, color: '#333333', margin: [0, 4, 0, 0] },
      metaLabel: { fontSize: 9, color: GREY_TEXT, margin: [0, 4, 0, 0] },
      metaLabelBold: { fontSize: 9, bold: true, color: NAVY, margin: [0, 4, 0, 0] },
      servicePeriod: { fontSize: 9, color: GREY_TEXT, margin: [0, 4, 0, 0] },
      tableHeader: { fontSize: 8, bold: true, color: '#FFFFFF', fillColor: NAVY, margin: [0, 2, 0, 2] },
      tableCell: { fontSize: 8, color: '#333333' },
      detailLine: { fontSize: 7, color: '#888888', italics: true },
      totalLabel: { fontSize: 9, color: '#333333', margin: [0, 1, 0, 1] },
      totalValue: { fontSize: 9, color: '#333333', margin: [0, 1, 0, 1] },
      grandTotalLabel: { fontSize: 10, bold: true, color: NAVY, margin: [0, 2, 0, 2] },
      grandTotalValue: { fontSize: 10, bold: true, color: NAVY, margin: [0, 2, 0, 2] },
    },
    defaultStyle: { font: 'Roboto' },
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 140],
  };
}

/**
 * Build PDF line items from stored invoice lines.
 * Groups by VAT rate, aggregates timesheet lines by project,
 * expense lines by project+VAT, write-in lines as individual rows.
 */
function buildLineItems(lines) {
  const vatGroups = new Map();

  function getVatKey(vatPercent) {
    if (vatPercent == null) return 'null';
    return String(vatPercent);
  }

  function ensureGroup(vatKey) {
    if (!vatGroups.has(vatKey)) {
      vatGroups.set(vatKey, { lines: [] });
    }
    return vatGroups.get(vatKey);
  }

  // Aggregate timesheet lines by (vatPercent, projectId)
  const tsAgg = {};
  for (const line of lines) {
    if (line.type !== 'timesheet') continue;
    const vatKey = getVatKey(line.vatPercent);
    const key = `${vatKey}::${line.projectId || 'unknown'}`;
    if (!tsAgg[key]) {
      tsAgg[key] = {
        vatPercent: line.vatPercent,
        projectId: line.projectId,
        description: line.description,
        unitPrice: line.unitPrice || 0,
        totalDays: 0,
        totalNet: 0,
        totalVat: 0,
        totalGross: 0,
      };
    }
    tsAgg[key].totalDays += line.quantity || 0;
    tsAgg[key].totalNet += line.netAmount || 0;
    tsAgg[key].totalVat += line.vatAmount || 0;
    tsAgg[key].totalGross += line.grossAmount || 0;
  }

  for (const agg of Object.values(tsAgg)) {
    const vatKey = getVatKey(agg.vatPercent);
    const group = ensureGroup(vatKey);
    group.lines.push({
      description: agg.description || 'Consulting fees',
      qty: agg.totalDays.toFixed(2),
      unit: 'days',
      unitPrice: agg.unitPrice,
      vatPercent: agg.vatPercent,
      vatAmount: round2(agg.totalVat),
      total: round2(agg.totalGross),
      detail: `timesheets: ${agg.totalDays.toFixed(2)} days × ${fmtGBP(agg.unitPrice)} = ${fmtGBP(agg.totalNet)}`,
    });
  }

  // Aggregate expense lines by (vatPercent, projectId)
  const expAgg = {};
  for (const line of lines) {
    if (line.type !== 'expense') continue;
    const vatKey = getVatKey(line.vatPercent);
    const key = `${line.projectId || 'unknown'}::${vatKey}`;
    if (!expAgg[key]) {
      expAgg[key] = { vatPercent: line.vatPercent, projectId: line.projectId, lines: [] };
    }
    expAgg[key].lines.push(line);
  }

  for (const bucket of Object.values(expAgg)) {
    const vatKey = getVatKey(bucket.vatPercent);
    const group = ensureGroup(vatKey);

    const count = bucket.lines.length;
    const totalGross = bucket.lines.reduce((s, l) => s + (l.grossAmount || 0), 0);
    const totalVat = bucket.lines.reduce((s, l) => s + (l.vatAmount || 0), 0);

    // Summarize expense types
    const typeCounts = {};
    for (const l of bucket.lines) {
      const t = l.expenseType || l.description?.split(' - ')[0] || 'Other';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    const typeSummary = Object.entries(typeCounts).map(([t, c]) => `${c}×${t}`).join(', ');
    const detailVat = totalVat > 0 ? `, VAT (inclusive) = ${fmtGBP(totalVat)}` : '';

    group.lines.push({
      description: `${Object.keys(typeCounts)[0] || 'Expenses'}${count > 1 ? ' expenses' : ''}`,
      qty: String(count),
      unit: count === 1 ? 'item' : 'items',
      unitPrice: round2(totalGross / count),
      vatPercent: bucket.vatPercent,
      vatAmount: round2(totalVat),
      total: round2(totalGross),
      detail: `expenses: ${typeSummary} = ${fmtGBP(totalGross)}${detailVat}`,
    });
  }

  // Write-in lines — render individually
  for (const line of lines) {
    if (line.type !== 'write-in') continue;
    const vatKey = getVatKey(line.vatPercent);
    const group = ensureGroup(vatKey);
    group.lines.push({
      description: line.description || 'Additional item',
      qty: String(line.quantity || 1),
      unit: line.unit || 'item',
      unitPrice: line.unitPrice || 0,
      vatPercent: line.vatPercent,
      vatAmount: line.vatAmount || 0,
      total: line.grossAmount || 0,
      detail: null,
    });
  }

  // Sort: highest VAT first, null (exempt) last
  const sortedKeys = [...vatGroups.keys()].sort((a, b) => {
    if (a === 'null') return 1;
    if (b === 'null') return -1;
    return Number(b) - Number(a);
  });

  return sortedKeys.map(key => vatGroups.get(key));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatPeriodLabel(startDate, endDate) {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  // Same month+year: "01 - 31 January 2026"
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    const day1 = String(start.getDate()).padStart(2, '0');
    const day2 = String(end.getDate()).padStart(2, '0');
    const monthYear = end.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    return `${day1} - ${day2} ${monthYear}`;
  }

  return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}
