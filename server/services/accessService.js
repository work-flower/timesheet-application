import { roles } from '../db/index.js';
import { runAsSystem } from '../pipeline/systemContext.js';
import { resolveMacros } from '../../shared/authz/macros.js';
import { decodePrivileges } from '../../shared/authz/filterCodec.js';
import { opValue } from '../../shared/authz/filterValidate.js';

/**
 * Resolve a user's effective grants from their roles — called once per request
 * by the identity middleware (immediate effect: no caching beyond the request).
 *
 * Union semantics across roles, per table and operation:
 *   read/update/delete — any `true` wins; otherwise filters OR together;
 *                        none granted = key absent = deny
 *   create             — OR of booleans
 *   actions            — set union
 *
 * Field-level security (fls) is the inverse — most-permissive INTERSECTION,
 * per operation: a field is excluded for an op only when EVERY role granting
 * that op on the table lists it. A granting role with no fls ⇒ empty
 * intersection ⇒ no exclusions. Stored op values may be plain (true|filter)
 * or the wrapper { access, fls } — normalised via opValue().
 *
 * Filters are macro-resolved here (identity + temporal), so the pipeline's
 * synchronous checkAccess receives ready-to-merge NeDB queries.
 */
function intersectFls(prev, fls) {
  if (prev === null) return new Set(fls);
  const next = new Set(fls);
  return new Set([...prev].filter((f) => next.has(f)));
}

export async function resolveGrants(user) {
  const roleDocs = await runAsSystem(() =>
    roles.find({ _id: { $in: user.roleIds || [] } })
  );

  const macroUser = { userId: user._id, email: user.email };
  const now = new Date();

  // Accumulate raw privilege values per table
  const acc = {};
  for (const role of roleDocs) {
    const privileges = decodePrivileges(role.privileges || {});
    for (const [table, priv] of Object.entries(privileges)) {
      const entry = (acc[table] ||= {
        read: [],
        update: [],
        delete: [],
        create: false,
        actions: new Set(),
        fls: { read: null, create: null, update: null },
      });
      for (const op of ['read', 'update', 'delete']) {
        const { access, fls } = opValue(priv[op]);
        if (access === undefined || access === false) continue;
        entry[op].push(access === true ? true : resolveMacros(access, macroUser, now));
        // fls intersects only across roles that GRANT the op (delete never carries fls)
        if (op !== 'delete') entry.fls[op] = intersectFls(entry.fls[op], fls);
      }
      const create = opValue(priv.create);
      if (create.access === true) {
        entry.create = true;
        entry.fls.create = intersectFls(entry.fls.create, create.fls);
      }
      for (const action of priv.actions || []) entry.actions.add(action);
    }
  }

  // Collapse accumulators into the grant shape checkAccess consumes
  const grants = {};
  for (const [table, entry] of Object.entries(acc)) {
    const grant = { actions: entry.actions };
    for (const op of ['read', 'update', 'delete']) {
      const values = entry[op];
      if (values.length === 0) continue;
      if (values.includes(true)) grant[op] = true;
      else grant[op] = values.length === 1 ? values[0] : { $or: values };
    }
    if (entry.create) grant.create = true;
    const fls = {};
    for (const op of ['read', 'create', 'update']) {
      if (entry.fls[op]?.size) fls[op] = entry.fls[op];
    }
    if (Object.keys(fls).length) grant.fls = fls;
    grants[table] = grant;
  }

  return grants;
}
