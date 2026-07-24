import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import { requireAction } from '../pipeline/authorisation.js';
import { runAsSystem } from '../pipeline/systemContext.js';
import * as calendarService from '../services/calendarService.js';

const router = Router();

// GET /api/calendar-sources
router.get('/', async (req, res) => {
  try {
    const result = await calendarService.getAll(req.query);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// GET /api/calendar-sources/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await calendarService.getById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Calendar source not found' });
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// POST /api/calendar-sources
router.post('/', async (req, res) => {
  try {
    const result = await calendarService.create(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// PUT /api/calendar-sources/:id
router.put('/:id', async (req, res) => {
  try {
    const result = await calendarService.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Calendar source not found' });
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// DELETE /api/calendar-sources/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await calendarService.remove(req.params.id);
    if (!result) return res.status(404).json({ error: 'Calendar source not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// POST /api/calendar-sources/:id/refresh
router.post('/:id/refresh', requireAction('calendarSources', 'refresh'), async (req, res) => {
  try {
    const result = await runAsSystem(() => calendarService.fetchAndCache(req.params.id));
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// POST /api/calendar-sources/refresh-all
router.post('/refresh-all', requireAction('calendarSources', 'refresh'), async (req, res) => {
  try {
    const results = await runAsSystem(() => calendarService.fetchAll());
    res.json(results);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

export default router;
