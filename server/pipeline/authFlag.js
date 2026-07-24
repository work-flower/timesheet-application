/**
 * AUTH_ENABLED gate. Unset/false = legacy single-user behaviour (no identity,
 * no enforcement, no attribution) — byte-identical to pre-authorisation builds.
 * Read per-call so the flag is testable without module reloads.
 */
export function isAuthEnabled() {
  return process.env.AUTH_ENABLED === 'true';
}
