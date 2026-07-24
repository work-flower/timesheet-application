import { users, roles } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';

const USER_STATUSES = ['pending', 'active', 'disabled'];

/**
 * Keep the bidirectional user↔role membership in sync — the single write path
 * for membership changes. Sets user.roleIds and adds/removes the user id on
 * every role's userIds array.
 */
export async function syncMembership(userId, roleIds) {
  const validRoles = await roles.find({ _id: { $in: roleIds } });
  const validIds = validRoles.map((r) => r._id);
  if (validIds.length !== roleIds.length) {
    const missing = roleIds.filter((id) => !validIds.includes(id));
    throw new Error(`Unknown role id(s): ${missing.join(', ')}`);
  }
  await users.update({ _id: userId }, { $set: { roleIds: validIds, updatedAt: new Date().toISOString() } });
  if (validIds.length > 0) {
    await roles.update(
      { _id: { $in: validIds } },
      { $addToSet: { userIds: userId } },
      { multi: true }
    );
  }
  await roles.update(
    { _id: { $nin: validIds }, userIds: userId },
    { $pull: { userIds: userId } },
    { multi: true }
  );
}

export async function getAll(query = {}) {
  const baseFilter = {};
  if (query.status) baseFilter.status = query.status;

  const { results, totalCount } = await buildQuery(users, query, { email: 1 }, baseFilter);

  const allRoles = await roles.find({});
  const roleMap = Object.fromEntries(allRoles.map((r) => [r._id, r]));

  const enriched = results.map((user) => ({
    ...user,
    roleNames: (user.roleIds || []).map((id) => roleMap[id]?.name || 'Unknown'),
  }));

  const items = applySelect(enriched, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
}

export async function getById(id) {
  const user = await users.findOne({ _id: id });
  if (!user) return null;
  const userRoles = await roles.find({ _id: { $in: user.roleIds || [] } });
  return {
    ...user,
    roleNames: userRoles.map((r) => r.name),
  };
}

export async function findByEmail(email) {
  return users.findOne({ email: email.toLowerCase() });
}

/**
 * JIT provisioning — first request from an unknown authenticated identity
 * creates a pending user with no roles. Unique email index guards the race
 * between concurrent first requests.
 */
export async function createPending(email) {
  const now = new Date().toISOString();
  try {
    return await users.insert({
      email: email.toLowerCase(),
      status: 'pending',
      roleIds: [],
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    const existing = await findByEmail(email);
    if (existing) return existing;
    throw err;
  }
}

export async function update(id, data) {
  const existing = await users.findOne({ _id: id });
  if (!existing) return null;

  if (data.status !== undefined && !USER_STATUSES.includes(data.status)) {
    throw new Error(`Invalid status "${data.status}" — must be one of ${USER_STATUSES.join(', ')}`);
  }

  const updateData = {};
  if (data.status !== undefined) updateData.status = data.status;
  if (Object.keys(updateData).length > 0) {
    updateData.updatedAt = new Date().toISOString();
    await users.update({ _id: id }, { $set: updateData });
  }

  if (data.roleIds !== undefined) {
    if (!Array.isArray(data.roleIds)) throw new Error('roleIds must be an array');
    await syncMembership(id, data.roleIds);
  }

  return getById(id);
}

export async function remove(id) {
  const existing = await users.findOne({ _id: id });
  if (!existing) return null;
  await roles.update({ userIds: id }, { $pull: { userIds: id } }, { multi: true });
  return users.remove({ _id: id });
}
