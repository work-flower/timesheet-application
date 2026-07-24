import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import * as calendarService from '../services/calendarService.js';

const router = Router();

// GET /api/calendar-events?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    const result = await calendarService.getEvents(req.query);
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

export default router;
