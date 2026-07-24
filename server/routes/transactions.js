import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import * as transactionService from '../services/transactionService.js';

const router = Router();

router.get('/\\$metadata', (req, res) => {
  res.json(transactionService.transactionSchema);
});

router.get('/accounts', async (req, res) => {
  try {
    const accounts = await transactionService.getDistinctAccounts();
    res.json(accounts);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await transactionService.getAll(req.query);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await transactionService.getById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Transaction not found' });
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await transactionService.create(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const result = await transactionService.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Transaction not found' });
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.put('/:id/mapping', async (req, res) => {
  try {
    const result = await transactionService.updateMapping(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Transaction not found' });
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await transactionService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

export default router;
