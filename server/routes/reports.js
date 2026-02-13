import { Router } from 'express';
import { buildTimesheetPdf } from '../services/reportService.js';
import { buildExpensePdf } from '../services/expenseReportService.js';
import { combinePdfs } from '../services/pdfCombineService.js';
import { renderToBuffer } from '../services/pdfRenderer.js';

const router = Router();

router.get('/timesheet-pdf', async (req, res) => {
  try {
    const { clientId, startDate, endDate, projectId } = req.query;

    if (!clientId || !startDate || !endDate) {
      return res.status(400).json({ error: 'clientId, startDate, and endDate are required' });
    }

    const docDefinition = await buildTimesheetPdf(clientId, startDate, endDate, projectId || null);
    const buffer = await renderToBuffer(docDefinition);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="timesheet-${startDate}-to-${endDate}.pdf"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/expense-pdf', async (req, res) => {
  try {
    const { clientId, startDate, endDate, projectId } = req.query;

    if (!clientId || !startDate || !endDate) {
      return res.status(400).json({ error: 'clientId, startDate, and endDate are required' });
    }

    const docDefinition = await buildExpensePdf(clientId, startDate, endDate, projectId || null);
    const buffer = await renderToBuffer(docDefinition);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="expenses-${startDate}-to-${endDate}.pdf"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Report builder registry — maps type names to builder functions
// Each supports either date range mode (clientId + startDate + endDate) or IDs mode (clientId + ids[])
const reportBuilders = {
  timesheet: async (params) => {
    const { clientId, startDate, endDate, projectId, ids } = params;
    if (!clientId) throw new Error('timesheet report requires clientId');
    if (!ids?.length && (!startDate || !endDate)) throw new Error('timesheet report requires startDate+endDate or ids[]');
    return buildTimesheetPdf(clientId, startDate, endDate, projectId || null, { ids });
  },
  expense: async (params) => {
    const { clientId, startDate, endDate, projectId, ids } = params;
    if (!clientId) throw new Error('expense report requires clientId');
    if (!ids?.length && (!startDate || !endDate)) throw new Error('expense report requires startDate+endDate or ids[]');
    return buildExpensePdf(clientId, startDate, endDate, projectId || null, { ids });
  },
};

// Lazy-load invoice builder to avoid circular deps
async function getInvoiceBuilder() {
  const { buildInvoicePdf } = await import('../services/invoicePdfService.js');
  return buildInvoicePdf;
}

router.post('/combined-pdf', async (req, res) => {
  try {
    const { reports } = req.body;
    if (!Array.isArray(reports) || reports.length === 0) {
      return res.status(400).json({ error: 'reports array is required and must not be empty' });
    }

    // Build each PDF buffer independently
    const buffers = [];
    for (const report of reports) {
      const { type, params } = report;
      let docDefinition;

      if (type === 'invoice') {
        const buildInvoicePdf = await getInvoiceBuilder();
        if (!params?.id) throw new Error('invoice report requires id');
        docDefinition = await buildInvoicePdf(params.id);
      } else if (reportBuilders[type]) {
        docDefinition = await reportBuilders[type](params);
      } else {
        throw new Error(`Unknown report type: ${type}`);
      }

      buffers.push(await renderToBuffer(docDefinition));
    }

    // Combine all PDFs
    const combined = await combinePdfs(buffers);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="combined-report.pdf"');
    res.send(combined);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
