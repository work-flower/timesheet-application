import { getRawById, getDefaultRaw } from './aiProviderService.js';
import { renderTemplate, renderHeaders } from './templateEngineService.js';
import { decodeResponse, shapeTools } from './streamDecoders.js';
import { readTranscript, appendMessage } from './conversationService.js';
import { readCard, MASTER_SLUG } from './agentCardService.js';
import { findAgent } from './routingService.js';
import { getConfig as getRoutingConfig } from './routingConfigService.js';
import { agents } from '../db/index.js';

/**
 * Master agent turn loop (Phase 3 "it delegates").
 *
 * Every turn is fronted by the reserved `master` card unless the user @mentions
 * a specialist (single-turn takeover — the NEXT turn goes back to the master).
 * The master holds two internal tools:
 *   find_agent — semantic routing via routingService; candidates are filtered
 *                through the CALLER-scoped agents collection, so the master can
 *                only ever see/route-to agents the caller can see.
 *   ask_agent  — runs a specialist as a stateless sub-loop (self-contained
 *                brief in, answer out) and returns its text as the tool result.
 *
 * Identity/no-leak boundary (authorisation judgment call): the ONLY
 * system-scoped read is the master card's own definition (boot-guaranteed
 * files). Everything the turn DOES — @mention resolution, find_agent
 * candidates, ask_agent targets, app-tool execution — runs in the caller's ALS
 * scope through wrapped collections. Never wrap the loop in runAsSystem.
 *
 * Persistence: the ROUTE appends the user message before calling streamTurn;
 * this service persists assistant text and tool_call/tool_result exchanges as
 * they happen, so the transcript is always the complete neutral history.
 */

const FALLBACK_SYSTEM = 'You are the assistant for a UK contractor timesheet and invoicing application. Answer helpfully and concisely.';

const MAX_TOOL_ITERATIONS = 4;
const MENTION_RE = /^@([a-z0-9][a-z0-9-]{1,48})\b\s*/;

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

function mapMessages(transcript, { includeToolMessages }) {
  const out = [];
  for (const m of transcript) {
    if (m.role === 'user' || m.role === 'assistant') {
      out.push({ role: m.role, content: m.content });
    } else if (includeToolMessages && m.role === 'tool_call') {
      out.push({
        role: 'tool_call',
        toolCallId: m.toolCallId,
        name: m.name,
        input: m.input || {},
        inputJson: JSON.stringify(m.input || {}),
      });
    } else if (includeToolMessages && m.role === 'tool_result') {
      out.push({ role: 'tool_result', toolCallId: m.toolCallId, name: m.name, content: m.content });
    }
  }
  return out;
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
async function* runCardStream(card, transcript, { tools = [], requestProviderId, signal } = {}) {
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
    messages: mapMessages(transcript, { includeToolMessages: tools.length > 0 }),
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

// -- Master tools -------------------------------------------------------------

/** Caller-scoped visibility filter over routing candidates. */
async function visibleCandidates(candidates) {
  if (!candidates.length) return [];
  const slugs = candidates.map((c) => c.agent);
  // Wrapped read — the caller's role filter applies; invisible agents drop out.
  const visible = await agents.find({ slug: { $in: slugs }, enabled: { $ne: false }, isMaster: { $ne: true } });
  const visibleSlugs = new Set(visible.map((a) => a.slug));
  return candidates.filter((c) => visibleSlugs.has(c.agent));
}

async function toolFindAgent({ query } = {}) {
  if (!query || !query.trim()) return 'find_agent requires a query.';
  const config = await getRoutingConfig();
  const { candidates } = await findAgent(query.trim());
  const visible = await visibleCandidates(candidates);
  if (!visible.length) return 'No matching specialist agents are available. Answer the user yourself.';
  return JSON.stringify({ candidates: visible.slice(0, Math.max(1, config.maxCandidates)) }, null, 2);
}

async function toolAskAgent({ agent, brief } = {}, { requestProviderId, signal } = {}) {
  if (!agent || !brief) return { content: 'ask_agent requires both "agent" and "brief".', consulted: null };
  // Caller-scoped resolution: invisible ⇒ not-found (visibility = talkability).
  const doc = await agents.findOne({ slug: agent, enabled: { $ne: false }, isMaster: { $ne: true } });
  if (!doc) return { content: `Agent "${agent}" was not found or is not accessible.`, consulted: null };
  const card = readCard(agent);
  if (!card) return { content: `Agent "${agent}" has no valid card on disk.`, consulted: null };

  let text = '';
  let error = null;
  const subTranscript = [{ role: 'user', content: brief }];
  for await (const event of runCardStream(card, subTranscript, { tools: [], requestProviderId, signal })) {
    if (event.type === 'text') text += event.text;
    else if (event.type === 'error') error = event.message;
  }
  if (error) return { content: `Specialist "${agent}" failed: ${error}`, consulted: null };
  // Only a specialist that actually answered counts as consulted (attribution).
  return { content: text || `Specialist "${agent}" returned no answer.`, consulted: text ? agent : null };
}

/** Execute a master tool → { content, consultedAgent } (consultedAgent set only
 *  when ask_agent got a real specialist answer — drives response attribution). */
async function executeMasterTool(call, opts) {
  try {
    if (call.name === 'find_agent') return { content: await toolFindAgent(call.input), consultedAgent: null };
    if (call.name === 'ask_agent') {
      const { content, consulted } = await toolAskAgent(call.input, opts);
      return { content, consultedAgent: consulted };
    }
    return { content: `Unknown tool: ${call.name}`, consultedAgent: null };
  } catch (err) {
    return { content: `Tool error: ${err.message}`, consultedAgent: null };
  }
}

// -- Turn orchestration -------------------------------------------------------

// Routing tier thresholds/toggles live in routingConfig (admin → Agents →
// Routing): autoRouteThreshold — a near-exact match (an utterance present in
// the eval-set scores ~1.0) is GROUND TRUTH and routes directly, like an
// implicit @mention; evidenceFloor — weaker matches than this are noise and
// attach no evidence. Read per turn; changes apply on the next message.

/** Run one specialist turn over the conversation (shared by @mention and
 *  ground-truth auto-routing). Persists the assistant reply with an agent tag. */
async function* runSpecialistTurn(conversationId, slug, { providerId, signal }) {
  const card = readCard(slug);
  if (!card) {
    yield { type: 'error', message: `Agent @${slug} has no valid card on disk.` };
    return;
  }
  yield { type: 'agent', agent: slug };
  const transcript = readTranscript(conversationId);
  let text = '';
  for await (const event of runCardStream(card, transcript, { tools: [], requestProviderId: providerId, signal })) {
    if (event.type === 'text') text += event.text;
    yield event;
    if (event.type === 'error') return;
  }
  if (text) await appendMessage(conversationId, { role: 'assistant', content: text, agent: slug });
}

/**
 * Stream one conversation turn. The route has already appended the user
 * message to the transcript. Yields neutral events for the SSE pane; persists
 * assistant text and tool exchanges as they happen.
 */
export async function* streamTurn(conversationId, userMessage, { providerId, signal } = {}) {
  // -- @mention: explicit single-turn takeover --------------------------------
  const mention = (userMessage || '').match(MENTION_RE);
  if (mention && mention[1] !== MASTER_SLUG) {
    const slug = mention[1];
    // Caller-scoped: invisible ⇒ not-found ⇒ surfaced as unknown.
    const doc = await agents.findOne({ slug, enabled: { $ne: false } });
    if (!doc) {
      yield { type: 'error', message: `Unknown or inaccessible agent @${slug}.` };
      return;
    }
    yield* runSpecialistTurn(conversationId, slug, { providerId, signal });
    return;
  }

  // -- Structural routing consultation ---------------------------------------
  // The routing corpus must not depend on the master CHOOSING to look: run the
  // query server-side (one local embed) on every master turn. A near-exact
  // eval-set match routes directly (ground truth); anything above the noise
  // floor is attached to the transcript as a ready-made find_agent exchange,
  // so the master decides WITH the evidence in front of it (and saves the
  // round-trip of calling the tool itself).
  const routingCfg = await getRoutingConfig();
  try {
    const { candidates } = await findAgent(userMessage);
    const visible = await visibleCandidates(candidates);
    if (visible.length) {
      const top = visible[0];
      if (routingCfg.autoRouteEnabled !== false && top.score >= routingCfg.autoRouteThreshold) {
        yield* runSpecialistTurn(conversationId, top.agent, { providerId, signal });
        return;
      }
      if (routingCfg.evidenceEnabled !== false && top.score >= routingCfg.evidenceFloor) {
        const toolCallId = `auto_${conversationId}_${readTranscript(conversationId).length}`;
        await appendMessage(conversationId, {
          role: 'tool_call', toolCallId, name: 'find_agent', input: { query: userMessage }, auto: true,
        });
        await appendMessage(conversationId, {
          role: 'tool_result', toolCallId, name: 'find_agent',
          content: JSON.stringify({ candidates: visible.slice(0, Math.max(1, routingCfg.maxCandidates)) }, null, 2), auto: true,
        });
      }
    }
  } catch (err) {
    // Routing must never block the conversation (e.g. embedding model missing).
    console.warn(`Routing consultation failed (continuing without evidence): ${err.message}`);
  }

  // -- Master turn with tool loop --------------------------------------------
  // The master card's DEFINITION is file-read directly (boot-guaranteed) — the
  // one intentionally non-caller-scoped resolution; see module note.
  const masterCard = readCard(MASTER_SLUG) || {
    slug: MASTER_SLUG, name: 'Master', agentMd: FALLBACK_SYSTEM, aiProviderId: null, payloadTemplate: null,
  };

  const maxIterations = Math.max(1, routingCfg.maxToolIterations ?? MAX_TOOL_ITERATIONS);
  // Specialists that actually answered via ask_agent this turn — the master's
  // subsequent responses are attributed to them ("via @slug" in the pane).
  const consulted = [];
  for (let iteration = 0; iteration <= maxIterations; iteration++) {
    const finalRound = iteration === maxIterations;
    // Last round runs without tools so the model must produce an answer.
    const tools = finalRound ? [] : MASTER_TOOL_DEFS;
    const transcript = readTranscript(conversationId);

    let text = '';
    const toolCalls = [];
    for await (const event of runCardStream(masterCard, transcript, { tools, requestProviderId: providerId, signal })) {
      if (event.type === 'text') {
        text += event.text;
        yield event;
      } else if (event.type === 'tool_use') {
        toolCalls.push(event);
        yield event; // pane shows "Using find_agent…"
      } else if (event.type === 'error') {
        yield event;
        return;
      } else if (event.type !== 'stop') {
        yield event; // thinking etc.
      }
    }

    if (text) {
      await appendMessage(conversationId, {
        role: 'assistant', content: text, ...(consulted.length ? { agents: [...consulted] } : {}),
      });
    }
    if (!toolCalls.length) return; // final answer delivered

    for (const call of toolCalls) {
      const toolCallId = call.id || `tc_${conversationId}_${iteration}_${toolCalls.indexOf(call)}`;
      await appendMessage(conversationId, { role: 'tool_call', toolCallId, name: call.name, input: call.input || {} });
      const { content: result, consultedAgent } = await executeMasterTool({ ...call, id: toolCallId }, { requestProviderId: providerId, signal });
      await appendMessage(conversationId, { role: 'tool_result', toolCallId, name: call.name, content: result });
      if (consultedAgent && !consulted.includes(consultedAgent)) {
        consulted.push(consultedAgent);
        yield { type: 'consulted', agents: [...consulted] };
      }
    }
    // Loop continues: next round's transcript includes the tool exchange.
  }
}

export { MASTER_TOOL_DEFS };
