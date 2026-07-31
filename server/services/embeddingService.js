import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

/**
 * Local text embeddings for routing RAG (Phase 2 "it routes").
 *
 * Uses @xenova/transformers (v2) with a small sentence-embedding model. v2 runs
 * onnxruntime-web (WASM) in Node, so it works on node:20-alpine (musl) with no
 * native binding and no Dockerfile change — @huggingface/transformers v3 only
 * ships a Node build bound to native onnxruntime-node (glibc-only, no musl
 * binary), so it cannot run on Alpine. The model (~23 MB) downloads from the HF
 * hub on first use and is cached under DATA_DIR/models on the host volume;
 * offline deploys pre-seed that directory. The pipeline is a lazy singleton —
 * nothing loads until the first embed() call, so importing this module is cheap.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function getDataDir() { return process.env.DATA_DIR || join(__dirname, '..', '..', 'data'); }
function getModelsDir() { return join(getDataDir(), 'models'); }

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIM = 384;

let extractorPromise = null;

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import('@xenova/transformers');
      const modelsDir = getModelsDir();
      mkdirSync(modelsDir, { recursive: true });
      // Cache downloaded weights on the host volume; always resolve from the hub
      // (cached) rather than a bundled local model directory. v2 runs the WASM
      // backend in Node by default — no device option needed.
      env.cacheDir = modelsDir;
      env.allowLocalModels = false;
      return pipeline('feature-extraction', MODEL_ID);
    })().catch((err) => {
      extractorPromise = null; // allow retry on transient download failure
      throw err;
    });
  }
  return extractorPromise;
}

/** Embed one or many strings → array of L2-normalized vectors (mean-pooled). */
export async function embed(texts) {
  const list = Array.isArray(texts) ? texts : [texts];
  if (list.length === 0) return [];
  const extractor = await getExtractor();
  const output = await extractor(list, { pooling: 'mean', normalize: true });
  return output.tolist();
}

/** Embed a single string → one vector. */
export async function embedOne(text) {
  const [vec] = await embed([text]);
  return vec;
}

/** Cosine similarity. Inputs are already L2-normalized, so this is a dot product. */
export function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/** Warm the model in the background (e.g. at boot) without blocking. */
export function warmUp() {
  return getExtractor().then(() => true).catch(() => false);
}
