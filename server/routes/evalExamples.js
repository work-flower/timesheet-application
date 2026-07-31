import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import * as evalService from '../services/evalService.js';

const router = Router();

// GET /admin/api/eval-examples
router.get('/', async (req, res) => {
  try {
    res.json(await evalService.getAll());
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// POST /admin/api/eval-examples/run — leave-one-out accuracy + confusion report.
// Declared before /:id so "run" isn't captured as an id.
router.post('/run', async (req, res) => {
  try {
    res.json(await evalService.runEvals());
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// POST /admin/api/eval-examples/route — probe: route an arbitrary utterance.
router.post('/route', async (req, res) => {
  try {
    res.json(await evalService.route(req.body?.utterance));
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// GET /admin/api/eval-examples/:id
router.get('/:id', async (req, res) => {
  try {
    const example = await evalService.getById(req.params.id);
    if (!example) return res.status(404).json({ error: 'Not found' });
    res.json(example);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// POST /admin/api/eval-examples
router.post('/', async (req, res) => {
  try {
    res.status(201).json(await evalService.create(req.body));
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// PUT /admin/api/eval-examples/:id
router.put('/:id', async (req, res) => {
  try {
    const example = await evalService.update(req.params.id, req.body);
    if (!example) return res.status(404).json({ error: 'Not found' });
    res.json(example);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// DELETE /admin/api/eval-examples/:id
router.delete('/:id', async (req, res) => {
  try {
    await evalService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

export default router;
