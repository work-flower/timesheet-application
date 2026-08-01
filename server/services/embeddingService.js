import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

/**
 * Local text embeddings for routing RAG (Phase 2 "it routes").
 *
 * Uses @xenova/transformers (v2) with a small sentence-embedding model.
 * Backends differ by environment, deliberately:
 *   - macOS/glibc dev: transformers.js statically selects the NATIVE
 *     onnxruntime-node backend under Node (no supported WASM switch exists).
 *   - Alpine (musl) Docker image: the native glibc-linked binding cannot load
 *     (and gcompat segfaults at import), so the Dockerfile stubs the nested
 *     onnxruntime-node package onto pure-WASM onnxruntime-web and patches the
 *     backend chooser; numThreads=1 below keeps ort-web off Node-incompatible
 *     blob: workers.
 * The model (~23 MB) downloads from the HF hub on first use and is cached
 * under DATA_DIR/models on the host volume; offline deploys pre-seed that
 * directory. The pipeline is a lazy singleton — nothing loads until the first
 * embed() call, so importing this module is cheap.
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
      // In the Docker image the Dockerfile stubs onnxruntime-node onto the
      // pure-WASM onnxruntime-web backend; ort-web's multi-threaded WASM tries
      // to spawn blob: workers, which Node's worker_threads rejects — force
      // single-threaded. No-op on the native (macOS dev) backend.
      if (env?.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1;
      // Cache downloaded weights on the host volume; always resolve from the hub
      // (cached) rather than a bundled local model directory. Under Node the
      // native onnxruntime-node backend is selected automatically (see module
      // note re: Alpine/gcompat).
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
