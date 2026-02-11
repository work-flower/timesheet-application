import { Router } from 'express';
import { settings } from '../db/index.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const docs = await settings.find({});
    res.json(docs[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const now = new Date().toISOString();
    const existing = await settings.find({});
    const updateData = { ...req.body, updatedAt: now };
    delete updateData._id;

    if (existing.length > 0) {
      delete updateData.createdAt;
      await settings.update({ _id: existing[0]._id }, { $set: updateData });
      const updated = await settings.findOne({ _id: existing[0]._id });
      res.json(updated);
    } else {
      updateData.createdAt = now;
      const created = await settings.insert(updateData);
      res.json(created);
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
