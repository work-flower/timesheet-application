import { clients, projects, expenses, settings } from '../db/index.js';

const NAVY = '#1B2A4A';
const GREY_TEXT = '#555555';
const LIGHT_GREY = '#F7F7F7';

const fmtGBP = (v) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(v || 0);

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
  if (startDate && endDate) {
    periodLabel = formatPeriodLabel(startDate, endDate);
  } else if (ids && ids.length > 0 && entries.length > 0) {
    const dates = entries.map(e => e.date).sort();
    periodLabel = formatPeriodLabel(dates[0], dates[dates.length - 1]);
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
    const addressParts = [
      ...(settingsDoc?.address || '').split('\n').filter(Boolean),
      settingsDoc?.phone,
    ].filter(Boolean);

    content.push({
      columns: [
        {
          width: '*',
          stack: [
            { text: businessName, style: 'contractorName' },
            ...addressParts.map(line => ({ text: line, style: 'contactDetails' })),
          ],
        },
        { text: 'EXPENSE REPORT', style: 'reportLabel', width: 'auto', alignment: 'right' },
      ],
      margin: [8, 0, 8, 24],
    });

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
        { text: 'Amount', style: 'tableHeader', alignment: 'right' },
      ],
    ];

    let totalAmount = 0;
    let rowIndex = 0;

    for (const entry of projectEntries) {
      const amount = entry.amount || 0;
      totalAmount += amount;
      const fill = rowIndex % 2 === 1 ? LIGHT_GREY : null;

      tableBody.push([
        { text: formatDate(entry.date), style: 'tableCell', fillColor: fill },
        { text: entry.expenseType || '', style: 'tableCell', fillColor: fill },
        { text: entry.description || '', style: 'tableCell', fillColor: fill },
        { text: fmtGBP(amount), style: 'tableCell', alignment: 'right', fillColor: fill },
      ]);
      rowIndex++;
    }

    // Totals row
    tableBody.push([
      { text: 'TOTAL', style: 'totalCell', colSpan: 3 },
      '', '',
      { text: fmtGBP(totalAmount), style: 'totalCell', alignment: 'right' },
    ]);

    content.push({
      table: {
        headerRows: 1,
        widths: [65, 55, '*', 65],
        body: tableBody,
      },
      layout: {
        hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
        vLineWidth: () => 0,
        hLineColor: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? NAVY : '#CCCCCC',
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
      contractorName: { fontSize: 16, bold: true, color: NAVY, margin: [0, 0, 0, 4] },
      reportLabel: { fontSize: 18, bold: true, color: NAVY },
      contactDetails: { fontSize: 9, color: GREY_TEXT, margin: [0, 4, 0, 0] },
      infoLabel: { fontSize: 10, bold: true, color: GREY_TEXT, margin: [0, 1, 8, 1] },
      infoValue: { fontSize: 10, color: '#333333', margin: [0, 1, 0, 1] },
      tableHeader: { fontSize: 9, bold: true, color: '#FFFFFF', fillColor: NAVY, margin: [0, 2, 0, 2] },
      tableCell: { fontSize: 9, color: '#333333' },
      totalCell: { fontSize: 9, bold: true, color: '#333333', fillColor: LIGHT_GREY },
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
