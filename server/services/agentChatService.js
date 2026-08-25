import { getRawById, getDefaultRaw } from './aiProviderService.js';
import { renderTemplate, renderHeaders } from './templateEngineService.js';
import { decodeResponse, shapeTools } from './streamDecoders.js';
import { readTranscript, appendMessage } from './conversationService.js';
import { readCard, MASTER_SLUG, DEFAULT_VERIFIER_MD } from './agentCardService.js';
import { toolsByName, handlers as appHandlers, canUseTool } from './agentToolRegistry.js';
import { findAgent, rankTools } from './routingService.js';
import { similarity } from './embeddingService.js';
import { getConfig as getRoutingConfig } from './routingConfigService.js';
import * as pageContentStore from './pageContentStore.js';
import { agents } from '../db/index.js';

/**
 * Agent turn loop — master-only surface, specialist delegation, verify/claim,
 * and app-tool execution with action-card write confirmations.
 *
 * The user converses ONLY with the reserved `master` card. Specialists never
 * take over a turn: they are consulted through the `ask_agent` sub-loop, either
 * at the master's discretion or deterministically when the user @mentions
 * them (a server-performed pre-consultation whose result is injected into the
 * master's context before its first round). The master holds two built-in
 * tools:
 *   find_agent — semantic routing via routingService; candidates are filtered
 *                through the CALLER-scoped agents collection, so the master can
 *                only ever see/route-to agents the caller can see.
 *   ask_agent  — runs a specialist as a conversation-stateless sub-loop (brief
 *                in + its own ephemeral tool exchanges, answer out). Cards with
 *                verify/claim enabled have their answer checked against their
 *                own context by a per-card verifier before it leaves the loop
 *                (see runVerifyClaim).
 *
 * App tools (agentToolRegistry) are granted per card (manifest.tools) and obey
 * UNIFORM semantics at any depth — master loop or ask_agent sub-loop:
 *   read tools  — execute immediately under the caller's ALS identity (the
 *                 pipeline enforces roles/fls for free).
 *   write tools — NEVER execute inline. They append a `proposal` transcript row
 *                 (an action card the pane renders with Confirm/Decline) plus a
 *                 pending tool_result telling the model the write did NOT run.
 *                 Confirm executes (optionally with user-edited input) and
 *                 resumes the MASTER's loop; see executeProposal/
 *                 resumeAfterProposal.
 *
 * Identity/no-leak boundary (authorisation judgment call): the ONLY
 * system-scoped read is the master card's own definition (boot-guaranteed
 * files). Everything the turn DOES — @mention resolution, find_agent
 * candidates, ask_agent targets, app-tool execution — runs in the caller's ALS
 * scope through wrapped collections. Never wrap the loop in runAsSystem.
 *
 * Persistence: the ROUTE appends the user message before calling streamTurn;
 * this service persists the master's assistant text, tool exchanges and
 * proposals as they happen, so the transcript is always the complete neutral
 * history. Specialist sub-loops, verifier calls and revision drafts are
 * ephemeral — only their outcome reaches the transcript.
 */

const FALLBACK_SYSTEM = 'You are the assistant for a UK contractor timesheet and invoicing application. Answer helpfully and concisely.';

const MAX_TOOL_ITERATIONS = 4;
// Every @slug anywhere in the message (whitespace-bounded; slug = group 2).
// Same charset as agentCardService VALID_SLUG.
const MENTION_RE = /(^|\s)@([a-z0-9][a-z0-9-]{1,48})\b/g;

const MASTER_TOOL_DEFS = [
  {
    name: 'find_agent',
    description:
      'Find candidate specialist agents for a user request. Returns ranked candidates with similarity scores and the matched examples/descriptions as evidence. Call this when a request may belong to a specialist.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The user request to route' },
      },
      required: ['query'],
    },
  },
  {
    name: 'ask_agent',
    description:
      'Delegate a task to a specialist agent and return its answer. The specialist cannot see this conversation — the brief must be fully self-contained (include all relevant context, dates, names and constraints).',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Agent slug (from find_agent)' },
        brief: { type: 'string', description: 'Complete, self-contained task brief' },
      },
      required: ['agent', 'brief'],
    },
  },
];

// Discover delivery mode: a card with grants gets ONE static meta-tool; the
// real defs are injected only after a deterministic, grant/privilege-filtered
// vector lookup — and only for the rest of the current turn.
const FIND_TOOL_DEF = {
  name: 'find_tool',
  description:
    'Discover which app tools are available for an action you need to perform (logging time, recording an expense, looking up projects/timesheets/expenses/calendar/tickets). Returns the best-matching tools; the matched tools become callable on your NEXT step. Call this before attempting any data action — until then no app tool is available.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What you need to do, in plain words' },
    },
    required: ['query'],
  },
};

// Verify/claim: the verifier reports its ledger through ONE tool — a structured
// tool_use arrives identically on every wireFormat, so no per-dialect "force
// JSON" is needed. Code constant, never in the registry/admin store (it is not
// an app tool and must not be grantable).
const REPORT_CLAIMS_DEF = {
  name: 'report_claims',
  description:
    'Report the verification ledger for the claim under review. Decompose the claim into atomic statements and grade each one against the provided context ONLY. This is the only way to report — do not answer in prose.',
  inputSchema: {
    type: 'object',
    properties: {
      claims: {
        type: 'array',
        description: 'One entry per atomic statement found in the claim.',
        items: {
          type: 'object',
          properties: {
            claim: { type: 'string', description: 'The atomic statement, quoted or closely paraphrased' },
            kind: {
              type: 'string',
              enum: ['fact', 'computation', 'action', 'instruction'],
              description: 'fact = data assertion; computation = derived number; action = something the agent says it did/proposed; instruction = compliance with the responding agent\'s own instructions',
            },
            status: {
              type: 'string',
              enum: ['supported', 'unsupported', 'contradicted'],
              description: 'supported = traceable to the context; unsupported = nothing in the context backs it; contradicted = the context says otherwise',
            },
            evidence: { type: 'string', description: 'The context passage (or recomputation) that decides the status' },
          },
          required: ['claim', 'kind', 'status'],
        },
      },
      summary: { type: 'string', description: 'One-line overall assessment' },
    },
    required: ['claims'],
  },
};
const VERIFY_STATUSES = ['supported', 'unsupported', 'contradicted'];

/**
 * Chat access gate: the caller must be able to read the agents collection at
 * all ("whatever agent the user can see, they can talk to" — no agents grant
 * means no assistant). Throws ForbiddenError under AUTH_ENABLED without a
 * grant; legacy mode passes. Called by the route BEFORE the SSE stream opens.
 */
export async function assertChatAccess() {
  await agents.count({});
}

// -- Neutral context building -------------------------------------------------

// Fixed tool_result content for a write proposal — the model must not believe
// the write happened, and must not retry it.
function proposalPendingText(name) {
  return `Action proposed — an action card was shown to the user for confirmation. The ${name} write was NOT executed. Do not call ${name} again for this same action and do not claim it was performed; close by telling the user to confirm or decline the card.`;
}

// Proposal resolutions map into context as USER-role text: it renders on every
// wireFormat without template changes and survives tool-less rounds (which
// drop tool rows entirely), so a resume/next turn always sees the outcome.
function resolutionContextText(m) {
  // A resolution row carries `input` only when the user edited the card's
  // values before confirming — the model must narrate what actually ran.
  const edited = m.input ? ` with edited values: ${JSON.stringify(m.input)}` : '';
  if (m.status === 'confirmed') {
    return `[action-card ${m.name}] The user CONFIRMED the proposed ${m.name}${edited}. It has been executed. Result:\n${m.content || ''}`;
  }
  if (m.status === 'failed') {
    return `[action-card ${m.name}] The user confirmed the proposed ${m.name}${edited} but execution FAILED: ${m.content || ''}`;
  }
  return `[action-card ${m.name}] The user DECLINED the proposed ${m.name}. It was NOT executed. Do not retry unless asked.`;
}

/**
 * toolScope selects WHOSE tool exchanges enter the provider context:
 *   null     — none (tool-less rounds; dialects reject tool blocks without tools)
 *   '*'      — all rows (ephemeral ask_agent sub-transcripts; a history-seeded
 *              sub-transcript holds prose rows only, so '*' still admits just
 *              the specialist's OWN exchanges)
 *   'master' — only untagged rows. Persisted tool rows are always the master's
 *              now; `agent`-tagged rows are legacy (v1 specialist takeovers)
 *              and stay excluded — their tool names may be undeclared in a
 *              master request.
 */
function includeToolRow(m, toolScope) {
  if (toolScope == null) return false;
  if (toolScope === '*') return true;
  return !m.agent || m.agent === MASTER_SLUG;
}

function mapMessages(transcript, { toolScope = null } = {}) {
  const out = [];
  for (const m of transcript) {
    if (m.role === 'user' || m.role === 'assistant') {
      out.push({ role: m.role, content: m.content });
    } else if (m.role === 'proposal_resolution') {
      out.push({ role: 'user', content: resolutionContextText(m) });
    } else if (m.role === 'tool_call' && includeToolRow(m, toolScope)) {
      out.push({
        role: 'tool_call',
        toolCallId: m.toolCallId,
        name: m.name,
        input: m.input || {},
        inputJson: JSON.stringify(m.input || {}),
      });
    } else if (m.role === 'tool_result' && includeToolRow(m, toolScope)) {
      out.push({ role: 'tool_result', toolCallId: m.toolCallId, name: m.name, content: m.content });
    }
    // 'proposal' rows are skipped: a main-loop proposal is already represented
    // by its tool_call + pending tool_result pair; a sub-loop proposal by the
    // marker inside the master's ask_agent tool_result.
  }
  return out;
}

/**
 * Render transcript rows as plain text — the verify/claim loop's common
 * currency. The verifier receives the specialist's context this way (one user
 * message, any wireFormat), and tool-less revise rounds receive the evidence
 * this way too: mapMessages drops tool rows when no tools are declared, so the
 * tool exchanges must travel as text or the revising model loses its evidence.
 *   part: 'all' | 'prose' (user/assistant + resolutions) | 'tools' (exchanges)
 */
function serialiseContext(rows, { part = 'all' } = {}) {
  const out = [];
  for (const m of rows) {
    const isProse = m.role === 'user' || m.role === 'assistant' || m.role === 'proposal_resolution';
    const isTool = m.role === 'tool_call' || m.role === 'tool_result';
    if (part === 'prose' && !isProse) continue;
    if (part === 'tools' && !isTool) continue;
    if (m.role === 'user' || m.role === 'assistant') {
      out.push(`[${m.role}] ${m.content || ''}`);
    } else if (m.role === 'proposal_resolution') {
      out.push(`[user] ${resolutionContextText(m)}`);
    } else if (m.role === 'tool_call') {
      out.push(`[tool ${m.name} called with ${JSON.stringify(m.input || {})}]`);
    } else if (m.role === 'tool_result') {
      out.push(`→ result of ${m.name}: ${m.content || ''}`);
    }
  }
  return out.join('\n\n');
}

async function resolveProvider(card, requestProviderId) {
  if (card?.aiProviderId) {
    const bound = await getRawById(card.aiProviderId);
    if (bound) return bound;
  }
  if (requestProviderId) {
    const requested = await getRawById(requestProviderId);
    if (requested) return requested;
  }
  return getDefaultRaw();
}

/**
 * One model request for a card: resolve provider + template (card override ??
 * provider template), render, call, decode. Yields neutral events.
 */
async function* runCardStream(card, transcript, { tools = [], toolScope = null, requestProviderId, signal } = {}) {
  const provider = await resolveProvider(card, requestProviderId);
  if (!provider) {
    yield { type: 'error', message: 'No AI provider is configured. Add one in the admin console.' };
    return;
  }
  if (!provider.apiKey) {
    yield { type: 'error', message: `Provider "${provider.name}" has no API key configured.` };
    return;
  }

  const template = card?.payloadTemplate ?? provider.payloadTemplate ?? {};
  const context = {
    apiKey: provider.apiKey,
    model: provider.model,
    system: (card?.agentMd || '').trim() || FALLBACK_SYSTEM,
    tools: shapeTools(provider.wireFormat, tools),
    // Tool rows only enter context when this round declares tools (dialects
    // reject tool_use/tool_result blocks without a tools node).
    messages: mapMessages(transcript, { toolScope: tools.length > 0 ? toolScope : null }),
  };

  const rendered = renderTemplate(template, context);
  if (!rendered || typeof rendered !== 'object' || Array.isArray(rendered)) {
    yield { type: 'error', message: `Payload template for "${card?.name || provider.name}" did not render to a JSON object — check it in the admin console.` };
    return;
  }
  if ('stream' in rendered) rendered.stream = provider.wireFormat && provider.wireFormat !== 'json';
  // Templates without tool support simply have no {{$.tools}} node; templates
  // WITH one get the node stripped when this turn grants no tools. When tools
  // WERE granted but the template can't carry them, that's a silent capability
  // loss (master can't delegate) — surface it loudly instead of choking.
  const templateSupportsTools = 'tools' in rendered;
  if (rendered.tools == null || (Array.isArray(rendered.tools) && rendered.tools.length === 0)) {
    delete rendered.tools;
  }
  if (tools.length > 0 && !templateSupportsTools) {
    console.warn(`Provider "${provider.name}" payload template has no {{$.tools}} placeholder — ${tools.length} tool(s) unavailable this turn (delegation disabled). Re-apply the provider preset in the admin console.`);
  }

  const headers = renderHeaders(provider.headers, context);

  let response;
  try {
    response = await fetch(provider.endpointUrl, {
      method: provider.method || 'POST',
      headers,
      body: JSON.stringify(rendered),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') return;
    yield { type: 'error', message: `Failed to reach provider: ${err.message}` };
    return;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    yield { type: 'error', message: `Provider returned ${response.status}: ${text.slice(0, 300)}` };
    return;
  }

  try {
    for await (const event of decodeResponse(provider.wireFormat, response, provider)) {
      yield event;
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    yield { type: 'error', message: `Stream decode error: ${err.message}` };
  }
}

// -- App tools ----------------------------------------------------------------

/**
 * Resolve a card's granted tool names → registry defs the CURRENT caller can
 * actually use. Stale grants (tool retired from the registry) warn + skip;
 * canUseTool drops tools the caller's roles could never execute (no dead-end
 * offers — the pipeline still enforces at execution time).
 */
function resolveGrantedTools(card) {
  const names = Array.isArray(card?.tools) ? card.tools : [];
  const defs = [];
  for (const name of names) {
    const def = toolsByName.get(name);
    if (!def) {
      console.warn(`Agent "${card.slug}": granted tool "${name}" is not in the registry — skipped (retired?).`);
      continue;
    }
    if (!canUseTool(def)) continue;
    defs.push(def);
  }
  return defs;
}

/** Execute a READ app tool under the caller's ALS identity. Errors become
 *  result text so the loop can continue and the model can adjust. Resolves
 *  definition → handlerName → fn: definitions may map any code handler, and
 *  deleted/disabled definitions fall out of toolsByName. */
async function executeAppTool(call) {
  const def = toolsByName.get(call.name);
  const handler = def ? appHandlers[def.handlerName]?.fn : undefined;
  if (!handler) return `Unknown tool: ${call.name}`;
  try {
    return await handler(call.input || {});
  } catch (err) {
    return `Tool error: ${err.message}`;
  }
}

/**
 * find_tool (discover mode): rank the card's granted tools against the query —
 * deterministic filters (grants + privileges, already applied in grantedDefs)
 * before the cosine sort. Returns the tool_result text AND the matched defs to
 * inject for the rest of the turn (injection is what makes them callable — a
 * name in text is not).
 */
async function executeFindTool(input, grantedDefs) {
  const query = (input?.query || '').trim();
  if (!query) return { content: 'find_tool requires a query.', defs: [] };
  if (!grantedDefs.length) return { content: 'No app tools are granted to this agent.', defs: [] };
  try {
    const ranked = await rankTools(query, grantedDefs.map((d) => d.name));
    if (!ranked.length) {
      return { content: 'No matching tool available; answer without tools or ask the user.', defs: [] };
    }
    const defs = ranked.map((r) => toolsByName.get(r.name)).filter(Boolean);
    return {
      content: JSON.stringify({
        tools: ranked.map(({ name, description, score }) => ({ name, description, score })),
        note: 'These tools are now available to call.',
      }, null, 2),
      defs,
    };
  } catch (err) {
    return { content: `Tool lookup failed: ${err.message}`, defs: [] };
  }
}

/** Append a proposal row and return the pane-facing proposal object. */
async function createProposal(conversationId, { toolCallId, name, input, agent }) {
  const proposalId = `prop_${conversationId}_${readTranscript(conversationId).length}`;
  const entry = await appendMessage(conversationId, {
    role: 'proposal', proposalId, toolCallId: toolCallId ?? null, name, input, agent,
  });
  return { proposalId, name, input, agent, status: 'pending', createdAt: entry.createdAt };
}

// -- Master tools -------------------------------------------------------------

/**
 * Filter mixed-kind routing candidates for the acting card:
 *   agent-kind — caller-scoped visibility via the wrapped agents collection
 *                (invisible agents drop out; visibility = talkability)
 *   tool-kind  — kept only when the acting card holds the grant, the tool is
 *                still in the registry, and the caller's roles could use it
 *                (suggesting an unusable tool is noise).
 */
async function filterCandidates(candidates, actingCard) {
  if (!candidates.length) return [];
  const agentKind = candidates.filter((c) => c.kind !== 'tool');
  const slugs = agentKind.map((c) => c.agent);
  // Wrapped read — the caller's role filter applies; invisible agents drop out.
  const visible = slugs.length
    ? await agents.find({ slug: { $in: slugs }, enabled: { $ne: false }, isMaster: { $ne: true } })
    : [];
  const visibleSlugs = new Set(visible.map((a) => a.slug));
  const grantedNames = new Set(resolveGrantedTools(actingCard).map((d) => d.name));
  return candidates.filter((c) => (
    c.kind === 'tool' ? grantedNames.has(c.target) : visibleSlugs.has(c.agent)
  ));
}

/**
 * Caller-scoped fallback candidate (routingConfig.fallbackAgentSlug):
 * attached as weak evidence when NOTHING clears the evidence floor — the
 * deliberate "no routing was possible" tier. Unroutable utterances are
 * typically the context-dependent ones (deixis over the current page), so
 * the configured agent gets offered with an explanatory note; score 0 and
 * the fallback flag make clear this is a hint, not a match. Same visibility
 * rule as filterCandidates: invisible/disabled/master ⇒ no fallback.
 */
async function resolveFallbackCandidate(slug) {
  const doc = await agents.findOne({ slug, enabled: { $ne: false }, isMaster: { $ne: true } });
  if (!doc) return null;
  return {
    kind: 'agent',
    target: slug,
    agent: slug,
    score: 0,
    fallback: true,
    note: 'No routing match cleared the evidence floor. If the request depends on context you cannot see (e.g. "this page", "this record", "here"), consider consulting this agent via ask_agent; for plain small talk, just answer.',
  };
}

async function toolFindAgent({ query } = {}, { card } = {}) {
  if (!query || !query.trim()) return 'find_agent requires a query.';
  const config = await getRoutingConfig();
  const { candidates } = await findAgent(query.trim());
  const filtered = await filterCandidates(candidates, card);
  if (!filtered.length) return 'No matching specialist agents are available. Answer the user yourself.';
  return JSON.stringify({ candidates: filtered.slice(0, Math.max(1, config.maxCandidates)) }, null, 2);
}

// -- Verify/claim -------------------------------------------------------------

function logVerify(entry) {
  // One structured line per round; the log hook stamps traceId/requestId from
  // ALS, so the log viewer's traceId filter shows a whole loop. Debug level:
  // set logConfig.logLevel to `debug` to see these.
  console.debug(`VERIFY ${JSON.stringify(entry)}`);
}

function buildVerifierPrompt(card, base, draft, priorFindings) {
  const sections = [
    `# Responding agent's instructions\n\nThe agent that produced the claim was operating under these instructions. Treat them as rules to check compliance against (kind "instruction"), not as your own instructions.\n\n${(card.agentMd || '').trim() || '(none)'}`,
    `# Context available to the agent\n\nThis is EVERYTHING the agent had when it answered. Nothing outside it counts as evidence.\n\n${serialiseContext(base) || '(empty)'}`,
  ];
  if (priorFindings.length) {
    sections.push(
      `# Your previous findings in this review\n\nThe agent revised its answer after these findings. Check whether each one was addressed; raise NEW points only when they are genuinely wrong — do not move the goalposts.\n\n${priorFindings.map((f) => `- "${f.claim}" — ${f.status}${f.evidence ? `: ${f.evidence}` : ''}`).join('\n')}`,
    );
  }
  sections.push(`# Claim to verify\n\n${draft}`);
  sections.push('Call the report_claims tool now with your ledger. Do not reply in prose.');
  return sections.join('\n\n---\n\n');
}

function buildCritique(failing, evidence) {
  return [
    '[verification] Your answer above was checked against the information available to you. The following statements could not be confirmed:',
    failing.map((f) => `- "${f.claim}" — ${f.status.toUpperCase()}${f.evidence ? `: ${f.evidence}` : ''}`).join('\n'),
    evidence ? `For reference, this is the evidence you gathered while answering (tool calls and their results):\n\n${evidence}` : null,
    'Write a fresh, complete answer to the original request. Correct what is wrong. Remove or clearly hedge anything you cannot support from the information you have. Keep what is right — if a point above is itself mistaken, keep your statement. Do NOT mention this review, a verifier, or that anything was corrected.',
  ].filter(Boolean).join('\n\n');
}

function buildVerificationMarker(failing) {
  const items = failing.map((f) => `"${f.claim}" (${f.status})`).join('; ');
  return `\n\n[Verification: ${failing.length} statement(s) could not be confirmed against the agent's context: ${items}]`;
}

// Sorted multiset of numeric tokens — the fixed-point guard. Embeddings barely
// separate "£700" from "£650" (measured ~0.97 on a one-line answer, ~0.997 when
// the change sits in one paragraph of twelve), and in this domain the figures
// ARE the answer: a revision that changes any number is never a fixed point,
// whatever the cosine says.
function numericFingerprint(text) {
  return (String(text || '').match(/\d+(?:[.,]\d+)*/g) || []).sort().join('|');
}

/**
 * Verify/claim loop for one specialist answer (per-card opt-in,
 * manifest.verifyClaim). Wraps the FINISHED tool loop: `base` is the ephemeral
 * sub-transcript as it stood when the draft was produced (brief/seed + the
 * specialist's own tool exchanges) and is the ONLY evidence the verifier may
 * use — the draft itself is never part of the context.
 *
 * Per round: (similarity early-stop from round 1) → verifier call (tool-less
 * pseudo-card built from verifier.md + the verify provider, reporting through
 * report_claims) → deterministic verdict (clean iff every claim is supported)
 * → clean: deliver; cap: deliver + marker (shadow mode, maxIterations 0:
 * deliver, no marker); else a TOOL-LESS revise round over an overlay of the
 * base prose + the latest draft + one critique message (evidence travels as
 * text — tool-less rounds drop tool rows). Only the latest draft/critique pair
 * is ever in the overlay. Nothing here touches the transcript.
 *
 * Failure is transparent: a verifier/revision error, a verifier that did not
 * call report_claims, or an empty revision return { aborted, message } and the
 * caller ends the turn with an SSE error — never a silent fall-back to the
 * unverified draft.
 */
async function* runVerifyClaim(card, base, draft, { requestProviderId, signal, conversationId, embeddingModel } = {}) {
  const vc = card.verifyClaim || {};
  const slug = card.slug;
  const maxIterations = Number.isInteger(vc.maxIterations) ? Math.max(0, Math.min(5, vc.maxIterations)) : 2;
  const threshold = Number.isFinite(vc.similarityThreshold) ? vc.similarityThreshold : 0.98;
  const verifier = {
    slug,
    name: `${card.name || slug} (verifier)`,
    agentMd: (card.verifierMd || '').trim() || DEFAULT_VERIFIER_MD,
    aiProviderId: vc.aiProviderId ?? card.aiProviderId ?? null,
    // A card template override is authored for the card's provider wire
    // format — when the verifier is bound elsewhere, inherit THAT provider's.
    payloadTemplate: vc.aiProviderId && vc.aiProviderId !== card.aiProviderId ? null : card.payloadTemplate,
  };
  const priorFindings = [];
  let lastFailing = [];
  let prevDraft = null;

  for (let round = 0; round <= maxIterations; round++) {
    let sim = null;
    if (round > 0 && vc.similarityCheck !== false) {
      try {
        sim = await similarity(prevDraft, draft, embeddingModel);
      } catch (err) {
        return { aborted: true, message: `Similarity check for @${slug} failed: ${err.message}` };
      }
      const sameNumbers = numericFingerprint(prevDraft) === numericFingerprint(draft);
      if (sim >= threshold && sameNumbers) {
        logVerify({ conversationId, agent: slug, round, verdict: 'fixed-point', similarity: sim, unresolved: lastFailing.length });
        return { draft, marker: lastFailing.length ? buildVerificationMarker(lastFailing) : null, outcome: 'fixed-point' };
      }
    }

    yield { type: 'status', text: `Verifying @${slug} (round ${round + 1}/${maxIterations + 1})…` };
    const startedAt = Date.now();
    const prompt = buildVerifierPrompt(card, base, draft, priorFindings);
    let ledger = null;
    let error = null;
    for await (const event of runCardStream(verifier, [{ role: 'user', content: prompt }], {
      tools: [REPORT_CLAIMS_DEF], toolScope: null, requestProviderId, signal,
    })) {
      if (event.type === 'tool_use' && event.name === REPORT_CLAIMS_DEF.name) {
        if (Array.isArray(event.input?.claims)) ledger = event.input.claims;
      } else if (event.type === 'error') {
        error = event.message;
      }
    }
    if (signal?.aborted) return { aborted: true, message: 'Request aborted.' };
    if (error) return { aborted: true, message: `Verifier for @${slug} failed: ${error}` };
    if (!ledger) return { aborted: true, message: `Verifier for @${slug} did not report a claim ledger.` };

    const claims = ledger.map((c) => ({
      claim: String(c?.claim ?? '').trim(),
      kind: c?.kind,
      status: VERIFY_STATUSES.includes(c?.status) ? c.status : 'unsupported',
      evidence: c?.evidence ? String(c.evidence) : '',
    })).filter((c) => c.claim);
    const failing = claims.filter((c) => c.status !== 'supported');
    const counts = {
      supported: claims.length - failing.length,
      unsupported: failing.filter((c) => c.status === 'unsupported').length,
      contradicted: failing.filter((c) => c.status === 'contradicted').length,
    };
    logVerify({
      conversationId, agent: slug, round, verdict: failing.length ? 'fail' : 'clean',
      counts, similarity: sim, durationMs: Date.now() - startedAt, ledger: claims,
    });

    if (!failing.length) return { draft, marker: null, outcome: 'clean' };
    if (round === maxIterations) {
      // Shadow mode (0): observe and log only — the answer is delivered as-is.
      if (maxIterations === 0) return { draft, marker: null, outcome: 'shadow' };
      return { draft, marker: buildVerificationMarker(failing), outcome: 'cap' };
    }

    // -- Revise (tool-less) --------------------------------------------------
    yield { type: 'status', text: `@${slug} revising (${counts.contradicted} contradicted, ${counts.unsupported} unsupported)…` };
    priorFindings.push(...failing);
    lastFailing = failing;
    const prose = base
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }));
    const overlay = [
      ...prose,
      { role: 'assistant', content: draft },
      { role: 'user', content: buildCritique(failing, serialiseContext(base, { part: 'tools' })) },
    ];
    let newText = '';
    let revError = null;
    for await (const event of runCardStream(card, overlay, { tools: [], requestProviderId, signal })) {
      if (event.type === 'text') newText += event.text;
      else if (event.type === 'error') revError = event.message;
    }
    if (signal?.aborted) return { aborted: true, message: 'Request aborted.' };
    if (revError) return { aborted: true, message: `Revision by @${slug} failed: ${revError}` };
    if (!newText.trim()) return { aborted: true, message: `Revision by @${slug} returned no text.` };
    prevDraft = draft;
    draft = newText;
  }
  // Unreachable: every path inside the loop returns on the final round.
  return { draft, marker: null, outcome: 'cap' };
}

/**
 * Delegate to a specialist as a bounded, conversation-stateless tool loop:
 * the sub-transcript starts from the brief (optionally preceded by a prose
 * `seed` — the @mention pre-consultation seeds the conversation's user/
 * assistant rows so the user's own, non-self-contained message has its
 * context; master-composed briefs pass no seed) and accumulates the
 * specialist's OWN tool exchanges only (ephemeral — never persisted). Reads
 * execute; writes create proposals on the MAIN transcript (agent-tagged,
 * toolCallId null) and the sub-loop closes over a pending marker. tool_use,
 * proposal and status events bubble to the pane via yield*; the return value
 * keeps the { content, consulted } attribution contract and adds `aborted`
 * (verify/claim failed transparently — the caller must end the turn).
 */
async function* toolAskAgent({ agent, brief } = {}, { requestProviderId, signal, conversationId, seed } = {}) {
  if (!agent || !brief) return { content: 'ask_agent requires both "agent" and "brief".', consulted: null };
  // Caller-scoped resolution: invisible ⇒ not-found (visibility = talkability).
  const doc = await agents.findOne({ slug: agent, enabled: { $ne: false }, isMaster: { $ne: true } });
  if (!doc) return { content: `Agent "${agent}" was not found or is not accessible.`, consulted: null };
  const card = readCard(agent);
  if (!card) return { content: `Agent "${agent}" has no valid card on disk.`, consulted: null };

  const routingCfg = await getRoutingConfig();
  const maxIterations = Math.max(1, routingCfg.maxToolIterations ?? MAX_TOOL_ITERATIONS);
  const granted = resolveGrantedTools(card);
  const discoverMode = routingCfg.toolDelivery === 'discover';
  const discovered = []; // sub-loop-scoped (the sub-transcript is ephemeral)
  const subTranscript = [
    ...(Array.isArray(seed) ? seed : []),
    { role: 'user', content: brief },
  ];
  let finalText = '';
  let proposalsMade = 0;

  for (let iteration = 0; iteration <= maxIterations; iteration++) {
    const finalRound = iteration === maxIterations;
    const tools = finalRound ? [] : (
      discoverMode
        ? [...(granted.length ? [FIND_TOOL_DEF] : []), ...discovered]
        : granted
    );
    let text = '';
    let error = null;
    const toolCalls = [];
    for await (const event of runCardStream(card, subTranscript, { tools, toolScope: '*', requestProviderId, signal })) {
      if (event.type === 'text') text += event.text;
      else if (event.type === 'tool_use') {
        toolCalls.push(event);
        yield { type: 'tool_use', name: event.name, input: event.input };
      } else if (event.type === 'error') error = event.message;
    }
    if (error) return { content: `Specialist "${agent}" failed: ${error}`, consulted: null };
    if (text) finalText = text; // last non-empty text wins (as before)
    if (!toolCalls.length) {
      // Final answer: NOT pushed into the sub-transcript — the verify loop
      // needs the context WITHOUT the draft it is checking.
      break;
    }
    if (text) subTranscript.push({ role: 'assistant', content: text });

    for (const call of toolCalls) {
      const toolCallId = call.id || `sub_${agent}_${iteration}_${toolCalls.indexOf(call)}`;
      subTranscript.push({ role: 'tool_call', toolCallId, name: call.name, input: call.input || {} });
      const def = toolsByName.get(call.name);
      if (call.name === FIND_TOOL_DEF.name) {
        const { content, defs } = await executeFindTool(call.input, granted);
        for (const d of defs) {
          if (!discovered.some((x) => x.name === d.name)) discovered.push(d);
        }
        subTranscript.push({ role: 'tool_result', toolCallId, name: call.name, content });
      } else if (def && def.kind === 'write') {
        const proposal = await createProposal(conversationId, {
          toolCallId: null, name: call.name, input: call.input || {}, agent,
        });
        proposalsMade++;
        subTranscript.push({ role: 'tool_result', toolCallId, name: call.name, content: proposalPendingText(call.name) });
        yield { type: 'proposal', proposal };
      } else {
        const result = await executeAppTool(call);
        subTranscript.push({ role: 'tool_result', toolCallId, name: call.name, content: result });
      }
    }
  }

  let marker = '';
  if (finalText && card.verifyClaim?.enabled) {
    const v = yield* runVerifyClaim(card, subTranscript, finalText, {
      requestProviderId, signal, conversationId, embeddingModel: routingCfg.embeddingModel,
    });
    if (v.aborted) {
      yield { type: 'error', message: v.message };
      return { content: `Verification of @${agent} failed: ${v.message}`, consulted: null, aborted: true };
    }
    finalText = v.draft;
    marker = v.marker || '';
  }

  let content = (finalText || `Specialist "${agent}" returned no answer.`) + marker;
  if (proposalsMade) {
    // The master's only durable record of sub-loop proposals — robust against
    // a specialist that forgets to mention them.
    content += `\n[The specialist proposed ${proposalsMade} action(s) now awaiting user confirmation — do not claim they were executed.]`;
  }
  return { content, consulted: finalText ? agent : null };
}

/** Execute a master tool → { content, consultedAgent, aborted } (consultedAgent
 *  set only when ask_agent got a real specialist answer — drives response
 *  attribution; aborted = verify/claim failed transparently, the loop must
 *  stop after recording the result). Generator: sub-loop tool_use/proposal/
 *  status events bubble to the pane. The catch turns handler throws into tool
 *  text — which is why an abort is a RETURNED flag, never a throw. */
async function* executeMasterTool(call, opts) {
  try {
    if (call.name === 'find_agent') return { content: await toolFindAgent(call.input, opts), consultedAgent: null };
    if (call.name === 'ask_agent') {
      const { content, consulted, aborted } = yield* toolAskAgent(call.input, opts);
      return { content, consultedAgent: consulted, aborted: !!aborted };
    }
    return { content: `Unknown tool: ${call.name}`, consultedAgent: null };
  } catch (err) {
    return { content: `Tool error: ${err.message}`, consultedAgent: null };
  }
}

// -- The agent loop -----------------------------------------------------------

/**
 * Run the MASTER's bounded tool loop over the conversation transcript — the
 * single engine behind master turns and confirm-resumes (specialists never run
 * over the transcript; they are consulted via toolAskAgent).
 *
 *   extraToolDefs    — defs injected beyond the card's grants (confirm-resume
 *                      injects the proposal's def so replayed tool history is
 *                      never undeclared)
 *   initialConsulted — specialists already consulted this turn by the @mention
 *                      pre-consultation, so attribution ("via @slug") covers
 *                      them too
 *
 * Per round: text streams out; read tools execute inline; write tools become
 * proposals (loop continues — the next round naturally narrates the card);
 * the last round runs tool-less so the model must produce an answer. An
 * aborted ask_agent (verify/claim failed) ends the loop after its tool_result
 * is recorded — the error event has already reached the pane.
 */
async function* runAgentLoop(conversationId, card, {
  providerId,
  signal,
  extraToolDefs = [],
  initialConsulted = [],
} = {}) {
  const routingCfg = await getRoutingConfig();
  const maxIterations = Math.max(1, routingCfg.maxToolIterations ?? MAX_TOOL_ITERATIONS);
  const granted = resolveGrantedTools(card);
  const extras = extraToolDefs.filter((d) => !granted.some((g) => g.name === d.name));
  const discoverMode = routingCfg.toolDelivery === 'discover';
  const discovered = []; // turn-scoped defs injected by find_tool (discover mode)

  // Specialists that actually answered via ask_agent this turn — the master's
  // subsequent responses are attributed to them ("via @slug" in the pane).
  const consulted = [...initialConsulted];
  if (consulted.length) yield { type: 'consulted', agents: [...consulted] };
  for (let iteration = 0; iteration <= maxIterations; iteration++) {
    const finalRound = iteration === maxIterations;
    const transcript = readTranscript(conversationId);
    // Last round runs without tools so the model must produce an answer.
    // static: all granted defs every round. discover: only the find_tool
    // meta-tool until a lookup injects the matched defs (turn-scoped).
    const grantedRound = discoverMode
      ? [...(granted.length ? [FIND_TOOL_DEF] : []), ...discovered]
      : granted;
    const tools = finalRound ? [] : [...MASTER_TOOL_DEFS, ...grantedRound, ...extras];
    // Mode-switch replay defence: if the master's history contains find_tool
    // calls (recorded under discover mode), keep the def declared — strict
    // dialects reject tool_use blocks whose tool is undeclared.
    if (!finalRound
      && !tools.some((t) => t.name === FIND_TOOL_DEF.name)
      && transcript.some((m) => m.role === 'tool_call' && m.name === FIND_TOOL_DEF.name && (m.agent ?? MASTER_SLUG) === MASTER_SLUG)) {
      tools.push(FIND_TOOL_DEF);
    }

    let text = '';
    const toolCalls = [];
    for await (const event of runCardStream(card, transcript, { tools, toolScope: MASTER_SLUG, requestProviderId: providerId, signal })) {
      if (event.type === 'text') {
        text += event.text;
        yield event;
      } else if (event.type === 'tool_use') {
        toolCalls.push(event);
        yield event; // pane shows "Using {tool}…"
      } else if (event.type === 'error') {
        yield event;
        return;
      } else if (event.type !== 'stop') {
        yield event; // thinking etc.
      }
    }

    if (text) {
      await appendMessage(conversationId, {
        role: 'assistant', content: text,
        ...(consulted.length ? { agents: [...consulted] } : {}),
      });
    }
    if (!toolCalls.length) return; // final answer delivered

    for (const call of toolCalls) {
      const toolCallId = call.id || `tc_${conversationId}_${iteration}_${toolCalls.indexOf(call)}`;
      const def = toolsByName.get(call.name);

      if (call.name === 'find_agent' || call.name === 'ask_agent') {
        await appendMessage(conversationId, { role: 'tool_call', toolCallId, name: call.name, input: call.input || {} });
        const { content: result, consultedAgent, aborted } = yield* executeMasterTool(
          { ...call, id: toolCallId },
          { requestProviderId: providerId, signal, conversationId, card },
        );
        // Always pair the tool_call before bailing — an orphan tool_use breaks
        // the next turn on strict dialects.
        await appendMessage(conversationId, { role: 'tool_result', toolCallId, name: call.name, content: result });
        if (aborted) return;
        if (consultedAgent && !consulted.includes(consultedAgent)) {
          consulted.push(consultedAgent);
          yield { type: 'consulted', agents: [...consulted] };
        }
      } else if (call.name === FIND_TOOL_DEF.name) {
        await appendMessage(conversationId, { role: 'tool_call', toolCallId, name: call.name, input: call.input || {} });
        const { content, defs } = await executeFindTool(call.input, granted);
        for (const d of defs) {
          if (!discovered.some((x) => x.name === d.name)) discovered.push(d);
        }
        await appendMessage(conversationId, { role: 'tool_result', toolCallId, name: call.name, content });
      } else if (def && def.kind === 'write') {
        // Uniform write semantics: propose, never execute inline.
        await appendMessage(conversationId, { role: 'tool_call', toolCallId, name: call.name, input: call.input || {} });
        const proposal = await createProposal(conversationId, {
          toolCallId, name: call.name, input: call.input || {}, agent: MASTER_SLUG,
        });
        await appendMessage(conversationId, { role: 'tool_result', toolCallId, name: call.name, content: proposalPendingText(call.name) });
        yield { type: 'proposal', proposal };
      } else {
        await appendMessage(conversationId, { role: 'tool_call', toolCallId, name: call.name, input: call.input || {} });
        const result = await executeAppTool(call);
        await appendMessage(conversationId, { role: 'tool_result', toolCallId, name: call.name, content: result });
      }
    }
    // Loop continues: next round's transcript includes the tool exchange.
  }
}

// -- Turn orchestration -------------------------------------------------------

// Routing lives in routingConfig (admin → Agents → Routing), read per turn:
// evidenceFloor — matches weaker than this are noise and attach no evidence;
// fallbackAgentSlug — weak evidence when nothing clears the floor. There is no
// takeover tier: the master always fronts the turn and decides with the
// evidence; @mentions force a consultation (below) rather than a takeover.

/** Fallback master card when the boot-guaranteed folder is unreadable. */
function masterCardOrFallback() {
  return readCard(MASTER_SLUG) || {
    slug: MASTER_SLUG, name: 'Master', agentMd: FALLBACK_SYSTEM, aiProviderId: null, payloadTemplate: null,
  };
}

/**
 * Stream one conversation turn. The route has already appended the user
 * message to the transcript. Yields neutral events for the SSE pane; persists
 * the master's assistant text and tool exchanges as they happen.
 */
export async function* streamTurn(conversationId, userMessage, { providerId, signal } = {}) {
  // The master card's DEFINITION is file-read directly (boot-guaranteed) — the
  // one intentionally non-caller-scoped resolution; see module note. Read
  // before routing: candidate filtering needs the master's tool grants.
  const masterCard = masterCardOrFallback();

  // -- Structural routing consultation ---------------------------------------
  // The routing corpus must not depend on the master CHOOSING to look: run the
  // query server-side (one local embed) on every master turn. Anything above
  // the noise floor is attached to the transcript as a ready-made find_agent
  // exchange, so the master decides WITH the evidence in front of it (and
  // saves the round-trip of calling the tool itself).
  const routingCfg = await getRoutingConfig();
  let evidence = null;
  try {
    const { candidates } = await findAgent(userMessage);
    const filtered = await filterCandidates(candidates, masterCard);
    if (filtered.length) {
      const top = filtered[0];
      if (routingCfg.evidenceEnabled !== false && top.score >= routingCfg.evidenceFloor) {
        evidence = filtered.slice(0, Math.max(1, routingCfg.maxCandidates));
      }
    }
  } catch (err) {
    // Routing must never block the conversation (e.g. embedding model missing).
    console.warn(`Routing consultation failed (continuing without evidence): ${err.message}`);
  }

  try {
    // Deliberate fallback tier: nothing routed (no candidates, all below the
    // floor, or the consultation itself failed) — attach the configured
    // fallback agent as weak evidence so the master can consult it for
    // context-dependent requests. Gated by evidenceEnabled like the tier above.
    if (!evidence && routingCfg.evidenceEnabled !== false && routingCfg.fallbackAgentSlug) {
      const fallback = await resolveFallbackCandidate(routingCfg.fallbackAgentSlug);
      if (fallback) evidence = [fallback];
    }
    if (evidence) {
      // Current-page pointer (route/title/capturedAt — NEVER the content,
      // ~15 tokens): the dedup key for expensive page-context consults. The
      // master compares it against the route stamped on an earlier
      // @page-context answer — same page ⇒ reuse that answer; different
      // route or fresher capturedAt the user asks about ⇒ consult again.
      const currentPage = pageContentStore.peek(pageContentStore.identityKey());
      const toolCallId = `auto_${conversationId}_${readTranscript(conversationId).length}`;
      await appendMessage(conversationId, {
        role: 'tool_call', toolCallId, name: 'find_agent', input: { query: userMessage }, auto: true,
      });
      await appendMessage(conversationId, {
        role: 'tool_result', toolCallId, name: 'find_agent',
        content: JSON.stringify({ candidates: evidence, ...(currentPage ? { currentPage } : {}) }, null, 2), auto: true,
      });
    }
  } catch (err) {
    console.warn(`Routing evidence attach failed (continuing without evidence): ${err.message}`);
  }

  // -- @mention pre-consultation (deterministic) ------------------------------
  // A mention is a routing decision made by the USER, so it must not depend on
  // the master choosing to honour it: the server consults every mentioned
  // agent itself (the same ask_agent sub-loop the master uses — verify/claim
  // included) and injects each answer as a synthetic ask_agent exchange before
  // the master's first round. The brief is the user's own message, so — unlike
  // a master-composed brief — it is not self-contained: the sub-transcript is
  // seeded with the conversation's prose rows. Unresolvable mentions (unknown,
  // disabled, invisible) are ignored; the master answers as usual.
  const initialConsulted = [];
  const mentions = [...new Set([...(userMessage || '').matchAll(MENTION_RE)].map((m) => m[2]))]
    .filter((slug) => slug !== MASTER_SLUG);
  if (mentions.length) {
    const brief = (userMessage || '').replace(MENTION_RE, ' ').replace(/\s+/g, ' ').trim() || userMessage;
    const rows = readTranscript(conversationId);
    const prior = rows.length && rows[rows.length - 1].role === 'user' ? rows.slice(0, -1) : rows;
    const seed = prior
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }));
    for (const slug of mentions) {
      const doc = await agents.findOne({ slug, enabled: { $ne: false }, isMaster: { $ne: true } });
      if (!doc) continue;
      const toolCallId = `mention_${conversationId}_${readTranscript(conversationId).length}`;
      await appendMessage(conversationId, {
        role: 'tool_call', toolCallId, name: 'ask_agent', input: { agent: slug, brief }, auto: true,
      });
      const { content, consulted, aborted } = yield* toolAskAgent(
        { agent: slug, brief },
        { requestProviderId: providerId, signal, conversationId, seed },
      );
      await appendMessage(conversationId, { role: 'tool_result', toolCallId, name: 'ask_agent', content, auto: true });
      if (aborted) return;
      if (consulted && !initialConsulted.includes(consulted)) initialConsulted.push(consulted);
    }
  }

  // -- Master turn with tool loop --------------------------------------------
  yield* runAgentLoop(conversationId, masterCard, { providerId, signal, initialConsulted });
}

// -- Proposal lifecycle (confirm/decline endpoints) ---------------------------

/**
 * Execute a confirmed proposal's write tool under the CALLER's ALS identity
 * (the pipeline re-validates roles/locks/fls naturally) and append the
 * resolution row. `inputOverride` carries the user's edits from the action
 * card: only keys the tool's inputSchema declares (or the proposal already
 * had) are accepted — an edit can adjust values, never smuggle in arguments.
 * The proposal row is append-only; when edits applied, the resolution row
 * records the executed `input` and it is returned for the pane/fold.
 * Returns { status: 'confirmed'|'failed', content, input? }.
 */
export async function executeProposal(conversationId, proposal, { inputOverride } = {}) {
  let status = 'confirmed';
  let content = '';
  // Definition → handlerName → fn; a definition deleted or disabled between
  // proposal and confirm resolves to no handler → the failed path.
  const def = toolsByName.get(proposal.name);
  const handler = def ? appHandlers[def.handlerName]?.fn : undefined;

  const allowed = new Set([
    ...Object.keys(proposal.input || {}),
    ...Object.keys(def?.inputSchema?.properties || {}),
  ]);
  const edits = {};
  if (inputOverride && typeof inputOverride === 'object' && !Array.isArray(inputOverride)) {
    for (const [k, v] of Object.entries(inputOverride)) {
      if (allowed.has(k)) edits[k] = v;
    }
  }
  const edited = Object.keys(edits).length > 0;
  const input = edited ? { ...(proposal.input || {}), ...edits } : (proposal.input || {});

  if (!handler) {
    status = 'failed';
    content = `Tool "${proposal.name}" is no longer available.`;
  } else {
    try {
      content = await handler(input);
    } catch (err) {
      status = 'failed';
      content = err.message;
    }
  }
  await appendMessage(conversationId, {
    role: 'proposal_resolution', proposalId: proposal.proposalId, name: proposal.name, status, content,
    ...(edited ? { input } : {}),
  });
  return { status, content, ...(edited ? { input } : {}) };
}

/** Append a declined resolution row. No model call. */
export async function declineProposal(conversationId, proposal) {
  await appendMessage(conversationId, {
    role: 'proposal_resolution', proposalId: proposal.proposalId, name: proposal.name, status: 'declined', content: '',
  });
  return { status: 'declined' };
}

/**
 * Resume the MASTER's loop after a confirm (success OR failure — the model
 * narrates either; the resolution row is user-role context, so it needs no
 * specialist). `proposal.agent` stays on the row for card attribution only.
 * The proposal's own tool def is force-injected so replayed tool_call history
 * (master proposals) is never undeclared, even if the grant was revoked
 * between proposal and confirm.
 */
export async function* resumeAfterProposal(conversationId, proposal, { providerId, signal } = {}) {
  const def = toolsByName.get(proposal.name);
  yield* runAgentLoop(conversationId, masterCardOrFallback(), {
    providerId,
    signal,
    extraToolDefs: def ? [def] : [],
  });
}

export { MASTER_TOOL_DEFS };
