/**
 * Admin surface guard — verifies the Cloudflare Access JWT for /admin/api/*.
 *
 * The admin SPA is protected by a SEPARATE Cloudflare Access application whose
 * path scope (/admin) also covers /admin/api. Requests that pass its policy
 * carry a Cf-Access-Jwt-Assertion signed by Cloudflare with that application's
 * AUD. This middleware verifies signature (team JWKS) + audience + issuer and
 * stamps the caller as SUPERUSER (bypasses the role engine entirely) — admin
 * capability is delegated wholly to Cloudflare; no app-level admin role exists.
 *
 * Env (required when AUTH_ENABLED):
 *   CF_TEAM_DOMAIN — Cloudflare Zero Trust team name (the <team> in
 *                    https://<team>.cloudflareaccess.com)
 *   CF_ADMIN_AUD   — Application Audience (AUD) tag of the admin Access app
 *
 * Flag off → no-op (admin surface open for local development).
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import als from '../logging/asyncContext.js';
import { isAuthEnabled } from '../pipeline/authFlag.js';

let jwks = null;
let jwksTeam = null;

function getJwks(teamDomain) {
  if (!jwks || jwksTeam !== teamDomain) {
    jwks = createRemoteJWKSet(
      new URL(`https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`)
    );
    jwksTeam = teamDomain;
  }
  return jwks;
}

export async function adminSurfaceMiddleware(req, res, next) {
  if (!isAuthEnabled()) return next();

  const teamDomain = process.env.CF_TEAM_DOMAIN;
  const audience = process.env.CF_ADMIN_AUD;
  if (!teamDomain || !audience) {
    console.error('Admin surface misconfigured: CF_TEAM_DOMAIN / CF_ADMIN_AUD required when AUTH_ENABLED');
    return res.status(503).json({ error: 'Admin surface not configured' });
  }

  const token = req.headers['cf-access-jwt-assertion'];
  if (!token) {
    console.warn(`Admin surface request without Access token: ${req.method} ${req.path}`);
    return res.status(403).json({ error: 'Missing Cloudflare Access token', code: 'unauthenticated' });
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(teamDomain), {
      issuer: `https://${teamDomain}.cloudflareaccess.com`,
      audience,
    });
    const email = String(payload.email || payload.common_name || 'admin').toLowerCase();
    const store = als.getStore() || {};
    store.user = email;
    store.auth = { superuser: true, user: { email } };
    next();
  } catch (err) {
    console.warn(`Admin JWT verification failed: ${err.message}`);
    res.status(403).json({ error: 'Invalid Cloudflare Access token', code: 'forbidden' });
  }
}
