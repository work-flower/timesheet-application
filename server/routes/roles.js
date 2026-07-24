import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import * as roleService from '../services/roleService.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await roleService.getAll(req.query);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await roleService.getById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Role not found' });
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await roleService.create(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const result = await roleService.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Role not found' });
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await roleService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

export default router;
