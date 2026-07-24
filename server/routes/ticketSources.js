import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import { requireAction } from '../pipeline/authorisation.js';
import { runAsSystem } from '../pipeline/systemContext.js';
import * as ticketService from '../services/ticketService.js';

const router = Router();

// GET /api/ticket-sources
router.get('/', async (req, res) => {
  try {
    const result = await ticketService.getAll(req.query);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// GET /api/ticket-sources/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await ticketService.getById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Ticket source not found' });
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// POST /api/ticket-sources
router.post('/', async (req, res) => {
  try {
    const result = await ticketService.create(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// PUT /api/ticket-sources/:id
router.put('/:id', async (req, res) => {
  try {
    const result = await ticketService.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Ticket source not found' });
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// DELETE /api/ticket-sources/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await ticketService.remove(req.params.id);
    if (!result) return res.status(404).json({ error: 'Ticket source not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// POST /api/ticket-sources/:id/refresh
router.post('/:id/refresh', requireAction('ticketSources', 'refresh'), async (req, res) => {
  try {
    const result = await runAsSystem(() => ticketService.fetchAndCache(req.params.id));
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// POST /api/ticket-sources/refresh-all
router.post('/refresh-all', requireAction('ticketSources', 'refresh'), async (req, res) => {
  try {
    const results = await runAsSystem(() => ticketService.fetchAll());
    res.json(results);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// POST /api/ticket-sources/:id/test
router.post('/:id/test', async (req, res) => {
  try {
    const result = await ticketService.testConnection(req.params.id);
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

export default router;
