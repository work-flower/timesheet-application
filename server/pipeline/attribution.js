/**
 * Attribution pre-hooks — stamp createdBy/updatedBy (acting identity) on every
 * insert/update. Audit only: these fields are NEVER used in filter evaluation.
 *
 * Registered as wildcard hooks from db/index.js. Only active when AUTH_ENABLED
 * (keeps legacy single-user mode byte-identical).
 */
import { hooks } from './hooks.js';
import { isAuthEnabled } from './authFlag.js';

function actor(context) {
  const auth = context.auth;
  if (auth?.system) return 'system';
  return auth?.user?.email || null;
}

hooks.register({
  collection: '*',
  operation: 'insert',
  phase: 'pre',
  fn: (context) => {
    if (!isAuthEnabled()) return;
    const who = actor(context);
    if (!who) return;
    const docs = Array.isArray(context.args[0]) ? context.args[0] : [context.args[0]];
    for (const doc of docs) {
      if (doc && typeof doc === 'object') {
        doc.createdBy = who;
        doc.updatedBy = who;
      }
    }
  },
});

hooks.register({
  collection: '*',
  operation: 'update',
  phase: 'pre',
  fn: (context) => {
    if (!isAuthEnabled()) return;
    const who = actor(context);
    if (!who) return;
    const modifier = context.args[1];
    if (!modifier || typeof modifier !== 'object') return;
    const hasOperators = Object.keys(modifier).some((k) => k.startsWith('$'));
    if (hasOperators) {
      // NeDB rejects mixed operator/plain updates — fold into $set
      modifier.$set = { ...(modifier.$set || {}), updatedBy: who };
    } else {
      // Whole-document replacement
      modifier.updatedBy = who;
    }
  },
});
