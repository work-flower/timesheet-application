import als from '../logging/asyncContext.js';

/**
 * Run a function under the system identity — full pipeline access.
 *
 * Used by non-HTTP execution (schedulers, AI parsing jobs, backup, seed) and by
 * the engine's own reads of users/roles (which are themselves wrapped collections).
 * Preserves any existing ALS store fields (traceId, source, ...) so logging
 * correlation survives; only `auth` is replaced.
 */
export function runAsSystem(fn, extraStore = {}) {
  const current = als.getStore() || {};
  return als.run({ ...current, ...extraStore, auth: { system: true } }, fn);
}
