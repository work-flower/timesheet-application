import { Router } from 'express';
import {
  getConfig,
  updateConfig,
  testConnection,
} from '../services/aiConfigService.js';

const router = Router();

// GET /api/ai-config
router.get('/', async (req, res) => {
  try {
    const config = await getConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/ai-config
router.put('/', async (req, res) => {
  try {
    const config = await updateConfig(req.body);
    res.json(config);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/ai-config/test-connection
router.post('/test-connection', async (req, res) => {
  try {
    const result = await testConnection(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
