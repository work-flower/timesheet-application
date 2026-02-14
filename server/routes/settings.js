import { Router } from 'express';
import { settings, clients } from '../db/index.js';

const router = Router();

const BUSINESS_LOCK_REASON = 'Business Client — managed via Settings';

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

    const oldBusinessClientId = existing.length > 0 ? existing[0].businessClientId : null;
    const newBusinessClientId = updateData.businessClientId || null;

    let result;
    if (existing.length > 0) {
      delete updateData.createdAt;
      await settings.update({ _id: existing[0]._id }, { $set: updateData });
      result = await settings.findOne({ _id: existing[0]._id });
    } else {
      updateData.createdAt = now;
      result = await settings.insert(updateData);
    }

    // Sync business client
    if (oldBusinessClientId !== newBusinessClientId) {
      // Clear old business client
      if (oldBusinessClientId) {
        await clients.update({ _id: oldBusinessClientId }, {
          $unset: { isBusiness: true, isLocked: true, isLockedReason: true },
        });
      }
      // Set new business client
      if (newBusinessClientId) {
        await clients.update({ _id: newBusinessClientId }, {
          $set: { isBusiness: true, isLocked: true, isLockedReason: BUSINESS_LOCK_REASON },
        });
      }
    }

    // Sync companyName + invoicingEntityAddress from settings to business client
    if (newBusinessClientId) {
      const syncFields = {};
      if (result.businessName) syncFields.companyName = result.businessName;
      if (result.address) syncFields.invoicingEntityAddress = result.address;
      if (Object.keys(syncFields).length > 0) {
        await clients.update({ _id: newBusinessClientId }, { $set: syncFields });
      }
    }

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
