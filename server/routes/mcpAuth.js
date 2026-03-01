import { Router } from 'express';
import { getConfig, updateConfig } from '../services/mcpAuthService.js';

const router = Router();

// GET /api/mcp-auth
router.get('/', async (req, res) => {
  try {
    const config = await getConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/mcp-auth
router.put('/', async (req, res) => {
  try {
    const config = await updateConfig(req.body);
    res.json(config);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
