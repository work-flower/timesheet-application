import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import { requireAction } from '../pipeline/authorisation.js';
import { runAsSystem } from '../pipeline/systemContext.js';
import * as invoiceService from '../services/invoiceService.js';
import { buildInvoicePdf } from '../services/invoicePdfService.js';
import { createPrinter } from '../services/pdfRenderer.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await invoiceService.getAll(req.query);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await invoiceService.getById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Invoice not found' });
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await invoiceService.create(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const result = await invoiceService.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Invoice not found' });
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await invoiceService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// Lifecycle actions: requireAction gates by role; the caller's scoped getById
// proves visibility; the operation itself runs under system identity because it
// performs privileged cross-entity writes (locks on timesheets/expenses,
// invoice number seed) that individual table grants shouldn't have to cover.
router.post('/:id/confirm', requireAction('invoices', 'confirm'), async (req, res) => {
  try {
    const invoice = await invoiceService.getById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const result = await runAsSystem(() => invoiceService.confirm(req.params.id));
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.post('/:id/post', requireAction('invoices', 'post'), async (req, res) => {
  try {
    const invoice = await invoiceService.getById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const result = await runAsSystem(() => invoiceService.post(req.params.id));
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.post('/:id/unconfirm', requireAction('invoices', 'unconfirm'), async (req, res) => {
  try {
    const invoice = await invoiceService.getById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const result = await runAsSystem(() => invoiceService.unconfirm(req.params.id));
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.post('/:id/add-line', async (req, res) => {
  try {
    const result = await invoiceService.addLine(req.params.id, req.body.items);
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.post('/:id/recalculate', async (req, res) => {
  try {
    const result = await invoiceService.recalculate(req.params.id);
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.post('/:id/consistency-check', async (req, res) => {
  try {
    const conflicts = await invoiceService.consistencyCheck(req.params.id);
    res.json({ conflicts });
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.put('/:id/payment', requireAction('invoices', 'updatePayment'), async (req, res) => {
  try {
    const invoice = await invoiceService.getById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const result = await runAsSystem(() => invoiceService.updatePayment(req.params.id, req.body));
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.post('/:id/link-transaction', async (req, res) => {
  try {
    const result = await invoiceService.linkTransaction(req.params.id, req.body.transactionId);
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.post('/:id/unlink-transaction', async (req, res) => {
  try {
    const result = await invoiceService.unlinkTransaction(req.params.id, req.body.transactionId);
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
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
    console.error(err.message);
    respondError(res, err, 500);
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
    console.error(err.message);
    respondError(res, err, 500);
  }
});

export default router;
