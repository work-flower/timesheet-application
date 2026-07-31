import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import * as providerService from '../services/aiProviderService.js';

const router = Router();

// GET /admin/api/ai-providers
router.get('/', async (req, res) => {
  try {
    res.json(await providerService.getAll());
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// GET /admin/api/ai-providers/:id
router.get('/:id', async (req, res) => {
  try {
    const provider = await providerService.getById(req.params.id);
    if (!provider) return res.status(404).json({ error: 'Not found' });
    res.json(provider);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// POST /admin/api/ai-providers
router.post('/', async (req, res) => {
  try {
    res.status(201).json(await providerService.create(req.body));
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// PUT /admin/api/ai-providers/:id
router.put('/:id', async (req, res) => {
  try {
    const provider = await providerService.update(req.params.id, req.body);
    if (!provider) return res.status(404).json({ error: 'Not found' });
    res.json(provider);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// DELETE /admin/api/ai-providers/:id
router.delete('/:id', async (req, res) => {
  try {
    await providerService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// POST /admin/api/ai-providers/:id/test-connection
router.post('/:id/test-connection', async (req, res) => {
  try {
    res.json(await providerService.testConnection(req.params.id, req.body));
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

export default router;
