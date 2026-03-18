import { Router } from 'express';
import {
  getConfig,
  updateConfig,
  testConnection,
  startBackup,
  startRestore,
  getOperation,
  listBackups,
  deleteBackup,
} from '../services/backupService.js';
import { updateSchedule } from '../services/backupScheduler.js';

const router = Router();

// GET /api/backup/config
router.get('/config', async (req, res) => {
  try {
    const config = await getConfig();
    res.json(config);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/backup/config
router.put('/config', async (req, res) => {
  try {
    const config = await updateConfig(req.body);
    updateSchedule(req.body.schedule || 'off');
    res.json(config);
  } catch (err) {
    console.warn(err.message);
    res.status(400).json({ error: err.message });
  }
});

// POST /api/backup/test-connection
router.post('/test-connection', async (req, res) => {
  try {
    const result = await testConnection(req.body);
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    res.status(400).json({ error: err.message });
  }
});

// POST /api/backup/create — starts backup in background, returns operation ID
router.post('/create', (req, res) => {
  try {
    const result = startBackup();
    res.status(202).json(result);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backup/list
router.get('/list', async (req, res) => {
  try {
    const backups = await listBackups();
    res.json(backups);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backup/restore — starts restore in background, returns operation ID
router.post('/restore', (req, res) => {
  try {
    const { backupKey } = req.body;
    const result = startRestore(backupKey);
    res.status(202).json(result);
  } catch (err) {
    console.warn(err.message);
    res.status(400).json({ error: err.message });
  }
});

// GET /api/backup/operations/:id — poll operation status
router.get('/operations/:id', (req, res) => {
  const operation = getOperation(req.params.id);
  if (!operation) return res.status(404).json({ error: 'Operation not found' });
  res.json(operation);
});

// DELETE /api/backup/:key(*) - wildcard to capture slashes in key
router.delete('/:key(*)', async (req, res) => {
  try {
    const result = await deleteBackup(req.params.key);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
