import { Router } from 'express';
import * as importJobService from '../services/importJobService.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await importJobService.getAll(req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await importJobService.getById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Import job not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await importJobService.create(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const result = await importJobService.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Import job not found' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await importJobService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/commit', async (req, res) => {
  try {
    const result = await importJobService.commit(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/abandon', async (req, res) => {
  try {
    const result = await importJobService.abandon(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
