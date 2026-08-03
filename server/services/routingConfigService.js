import routingConfig from '../db/routingConfig.js';

/**
 * Routing engine configuration — single document, defaults matching the
 * previously hardcoded constants, so a fresh install behaves identically.
 * Read per-turn by the chat/routing/embedding services (tiny NeDB single-doc
 * read; changes take effect on the next turn, no restart).
 *
 * Basic (behaviour policy):
 *   autoRouteEnabled / autoRouteThreshold — ground-truth takeover tier (an
 *     utterance scoring ≥ threshold, i.e. present in the eval-set, routes
 *     straight to the specialist with no master round)
 *   evidenceEnabled / evidenceFloor — synthetic find_agent evidence attachment
 *   maxCandidates — candidates shown to the master (evidence + find_agent)
 *
 * Advanced (expert/beta knobs):
 *   topK — nearest corpus entries considered per query
 *   aggregation — per-agent score from matched entries: 'max' | 'mean'
 *   embeddingModel — HF model id (ONNX/Xenova export). Changing it downloads
 *     the new model on next use and rebuilds the index (model id is part of
 *     the index hash)
 *   includeCardDescriptions / includeEvalExamples / includeToolDescriptions —
 *     corpus source toggles (tool descriptions rank as kind:'tool' entries)
 *   maxToolIterations — agent tool-loop rounds before a forced final answer
 *   toolDelivery — how granted app-tool definitions reach an agent's context:
 *     'static' (default) injects all granted defs every round; 'discover' gives
 *     agents a find_tool meta-tool — a deterministic grant/privilege-filtered
 *     vector lookup that injects only the matched defs for the rest of the turn
 */

export const DEFAULTS = {
  autoRouteEnabled: true,
  autoRouteThreshold: 0.92,
  evidenceEnabled: true,
  evidenceFloor: 0.3,
  maxCandidates: 5,
  topK: 20,
  aggregation: 'max',
  embeddingModel: 'Xenova/all-MiniLM-L6-v2',
  includeCardDescriptions: true,
  includeEvalExamples: true,
  includeToolDescriptions: true,
  maxToolIterations: 4,
  toolDelivery: 'static',
};

const NUMERIC_FIELDS = ['autoRouteThreshold', 'evidenceFloor', 'maxCandidates', 'topK', 'maxToolIterations'];
const BOOLEAN_FIELDS = ['autoRouteEnabled', 'evidenceEnabled', 'includeCardDescriptions', 'includeEvalExamples', 'includeToolDescriptions'];

function normalise(data) {
  const out = {};
  for (const field of NUMERIC_FIELDS) {
    if (field in data) {
      const n = Number(data[field]);
      out[field] = Number.isFinite(n) ? n : DEFAULTS[field];
    }
  }
  for (const field of BOOLEAN_FIELDS) {
    if (field in data) out[field] = data[field] !== false && data[field] !== 'false';
  }
  if ('aggregation' in data) {
    out.aggregation = data.aggregation === 'mean' ? 'mean' : 'max';
  }
  if ('toolDelivery' in data) {
    out.toolDelivery = data.toolDelivery === 'discover' ? 'discover' : 'static';
  }
  if ('embeddingModel' in data) {
    const model = String(data.embeddingModel || '').trim();
    out.embeddingModel = model || DEFAULTS.embeddingModel;
  }
  return out;
}

/** Effective config: stored values over defaults. The read path for consumers. */
export async function getConfig() {
  const docs = await routingConfig.find({});
  return { ...DEFAULTS, ...(docs[0] || {}) };
}

export async function updateConfig(data) {
  const now = new Date().toISOString();
  const existing = await routingConfig.find({});
  const updateData = { ...normalise(data), updatedAt: now };

  if (existing.length > 0) {
    await routingConfig.update({ _id: existing[0]._id }, { $set: updateData });
  } else {
    await routingConfig.insert({ ...updateData, createdAt: now });
  }
  return getConfig();
}

export function getDefaults() {
  return { ...DEFAULTS };
}
