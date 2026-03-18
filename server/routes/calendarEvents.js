import { Router } from 'express';
import * as calendarService from '../services/calendarService.js';

const router = Router();

// GET /api/calendar-events?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    const result = await calendarService.getEvents(req.query);
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    res.status(400).json({ error: err.message });
  }
});

export default router;
