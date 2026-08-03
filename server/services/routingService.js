import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import evalExamples from '../db/evalExamples.js';
import { agents } from '../db/index.js';
import { tools as registryTools } from './agentToolRegistry.js';
import { runAsSystem } from '../pipeline/systemContext.js';
import { embed, cosineSim } from './embeddingService.js';
import { getConfig as getRoutingConfig } from './routingConfigService.js';

/**
 * Routing service (Phase 2 "it routes").
 *
 * Semantic tier of the master's routing. Builds a flat-file vector index over
 * the routing corpus — eval-set exemplars + agent card descriptions + app tool
 * descriptions. Every entry carries deterministic metadata:
 *   kind: 'agent' | 'tool' — what the entry routes TO. Only agent-kind
 *   candidates can take a turn over; tool-kind matches are evidence (and the
 *   find_tool lookup pool in discover delivery mode).
 * A brute-force cosine search is ample at this corpus size (tens–hundreds of
 * entries), so there is no vector DB.
 *
 * findAgent(utterance) → ranked mixed-kind candidates with scores AND reasons
 * (the entries that matched) — the evidence the master weighs. runEvals()
 * routes every example leave-one-out and reports accuracy + confusion
 * (kind-prefixed labels, e.g. agent:vat-help vs tool:create_timesheet), so
 * routing quality is measurable before it ever touches chat.
 *
 * The index caches in memory and persists to DATA_DIR/rag/routing-index.json,
 * keyed by a corpus hash: a mismatch (examples changed, even across a restart)
 * triggers a rebuild; eval mutations call invalidateIndex() to force one.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function getDataDir() { return process.env.DATA_DIR || join(__dirname, '..', '..', 'data'); }
function getRagDir() { return join(getDataDir(), 'rag'); }
function getIndexPath() { return join(getRagDir(), 'routing-index.json'); }

let memoryIndex = null; // { hash, builtAt, entries: [{ id, label, kind, text, source, vector }] }

/** Stable hash of the routing corpus + embedding model — any change forces a rebuild. */
function corpusHash(items, model) {
  const material = items
    .map((i) => `${i.id}\u0001${i.label}\u0001${i.kind}\u0001${i.text}`)
    .sort()
    .join('\u0002');
  return createHash('sha256').update(`${model}\u0003${material}`).digest('hex');
}

/**
 * The routing corpus: eval exemplars (kind from the example's targetKind) +
 * enabled agent card descriptions (kind 'agent', label = slug; master excluded
 * — it is the router, not a destination) + registry tool descriptions (kind
 * 'tool', label = tool name). Cards are read under system identity: the index
 * is GLOBAL and derived; per-caller visibility/grants apply to CANDIDATES
 * (filterCandidates in the chat service), never baked into the index.
 */
async function loadCorpus(config) {
  const [examples, cards] = await Promise.all([
    config.includeEvalExamples !== false ? evalExamples.find({}) : [],
    config.includeCardDescriptions !== false
      ? runAsSystem(() => agents.find({ enabled: { $ne: false }, isMaster: { $ne: true } }))
      : [],
  ]);
  const items = examples.map((e) => ({
    id: e._id,
    label: e.expectedAgent,
    kind: e.targetKind === 'tool' ? 'tool' : 'agent',
    text: e.utterance,
    source: 'eval',
  }));
  for (const card of cards) {
    if (!card.description) continue;
    items.push({ id: `card:${card.slug}`, label: card.slug, kind: 'agent', text: card.description, source: 'card' });
  }
  if (config.includeToolDescriptions !== false) {
    for (const tool of registryTools) {
      if (!tool.description) continue;
      items.push({ id: `tool:${tool.name}`, label: tool.name, kind: 'tool', text: tool.description, source: 'tool' });
    }
  }
  return items;
}

/** Mark the in-memory index stale; next getIndex() rebuilds. Cheap + sync. */
export function invalidateIndex() {
  memoryIndex = null;
}

async function buildIndex(items, hash, model) {
  const entries = [];
  if (items.length) {
    const vectors = await embed(items.map((i) => i.text), model);
    for (let i = 0; i < items.length; i++) {
      entries.push({ ...items[i], vector: vectors[i] });
    }
  }
  const index = { hash, model, builtAt: new Date().toISOString(), entries };
  mkdirSync(getRagDir(), { recursive: true });
  writeFileSync(getIndexPath(), JSON.stringify(index));
  memoryIndex = index;
  return index;
}

/** Get a fresh index (in-memory → flat file → rebuild), validated by corpus hash. */
async function getIndex(config) {
  const cfg = config || await getRoutingConfig();
  const items = await loadCorpus(cfg);
  const hash = corpusHash(items, cfg.embeddingModel);

  if (memoryIndex && memoryIndex.hash === hash) return memoryIndex;

  if (existsSync(getIndexPath())) {
    try {
      const onDisk = JSON.parse(readFileSync(getIndexPath(), 'utf-8'));
      if (onDisk.hash === hash) {
        memoryIndex = onDisk;
        return onDisk;
      }
    } catch { /* fall through to rebuild */ }
  }
  return buildIndex(items, hash, cfg.embeddingModel);
}

/** Aggregate scored entries into ranked mixed-kind candidates with reasons.
 *  Grouping key is kind:label so an agent slug and a tool name can never
 *  collide. aggregation 'max' (default) scores a candidate by its best match;
 *  'mean' averages its retrieved matches (rewards broad support, dilutes
 *  one-offs). Agent-kind candidates keep the legacy `agent` field (master
 *  prompt evidence + admin UI); tool-kind carry `tool` + `description`. */
function rank(scored, aggregation = 'max') {
  const byLabel = new Map();
  for (const s of scored) {
    const key = `${s.kind}:${s.label}`;
    const cur = byLabel.get(key);
    if (!cur) {
      byLabel.set(key, { kind: s.kind, target: s.label, matches: [s] });
    } else {
      cur.matches.push(s);
    }
  }
  const candidates = [...byLabel.values()].map((c) => ({
    kind: c.kind,
    target: c.target,
    ...(c.kind === 'tool'
      ? { tool: c.target, description: c.matches.find((m) => m.source === 'tool')?.text || null }
      : { agent: c.target }),
    score: aggregation === 'mean'
      ? c.matches.reduce((sum, m) => sum + m.similarity, 0) / c.matches.length
      : Math.max(...c.matches.map((m) => m.similarity)),
    reasons: c.matches
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3)
      .map((m) => ({ text: m.text, similarity: Number(m.similarity.toFixed(4)) })),
  }));
  candidates.sort((a, b) => b.score - a.score);
  return candidates.map((c) => ({ ...c, score: Number(c.score.toFixed(4)) }));
}

/**
 * Route an utterance to candidates (agents AND tools, kind-tagged).
 * @param {string} utterance
 * @param {{ excludeId?: string }} [opts] excludeId omits one exemplar (leave-one-out).
 * @returns {Promise<{ candidates: Array, top: object|null, topAgent: object|null }>}
 */
export async function findAgent(utterance, opts = {}) {
  const config = await getRoutingConfig();
  const index = await getIndex(config);
  const pool = opts.excludeId ? index.entries.filter((e) => e.id !== opts.excludeId) : index.entries;
  if (!pool.length) return { candidates: [], top: null, topAgent: null };

  const [queryVec] = await embed([utterance], config.embeddingModel);
  const scored = pool
    .map((e) => ({
      label: e.label,
      kind: e.kind || 'agent',
      text: e.text,
      source: e.source,
      similarity: cosineSim(queryVec, e.vector),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.max(1, config.topK));

  const candidates = rank(scored, config.aggregation);
  return {
    candidates,
    top: candidates[0] || null,
    topAgent: candidates.find((c) => c.kind === 'agent') || null,
  };
}

/**
 * Rank a card's granted tools against a query — the deterministic lookup
 * behind find_tool (discover delivery mode): DB-level filters first (kind
 * 'tool' ∧ name ∈ allowedNames — grants and privileges are applied by the
 * caller), cosine sort second. If the tool corpus is disabled
 * (includeToolDescriptions=false) the allowed tools are returned unranked so
 * discover mode never goes dark.
 */
export async function rankTools(utterance, allowedNames = []) {
  if (!allowedNames.length) return [];
  const config = await getRoutingConfig();
  const index = await getIndex(config);
  const allowed = new Set(allowedNames);
  const pool = index.entries.filter((e) => e.kind === 'tool' && e.source === 'tool' && allowed.has(e.label));

  if (!pool.length) {
    return allowedNames.map((name) => {
      const tool = registryTools.find((t) => t.name === name);
      return { name, description: tool?.description || '', score: null };
    });
  }

  const [queryVec] = await embed([utterance], config.embeddingModel);
  return pool
    .map((e) => ({ name: e.label, description: e.text, score: Number(cosineSim(queryVec, e.vector).toFixed(4)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, config.maxCandidates));
}

/** Index status for the admin Routing page. */
export async function getIndexStatus() {
  const config = await getRoutingConfig();
  const index = await getIndex(config);
  const counts = { eval: 0, card: 0, tool: 0 };
  for (const e of index.entries) counts[e.source] = (counts[e.source] || 0) + 1;
  return {
    builtAt: index.builtAt,
    model: index.model || config.embeddingModel,
    entries: index.entries.length,
    counts,
  };
}

/** Force a full rebuild (admin Rebuild button), bypassing the hash check. */
export async function rebuildIndex() {
  const config = await getRoutingConfig();
  const items = await loadCorpus(config);
  const hash = corpusHash(items, config.embeddingModel);
  memoryIndex = null;
  await buildIndex(items, hash, config.embeddingModel);
  return getIndexStatus();
}

/**
 * Leave-one-out evaluation over the eval-set only. Card-description entries
 * stay IN the pool (they are legitimate routing signal) — only the labeled
 * eval examples are scored, each with itself excluded from retrieval.
 * @returns {Promise<{ total, correct, accuracy, perAgent, confusion, misroutes }>}
 */
export async function runEvals() {
  const examples = await evalExamples.find({});
  await getIndex(); // ensure built once; findAgent reuses the cached index

  const perAgent = {}; // kind-prefixed target → { total, correct }
  const confusion = {}; // expected → { predicted: count } (kind-prefixed labels)
  const misroutes = [];
  let correct = 0;

  for (const ex of examples) {
    const { top } = await findAgent(ex.utterance, { excludeId: ex._id });
    // Labels are kind-prefixed (agent:vat-help / tool:create_timesheet) so a
    // tool-target example scored against an agent match reads as a misroute,
    // never an accidental name collision.
    const expected = `${ex.targetKind === 'tool' ? 'tool' : 'agent'}:${ex.expectedAgent}`;
    const predicted = top ? `${top.kind}:${top.target}` : '(none)';
    const isCorrect = predicted === expected;
    if (isCorrect) correct++;

    perAgent[expected] = perAgent[expected] || { total: 0, correct: 0 };
    perAgent[expected].total++;
    if (isCorrect) perAgent[expected].correct++;

    confusion[expected] = confusion[expected] || {};
    confusion[expected][predicted] = (confusion[expected][predicted] || 0) + 1;

    if (!isCorrect) {
      misroutes.push({
        utterance: ex.utterance,
        expected,
        predicted,
        score: top ? top.score : null,
      });
    }
  }

  const total = examples.length;
  return {
    total,
    correct,
    accuracy: total ? Number((correct / total).toFixed(4)) : null,
    perAgent: Object.fromEntries(
      Object.entries(perAgent).map(([a, s]) => [a, { ...s, accuracy: Number((s.correct / s.total).toFixed(4)) }]),
    ),
    confusion,
    misroutes,
  };
}
