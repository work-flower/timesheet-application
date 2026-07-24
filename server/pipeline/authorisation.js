/**
 * Authorisation enforcement — the data-layer choke point.
 *
 * Grants are resolved asynchronously per-request by the identity middleware
 * (server/pipeline/identity.js) and stamped into the ALS store as:
 *
 *   store.auth = {
 *     system: bool,      // background execution — full access
 *     superuser: bool,   // admin surface (Cloudflare-verified) — full access
 *     user: { id, email, status } | null,
 *     grants: {
 *       [table]: {
 *         read:   true | <filter>,   // filter = macro-resolved NeDB query
 *         create: true,
 *         update: true | <filter>,
 *         delete: true | <filter>,
 *         actions: Set<string>,
 *       }
 *     }
 *   }
 *
 * checkAccess is SYNCHRONOUS by design: the cursor path (find/findOne/count)
 * must return a chainable cursor, so nothing here may await. Record scoping
 * works by mutating context.args[0] — the same array reference the pipeline
 * spreads into the real datastore call.
 *
 * Default deny: a table (or action) absent from grants is inaccessible.
 */
import als from '../logging/asyncContext.js';
import nedbModel from '@seald-io/nedb/lib/model.js';
import { isAuthEnabled } from './authFlag.js';
import { ForbiddenError } from '../utils/errors.js';

const OP_PRIVILEGE = {
  find: 'read',
  findOne: 'read',
  count: 'read',
  insert: 'create',
  update: 'update',
  remove: 'delete',
};

export function checkAccess(context) {
  // Phase 0 — bypass: legacy mode, system execution, admin surface
  if (!isAuthEnabled()) return;
  const auth = context.auth;
  if (auth?.system || auth?.superuser) return;

  // Phase 1 — identity
  if (!auth || !auth.user) {
    throw new ForbiddenError('Not authenticated', 'unauthenticated');
  }
  if (auth.user.status === 'pending') {
    throw new ForbiddenError('Account pending activation', 'pending');
  }
  if (auth.user.status !== 'active') {
    throw new ForbiddenError('Account disabled', 'disabled');
  }

  // Phase 2 — collection privilege
  const privilege = OP_PRIVILEGE[context.operation];
  const grant = auth.grants?.[context.collection]?.[privilege];
  if (grant === undefined || grant === false) {
    throw new ForbiddenError(
      `No ${privilege} access to ${context.collection}`,
      'forbidden'
    );
  }

  // Phase 3 — record scoping: merge the role filter into the selector so
  // out-of-scope records behave as not-found (reads AND update/delete)
  if (grant !== true && privilege !== 'create') {
    context.args[0] = { $and: [grant, context.args[0] || {}] };
  }
}

/**
 * Post-image enforcement for writes — async, called from the pipeline's write
 * path (which awaits) after checkAccess has merged the filter into the selector.
 *
 * The merged selector already guarantees the pre-image is in scope. This check
 * closes the remaining hole: an update that modifies a record so it ESCAPES the
 * caller's scope (e.g. moving a timesheet to a project the filter excludes).
 * Every candidate the selector matches is modified in memory (nedbModel.modify)
 * and re-tested against the raw grant filter (nedbModel.match) — the exact
 * matcher NeDB itself uses, so semantics cannot drift.
 *
 * Upserts insert when nothing matches, so they additionally require the
 * table's create privilege; the insert branch of an upsert is not scope-checked
 * beyond that (documented limitation — create is a boolean privilege).
 */
export async function enforceWriteScope(context, rawDatastore) {
  if (!isAuthEnabled()) return;
  const auth = context.auth;
  if (auth?.system || auth?.superuser) return;
  if (context.operation !== 'update') return;

  const tableGrants = auth.grants?.[context.collection] || {};
  const updateGrant = tableGrants.update;
  const options = context.args[2] || {};

  if (options.upsert && tableGrants.create !== true) {
    throw new ForbiddenError(
      `Upsert on ${context.collection} requires create access`,
      'forbidden'
    );
  }
  if (updateGrant === true) return;

  const candidates = await rawDatastore.find(context.args[0]);
  for (const doc of candidates) {
    const newDoc = nedbModel.modify(doc, context.args[1]);
    if (!nedbModel.match(newDoc, updateGrant)) {
      throw new ForbiddenError(
        `Update would move a ${context.collection} record outside your permitted scope`,
        'scope_escape'
      );
    }
  }
}

/**
 * Express middleware gating named lifecycle actions (invoice confirm/post/...,
 * staged submit, import abandon, source refresh). Default deny: the action must
 * be explicitly granted by one of the caller's roles.
 */
export function requireAction(table, action) {
  return (req, res, next) => {
    if (!isAuthEnabled()) return next();
    const auth = als.getStore()?.auth;
    if (auth?.system || auth?.superuser) return next();
    if (auth?.grants?.[table]?.actions?.has(action)) return next();
    console.warn(`Action denied: ${table}.${action} for ${auth?.user?.email || 'unknown'}`);
    return res
      .status(403)
      .json({ error: `No permission for action ${table}.${action}`, code: 'forbidden' });
  };
}
