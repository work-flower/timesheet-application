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

// POST /api/tickets — bulk import canonical tickets
router.post('/', async (req, res) => {
  try {
    const result = await ticketService.bulkImport(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.warn(err.message);
    res.status(400).json({ error: err.message });
  }
});

// GET /api/tickets/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await ticketService.getTicketById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Ticket not found' });
    res.json(result);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tickets/:id — update extension data only
router.patch('/:id', async (req, res) => {
  try {
    const result = await ticketService.patchTicket(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Ticket not found' });
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    res.status(400).json({ error: err.message });
  }
});

export default router;
