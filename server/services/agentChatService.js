import { getRawById, getDefaultRaw } from './aiProviderService.js';
import { renderTemplate, renderHeaders } from './templateEngineService.js';
import { decodeResponse, shapeTools } from './streamDecoders.js';
import { readTranscript, appendMessage } from './conversationService.js';
import { readCard, MASTER_SLUG } from './agentCardService.js';
import { toolsByName, handlers as appHandlers, canUseTool } from './agentToolRegistry.js';
import { findAgent, rankTools } from './routingService.js';
import { getConfig as getRoutingConfig } from './routingConfigService.js';
import * as pageContentStore from './pageContentStore.js';
import { agents } from '../db/index.js';

/**
 * Agent turn loop — master fronting, specialist takeovers, delegation, and
 * app-tool execution with action-card write confirmations.
 *
 * Every turn is fronted by the reserved `master` card unless the user @mentions
 * a specialist (single-turn takeover — the NEXT turn goes back to the master).
 * The master holds two built-in tools:
 *   find_agent — semantic routing via routingService; candidates are filtered
 *                through the CALLER-scoped agents collection, so the master can
 *                only ever see/route-to agents the caller can see.
 *   ask_agent  — runs a specialist as a conversation-stateless sub-loop (brief
 *                in + its own ephemeral tool exchanges, answer out).
 *
 * App tools (agentToolRegistry) are granted per card (manifest.tools) and obey
 * UNIFORM semantics at any depth — master loop, takeover, or ask_agent
 * sub-loop:
 *   read tools  — execute immediately under the caller's ALS identity (the
 *                 pipeline enforces roles/fls for free).
 *   write tools — NEVER execute inline. They append a `proposal` transcript row
 *                 (an action card the pane renders with Confirm/Decline) plus a
 *                 pending tool_result telling the model the write did NOT run.
 *                 Confirm executes + resumes the proposing card's loop; see
 *                 confirmProposal/resumeAfterProposal.
 *
 * Identity/no-leak boundary (authorisation judgment call): the ONLY
 * system-scoped read is the master card's own definition (boot-guaranteed
 * files). Everything the turn DOES — @mention resolution, find_agent
 * candidates, ask_agent targets, app-tool execution — runs in the caller's ALS
 * scope through wrapped collections. Never wrap the loop in runAsSystem.
 *
 * Persistence: the ROUTE appends the user message before calling streamTurn;
 * this service persists assistant text, tool exchanges (agent-tagged for
 * non-master loops) and proposals as they happen, so the transcript is always
 * the complete neutral history.
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
  if (m.status === 'confirmed') {
    return `[action-card ${m.name}] The user CONFIRMED the proposed ${m.name}. It has been executed. Result:\n${m.content || ''}`;
  }
  if (m.status === 'failed') {
    return `[action-card ${m.name}] The user confirmed the proposed ${m.name} but execution FAILED: ${m.content || ''}`;
  }
  return `[action-card ${m.name}] The user DECLINED the proposed ${m.name}. It was NOT executed. Do not retry unless asked.`;
}

/**
 * toolScope selects WHOSE tool exchanges enter the provider context:
 *   null   — none (tool-less rounds; dialects reject tool blocks without tools)
 *   '*'    — all rows (ephemeral ask_agent sub-transcripts)
 *   'master' | '<slug>' — only rows persisted by that loop (untagged = master).
 * A resumed specialist must see its own exchanges but never the master's
 * find_agent/ask_agent blocks (their tool names are undeclared in its request).
 */
function includeToolRow(m, toolScope) {
  if (toolScope == null) return false;
  if (toolScope === '*') return true;
  return (m.agent ?? 'master') === toolScope;
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

/**
 * Delegate to a specialist as a bounded, conversation-stateless tool loop:
 * the sub-transcript starts from the brief and accumulates the specialist's
 * OWN tool exchanges only (ephemeral — never persisted to the conversation).
 * Reads execute; writes create proposals on the MAIN transcript (agent-tagged,
 * toolCallId null) and the sub-loop closes over a pending marker. tool_use and
 * proposal events bubble to the pane via yield*; the return value keeps the
 * { content, consulted } attribution contract.
 */
async function* toolAskAgent({ agent, brief } = {}, { requestProviderId, signal, conversationId } = {}) {
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
  const subTranscript = [{ role: 'user', content: brief }];
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
    if (text) {
      subTranscript.push({ role: 'assistant', content: text });
      finalText = text;
    }
    if (!toolCalls.length) break;

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

  let content = finalText || `Specialist "${agent}" returned no answer.`;
  if (proposalsMade) {
    // The master's only durable record of sub-loop proposals — robust against
    // a specialist that forgets to mention them.
    content += `\n[The specialist proposed ${proposalsMade} action(s) now awaiting user confirmation — do not claim they were executed.]`;
  }
  return { content, consulted: finalText ? agent : null };
}

/** Execute a master tool → { content, consultedAgent } (consultedAgent set only
 *  when ask_agent got a real specialist answer — drives response attribution).
 *  Generator: sub-loop tool_use/proposal events bubble to the pane. */
async function* executeMasterTool(call, opts) {
  try {
    if (call.name === 'find_agent') return { content: await toolFindAgent(call.input, opts), consultedAgent: null };
    if (call.name === 'ask_agent') {
      const { content, consulted } = yield* toolAskAgent(call.input, opts);
      return { content, consultedAgent: consulted };
    }
    return { content: `Unknown tool: ${call.name}`, consultedAgent: null };
  } catch (err) {
    return { content: `Tool error: ${err.message}`, consultedAgent: null };
  }
}

// -- The agent loop -----------------------------------------------------------

/**
 * Run one card's bounded tool loop over the conversation transcript — the
 * single engine behind master turns, specialist takeovers and confirm-resumes.
 *
 *   masterTools   — include find_agent/ask_agent (master only)
 *   announceAgent — emit { type:'agent' } + persist agent-tagged rows
 *                   (takeovers and specialist resumes)
 *   extraToolDefs — defs injected beyond the card's grants (confirm-resume
 *                   injects the proposal's def so replayed tool history is
 *                   never undeclared)
 *
 * Per round: text streams out; read tools execute inline; write tools become
 * proposals (loop continues — the next round naturally narrates the card);
 * the last round runs tool-less so the model must produce an answer.
 */
async function* runAgentLoop(conversationId, card, {
  masterTools = false,
  announceAgent = false,
  providerId,
  signal,
  extraToolDefs = [],
} = {}) {
  const routingCfg = await getRoutingConfig();
  const scope = masterTools ? MASTER_SLUG : card.slug;
  const maxIterations = Math.max(1, routingCfg.maxToolIterations ?? MAX_TOOL_ITERATIONS);
  const granted = resolveGrantedTools(card);
  const extras = extraToolDefs.filter((d) => !granted.some((g) => g.name === d.name));
  const agentTag = scope === MASTER_SLUG ? {} : { agent: scope };
  const discoverMode = routingCfg.toolDelivery === 'discover';
  const discovered = []; // turn-scoped defs injected by find_tool (discover mode)

  if (announceAgent) yield { type: 'agent', agent: card.slug };

  // Specialists that actually answered via ask_agent this turn — the master's
  // subsequent responses are attributed to them ("via @slug" in the pane).
  const consulted = [];
  for (let iteration = 0; iteration <= maxIterations; iteration++) {
    const finalRound = iteration === maxIterations;
    const transcript = readTranscript(conversationId);
    // Last round runs without tools so the model must produce an answer.
    // static: all granted defs every round. discover: only the find_tool
    // meta-tool until a lookup injects the matched defs (turn-scoped).
    const grantedRound = discoverMode
      ? [...(granted.length ? [FIND_TOOL_DEF] : []), ...discovered]
      : granted;
    const tools = finalRound ? [] : [...(masterTools ? MASTER_TOOL_DEFS : []), ...grantedRound, ...extras];
    // Mode-switch replay defence: if this scope's history contains find_tool
    // calls (recorded under discover mode), keep the def declared — strict
    // dialects reject tool_use blocks whose tool is undeclared.
    if (!finalRound
      && !tools.some((t) => t.name === FIND_TOOL_DEF.name)
      && transcript.some((m) => m.role === 'tool_call' && m.name === FIND_TOOL_DEF.name && (m.agent ?? MASTER_SLUG) === scope)) {
      tools.push(FIND_TOOL_DEF);
    }

    let text = '';
    const toolCalls = [];
    for await (const event of runCardStream(card, transcript, { tools, toolScope: scope, requestProviderId: providerId, signal })) {
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
        ...agentTag,
        ...(consulted.length ? { agents: [...consulted] } : {}),
      });
    }
    if (!toolCalls.length) return; // final answer delivered

    for (const call of toolCalls) {
      const toolCallId = call.id || `tc_${conversationId}_${iteration}_${toolCalls.indexOf(call)}`;
      const def = toolsByName.get(call.name);

      if (masterTools && (call.name === 'find_agent' || call.name === 'ask_agent')) {
        await appendMessage(conversationId, { role: 'tool_call', toolCallId, name: call.name, input: call.input || {} });
        const { content: result, consultedAgent } = yield* executeMasterTool(
          { ...call, id: toolCallId },
          { requestProviderId: providerId, signal, conversationId, card },
        );
        await appendMessage(conversationId, { role: 'tool_result', toolCallId, name: call.name, content: result });
        if (consultedAgent && !consulted.includes(consultedAgent)) {
          consulted.push(consultedAgent);
          yield { type: 'consulted', agents: [...consulted] };
        }
      } else if (call.name === FIND_TOOL_DEF.name) {
        await appendMessage(conversationId, { role: 'tool_call', toolCallId, name: call.name, input: call.input || {}, ...agentTag });
        const { content, defs } = await executeFindTool(call.input, granted);
        for (const d of defs) {
          if (!discovered.some((x) => x.name === d.name)) discovered.push(d);
        }
        await appendMessage(conversationId, { role: 'tool_result', toolCallId, name: call.name, content, ...agentTag });
      } else if (def && def.kind === 'write') {
        // Uniform write semantics: propose, never execute inline.
        await appendMessage(conversationId, { role: 'tool_call', toolCallId, name: call.name, input: call.input || {}, ...agentTag });
        const proposal = await createProposal(conversationId, {
          toolCallId, name: call.name, input: call.input || {}, agent: scope,
        });
        await appendMessage(conversationId, { role: 'tool_result', toolCallId, name: call.name, content: proposalPendingText(call.name), ...agentTag });
        yield { type: 'proposal', proposal };
      } else {
        await appendMessage(conversationId, { role: 'tool_call', toolCallId, name: call.name, input: call.input || {}, ...agentTag });
        const result = await executeAppTool(call);
        await appendMessage(conversationId, { role: 'tool_result', toolCallId, name: call.name, content: result, ...agentTag });
      }
    }
    // Loop continues: next round's transcript includes the tool exchange.
  }
}

// -- Turn orchestration -------------------------------------------------------

// Routing tier thresholds/toggles live in routingConfig (admin → Agents →
// Routing): autoRouteThreshold — a near-exact match (an utterance present in
// the eval-set scores ~1.0) is GROUND TRUTH and routes directly, like an
// implicit @mention; evidenceFloor — weaker matches than this are noise and
// attach no evidence. Read per turn; changes apply on the next message.

/** Run one specialist turn over the conversation (shared by @mention and
 *  ground-truth auto-routing). Uniform tool semantics apply — the specialist
 *  runs the same bounded tool loop as the master, with its own grants. */
async function* runSpecialistTurn(conversationId, slug, { providerId, signal }) {
  const card = readCard(slug);
  if (!card) {
    yield { type: 'error', message: `Agent @${slug} has no valid card on disk.` };
    return;
  }
  yield* runAgentLoop(conversationId, card, { announceAgent: true, providerId, signal });
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

  // The master card's DEFINITION is file-read directly (boot-guaranteed) — the
  // one intentionally non-caller-scoped resolution; see module note. Read
  // before routing: candidate filtering needs the master's tool grants.
  const masterCard = readCard(MASTER_SLUG) || {
    slug: MASTER_SLUG, name: 'Master', agentMd: FALLBACK_SYSTEM, aiProviderId: null, payloadTemplate: null,
  };

  // -- Structural routing consultation ---------------------------------------
  // The routing corpus must not depend on the master CHOOSING to look: run the
  // query server-side (one local embed) on every master turn. A near-exact
  // eval-set match routes directly (ground truth); anything above the noise
  // floor is attached to the transcript as a ready-made find_agent exchange,
  // so the master decides WITH the evidence in front of it (and saves the
  // round-trip of calling the tool itself).
  const routingCfg = await getRoutingConfig();
  let takeover = null;
  let evidence = null;
  try {
    const { candidates } = await findAgent(userMessage);
    const filtered = await filterCandidates(candidates, masterCard);
    if (filtered.length) {
      const top = filtered[0];
      // Auto-route (takeover) requires the top candidate to be AGENT-kind: a
      // tool can't front a turn (its arguments still need the model), and a
      // higher-scoring tool match means the utterance is an action request —
      // taking over with a lower-ranked agent would be wrong. Tool matches are
      // evidence-only.
      if (top.kind === 'agent'
        && routingCfg.autoRouteEnabled !== false && top.score >= routingCfg.autoRouteThreshold) {
        takeover = top.target;
      } else if (routingCfg.evidenceEnabled !== false && top.score >= routingCfg.evidenceFloor) {
        evidence = filtered.slice(0, Math.max(1, routingCfg.maxCandidates));
      }
    }
  } catch (err) {
    // Routing must never block the conversation (e.g. embedding model missing).
    console.warn(`Routing consultation failed (continuing without evidence): ${err.message}`);
  }

  if (takeover) {
    yield* runSpecialistTurn(conversationId, takeover, { providerId, signal });
    return;
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

  // -- Master turn with tool loop --------------------------------------------
  yield* runAgentLoop(conversationId, masterCard, { masterTools: true, providerId, signal });
}

// -- Proposal lifecycle (confirm/decline endpoints) ---------------------------

/**
 * Execute a confirmed proposal's write tool under the CALLER's ALS identity
 * (the pipeline re-validates roles/locks/fls naturally) and append the
 * resolution row. Returns { status: 'confirmed'|'failed', content }.
 */
export async function executeProposal(conversationId, proposal) {
  let status = 'confirmed';
  let content = '';
  // Definition → handlerName → fn; a definition deleted or disabled between
  // proposal and confirm resolves to no handler → the failed path.
  const def = toolsByName.get(proposal.name);
  const handler = def ? appHandlers[def.handlerName]?.fn : undefined;
  if (!handler) {
    status = 'failed';
    content = `Tool "${proposal.name}" is no longer available.`;
  } else {
    try {
      content = await handler(proposal.input || {});
    } catch (err) {
      status = 'failed';
      content = err.message;
    }
  }
  await appendMessage(conversationId, {
    role: 'proposal_resolution', proposalId: proposal.proposalId, name: proposal.name, status, content,
  });
  return { status, content };
}

/** Append a declined resolution row. No model call. */
export async function declineProposal(conversationId, proposal) {
  await appendMessage(conversationId, {
    role: 'proposal_resolution', proposalId: proposal.proposalId, name: proposal.name, status: 'declined', content: '',
  });
  return { status: 'declined' };
}

/**
 * Resume the proposing card's loop after a confirm (success OR failure — the
 * model narrates either). The proposal's own tool def is force-injected so
 * replayed tool_call history is never undeclared, even if the grant was
 * revoked between proposal and confirm.
 */
export async function* resumeAfterProposal(conversationId, proposal, { providerId, signal } = {}) {
  const isMasterProposal = !proposal.agent || proposal.agent === MASTER_SLUG;
  const card = (!isMasterProposal && readCard(proposal.agent)) || readCard(MASTER_SLUG) || {
    slug: MASTER_SLUG, name: 'Master', agentMd: FALLBACK_SYSTEM, aiProviderId: null, payloadTemplate: null,
  };
  const resumingAsMaster = card.slug === MASTER_SLUG;
  const def = toolsByName.get(proposal.name);
  yield* runAgentLoop(conversationId, card, {
    masterTools: resumingAsMaster,
    announceAgent: !resumingAsMaster,
    providerId,
    signal,
    extraToolDefs: def ? [def] : [],
  });
}

export { MASTER_TOOL_DEFS };
