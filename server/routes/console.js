import { Router } from 'express';
import { execute } from '../services/consoleService.js';
import { sandboxRoot, describe } from '../services/consoleSandbox.js';

const router = Router();

// POST /api/console/execute
router.post('/execute', async (req, res) => {
  try {
    const { command, cwd } = req.body;
    if (!command) {
      return res.status(400).json({ error: 'command is required' });
    }
    const result = await execute(command, cwd);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/console/info
router.get('/info', (req, res) => {
  res.json({ sandboxRoot });
});

// GET /api/console/welcome
router.get('/welcome', (req, res) => {
  res.json(describe());
});

export default router;
