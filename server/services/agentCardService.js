import { agents } from '../db/index.js';
import { runAsSystem } from '../pipeline/systemContext.js';
import { invalidateIndex } from './routingService.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync,
} from 'fs';

/**
 * Agent cards — file-led specialist definitions (Phase 3 "it delegates").
 *
 * A card IS its folder at DATA_DIR/agents/{slug}/ — fully portable, zero
 * secrets. The wrapped `agents` collection is a REBUILDABLE INDEX over those
 * folders (scan on boot + after every admin save + explicit Rescan), used for
 * caller-scoped visibility ("whatever agent the user can see, they can talk
 * to") and list views. Never treat the DB doc as the source of truth.
 *
 * Folder contents:
 *   manifest.json          — { name, description, aiProviderId|null, enabled }
 *   agent.md               — the agent's persona/system prompt (provider-agnostic)
 *   payload_template.json  — OPTIONAL override of the provider's payload template
 *                            (resolution: card template ?? provider template)
 *   knowledge/             — RAG sources (consumption arrives with RAG Providers)
 *   skills/                — on-demand instruction files (future)
 *
 * The reserved `master` card fronts every conversation; it is guaranteed at
 * boot (ensureMasterCard) and cannot be deleted or disabled.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function getDataDir() { return process.env.DATA_DIR || join(__dirname, '..', '..', 'data'); }
function getAgentsDir() { return join(getDataDir(), 'agents'); }

export const MASTER_SLUG = 'master';

// Slug doubles as folder name and @mention handle — strict charset keeps it
// path-safe (no traversal) and mention-parseable.
const VALID_SLUG = /^[a-z0-9][a-z0-9-]{1,48}$/;

export function assertValidSlug(slug) {
  if (typeof slug !== 'string' || !VALID_SLUG.test(slug)) {
    throw new Error('Invalid agent slug — use 2-49 chars of a-z, 0-9 and hyphens, starting alphanumeric');
  }
  return slug;
}

function getCardDir(slug) { return join(getAgentsDir(), assertValidSlug(slug)); }
function getManifestPath(slug) { return join(getCardDir(slug), 'manifest.json'); }
function getAgentMdPath(slug) { return join(getCardDir(slug), 'agent.md'); }
function getPayloadTemplatePath(slug) { return join(getCardDir(slug), 'payload_template.json'); }

const DEFAULT_MASTER_AGENT_MD = `You are the master assistant for a UK contractor timesheet and invoicing application. You front every conversation.

You have two tools:
- find_agent: given the user's request, returns candidate specialist agents with similarity scores and the matched examples (evidence). Call it when a request looks like it belongs to a specialist.
- ask_agent: delegate a task to a specialist agent by slug with a clear, self-contained brief. The specialist has no access to this conversation — include everything it needs in the brief.

How to work:
1. For general questions you can answer yourself, just answer — do not route.
2. When a request may belong to a specialist, call find_agent. If the top candidate is a clear winner, call ask_agent with a well-formed brief and relay its answer in your own words.
3. If candidates are close or unclear, ask the user which they meant rather than guessing.
4. If no specialist fits, answer yourself and say plainly when you lack the data to do so.

Be concise and professional. Never invent data about timesheets, expenses or invoices.`;

// -- File primitives ---------------------------------------------------------

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

/** Read one card folder → full card object (null if folder/manifest invalid). */
export function readCard(slug) {
  const dir = getCardDir(slug);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;
  const manifest = readJson(getManifestPath(slug));
  if (!manifest || !manifest.name) return null;
  const agentMd = existsSync(getAgentMdPath(slug)) ? readFileSync(getAgentMdPath(slug), 'utf-8') : '';
  const payloadTemplate = readJson(getPayloadTemplatePath(slug)); // null = inherit provider template
  return {
    slug,
    name: manifest.name,
    description: manifest.description || '',
    aiProviderId: manifest.aiProviderId || null,
    enabled: slug === MASTER_SLUG ? true : manifest.enabled !== false,
    isMaster: slug === MASTER_SLUG,
    agentMd,
    payloadTemplate,
    hasPayloadTemplate: payloadTemplate != null,
  };
}

function listFilenames(slug, sub) {
  const dir = join(getCardDir(slug), sub);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => !f.startsWith('.'));
}

/** Folder file listing for the designer (read-only in v1). */
export function readCardFiles(slug) {
  return { knowledge: listFilenames(slug, 'knowledge'), skills: listFilenames(slug, 'skills') };
}

function writeCardFiles(slug, { name, description, aiProviderId, enabled, agentMd, payloadTemplate }) {
  const dir = getCardDir(slug);
  mkdirSync(join(dir, 'knowledge'), { recursive: true });
  mkdirSync(join(dir, 'skills'), { recursive: true });
  const manifest = {
    name,
    description: description || '',
    aiProviderId: aiProviderId || null,
    enabled: enabled !== false,
  };
  writeFileSync(getManifestPath(slug), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(getAgentMdPath(slug), agentMd || '');
  // Copy-on-write: the file exists ONLY when the card deliberately overrides
  // the provider template. null/undefined = inherit → remove any stale file.
  if (payloadTemplate != null) {
    writeFileSync(getPayloadTemplatePath(slug), JSON.stringify(payloadTemplate, null, 2) + '\n');
  } else if (existsSync(getPayloadTemplatePath(slug))) {
    rmSync(getPayloadTemplatePath(slug));
  }
}

// -- Index (scan) ------------------------------------------------------------

/** Rebuild the wrapped `agents` index from the folders. System identity: the
 *  index is global; caller scoping applies on reads, not on maintenance. */
export async function scanAgents() {
  return runAsSystem(async () => {
    const dir = getAgentsDir();
    mkdirSync(dir, { recursive: true });
    const slugs = readdirSync(dir).filter((f) => {
      try {
        return !f.startsWith('.') && VALID_SLUG.test(f) && statSync(join(dir, f)).isDirectory();
      } catch {
        return false;
      }
    });

    const now = new Date().toISOString();
    const seen = [];
    for (const slug of slugs) {
      const card = readCard(slug);
      if (!card) continue; // folder without a valid manifest — skip, not index
      seen.push(slug);
      const doc = {
        slug,
        name: card.name,
        description: card.description,
        aiProviderId: card.aiProviderId,
        enabled: card.enabled,
        isMaster: card.isMaster,
        hasPayloadTemplate: card.hasPayloadTemplate,
        updatedAt: now,
      };
      const existing = await agents.findOne({ slug });
      if (existing) await agents.update({ slug }, { $set: doc });
      else await agents.insert({ ...doc, createdAt: now });
    }
    // Drop index docs whose folders vanished
    await agents.remove({ slug: { $nin: seen } }, { multi: true });
    invalidateIndex(); // card descriptions are part of the routing corpus
    return { indexed: seen.length };
  }, { source: 'agent_scan' });
}

/** Guarantee the reserved master card exists (boot). */
export async function ensureMasterCard() {
  if (!existsSync(getManifestPath(MASTER_SLUG))) {
    writeCardFiles(MASTER_SLUG, {
      name: 'Master',
      description: 'Fronts every conversation; routes to specialists via find_agent and delegates via ask_agent.',
      aiProviderId: null,
      enabled: true,
      agentMd: DEFAULT_MASTER_AGENT_MD,
      payloadTemplate: null,
    });
  }
}

// -- Admin CRUD (writes files, then reindexes) --------------------------------

function validateInput(data, { isCreate }) {
  if (isCreate) assertValidSlug(data.slug);
  if (!data.name || !String(data.name).trim()) throw new Error('Name is required');
  if (data.payloadTemplate && typeof data.payloadTemplate === 'string') {
    try {
      JSON.parse(data.payloadTemplate);
    } catch {
      throw new Error('payload_template is not valid JSON');
    }
  }
}

function normaliseTemplate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') return JSON.parse(value);
  return value;
}

export async function getAllCards() {
  // Caller-scoped list via the wrapped index (visibility = talkability).
  const docs = await agents.find({});
  docs.sort((a, b) => (b.isMaster ? 1 : 0) - (a.isMaster ? 1 : 0) || (a.name || '').localeCompare(b.name || ''));
  return docs;
}

export async function getCardDetail(slug) {
  // Existence/visibility via the wrapped index first; file read only after.
  const indexed = await agents.findOne({ slug: assertValidSlug(slug) });
  if (!indexed) return null;
  const card = readCard(slug);
  if (!card) return null;
  return { ...indexed, ...card, files: readCardFiles(slug) };
}

export async function createCard(data) {
  validateInput(data, { isCreate: true });
  const slug = data.slug;
  if (slug === MASTER_SLUG) throw new Error('"master" is reserved');
  if (existsSync(getCardDir(slug))) throw new Error(`Agent "${slug}" already exists`);
  writeCardFiles(slug, {
    name: String(data.name).trim(),
    description: data.description || '',
    aiProviderId: data.aiProviderId || null,
    enabled: data.enabled !== false,
    agentMd: data.agentMd || '',
    payloadTemplate: normaliseTemplate(data.payloadTemplate),
  });
  await scanAgents();
  return getCardDetail(slug);
}

export async function updateCard(slug, data) {
  const existing = readCard(assertValidSlug(slug));
  if (!existing) return null;
  validateInput({ ...existing, ...data }, { isCreate: false });
  const isMaster = slug === MASTER_SLUG;
  writeCardFiles(slug, {
    name: data.name != null ? String(data.name).trim() : existing.name,
    description: data.description != null ? data.description : existing.description,
    aiProviderId: 'aiProviderId' in data ? (data.aiProviderId || null) : existing.aiProviderId,
    enabled: isMaster ? true : (data.enabled != null ? data.enabled : existing.enabled),
    agentMd: data.agentMd != null ? data.agentMd : existing.agentMd,
    payloadTemplate: 'payloadTemplate' in data
      ? normaliseTemplate(data.payloadTemplate)
      : existing.payloadTemplate,
  });
  await scanAgents();
  return getCardDetail(slug);
}

export async function removeCard(slug) {
  assertValidSlug(slug);
  if (slug === MASTER_SLUG) throw new Error('The master agent cannot be deleted');
  const dir = getCardDir(slug);
  if (!existsSync(dir)) return null;
  rmSync(dir, { recursive: true, force: true });
  await scanAgents();
  return true;
}
