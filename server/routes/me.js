import { Router } from 'express';
import als from '../logging/asyncContext.js';
import { isAuthEnabled } from '../pipeline/authFlag.js';
import { runAsSystem } from '../pipeline/systemContext.js';
import { respondError } from '../utils/errors.js';
import * as userService from '../services/userService.js';
import { resolveGrants } from '../services/accessService.js';

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

  const store = als.getStore() || {};
  res.json({
    enabled: true,
    email: auth.user.email,
    status: auth.user.status,
    tables,
    actions,
    ...(store.impersonating && {
      impersonating: { email: store.impersonating, by: auth.impersonatedBy },
    }),
  });
});

// POST /api/me/impersonate — start acting as another user.
// The identity middleware SKIPS the impersonation swap for these two endpoints,
// so they always run under the REAL caller's identity and grants (otherwise
// switching targets or stopping while impersonating a blocked user would 403).
router.post('/impersonate', async (req, res) => {
  try {
    if (!isAuthEnabled()) {
      return res.status(400).json({ error: 'Authorisation is disabled' });
    }
    const auth = als.getStore()?.auth;
    if (!auth?.grants?.users?.actions?.has('impersonate')) {
      return res
        .status(403)
        .json({ error: 'No permission for action users.impersonate', code: 'forbidden' });
    }
    const email = (req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'email is required' });
    if (email === auth.user.email) {
      return res.status(400).json({ error: 'Cannot impersonate yourself' });
    }
    const target = await runAsSystem(() => userService.findByEmail(email));
    if (!target) return res.status(404).json({ error: 'User not found' });
    const targetGrants = await resolveGrants(target);
    if (targetGrants.users?.actions?.has('impersonate')) {
      return res.status(403).json({
        error: 'Impersonation-capable users cannot be impersonated',
        code: 'forbidden',
      });
    }
    // Session cookie (no Max-Age) — dies with the browser; SameSite=Lax rides on
    // every same-origin request incl. <img>/iframe loads. Secure is set when the
    // request reached the edge over https (Cloudflare sets X-Forwarded-Proto), so
    // the tunnelled deployment gets Secure while local http dev still works.
    const secure = req.headers['x-forwarded-proto'] === 'https';
    res.cookie('impersonate', target.email, { httpOnly: true, sameSite: 'lax', path: '/', secure });
    console.log(`Impersonation started: ${auth.user.email} -> ${target.email}`);
    res.json({ impersonating: { email: target.email, by: auth.user.email } });
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// DELETE /api/me/impersonate — stop impersonating. No grant required: clearing
// your own cookie is harmless, and it must work while impersonating a blocked user.
router.delete('/impersonate', (req, res) => {
  res.clearCookie('impersonate', { path: '/' });
  console.log('Impersonation stopped');
  res.json({ success: true });
});

export default router;
