import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import {
  getConfig,
  updateConfig,
  testConnection,
  getDefaults,
} from '../services/aiConfigService.js';

const router = Router();

// GET /api/ai-config
router.get('/', async (req, res) => {
  try {
    const config = await getConfig();
    res.json(config);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// PUT /api/ai-config
router.put('/', async (req, res) => {
  try {
    const config = await updateConfig(req.body);
    res.json(config);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// POST /api/ai-config/test-connection
router.post('/test-connection', async (req, res) => {
  try {
    const result = await testConnection(req.body);
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// GET /api/ai-config/defaults
router.get('/defaults', (req, res) => {
  res.json(getDefaults());
});

export default router;
