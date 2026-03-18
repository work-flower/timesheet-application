import { Router } from 'express';
import * as ticketService from '../services/ticketService.js';

const router = Router();

// GET /api/tickets
router.get('/', async (req, res) => {
  try {
    const result = await ticketService.getTickets(req.query);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
