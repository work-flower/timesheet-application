import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import * as agentToolService from '../services/agentToolService.js';

const router = Router();

// GET /admin/api/agent-tools
router.get('/', async (req, res) => {
  try {
    res.json(await agentToolService.getAll());
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// GET /admin/api/agent-tools/handlers — code-side handler list for the mapping
// dropdown. Declared before /:id so "handlers" isn't captured as an id.
router.get('/handlers', (req, res) => {
  try {
    res.json(agentToolService.listHandlers());
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// GET /admin/api/agent-tools/:id
router.get('/:id', async (req, res) => {
  try {
    const def = await agentToolService.getById(req.params.id);
    if (!def) return res.status(404).json({ error: 'Not found' });
    res.json(def);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// POST /admin/api/agent-tools
router.post('/', async (req, res) => {
  try {
    res.status(201).json(await agentToolService.create(req.body));
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// PUT /admin/api/agent-tools/:id
router.put('/:id', async (req, res) => {
  try {
    const def = await agentToolService.update(req.params.id, req.body);
    if (!def) return res.status(404).json({ error: 'Not found' });
    res.json(def);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// DELETE /admin/api/agent-tools/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await agentToolService.remove(req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

export default router;
