import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import * as userService from '../services/userService.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await userService.getAll(req.query);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await userService.getById(req.params.id);
    if (!result) return res.status(404).json({ error: 'User not found' });
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// Pre-create a user ahead of their first visit (JIT-pending handles the usual path)
router.post('/', async (req, res) => {
  try {
    if (!req.body.email || !req.body.email.trim()) throw new Error('Email is required');
    const user = await userService.createPending(req.body.email.trim());
    const updated =
      req.body.status || req.body.roleIds
        ? await userService.update(user._id, { status: req.body.status, roleIds: req.body.roleIds })
        : await userService.getById(user._id);
    res.status(201).json(updated);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const result = await userService.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'User not found' });
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await userService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

export default router;
