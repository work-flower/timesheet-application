import evalExamples from '../db/evalExamples.js';
import { invalidateIndex, findAgent, runEvals as routingRunEvals } from './routingService.js';

/**
 * Routing eval-set — labeled `utterance → expectedAgent` examples.
 *
 * Double duty (by design):
 *   1. Runtime routing signal — every example is an exemplar in the routing
 *      vector index (see routingService). Mutations invalidate that index.
 *   2. Evaluation harness — runEvals() routes each example leave-one-out and
 *      reports accuracy + a per-agent confusion table, so routing quality is a
 *      measured number. Misroutes get curated back in as new examples.
 *
 * `expectedAgent` is a free-text agent slug. Agent cards don't exist until P3,
 * so these slugs are the labels routing aims at; when cards land, their
 * descriptions join the same index (routingService).
 */

function validate(data) {
  if (!data.utterance || !String(data.utterance).trim()) throw new Error('Utterance is required');
  if (!data.expectedAgent || !String(data.expectedAgent).trim()) throw new Error('Expected agent is required');
}

export async function getAll() {
  const docs = await evalExamples.find({});
  docs.sort((a, b) => (a.expectedAgent || '').localeCompare(b.expectedAgent || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));
  return docs;
}

export async function getById(id) {
  return evalExamples.findOne({ _id: id });
}

export async function create(data) {
  validate(data);
  const now = new Date().toISOString();
  const doc = await evalExamples.insert({
    utterance: String(data.utterance).trim(),
    expectedAgent: String(data.expectedAgent).trim(),
    createdAt: now,
    updatedAt: now,
  });
  invalidateIndex();
  return doc;
}

export async function update(id, data) {
  const existing = await evalExamples.findOne({ _id: id });
  if (!existing) return null;
  validate({ ...existing, ...data });
  const updateData = { updatedAt: new Date().toISOString() };
  if (data.utterance != null) updateData.utterance = String(data.utterance).trim();
  if (data.expectedAgent != null) updateData.expectedAgent = String(data.expectedAgent).trim();
  await evalExamples.update({ _id: id }, { $set: updateData });
  invalidateIndex();
  return evalExamples.findOne({ _id: id });
}

export async function remove(id) {
  const existing = await evalExamples.findOne({ _id: id });
  if (!existing) return null;
  const removed = await evalExamples.remove({ _id: id });
  invalidateIndex();
  return removed;
}

/** Probe: route an arbitrary utterance and return ranked candidates + reasons. */
export async function route(utterance) {
  if (!utterance || !String(utterance).trim()) throw new Error('Utterance is required');
  return findAgent(String(utterance).trim());
}

/** Run the full eval harness → { total, correct, accuracy, perAgent, confusion, misroutes }. */
export async function runEvals() {
  return routingRunEvals();
}
