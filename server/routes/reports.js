import { Router } from 'express';
import { createRequire } from 'module';
import { buildTimesheetPdf } from '../services/reportService.js';

const require = createRequire(import.meta.url);
const PdfPrinter = require('pdfmake/js/Printer').default;

const fonts = {
  Roboto: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

const router = Router();

router.get('/timesheet-pdf', async (req, res) => {
  try {
    const { clientId, startDate, endDate, projectId } = req.query;

    if (!clientId || !startDate || !endDate) {
      return res.status(400).json({ error: 'clientId, startDate, and endDate are required' });
    }

    const docDefinition = await buildTimesheetPdf(clientId, startDate, endDate, projectId || null);
    const printer = new PdfPrinter(fonts);
    const pdfDoc = await printer.createPdfKitDocument(docDefinition);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="timesheet-${startDate}-to-${endDate}.pdf"`);

    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
