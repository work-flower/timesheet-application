import { agents } from '../db/index.js';
import { runAsSystem } from '../pipeline/systemContext.js';
import { invalidateIndex } from './routingService.js';
import { getById as getProviderById } from './aiProviderService.js';
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
 *   manifest.json          — { name, description, aiProviderId|null, enabled,
 *                              tools: [registry tool names granted to this card],
 *                              verifyClaim: { enabled, maxIterations,
 *                                similarityCheck, similarityThreshold,
 *                                aiProviderId|null } }   (non-master only)
 *   agent.md               — the agent's persona/system prompt (provider-agnostic)
 *   verifier.md            — OPTIONAL per-card verifier instructions (the
 *                            verify/claim rubric; blank = DEFAULT_VERIFIER_MD)
 *   payload_template.json  — OPTIONAL override of the provider's payload template
 *                            (resolution: card template ?? provider template)
 *   knowledge/             — RAG sources (consumption arrives with RAG Providers)
 *   skills/                — on-demand instruction files (future)
 *
 * The reserved `master` card fronts every conversation; it is guaranteed at
 * boot (ensureMasterCard), cannot be deleted or disabled, and never carries a
 * verifyClaim block (the master is the relay, not a verified source).
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
function getVerifierMdPath(slug) { return join(getCardDir(slug), 'verifier.md'); }

// Verify/claim per-card config (manifest.verifyClaim). maxIterations = number
// of REVISE rounds (0 = shadow mode: verify once, log, deliver unchanged).
export const VERIFY_CLAIM_DEFAULTS = Object.freeze({
  enabled: false,
  maxIterations: 2,
  similarityCheck: true,
  similarityThreshold: 0.98,
  aiProviderId: null,
});
const VERIFY_MAX_ITERATIONS_CAP = 5;

// Rubric used when a card's verifier.md is blank. The admin tab prefills the
// editor with it so experts edit from a working baseline.
export const DEFAULT_VERIFIER_MD = `You are a verifier. Another agent has answered a request; your only job is to check that answer (the CLAIM) against the CONTEXT that agent had — nothing else. You are not answering the request yourself and you have no tools except report_claims.

What you receive:
- The responding agent's instructions — rules that agent was meant to follow. Check compliance with them (kind "instruction"); do not adopt them as your own.
- The context available to the agent — everything it had: the request, prior conversation, and the results of any tools it called. This is the ONLY admissible evidence. Your own knowledge of the world is NOT evidence.
- Your previous findings in this review (on later rounds) — check whether they were addressed; do not move the goalposts with unrelated new objections.
- The claim to verify — the agent's answer.

How to verify:
1. Decompose the claim into atomic statements. A statement is an assertion of fact (a number, date, name, status, rule), a computed value, or something the agent says it did or proposed. Pleasantries, questions to the user, offers of further help, and explicit hedges ("I don't have data on…") are NOT claims — leave them out.
2. Grade each statement against the context ONLY:
   - supported — it is directly traceable to the context, or it is a correct computation over context values.
   - unsupported — nothing in the context backs it (the agent asserted something it never looked up or was never told).
   - contradicted — the context says otherwise (a different figure, date, status, or name).
3. Recompute every arithmetic result (totals, VAT, days from hours, rate × days) from the context values; a wrong result is contradicted.
4. For actions: "I created/updated X" is supported only if a tool result in the context confirms it; "I proposed X — please confirm the card" is supported by a pending-proposal marker in the context.
5. Quote the deciding context passage (or your recomputation) as evidence for every non-supported row; keep evidence short for supported rows.

Be strict about facts and figures and lenient about wording. Report ONLY via the report_claims tool — never reply in prose.`;

const DEFAULT_MASTER_AGENT_MD = `You are the master assistant for a UK contractor timesheet and invoicing application. You front every conversation, delegate to specialist agents, and use the app tools granted to you.

You always have two built-in tools:
- find_agent: returns candidate specialists AND app tools with similarity scores and the matched examples (evidence). Routing evidence for the user's latest message is usually ALREADY attached to the conversation as a find_agent result — weigh it before answering; only call find_agent yourself for a different or refined query.
- ask_agent: delegate a task to a specialist agent by slug with a clear, self-contained brief. The specialist has no access to this conversation — include everything it needs in the brief.

When the user addresses a specialist directly with @slug, that specialist has ALREADY been consulted for you: its answer is attached to the conversation as an ask_agent result before your turn. Relay a consulted specialist's answer faithfully — keep its figures, dates and caveats exactly; do not editorialise or "improve" numbers. If a specialist's answer ends with a [Verification: …] marker, the listed statements could NOT be confirmed against the specialist's own data: do not present them as fact — tell the user which points are unconfirmed.

You may also hold granted app tools:
- READ tools (list_projects, list_recent_timesheets, ...) run immediately and return real data — always prefer them over answering from memory.
- WRITE tools (create_timesheet, create_expense, ...) NEVER execute when you call them: the user is shown a confirmation card instead. After proposing, tell the user to confirm or decline the card, and never claim the write happened until the conversation shows it was confirmed and executed.

How to work:
1. Check the attached routing evidence first. Candidates are kind "agent" (a specialist — delegate via ask_agent) or kind "tool" (the request looks like a direct action — use that tool if you hold it). If the top candidate clearly fits, act on it; prefer delegating or using tools over answering from general knowledge.
2. If candidates are close or ambiguous, ask the user which they meant rather than guessing.
3. If no specialist or tool fits, answer yourself and say plainly when you lack the data to do so.
4. Small talk and questions about this app's usage need no routing.

Be concise and professional. Never invent data about timesheets, expenses or invoices — read it with a tool, or delegate.`;

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
  const isMaster = slug === MASTER_SLUG;
  const verifierMd = !isMaster && existsSync(getVerifierMdPath(slug)) ? readFileSync(getVerifierMdPath(slug), 'utf-8') : '';
  return {
    slug,
    name: manifest.name,
    description: manifest.description || '',
    aiProviderId: manifest.aiProviderId || null,
    enabled: isMaster ? true : manifest.enabled !== false,
    isMaster,
    // Granted app-tool names. Stale names (tool retired from the registry) are
    // kept here and skipped at loop assembly — the tool may come back.
    tools: normaliseTools(manifest.tools),
    agentMd,
    payloadTemplate,
    hasPayloadTemplate: payloadTemplate != null,
    // Verify/claim: the master is never verified (it relays).
    verifyClaim: isMaster ? { ...VERIFY_CLAIM_DEFAULTS } : normaliseVerifyClaim(manifest.verifyClaim),
    verifierMd,
    hasVerifierMd: verifierMd.trim().length > 0,
  };
}

function normaliseTools(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim()))];
}

/** Lenient read-side coercion of manifest.verifyClaim (hand-edited folders). */
function normaliseVerifyClaim(value) {
  const v = value && typeof value === 'object' ? value : {};
  const iterations = Number(v.maxIterations);
  const threshold = Number(v.similarityThreshold);
  return {
    enabled: v.enabled === true || v.enabled === 'true',
    maxIterations: Number.isInteger(iterations)
      ? Math.max(0, Math.min(VERIFY_MAX_ITERATIONS_CAP, iterations))
      : VERIFY_CLAIM_DEFAULTS.maxIterations,
    similarityCheck: v.similarityCheck !== false && v.similarityCheck !== 'false',
    similarityThreshold: Number.isFinite(threshold)
      ? Math.max(0, Math.min(1, threshold))
      : VERIFY_CLAIM_DEFAULTS.similarityThreshold,
    aiProviderId: v.aiProviderId || null,
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

function writeCardFiles(slug, {
  name, description, aiProviderId, enabled, tools, agentMd, payloadTemplate, verifyClaim, verifierMd,
}) {
  const dir = getCardDir(slug);
  const isMaster = slug === MASTER_SLUG;
  mkdirSync(join(dir, 'knowledge'), { recursive: true });
  mkdirSync(join(dir, 'skills'), { recursive: true });
  const manifest = {
    name,
    description: description || '',
    aiProviderId: aiProviderId || null,
    enabled: enabled !== false,
    tools: normaliseTools(tools),
    // The master never carries the block — it is the relay, not a source.
    ...(isMaster ? {} : { verifyClaim: normaliseVerifyClaim(verifyClaim) }),
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
  // Same copy-on-write for the verifier rubric: blank = built-in default.
  const rubric = !isMaster && typeof verifierMd === 'string' ? verifierMd : '';
  if (rubric.trim()) {
    writeFileSync(getVerifierMdPath(slug), rubric);
  } else if (existsSync(getVerifierMdPath(slug))) {
    rmSync(getVerifierMdPath(slug));
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
        tools: card.tools,
        hasPayloadTemplate: card.hasPayloadTemplate,
        verifyEnabled: card.verifyClaim.enabled,
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

async function validateInput(data, { isCreate }) {
  if (isCreate) assertValidSlug(data.slug);
  if (!data.name || !String(data.name).trim()) throw new Error('Name is required');
  if (data.payloadTemplate && typeof data.payloadTemplate === 'string') {
    try {
      JSON.parse(data.payloadTemplate);
    } catch {
      throw new Error('payload_template is not valid JSON');
    }
  }
  // Strict write-side validation of the verify/claim block (the read side is
  // lenient for hand-edited folders; the designer must not save junk).
  const vc = data.verifyClaim;
  if (vc != null && data.slug !== MASTER_SLUG) {
    if (typeof vc !== 'object' || Array.isArray(vc)) throw new Error('verifyClaim must be an object');
    if ('maxIterations' in vc) {
      const n = Number(vc.maxIterations);
      if (!Number.isInteger(n) || n < 0 || n > VERIFY_MAX_ITERATIONS_CAP) {
        throw new Error(`verifyClaim.maxIterations must be an integer between 0 and ${VERIFY_MAX_ITERATIONS_CAP}`);
      }
    }
    if ('similarityThreshold' in vc) {
      const t = Number(vc.similarityThreshold);
      if (!Number.isFinite(t) || t < 0 || t > 1) throw new Error('verifyClaim.similarityThreshold must be a number between 0 and 1');
    }
    if (vc.aiProviderId) {
      const provider = await getProviderById(vc.aiProviderId);
      if (!provider) throw new Error('verifyClaim.aiProviderId does not match a configured AI provider');
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
  // defaultVerifierMd lets the designer prefill the rubric editor.
  return { ...indexed, ...card, files: readCardFiles(slug), defaultVerifierMd: DEFAULT_VERIFIER_MD };
}

export async function createCard(data) {
  await validateInput(data, { isCreate: true });
  const slug = data.slug;
  if (slug === MASTER_SLUG) throw new Error('"master" is reserved');
  if (existsSync(getCardDir(slug))) throw new Error(`Agent "${slug}" already exists`);
  writeCardFiles(slug, {
    name: String(data.name).trim(),
    description: data.description || '',
    aiProviderId: data.aiProviderId || null,
    enabled: data.enabled !== false,
    tools: data.tools,
    agentMd: data.agentMd || '',
    payloadTemplate: normaliseTemplate(data.payloadTemplate),
    verifyClaim: { ...VERIFY_CLAIM_DEFAULTS, ...(data.verifyClaim || {}) },
    verifierMd: data.verifierMd || '',
  });
  await scanAgents();
  return getCardDetail(slug);
}

export async function updateCard(slug, data) {
  const existing = readCard(assertValidSlug(slug));
  if (!existing) return null;
  await validateInput({ ...existing, ...data }, { isCreate: false });
  const isMaster = slug === MASTER_SLUG;
  writeCardFiles(slug, {
    name: data.name != null ? String(data.name).trim() : existing.name,
    description: data.description != null ? data.description : existing.description,
    aiProviderId: 'aiProviderId' in data ? (data.aiProviderId || null) : existing.aiProviderId,
    enabled: isMaster ? true : (data.enabled != null ? data.enabled : existing.enabled),
    tools: 'tools' in data ? data.tools : existing.tools,
    agentMd: data.agentMd != null ? data.agentMd : existing.agentMd,
    payloadTemplate: 'payloadTemplate' in data
      ? normaliseTemplate(data.payloadTemplate)
      : existing.payloadTemplate,
    // Partial block merges over the stored one; the master never gets one.
    verifyClaim: isMaster ? undefined : ('verifyClaim' in data
      ? { ...existing.verifyClaim, ...(data.verifyClaim || {}) }
      : existing.verifyClaim),
    verifierMd: isMaster ? '' : (data.verifierMd != null ? data.verifierMd : existing.verifierMd),
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
