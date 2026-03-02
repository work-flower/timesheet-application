import { Router } from 'express';
import als from '../logging/asyncContext.js';
import * as logService from '../services/logService.js';

const router = Router();

// GET /api/logs/config
router.get('/config', async (req, res) => {
  try {
    const config = await logService.getConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/logs/config
router.put('/config', async (req, res) => {
  try {
    const config = await logService.updateConfig(req.body);
    res.json(config);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/logs/test-connection
router.post('/test-connection', async (req, res) => {
  try {
    const result = await logService.testConnection(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/logs/files
router.get('/files', (req, res) => {
  try {
    const files = logService.listLocalFiles();
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/logs/files/:filename
router.get('/files/:filename', (req, res) => {
  try {
    const { level, source, keyword, skip, limit } = req.query;
    const result = logService.readLogFile(req.params.filename, {
      level: level || undefined,
      source: source || undefined,
      keyword: keyword || undefined,
      skip: skip ? parseInt(skip, 10) : 0,
      limit: limit ? parseInt(limit, 10) : 100,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/logs/search
router.get('/search', (req, res) => {
  try {
    const result = logService.searchLogs(req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/logs/pageview — client-side navigation tracking
router.post('/pageview', (req, res) => {
  const { path, method, traceId } = req.body;
  if (path) {
    const store = als.getStore();
    if (store) {
      const pathParts = path.split('/').filter(Boolean);
      store.source = pathParts[0] || 'dashboard';
      store.method = method || 'GET';
      store.path = path;
      if (traceId) store.traceId = traceId;
    }
    console.log(`PAGE ${path}`);
  }
  res.status(204).end();
});

// POST /api/logs/upload/:filename
router.post('/upload/:filename', async (req, res) => {
  try {
    const result = await logService.uploadToR2(req.params.filename);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/logs/files/:filename — safe delete with R2 backup check
router.delete('/files/:filename', async (req, res) => {
  try {
    const result = await logService.safeDeleteLocalFile(req.params.filename);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/logs/download/:filename — download from R2 to local
router.post('/download/:filename', async (req, res) => {
  try {
    const result = await logService.downloadFromR2(req.params.filename);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/logs/r2
router.get('/r2', async (req, res) => {
  try {
    const logs = await logService.listR2Logs();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
