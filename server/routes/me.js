import { Router } from 'express';
import als from '../logging/asyncContext.js';
import { isAuthEnabled } from '../pipeline/authFlag.js';

const router = Router();

// GET /api/me — current user + UI permission hints.
// Booleans only, never raw filters: a filter-typed privilege reports as
// `true` meaning "some access" (the pipeline decides which records).
// The identity middleware lets pending/disabled users through for this path
// only, so the frontend can render the awaiting-access page from one call.
router.get('/', (req, res) => {
  if (!isAuthEnabled()) return res.json({ enabled: false });

  const auth = als.getStore()?.auth;
  if (!auth?.user) {
    return res.status(403).json({ error: 'Not authenticated', code: 'unauthenticated' });
  }

  const tables = {};
  const actions = {};
  for (const [table, grant] of Object.entries(auth.grants || {})) {
    tables[table] = {
      read: grant.read !== undefined,
      create: grant.create === true,
      update: grant.update !== undefined,
      delete: grant.delete !== undefined,
    };
    if (grant.actions?.size) actions[table] = [...grant.actions];
  }

  res.json({
    enabled: true,
    email: auth.user.email,
    status: auth.user.status,
    tables,
    actions,
  });
});

export default router;
