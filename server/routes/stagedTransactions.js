import { Router } from 'express';
import * as stagedTransactionService from '../services/stagedTransactionService.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await stagedTransactionService.getAll(req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await stagedTransactionService.getById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Staged transaction not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await stagedTransactionService.create(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const result = await stagedTransactionService.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Staged transaction not found' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/submit', async (req, res) => {
  try {
    const { importJobId, fieldMapping } = req.body;
    if (!importJobId) return res.status(400).json({ error: 'importJobId is required' });
    if (!fieldMapping) return res.status(400).json({ error: 'fieldMapping is required' });
    const result = await stagedTransactionService.submit(importJobId, fieldMapping);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/check-duplicates', async (req, res) => {
  try {
    const { importJobId } = req.body;
    if (!importJobId) return res.status(400).json({ error: 'importJobId is required' });
    const result = await stagedTransactionService.checkDuplicates(importJobId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await stagedTransactionService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
