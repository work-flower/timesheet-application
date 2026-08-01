import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import evalExamples from '../db/evalExamples.js';
import { agents } from '../db/index.js';
import { runAsSystem } from '../pipeline/systemContext.js';
import { embed, cosineSim } from './embeddingService.js';
import { getConfig as getRoutingConfig } from './routingConfigService.js';

/**
 * Routing service (Phase 2 "it routes").
 *
 * Semantic tier of the master's agent routing. Builds a flat-file vector index
 * over the routing corpus — currently the eval-set exemplars (P3 adds agent
 * card descriptions as more entries, source: 'card'). A brute-force cosine
 * search is ample at this corpus size (tens–hundreds of entries), so there is
 * no vector DB.
 *
 * findAgent(utterance) → ranked candidate agents with scores AND reasons (the
 * exemplars that matched) — the evidence the master weighs in P3. runEvals()
 * routes every example leave-one-out and reports accuracy + confusion, so
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

let memoryIndex = null; // { hash, builtAt, entries: [{ id, label, text, source, vector }] }

/** Stable hash of the routing corpus + embedding model — any change forces a rebuild. */
function corpusHash(items, model) {
  const material = items
    .map((i) => `${i.id}\u0001${i.label}\u0001${i.text}`)
    .sort()
    .join('\u0002');
  return createHash('sha256').update(`${model}\u0003${material}`).digest('hex');
}

/**
 * The routing corpus: eval exemplars + enabled agent card descriptions
 * (source 'card', label = slug; master excluded - it is the router, not a
 * destination). Cards are read under system identity: the index is GLOBAL and
 * derived; per-caller visibility applies to CANDIDATES (find_agent tool
 * handler), never baked into the index.
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
    text: e.utterance,
    source: 'eval',
  }));
  for (const card of cards) {
    if (!card.description) continue;
    items.push({ id: `card:${card.slug}`, label: card.slug, text: card.description, source: 'card' });
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

/** Aggregate scored entries into ranked candidate agents with reasons.
 *  aggregation 'max' (default) scores an agent by its best match; 'mean'
 *  averages its retrieved matches (rewards broad support, dilutes one-offs). */
function rank(scored, aggregation = 'max') {
  const byLabel = new Map();
  for (const s of scored) {
    const cur = byLabel.get(s.label);
    if (!cur) {
      byLabel.set(s.label, { agent: s.label, matches: [s] });
    } else {
      cur.matches.push(s);
    }
  }
  const candidates = [...byLabel.values()].map((c) => ({
    agent: c.agent,
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
 * Route an utterance to candidate agents.
 * @param {string} utterance
 * @param {{ excludeId?: string }} [opts] excludeId omits one exemplar (leave-one-out).
 * @returns {Promise<{ candidates: Array, top: object|null }>}
 */
export async function findAgent(utterance, opts = {}) {
  const config = await getRoutingConfig();
  const index = await getIndex(config);
  const pool = opts.excludeId ? index.entries.filter((e) => e.id !== opts.excludeId) : index.entries;
  if (!pool.length) return { candidates: [], top: null };

  const [queryVec] = await embed([utterance], config.embeddingModel);
  const scored = pool
    .map((e) => ({ label: e.label, text: e.text, source: e.source, similarity: cosineSim(queryVec, e.vector) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.max(1, config.topK));

  const candidates = rank(scored, config.aggregation);
  return { candidates, top: candidates[0] || null };
}

/** Index status for the admin Routing page. */
export async function getIndexStatus() {
  const config = await getRoutingConfig();
  const index = await getIndex(config);
  const counts = { eval: 0, card: 0 };
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

  const perAgent = {}; // agent → { total, correct }
  const confusion = {}; // expected → { predicted: count }
  const misroutes = [];
  let correct = 0;

  for (const ex of examples) {
    const { top } = await findAgent(ex.utterance, { excludeId: ex._id });
    const predicted = top ? top.agent : '(none)';
    const isCorrect = predicted === ex.expectedAgent;
    if (isCorrect) correct++;

    perAgent[ex.expectedAgent] = perAgent[ex.expectedAgent] || { total: 0, correct: 0 };
    perAgent[ex.expectedAgent].total++;
    if (isCorrect) perAgent[ex.expectedAgent].correct++;

    confusion[ex.expectedAgent] = confusion[ex.expectedAgent] || {};
    confusion[ex.expectedAgent][predicted] = (confusion[ex.expectedAgent][predicted] || 0) + 1;

    if (!isCorrect) {
      misroutes.push({
        utterance: ex.utterance,
        expected: ex.expectedAgent,
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
