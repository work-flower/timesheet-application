import { Router } from 'express';
import {
  getConfig,
  updateConfig,
  testConnection,
  createBackup,
  listBackups,
  restoreFromBackup,
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
    res.status(400).json({ error: err.message });
  }
});

// POST /api/backup/test-connection
router.post('/test-connection', async (req, res) => {
  try {
    const result = await testConnection(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/backup/create
router.post('/create', async (req, res) => {
  try {
    const result = await createBackup();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backup/list
router.get('/list', async (req, res) => {
  try {
    const backups = await listBackups();
    res.json(backups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backup/restore
router.post('/restore', async (req, res) => {
  try {
    const { backupKey } = req.body;
    if (!backupKey) return res.status(400).json({ error: 'backupKey is required' });
    const result = await restoreFromBackup(backupKey);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/backup/:key(*) - wildcard to capture slashes in key
router.delete('/:key(*)', async (req, res) => {
  try {
    const result = await deleteBackup(req.params.key);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
