import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import * as ticketService from '../services/ticketService.js';

const router = Router();

// GET /api/tickets
router.get('/', async (req, res) => {
  try {
    const result = await ticketService.getTickets(req.query);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// POST /api/tickets — bulk import canonical tickets
router.post('/', async (req, res) => {
  try {
    const result = await ticketService.bulkImport(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// GET /api/tickets/comments?date=YYYY-MM-DD — flattened comments across all tickets for a single date
router.get('/comments', async (req, res) => {
  try {
    const result = await ticketService.getCommentsByDate(req.query.date);
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
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
    respondError(res, err, 500);
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
    respondError(res, err, 400);
  }
});

export default router;
