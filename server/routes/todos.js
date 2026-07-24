import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import * as todoService from '../services/todoService.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await todoService.getAll(req.query);
    res.json(result);
  } catch (err) {
    respondError(res, err, 500);
  }
});

router.get('/incomplete', async (req, res) => {
  try {
    const result = await todoService.getIncomplete();
    res.json(result);
  } catch (err) {
    respondError(res, err, 500);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await todoService.getById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    respondError(res, err, 500);
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await todoService.create(req.body);
    res.status(201).json(result);
  } catch (err) {
    respondError(res, err, 400);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const result = await todoService.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    respondError(res, err, 400);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await todoService.getById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await todoService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    respondError(res, err, 500);
  }
});

export default router;
