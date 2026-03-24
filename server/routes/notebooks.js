import { Router } from 'express';
import multer from 'multer';
import { join } from 'path';
import { mkdirSync } from 'fs';
import * as notebookService from '../services/notebookService.js';
import { buildNotebookPdf } from '../services/notebookPdfService.js';

const router = Router();

// Multer with memory storage for import (no notebook ID yet)
const importUpload = multer({ storage: multer.memoryStorage() });

// Multer setup for media uploads — resolves notebook folder via title
const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    try {
      const dir = await notebookService.getNotebookDir(req.params.id);
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, file, cb) => {
    // Preserve original filename but sanitize
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, safe);
  },
});
const upload = multer({ storage });

// --- Standard CRUD ---

router.get('/', async (req, res) => {
  try {
    const result = await notebookService.getAll(req.query);
    res.json(result);
  } catch (err) {
    console.error('Failed to list notebooks:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/tags', async (_req, res) => {
  try {
    const tags = await notebookService.getAllTags();
    res.json(tags);
  } catch (err) {
    console.error('Failed to get tags:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/import', importUpload.array('files'), async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required' });

    const result = await notebookService.importNotebook(
      content,
      req.files || [],
    );
    res.status(201).json(result);
  } catch (err) {
    console.warn('Failed to import notebook:', err);
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await notebookService.getById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    console.error('Failed to get notebook:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await notebookService.create(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.warn('Failed to create notebook:', err);
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const result = await notebookService.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    console.warn('Failed to update notebook:', err);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await notebookService.remove(req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    console.error('Failed to delete notebook:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Lifecycle ---

router.post('/:id/restore', async (req, res) => {
  try {
    const result = await notebookService.restore(req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    console.warn('Failed to restore notebook:', err);
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/archive', async (req, res) => {
  try {
    const result = await notebookService.archive(req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    console.warn('Failed to archive notebook:', err);
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/unarchive', async (req, res) => {
  try {
    const result = await notebookService.unarchive(req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    console.warn('Failed to unarchive notebook:', err);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/purge', async (req, res) => {
  try {
    const result = await notebookService.purge(req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    console.error('Failed to purge notebook:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Git Config ---

router.get('/git/config', async (_req, res) => {
  try {
    const config = notebookService.getGitConfig();
    res.json(config);
  } catch (err) {
    console.error('Failed to get git config:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/git/config', async (req, res) => {
  try {
    const config = notebookService.setGitConfig(req.body);
    res.json(config);
  } catch (err) {
    console.warn('Failed to set git config:', err);
    res.status(400).json({ error: err.message });
  }
});

router.post('/git/test-connection', async (_req, res) => {
  try {
    const result = notebookService.testGitConnection();
    res.json(result);
  } catch (err) {
    console.error('Failed to test git connection:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/git/branches', async (_req, res) => {
  try {
    const branches = notebookService.listGitBranches();
    res.json(branches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/git/has-remote', async (_req, res) => {
  try {
    res.json({ hasRemote: notebookService.hasGitRemote() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- History ---

router.get('/:id/history', async (req, res) => {
  try {
    const history = await notebookService.getHistory(req.params.id);
    if (history === null) return res.status(404).json({ error: 'Not found' });
    res.json(history);
  } catch (err) {
    console.error('Failed to get notebook history:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/history/:hash', async (req, res) => {
  try {
    const diff = await notebookService.getCommitDiff(req.params.hash, req.params.id);
    res.type('text/plain').send(diff);
  } catch (err) {
    console.error('Failed to get commit diff:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/compare/:from/:to', async (req, res) => {
  try {
    const diff = await notebookService.getCompareDiff(req.params.from, req.params.to, req.params.id);
    res.type('text/plain').send(diff);
  } catch (err) {
    console.error('Failed to get compare diff:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Push / Pull ---

router.post('/git/push/prepare', async (_req, res) => {
  try {
    const result = await notebookService.preparePush();
    res.json(result);
  } catch (err) {
    console.error('Failed to prepare push:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/git/push/execute', async (req, res) => {
  try {
    const { force } = req.body;
    const result = notebookService.executePush(force === true);
    res.json(result);
  } catch (err) {
    console.error('Failed to push:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/git/pull/prepare', async (_req, res) => {
  try {
    const result = await notebookService.preparePull();
    res.json(result);
  } catch (err) {
    console.error('Failed to prepare pull:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/git/pull/execute', async (req, res) => {
  try {
    const { force } = req.body;
    const result = await notebookService.executePull(force === true);
    res.json(result);
  } catch (err) {
    console.error('Failed to pull:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/git/operation', async (_req, res) => {
  try {
    const status = notebookService.getOperationStatus();
    res.json(status || { status: 'idle' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/git/operation/clear', async (_req, res) => {
  try {
    notebookService.clearOperation();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Publish & Discard ---

router.post('/:id/publish', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Commit message is required' });
    }
    const result = await notebookService.publish(req.params.id, message);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    console.warn('Failed to publish notebook:', err);
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/discard', async (req, res) => {
  try {
    const result = await notebookService.discard(req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    console.warn('Failed to discard changes:', err);
    res.status(400).json({ error: err.message });
  }
});

// --- PDF ---

router.get('/:id/pdf', async (req, res) => {
  try {
    const existing = await notebookService.getById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { buffer } = await buildNotebookPdf(req.params.id);

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename="${(existing.title || 'notebook').replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf"`);
    res.send(buffer);
  } catch (err) {
    console.error('Failed to generate notebook PDF:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Content ---

router.get('/:id/content', async (req, res) => {
  try {
    const content = await notebookService.getContent(req.params.id);
    if (content === null) return res.status(404).json({ error: 'Not found' });
    res.type('text/markdown').send(content);
  } catch (err) {
    console.error('Failed to get notebook content:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/content', async (req, res) => {
  try {
    // Accept raw text or JSON { content: "..." }
    const markdown = typeof req.body === 'string' ? req.body : (req.body.content || '');
    const result = await notebookService.updateContent(req.params.id, markdown);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    console.warn('Failed to update notebook content:', err);
    res.status(400).json({ error: err.message });
  }
});

// --- Media ---

router.post('/:id/media', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  } catch (err) {
    console.error('Failed to upload media:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/media', async (req, res) => {
  try {
    const files = await notebookService.listMedia(req.params.id);
    res.json(files);
  } catch (err) {
    console.error('Failed to list media:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Artifacts ---

router.get('/:id/artifacts', async (req, res) => {
  try {
    const artifacts = await notebookService.listArtifacts(req.params.id);
    res.json(artifacts);
  } catch (err) {
    console.error('Failed to list artifacts:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/artifacts', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    // Stage the folder in git
    await notebookService.stageArtifact(req.params.id);
    res.status(201).json({
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  } catch (err) {
    console.error('Failed to upload artifact:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/artifacts/:filename/content', async (req, res) => {
  try {
    const content = await notebookService.readArtifact(req.params.id, req.params.filename);
    res.type('text/plain').send(content);
  } catch (err) {
    console.warn('Failed to read artifact:', err);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/artifacts/:filename', async (req, res) => {
  try {
    const result = await notebookService.deleteArtifact(req.params.id, req.params.filename);
    res.json(result);
  } catch (err) {
    console.warn('Failed to delete artifact:', err);
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id/artifacts/:filename', async (req, res) => {
  try {
    const { newName } = req.body;
    if (!newName) return res.status(400).json({ error: 'newName is required' });
    const result = await notebookService.renameArtifact(req.params.id, req.params.filename, newName);
    res.json(result);
  } catch (err) {
    console.warn('Failed to rename artifact:', err);
    res.status(400).json({ error: err.message });
  }
});

export default router;
