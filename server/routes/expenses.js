import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import multer from 'multer';
import * as expenseService from '../services/expenseService.js';
import * as attachmentService from '../services/expenseAttachmentService.js';
import { parseReceipt } from '../services/expenseParserService.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// POST /parse-receipts must come before /:id
router.post('/parse-receipts', upload.any(), async (req, res) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    for (const file of files) {
      if (!file.mimetype.startsWith('image/') && file.mimetype !== 'application/pdf') {
        return res.status(400).json({ error: `Unsupported file type: ${file.originalname}. Please upload images or PDFs.` });
      }
    }
    const results = await Promise.all(
      files.map(async (file) => {
        try {
          const parsed = await parseReceipt(file.buffer, file.originalname, file.mimetype);
          return { filename: file.originalname, ...parsed };
        } catch (err) {
          return { filename: file.originalname, error: err.message };
        }
      })
    );
    res.json(results);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// GET /types must come before /:id
router.get('/types', async (req, res) => {
  try {
    const types = await expenseService.getDistinctTypes();
    res.json(types);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await expenseService.getAll(req.query);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await expenseService.getById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Expense not found' });
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await expenseService.create(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const result = await expenseService.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Expense not found' });
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await expenseService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

router.post('/:id/link-transaction', async (req, res) => {
  try {
    const result = await expenseService.linkTransaction(req.params.id, req.body.transactionId);
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.post('/:id/unlink-transaction', async (req, res) => {
  try {
    const result = await expenseService.unlinkTransaction(req.params.id, req.body.transactionId);
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
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
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.delete('/:id/attachments/:filename', async (req, res) => {
  try {
    const attachments = await attachmentService.removeAttachment(req.params.id, req.params.filename);
    res.json(attachments);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// File serving does a pipeline-scoped lookup first: an expense the caller's
// role filter excludes behaves as not-found, so its files are unreachable.
router.get('/:id/attachments/:filename', async (req, res) => {
  try {
    const expense = await expenseService.getById(req.params.id);
    if (!expense) return res.status(404).json({ error: 'File not found' });
  } catch (err) {
    console.warn(err.message);
    return respondError(res, err, 400);
  }
  const filePath = attachmentService.getFilePath(req.params.id, req.params.filename);
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'File not found' });
    }
  });
});

router.get('/:id/attachments/:filename/thumbnail', async (req, res) => {
  try {
    const expense = await expenseService.getById(req.params.id);
    if (!expense) return res.status(404).json({ error: 'Thumbnail not found' });
  } catch (err) {
    console.warn(err.message);
    return respondError(res, err, 400);
  }
  const thumbPath = attachmentService.getThumbnailPath(req.params.id, req.params.filename);
  res.sendFile(thumbPath, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'Thumbnail not found' });
    }
  });
});

export default router;
