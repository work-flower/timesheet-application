/**
 * Identity middleware — resolves the Cloudflare-authenticated caller into an
 * app user with grants, per request. Runs inside the ALS scope (registered
 * after the ALS middleware) and stamps `store.auth` for the pipeline's
 * synchronous checkAccess.
 *
 * Authentication itself is fully offloaded to Cloudflare Access: interactive
 * users arrive with Cf-Access-Authenticated-User-Email; service-token callers
 * (MCP / M2M) carry only the Cf-Access-Jwt-Assertion, whose payload's
 * email/common_name is used as the identity string. The main-surface JWT is
 * NOT signature-verified — the tunnel is the trust boundary (the admin surface
 * does full verification). Only meaningful behind the tunnel; AUTH_ENABLED
 * should stay off elsewhere.
 *
 * Lifecycle: unknown identity → JIT-create pending user → 403 code:pending.
 * pending/disabled → 403 with code. active → grants resolved (per-request,
 * immediate effect) and stamped into ALS.
 */
import als from '../logging/asyncContext.js';
import { isAuthEnabled } from './authFlag.js';
import { runAsSystem } from './systemContext.js';
import * as userService from '../services/userService.js';
import { resolveGrants } from '../services/accessService.js';

const PUBLIC_PATHS = new Set(['/api/health']);

function extractIdentity(req) {
  const email = req.headers['cf-access-authenticated-user-email'];
  if (email) return email.toLowerCase();
  const jwt = req.headers['cf-access-jwt-assertion'];
  if (jwt) {
    try {
      const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
      const identity = payload.email || payload.common_name || null;
      return identity ? identity.toLowerCase() : null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function identityMiddleware(req, res, next) {
  if (!isAuthEnabled()) return next();

  const path = req.path;
  const guarded =
    path.startsWith('/api/') || path === '/mcp' || path.startsWith('/mcp/') || path.startsWith('/notebooks/');
  if (!guarded || PUBLIC_PATHS.has(path)) return next();

  try {
    const email = extractIdentity(req);
    if (!email) {
      console.warn(`Identity missing on ${req.method} ${path}`);
      return res.status(403).json({ error: 'Not authenticated', code: 'unauthenticated' });
    }

    let user = await runAsSystem(() => userService.findByEmail(email));
    if (!user) {
      user = await runAsSystem(() => userService.createPending(email));
      console.log(`Provisioned pending user ${email}`);
    }

    const store = als.getStore() || {};
    store.user = user.email; // log attribution

    if (user.status !== 'active') {
      store.auth = {
        user: { id: user._id, email: user.email, status: user.status },
        grants: {},
      };
      // /api/me must answer even for pending/disabled users so the frontend
      // can render the awaiting-access page from a single call
      if (path === '/api/me') return next();
      const code = user.status === 'pending' ? 'pending' : 'disabled';
      console.warn(`Access denied (${code}) for ${email} on ${req.method} ${path}`);
      return res.status(403).json({
        error: code === 'pending' ? 'Account pending activation' : 'Account disabled',
        code,
      });
    }

    const grants = await resolveGrants(user);
    store.auth = {
      user: { id: user._id, email: user.email, status: user.status },
      grants,
    };
    next();
  } catch (err) {
    console.error('Identity resolution failed:', err.message);
    res.status(500).json({ error: 'Identity resolution failed' });
  }
}
