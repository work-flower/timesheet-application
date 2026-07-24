import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import { getConfig, updateConfig } from '../services/mcpAuthService.js';

const router = Router();

// GET /api/mcp-auth
router.get('/', async (req, res) => {
  try {
    const config = await getConfig();
    res.json(config);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// PUT /api/mcp-auth
router.put('/', async (req, res) => {
  try {
    const config = await updateConfig(req.body);
    res.json(config);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

export default router;
