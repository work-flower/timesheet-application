import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import { requireAction } from '../pipeline/authorisation.js';
import { runAsSystem } from '../pipeline/systemContext.js';
import * as stagedTransactionService from '../services/stagedTransactionService.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await stagedTransactionService.getAll(req.query);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await stagedTransactionService.getById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Staged transaction not found' });
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await stagedTransactionService.create(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const result = await stagedTransactionService.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Staged transaction not found' });
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.post('/submit', requireAction('stagedTransactions', 'submit'), async (req, res) => {
  try {
    const { importJobId, fieldMapping } = req.body;
    if (!importJobId) return res.status(400).json({ error: 'importJobId is required' });
    if (!fieldMapping) return res.status(400).json({ error: 'fieldMapping is required' });
    // Commits staged rows into locked transactions — privileged lifecycle execution
    const result = await runAsSystem(() => stagedTransactionService.submit(importJobId, fieldMapping));
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

router.post('/check-duplicates', async (req, res) => {
  try {
    const { importJobId } = req.body;
    if (!importJobId) return res.status(400).json({ error: 'importJobId is required' });
    const result = await stagedTransactionService.checkDuplicates(importJobId);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await stagedTransactionService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

export default router;
