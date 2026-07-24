import { roles, users } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';
import { validatePrivileges } from '../../shared/authz/filterValidate.js';
import { encodePrivileges, decodePrivileges } from '../../shared/authz/filterCodec.js';

function assertValidPrivileges(privileges) {
  const { ok, errors } = validatePrivileges(privileges || {});
  if (!ok) throw new Error(`Invalid privileges: ${errors.join('; ')}`);
}

export async function getAll(query = {}) {
  const { results, totalCount } = await buildQuery(roles, query, { name: 1 }, {});

  const enriched = results.map((role) => ({
    ...role,
    privileges: decodePrivileges(role.privileges || {}),
    userCount: (role.userIds || []).length,
  }));

  const items = applySelect(enriched, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
}

export async function getById(id) {
  const role = await roles.findOne({ _id: id });
  if (!role) return null;
  return { ...role, privileges: decodePrivileges(role.privileges || {}) };
}

export async function create(data) {
  if (!data.name || !data.name.trim()) throw new Error('Role name is required');
  assertValidPrivileges(data.privileges);

  const now = new Date().toISOString();
  const created = await roles.insert({
    name: data.name.trim(),
    description: data.description || '',
    // NeDB forbids $-prefixed / dotted keys in stored docs — filters are
    // stored escaped and decoded on every read (shared/authz/filterCodec.js)
    privileges: encodePrivileges(data.privileges || {}),
    userIds: [], // membership managed via userService.syncMembership only
    createdAt: now,
    updatedAt: now,
  });
  return { ...created, privileges: decodePrivileges(created.privileges || {}) };
}

export async function update(id, data) {
  const existing = await roles.findOne({ _id: id });
  if (!existing) return null;

  if (data.name !== undefined && !data.name.trim()) throw new Error('Role name is required');
  if (data.privileges !== undefined) assertValidPrivileges(data.privileges);

  const updateData = { updatedAt: new Date().toISOString() };
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.description !== undefined) updateData.description = data.description;
  if (data.privileges !== undefined) updateData.privileges = encodePrivileges(data.privileges);

  await roles.update({ _id: id }, { $set: updateData });
  return getById(id);
}

export async function remove(id) {
  const existing = await roles.findOne({ _id: id });
  if (!existing) return null;
  await users.update({ roleIds: id }, { $pull: { roleIds: id } }, { multi: true });
  return roles.remove({ _id: id });
}
