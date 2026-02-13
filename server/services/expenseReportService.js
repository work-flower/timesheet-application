import { clients, projects, expenses, settings } from '../db/index.js';

export async function buildExpensePdf(clientId, startDate, endDate, projectId = null, { ids } = {}) {
  const [settingsDoc, client] = await Promise.all([
    settings.findOne({}),
    clients.findOne({ _id: clientId }),
  ]);

  if (!client) throw new Error('Client not found');

  let clientProjects;
  if (projectId) {
    const p = await projects.findOne({ _id: projectId });
    clientProjects = p ? [p] : [];
  } else {
    clientProjects = await projects.find({ clientId });
  }
  const projectIds = clientProjects.map((p) => p._id);

  let entries;
  if (ids && ids.length > 0) {
    entries = await expenses.find({ _id: { $in: ids } }).sort({ date: 1 });
  } else {
    entries = await expenses.find({
      projectId: { $in: projectIds },
      date: { $gte: startDate, $lte: endDate },
    }).sort({ date: 1 });
  }

  // Group entries by project
  const entriesByProject = {};
  for (const entry of entries) {
    if (!entriesByProject[entry.projectId]) {
      entriesByProject[entry.projectId] = [];
    }
    entriesByProject[entry.projectId].push(entry);
  }

  const projectMap = Object.fromEntries(clientProjects.map((p) => [p._id, p]));

  let periodLabel;
  if (ids && ids.length > 0 && entries.length > 0) {
    const dates = entries.map(e => e.date).sort();
    periodLabel = formatPeriodLabel(dates[0], dates[dates.length - 1]);
  } else if (startDate && endDate) {
    periodLabel = formatPeriodLabel(startDate, endDate);
  } else {
    periodLabel = 'N/A';
  }

  const content = [];
  let pageIndex = 0;

  for (const [projId, projectEntries] of Object.entries(entriesByProject)) {
    const project = projectMap[projId];
    if (!project) continue;

    if (pageIndex > 0) {
      content.push({ text: '', pageBreak: 'before' });
    }

    // Contractor header
    const businessName = settingsDoc?.businessName || settingsDoc?.name || '';
    content.push({
      columns: [
        { text: businessName, style: 'contractorName', width: '*' },
        { text: 'EXPENSE REPORT', style: 'reportLabel', width: 'auto', alignment: 'right' },
      ],
      margin: [0, 0, 0, 2],
    });
    const contactParts = [
      settingsDoc?.address,
      settingsDoc?.email,
      settingsDoc?.phone,
    ].filter(Boolean);
    if (contactParts.length > 0) {
      content.push({
        text: contactParts.join('  |  '),
        style: 'contactDetails',
        margin: [0, 0, 0, 16],
      });
    }

    // Client / project info
    content.push({
      table: {
        widths: ['auto', '*'],
        body: [
          [{ text: 'Client:', style: 'infoLabel' }, { text: client.companyName, style: 'infoValue' }],
          [{ text: 'Project:', style: 'infoLabel' }, { text: project.name, style: 'infoValue' }],
          [{ text: 'Period:', style: 'infoLabel' }, { text: periodLabel, style: 'infoValue' }],
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 16],
    });

    // Expense table
    const tableBody = [
      [
        { text: 'Date', style: 'tableHeader' },
        { text: 'Type', style: 'tableHeader' },
        { text: 'Description', style: 'tableHeader' },
        { text: 'Billable', style: 'tableHeader' },
        { text: 'Amount', style: 'tableHeader', alignment: 'right' },
        { text: 'VAT', style: 'tableHeader', alignment: 'right' },
        { text: 'Net', style: 'tableHeader', alignment: 'right' },
      ],
    ];

    let totalAmount = 0;
    let totalVat = 0;
    let totalNet = 0;

    for (const entry of projectEntries) {
      const amount = entry.amount || 0;
      const vat = entry.vatAmount || 0;
      const net = amount - vat;
      totalAmount += amount;
      totalVat += vat;
      totalNet += net;

      tableBody.push([
        { text: formatDate(entry.date), style: 'tableCell' },
        { text: entry.expenseType || '', style: 'tableCell' },
        { text: entry.description || '', style: 'tableCell' },
        { text: entry.billable ? 'Yes' : 'No', style: 'tableCell' },
        { text: `£${amount.toFixed(2)}`, style: 'tableCell', alignment: 'right' },
        { text: `£${vat.toFixed(2)}`, style: 'tableCell', alignment: 'right' },
        { text: `£${net.toFixed(2)}`, style: 'tableCell', alignment: 'right' },
      ]);
    }

    // Totals row
    tableBody.push([
      { text: 'TOTAL', style: 'totalCell', colSpan: 4 },
      '', '', '',
      { text: `£${totalAmount.toFixed(2)}`, style: 'totalCell', alignment: 'right' },
      { text: `£${totalVat.toFixed(2)}`, style: 'totalCell', alignment: 'right' },
      { text: `£${totalNet.toFixed(2)}`, style: 'totalCell', alignment: 'right' },
    ]);

    content.push({
      table: {
        headerRows: 1,
        widths: [65, 55, '*', 40, 55, 50, 55],
        body: tableBody,
      },
      layout: {
        hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
        vLineWidth: () => 0,
        hLineColor: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? '#333333' : '#CCCCCC',
        paddingTop: () => 4,
        paddingBottom: () => 4,
        paddingLeft: () => 6,
        paddingRight: () => 6,
      },
    });

    pageIndex++;
  }

  if (content.length === 0) {
    content.push({ text: 'No expense entries found for this period.', style: 'emptyMessage' });
  }

  return {
    content,
    footer: (currentPage, pageCount) => ({
      text: `Page ${currentPage} of ${pageCount}`,
      alignment: 'center',
      style: 'footer',
      margin: [0, 0, 0, 0],
    }),
    styles: {
      contractorName: { fontSize: 14, bold: true, color: '#333333' },
      reportLabel: { fontSize: 18, bold: true, color: '#0078D4' },
      contactDetails: { fontSize: 9, color: '#666666' },
      infoLabel: { fontSize: 10, bold: true, color: '#555555', margin: [0, 1, 8, 1] },
      infoValue: { fontSize: 10, color: '#333333', margin: [0, 1, 0, 1] },
      tableHeader: { fontSize: 9, bold: true, color: '#FFFFFF', fillColor: '#0078D4', margin: [0, 2, 0, 2] },
      tableCell: { fontSize: 9, color: '#333333' },
      totalCell: { fontSize: 9, bold: true, color: '#333333', fillColor: '#F0F0F0' },
      footer: { fontSize: 8, color: '#999999' },
      emptyMessage: { fontSize: 11, color: '#666666', italics: true },
    },
    defaultStyle: { font: 'Roboto' },
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40],
  };
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatPeriodLabel(startDate, endDate) {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  if (start.getDate() === 1) {
    const lastOfMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    if (end.getDate() === lastOfMonth.getDate() && start.getMonth() === end.getMonth()) {
      return start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    }
  }

  return `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} – ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
