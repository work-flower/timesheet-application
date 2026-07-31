import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import evalExamples from '../db/evalExamples.js';
import { embed, cosineSim } from './embeddingService.js';

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

const TOP_K = 20; // nearest exemplars considered per query

let memoryIndex = null; // { hash, builtAt, entries: [{ id, label, text, source, vector }] }

/** Stable hash of the routing corpus — any change forces a rebuild. */
function corpusHash(examples) {
  const material = examples
    .map((e) => `${e._id}${e.utterance}${e.expectedAgent}`)
    .sort()
    .join('');
  return createHash('sha256').update(material).digest('hex');
}

async function loadCorpus() {
  // Current corpus = eval exemplars. P3: concat agent card descriptions here.
  return evalExamples.find({});
}

/** Mark the in-memory index stale; next getIndex() rebuilds. Cheap + sync. */
export function invalidateIndex() {
  memoryIndex = null;
}

async function buildIndex(examples, hash) {
  const entries = [];
  if (examples.length) {
    const vectors = await embed(examples.map((e) => e.utterance));
    for (let i = 0; i < examples.length; i++) {
      entries.push({
        id: examples[i]._id,
        label: examples[i].expectedAgent,
        text: examples[i].utterance,
        source: 'eval',
        vector: vectors[i],
      });
    }
  }
  const index = { hash, builtAt: new Date().toISOString(), entries };
  mkdirSync(getRagDir(), { recursive: true });
  writeFileSync(getIndexPath(), JSON.stringify(index));
  memoryIndex = index;
  return index;
}

/** Get a fresh index (in-memory → flat file → rebuild), validated by corpus hash. */
async function getIndex() {
  const examples = await loadCorpus();
  const hash = corpusHash(examples);

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
  return buildIndex(examples, hash);
}

/** Aggregate scored entries into ranked candidate agents with reasons. */
function rank(scored) {
  const byLabel = new Map();
  for (const s of scored) {
    const cur = byLabel.get(s.label);
    if (!cur) {
      byLabel.set(s.label, { agent: s.label, score: s.similarity, matches: [s] });
    } else {
      cur.score = Math.max(cur.score, s.similarity);
      cur.matches.push(s);
    }
  }
  const candidates = [...byLabel.values()].map((c) => ({
    agent: c.agent,
    score: c.score,
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
  const index = await getIndex();
  const pool = opts.excludeId ? index.entries.filter((e) => e.id !== opts.excludeId) : index.entries;
  if (!pool.length) return { candidates: [], top: null };

  const [queryVec] = await embed([utterance]);
  const scored = pool
    .map((e) => ({ label: e.label, text: e.text, source: e.source, similarity: cosineSim(queryVec, e.vector) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, TOP_K);

  const candidates = rank(scored);
  return { candidates, top: candidates[0] || null };
}

/**
 * Leave-one-out evaluation over the whole eval-set.
 * @returns {Promise<{ total, correct, accuracy, perAgent, confusion, misroutes }>}
 */
export async function runEvals() {
  const examples = await loadCorpus();
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
