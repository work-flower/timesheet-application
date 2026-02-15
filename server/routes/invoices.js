import { Router } from 'express';
import * as invoiceService from '../services/invoiceService.js';
import { buildInvoicePdf } from '../services/invoicePdfService.js';
import { createPrinter } from '../services/pdfRenderer.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await invoiceService.getAll(req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await invoiceService.getById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Invoice not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await invoiceService.create(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const result = await invoiceService.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Invoice not found' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await invoiceService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/confirm', async (req, res) => {
  try {
    const result = await invoiceService.confirm(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/post', async (req, res) => {
  try {
    const result = await invoiceService.post(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/unconfirm', async (req, res) => {
  try {
    const result = await invoiceService.unconfirm(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/recalculate', async (req, res) => {
  try {
    const result = await invoiceService.recalculate(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/consistency-check', async (req, res) => {
  try {
    const conflicts = await invoiceService.consistencyCheck(req.params.id);
    res.json({ conflicts });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id/payment', async (req, res) => {
  try {
    const result = await invoiceService.updatePayment(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/link-transaction', async (req, res) => {
  try {
    const result = await invoiceService.linkTransaction(req.params.id, req.body.transactionId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/unlink-transaction', async (req, res) => {
  try {
    const result = await invoiceService.unlinkTransaction(req.params.id, req.body.transactionId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/file', async (req, res) => {
  try {
    const invoice = await invoiceService.getById(req.params.id);
    if (!invoice?.pdfPath) return res.status(404).json({ error: 'No saved PDF for this invoice' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoice.invoiceNumber || 'invoice'}.pdf"`);
    res.sendFile(invoice.pdfPath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/pdf', async (req, res) => {
  try {
    const docDefinition = await buildInvoicePdf(req.params.id);
    const printer = createPrinter();
    const pdfDoc = await printer.createPdfKitDocument(docDefinition);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="invoice.pdf"');
    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
