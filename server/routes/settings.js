import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import { settings, clients } from '../db/index.js';
import { runAsSystem } from '../pipeline/systemContext.js';

const router = Router();

const BUSINESS_LOCK_REASON = 'Business Client — managed via Settings';

router.get('/', async (req, res) => {
  try {
    const docs = await settings.find({});
    res.json(docs[0] || null);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
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

    // Business-client sync is a system-maintenance side effect: run under
    // system identity so (a) a caller's clients-table grants/field exclusions
    // can't strip or divert the sync, and (b) the copied values come from an
    // unmasked system read of settings, never from the caller-masked response.
    await runAsSystem(async () => {
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
        const fresh = await settings.findOne({ _id: result._id });
        const syncFields = {};
        if (fresh?.businessName) syncFields.companyName = fresh.businessName;
        if (fresh?.address) syncFields.invoicingEntityAddress = fresh.address;
        if (Object.keys(syncFields).length > 0) {
          await clients.update({ _id: newBusinessClientId }, { $set: syncFields });
        }
      }
    });

    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

export default router;
