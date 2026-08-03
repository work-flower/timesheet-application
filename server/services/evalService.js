import evalExamples from '../db/evalExamples.js';
import { invalidateIndex, runEvals as routingRunEvals } from './routingService.js';

/**
 * Routing eval-set — labeled `utterance → expected target` examples, where the
 * target is an agent slug OR a registry tool name (targetKind: 'agent'|'tool';
 * missing = 'agent' for pre-existing docs — no migration).
 *
 * Double duty (by design):
 *   1. Runtime routing signal — every example is an exemplar in the routing
 *      vector index (see routingService), kind-tagged from targetKind.
 *      Mutations invalidate that index.
 *   2. Evaluation harness — runEvals() routes each example leave-one-out and
 *      reports accuracy + a confusion table with kind-prefixed labels
 *      (agent:vat-help vs tool:create_timesheet), so routing quality is a
 *      measured number. Misroutes get curated back in as new examples.
 */

function validate(data) {
  if (!data.utterance || !String(data.utterance).trim()) throw new Error('Utterance is required');
  if (!data.expectedAgent || !String(data.expectedAgent).trim()) throw new Error('Expected target is required');
  if (data.targetKind != null && data.targetKind !== 'agent' && data.targetKind !== 'tool') {
    throw new Error('targetKind must be "agent" or "tool"');
  }
}

// Default targetKind on the way out — pre-existing docs have no field.
function withKind(doc) {
  return doc ? { ...doc, targetKind: doc.targetKind === 'tool' ? 'tool' : 'agent' } : doc;
}

export async function getAll() {
  const docs = await evalExamples.find({});
  docs.sort((a, b) => (a.expectedAgent || '').localeCompare(b.expectedAgent || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));
  return docs.map(withKind);
}

export async function getById(id) {
  return withKind(await evalExamples.findOne({ _id: id }));
}

export async function create(data) {
  validate(data);
  const now = new Date().toISOString();
  const doc = await evalExamples.insert({
    utterance: String(data.utterance).trim(),
    expectedAgent: String(data.expectedAgent).trim(),
    targetKind: data.targetKind === 'tool' ? 'tool' : 'agent',
    createdAt: now,
    updatedAt: now,
  });
  invalidateIndex();
  return withKind(doc);
}

export async function update(id, data) {
  const existing = await evalExamples.findOne({ _id: id });
  if (!existing) return null;
  validate({ ...existing, ...data });
  const updateData = { updatedAt: new Date().toISOString() };
  if (data.utterance != null) updateData.utterance = String(data.utterance).trim();
  if (data.expectedAgent != null) updateData.expectedAgent = String(data.expectedAgent).trim();
  if (data.targetKind != null) updateData.targetKind = data.targetKind === 'tool' ? 'tool' : 'agent';
  await evalExamples.update({ _id: id }, { $set: updateData });
  invalidateIndex();
  return withKind(await evalExamples.findOne({ _id: id }));
}

export async function remove(id) {
  const existing = await evalExamples.findOne({ _id: id });
  if (!existing) return null;
  const removed = await evalExamples.remove({ _id: id });
  invalidateIndex();
  return removed;
}

/** Run the full eval harness → { total, correct, accuracy, perAgent, confusion, misroutes }. */
export async function runEvals() {
  return routingRunEvals();
}
