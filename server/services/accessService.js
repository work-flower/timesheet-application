import { roles } from '../db/index.js';
import { runAsSystem } from '../pipeline/systemContext.js';
import { resolveMacros } from '../../shared/authz/macros.js';
import { decodePrivileges } from '../../shared/authz/filterCodec.js';

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
 * Filters are macro-resolved here (identity + temporal), so the pipeline's
 * synchronous checkAccess receives ready-to-merge NeDB queries.
 */
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
      });
      for (const op of ['read', 'update', 'delete']) {
        const value = priv[op];
        if (value === undefined || value === false) continue;
        entry[op].push(value === true ? true : resolveMacros(value, macroUser, now));
      }
      if (priv.create === true) entry.create = true;
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
    grants[table] = grant;
  }

  return grants;
}
