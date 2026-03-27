import { todos } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';

export async function getAll(query = {}) {
  const baseFilter = {};

  if (query.status) baseFilter.status = query.status;
  if (query.createdInPlanId) baseFilter.createdInPlanId = query.createdInPlanId;

  const { results, totalCount } = await buildQuery(
    todos, query, { createdAt: -1 }, baseFilter
  );

  const items = applySelect(results, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
}

export async function getById(id) {
  return todos.findOne({ _id: id });
}

export async function create(data) {
  if (!data.text || !data.text.trim()) throw new Error('Todo text is required');

  const now = new Date().toISOString();
  return todos.insert({
    text: data.text.trim(),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    createdInPlanId: data.createdInPlanId || null,
    completedAt: null,
    completedInPlanId: null,
  });
}

export async function update(id, data) {
  const existing = await todos.findOne({ _id: id });
  if (!existing) return null;

  const now = new Date().toISOString();
  const updateData = { updatedAt: now };

  if (data.text !== undefined) updateData.text = data.text.trim();

  // Handle status transitions
  if (data.status !== undefined && data.status !== existing.status) {
    updateData.status = data.status;
    if (data.status === 'done') {
      updateData.completedAt = now;
      updateData.completedInPlanId = data.completedInPlanId || null;
    } else if (data.status === 'pending') {
      // Re-opening a completed todo
      updateData.completedAt = null;
      updateData.completedInPlanId = null;
    }
  }

  await todos.update({ _id: id }, { $set: updateData });
  return todos.findOne({ _id: id });
}

export async function remove(id) {
  const existing = await todos.findOne({ _id: id });
  if (!existing) return null;
  return todos.remove({ _id: id });
}

/**
 * Get all incomplete todos — used by daily plan wrap-up to carry forward.
 */
export async function getIncomplete() {
  return todos.find({ status: 'pending' });
}

/**
 * Get todos by an array of IDs — used by daily plan form to display its todos.
 */
export async function getByIds(ids) {
  if (!ids || ids.length === 0) return [];
  return todos.find({ _id: { $in: ids } });
}
