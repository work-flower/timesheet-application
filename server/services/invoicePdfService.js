import { clients, invoices, settings } from '../db/index.js';

export async function buildInvoicePdf(invoiceId) {
  const invoice = await invoices.findOne({ _id: invoiceId });
  if (!invoice) throw new Error('Invoice not found');

  const [settingsDoc, client] = await Promise.all([
    settings.findOne({}),
    clients.findOne({ _id: invoice.clientId }),
  ]);
  if (!client) throw new Error('Client not found');

  // Build line items from stored lines (no source record fetching needed)
  const lineItems = buildLineItems(invoice.lines || []);

  const content = [];

  // Header: Business name + INVOICE
  const businessName = settingsDoc?.businessName || settingsDoc?.name || '';
  content.push({
    columns: [
      { text: businessName, style: 'businessName', width: '*' },
      { text: 'INVOICE', style: 'invoiceLabel', width: 'auto', alignment: 'right' },
    ],
    margin: [0, 0, 0, 16],
  });

  // From / To columns
  const fromLines = [];
  if (settingsDoc?.address) fromLines.push(settingsDoc.address);
  if (settingsDoc?.email) fromLines.push(settingsDoc.email);
  if (settingsDoc?.phone) fromLines.push(settingsDoc.phone);
  if (settingsDoc?.vatNumber) fromLines.push(`VAT: ${settingsDoc.vatNumber}`);

  const billToName = client.invoicingEntityName || client.companyName;
  const billToAddress = client.invoicingEntityAddress || '';

  content.push({
    columns: [
      {
        width: '*',
        stack: [
          { text: 'From:', style: 'sectionLabel', margin: [0, 0, 0, 4] },
          { text: businessName, style: 'infoText', bold: true },
          ...fromLines.map(line => ({ text: line, style: 'infoText' })),
        ],
      },
      {
        width: '*',
        stack: [
          { text: 'Bill To:', style: 'sectionLabel', margin: [0, 0, 0, 4] },
          { text: billToName, style: 'infoText', bold: true },
          ...(billToAddress ? billToAddress.split('\n').map(line => ({ text: line, style: 'infoText' })) : []),
        ],
      },
    ],
    margin: [0, 0, 0, 16],
  });

  // Invoice meta box
  const metaRows = [];
  if (invoice.invoiceNumber) {
    metaRows.push(['Invoice Number:', invoice.invoiceNumber]);
  }
  metaRows.push(['Invoice Date:', formatDate(invoice.invoiceDate)]);
  metaRows.push(['Due Date:', formatDate(invoice.dueDate)]);

  content.push({
    table: {
      widths: ['auto', 'auto'],
      body: metaRows.map(([label, value]) => [
        { text: label, style: 'metaLabel', alignment: 'right' },
        { text: value, style: 'metaValue' },
      ]),
    },
    layout: 'noBorders',
    alignment: 'right',
    margin: [0, 0, 0, 12],
  });

  // Additional information
  const infoParts = [];
  if (invoice.servicePeriodStart && invoice.servicePeriodEnd) {
    infoParts.push(`Service Period: ${formatDate(invoice.servicePeriodStart)} – ${formatDate(invoice.servicePeriodEnd)}`);
  }
  if (invoice.additionalNotes) {
    infoParts.push(invoice.additionalNotes);
  }
  if (infoParts.length > 0) {
    content.push({
      text: infoParts.join('\n'),
      style: 'additionalInfo',
      margin: [0, 0, 0, 12],
    });
  }

  // Line items table
  const tableBody = [
    [
      { text: 'Description', style: 'tableHeader' },
      { text: 'Qty', style: 'tableHeader', alignment: 'right' },
      { text: 'Unit', style: 'tableHeader' },
      { text: 'Unit Price', style: 'tableHeader', alignment: 'right' },
      { text: 'VAT %', style: 'tableHeader', alignment: 'right' },
      { text: 'VAT', style: 'tableHeader', alignment: 'right' },
      { text: 'Total', style: 'tableHeader', alignment: 'right' },
    ],
  ];

  let isFirstGroup = true;
  for (const group of lineItems) {
    if (!isFirstGroup) {
      tableBody.push([
        { text: '', colSpan: 7, margin: [0, 6, 0, 6] },
        '', '', '', '', '', '',
      ]);
    }
    isFirstGroup = false;

    for (const line of group.lines) {
      const vatDisplay = line.vatPercent != null ? `${line.vatPercent}%` : 'N/A';
      const vatAmount = line.vatPercent != null ? `£${line.vatAmount.toFixed(2)}` : '—';

      tableBody.push([
        { text: line.description, style: 'tableCell', bold: true },
        { text: line.qty, style: 'tableCell', alignment: 'right' },
        { text: line.unit, style: 'tableCell' },
        { text: `£${line.unitPrice.toFixed(2)}`, style: 'tableCell', alignment: 'right' },
        { text: vatDisplay, style: 'tableCell', alignment: 'right' },
        { text: vatAmount, style: 'tableCell', alignment: 'right' },
        { text: `£${line.total.toFixed(2)}`, style: 'tableCell', alignment: 'right' },
      ]);

      if (line.detail) {
        tableBody.push([
          { text: `  ${line.detail}`, colSpan: 7, style: 'detailLine' },
          '', '', '', '', '', '',
        ]);
      }
    }
  }

  // Totals rows
  const blankCols = (n) => Array(n).fill('');
  tableBody.push([
    ...blankCols(5),
    { text: 'Sub Total:', style: 'totalLabel', alignment: 'right' },
    { text: `£${invoice.subtotal.toFixed(2)}`, style: 'totalValue', alignment: 'right' },
  ]);
  tableBody.push([
    ...blankCols(5),
    { text: 'Total VAT:', style: 'totalLabel', alignment: 'right' },
    { text: `£${invoice.totalVat.toFixed(2)}`, style: 'totalValue', alignment: 'right' },
  ]);
  tableBody.push([
    ...blankCols(5),
    { text: 'Total Due:', style: 'grandTotalLabel', alignment: 'right' },
    { text: `£${invoice.total.toFixed(2)}`, style: 'grandTotalValue', alignment: 'right' },
  ]);

  content.push({
    table: {
      headerRows: 1,
      widths: ['*', 40, 35, 60, 35, 55, 65],
      body: tableBody,
    },
    layout: {
      hLineWidth: (i, node) => {
        if (i === 0 || i === 1) return 1;
        if (i === node.table.body.length) return 1;
        if (i >= node.table.body.length - 3) return 0.5;
        return 0;
      },
      vLineWidth: () => 0,
      hLineColor: (i) => {
        if (i === 0 || i === 1) return '#333333';
        return '#CCCCCC';
      },
      paddingTop: () => 3,
      paddingBottom: () => 3,
      paddingLeft: () => 4,
      paddingRight: () => 4,
    },
    margin: [0, 0, 0, 24],
  });

  // Bank details footer
  const footerParts = [];
  if (settingsDoc?.companyRegistration) footerParts.push(`Company No: ${settingsDoc.companyRegistration}`);
  if (settingsDoc?.address) footerParts.push(settingsDoc.address);
  if (settingsDoc?.email) footerParts.push(settingsDoc.email);

  const bankParts = [];
  if (settingsDoc?.bankName) bankParts.push(settingsDoc.bankName);
  if (settingsDoc?.bankSortCode) bankParts.push(`Sort Code: ${settingsDoc.bankSortCode}`);
  if (settingsDoc?.bankAccountNumber) bankParts.push(`Account: ${settingsDoc.bankAccountNumber}`);
  if (settingsDoc?.bankAccountOwner) bankParts.push(`Name: ${settingsDoc.bankAccountOwner}`);

  if (bankParts.length > 0) {
    content.push({
      text: 'Bank Details',
      style: 'bankHeader',
      margin: [0, 0, 0, 4],
    });
    content.push({
      text: bankParts.join('  |  '),
      style: 'bankDetails',
      margin: [0, 0, 0, 8],
    });
  }

  if (settingsDoc?.invoiceFooterText) {
    content.push({
      text: settingsDoc.invoiceFooterText,
      style: 'footerText',
      margin: [0, 8, 0, 0],
    });
  }

  if (footerParts.length > 0) {
    content.push({
      text: footerParts.join('  |  '),
      style: 'companyFooter',
      margin: [0, 8, 0, 0],
    });
  }

  return {
    content,
    styles: {
      businessName: { fontSize: 16, bold: true, color: '#333333' },
      invoiceLabel: { fontSize: 18, bold: true, color: '#0078D4' },
      sectionLabel: { fontSize: 9, bold: true, color: '#555555' },
      infoText: { fontSize: 9, color: '#333333' },
      metaLabel: { fontSize: 9, bold: true, color: '#555555', margin: [0, 1, 8, 1] },
      metaValue: { fontSize: 9, color: '#333333', margin: [0, 1, 0, 1] },
      additionalInfo: { fontSize: 9, color: '#555555', italics: true },
      tableHeader: { fontSize: 8, bold: true, color: '#FFFFFF', fillColor: '#0078D4', margin: [0, 2, 0, 2] },
      tableCell: { fontSize: 8, color: '#333333' },
      detailLine: { fontSize: 7, color: '#888888', italics: true },
      totalLabel: { fontSize: 9, bold: true, color: '#333333' },
      totalValue: { fontSize: 9, color: '#333333' },
      grandTotalLabel: { fontSize: 10, bold: true, color: '#333333' },
      grandTotalValue: { fontSize: 10, bold: true, color: '#333333' },
      bankHeader: { fontSize: 9, bold: true, color: '#333333' },
      bankDetails: { fontSize: 8, color: '#555555' },
      footerText: { fontSize: 8, color: '#666666', italics: true },
      companyFooter: { fontSize: 7, color: '#999999' },
    },
    defaultStyle: { font: 'Roboto' },
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40],
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
      detail: `timesheets: ${agg.totalDays.toFixed(2)} days × £${agg.unitPrice.toFixed(2)} = £${agg.totalNet.toFixed(2)}`,
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
    const detailVat = totalVat > 0 ? `, VAT (inclusive) = £${totalVat.toFixed(2)}` : '';

    group.lines.push({
      description: `${Object.keys(typeCounts)[0] || 'Expenses'}${count > 1 ? ' expenses' : ''}`,
      qty: String(count),
      unit: count === 1 ? 'item' : 'items',
      unitPrice: round2(totalGross / count),
      vatPercent: bucket.vatPercent,
      vatAmount: round2(totalVat),
      total: round2(totalGross),
      detail: `expenses: ${typeSummary} = £${totalGross.toFixed(2)}${detailVat}`,
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
