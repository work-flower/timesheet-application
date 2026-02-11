import { Router } from 'express';
import * as timesheetService from '../services/timesheetService.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await timesheetService.getAll(req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await timesheetService.getById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Timesheet entry not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await timesheetService.create(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const result = await timesheetService.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Timesheet entry not found' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await timesheetService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
