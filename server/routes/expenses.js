import { Router } from 'express';
import multer from 'multer';
import * as expenseService from '../services/expenseService.js';
import * as attachmentService from '../services/expenseAttachmentService.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// GET /types must come before /:id
router.get('/types', async (req, res) => {
  try {
    const types = await expenseService.getDistinctTypes();
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await expenseService.getAll(req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await expenseService.getById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Expense not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await expenseService.create(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const result = await expenseService.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Expense not found' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await expenseService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/link-transaction', async (req, res) => {
  try {
    const result = await expenseService.linkTransaction(req.params.id, req.body.transactionId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/unlink-transaction', async (req, res) => {
  try {
    const result = await expenseService.unlinkTransaction(req.params.id, req.body.transactionId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Attachment endpoints
router.post('/:id/attachments', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    const attachments = await attachmentService.saveAttachments(req.params.id, req.files);
    res.json(attachments);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/attachments/:filename', async (req, res) => {
  try {
    const attachments = await attachmentService.removeAttachment(req.params.id, req.params.filename);
    res.json(attachments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/attachments/:filename', (req, res) => {
  const filePath = attachmentService.getFilePath(req.params.id, req.params.filename);
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'File not found' });
    }
  });
});

router.get('/:id/attachments/:filename/thumbnail', (req, res) => {
  const thumbPath = attachmentService.getThumbnailPath(req.params.id, req.params.filename);
  res.sendFile(thumbPath, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'Thumbnail not found' });
    }
  });
});

export default router;
