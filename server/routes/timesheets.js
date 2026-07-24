import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import * as timesheetService from '../services/timesheetService.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await timesheetService.getAll(req.query);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await timesheetService.getById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Timesheet entry not found' });
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await timesheetService.create(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const result = await timesheetService.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Timesheet entry not found' });
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await timesheetService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

export default router;
