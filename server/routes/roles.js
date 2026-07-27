import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import * as roleService from '../services/roleService.js';
import { collectionsByName } from '../db/index.js';
import { isKnownTable, PROTECTED_FIELDS } from '../../shared/authz/registry.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await roleService.getAll(req.query);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// GET /table-fields/:table — sampled field names for the Roles editor's fls
// pickers. Must come before GET /:id. Schemaless collections have no field
// registry, so field names are harvested from a record sample; the editor
// always allows custom values on top.
router.get('/table-fields/:table', async (req, res) => {
  try {
    const { table } = req.params;
    if (!isKnownTable(table)) {
      return res.status(400).json({ error: `Unknown table "${table}"` });
    }
    const docs = await collectionsByName[table].find({}).limit(200);
    const fields = new Set();
    for (const doc of docs) {
      for (const key of Object.keys(doc)) fields.add(key);
    }
    for (const protectedField of PROTECTED_FIELDS) fields.delete(protectedField);
    res.json([...fields].sort());
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await roleService.getById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Role not found' });
    res.json(result);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await roleService.create(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const result = await roleService.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Role not found' });
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await roleService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

export default router;
