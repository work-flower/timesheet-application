import { Router } from 'express';
import { createRequire } from 'module';
import * as documentService from '../services/documentService.js';
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

// List documents
router.get('/', async (req, res) => {
  try {
    const docs = await documentService.getAll(req.query);
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get document metadata
router.get('/:id', async (req, res) => {
  try {
    const doc = await documentService.getById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve PDF file
router.get('/:id/file', async (req, res) => {
  try {
    const doc = await documentService.getById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${doc.filename}"`);
    res.sendFile(doc.filePath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save document (generate PDF + store)
router.post('/', async (req, res) => {
  try {
    const { clientId, projectId, startDate, endDate, granularity } = req.body;

    if (!clientId || !projectId || !startDate || !endDate) {
      return res.status(400).json({ error: 'clientId, projectId, startDate, and endDate are required' });
    }

    const docDefinition = await buildTimesheetPdf(clientId, startDate, endDate, projectId);
    const printer = new PdfPrinter(fonts);
    const pdfDoc = await printer.createPdfKitDocument(docDefinition);

    // Collect PDF buffer
    const chunks = [];
    pdfDoc.on('data', (chunk) => chunks.push(chunk));
    await new Promise((resolve, reject) => {
      pdfDoc.on('end', resolve);
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });
    const pdfBuffer = Buffer.concat(chunks);

    const doc = await documentService.save(pdfBuffer, {
      clientId,
      projectId,
      periodStart: startDate,
      periodEnd: endDate,
      granularity: granularity || 'monthly',
    });

    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete document
router.delete('/:id', async (req, res) => {
  try {
    await documentService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
