import { Router } from 'express';
import * as calendarService from '../services/calendarService.js';

const router = Router();

// GET /api/calendar-sources
router.get('/', async (req, res) => {
  try {
    const result = await calendarService.getAll(req.query);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calendar-sources
router.post('/', async (req, res) => {
  try {
    const result = await calendarService.create(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.warn(err.message);
    res.status(400).json({ error: err.message });
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
    res.status(400).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calendar-sources/:id/refresh
router.post('/:id/refresh', async (req, res) => {
  try {
    const result = await calendarService.fetchAndCache(req.params.id);
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    res.status(400).json({ error: err.message });
  }
});

// POST /api/calendar-sources/refresh-all
router.post('/refresh-all', async (req, res) => {
  try {
    const results = await calendarService.fetchAll();
    res.json(results);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
