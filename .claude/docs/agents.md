# Agents — Wiring Doc

> **Status:** Phases 1 ("it talks"), 2 ("it routes"), 3 ("it delegates"), the tools phase ("it acts": per-card tool grants, in-loop execution, action-card write confirmations, tools in the routing corpus) and admin-managed tool DEFINITIONS (definitions in `agent-tools.db`, handlers stay code — see the runbook) implemented. Beyond that (see `## Roadmap`): RAG Provider knowledge consumption, `.cred` secrets vault, a generic declarative handler (runtime-registrable behaviour).

The agent layer: a **master agent** (the reserved `master` card) fronts every Copilot-pane conversation, routes via a `find_agent` tool (local-embeddings RAG over card descriptions + tool descriptions + eval exemplars) and delegates via `ask_agent` (conversation-stateless specialist sub-loops). `@slug` mentions route a single turn directly. Cards are **file-led folders** holding per-card **app-tool grants**; reads execute in-loop under the caller's identity, writes become **action-card proposals** the user must confirm. Providers are declarative payload templates; visibility = talkability via the role engine.

## Overview

- **AI Providers** — a provider-agnostic abstraction over any chat completion API. A provider record carries endpoint semantics, a declarative **payload template** (JSONPath-style placeholders + a bounded per-role iteration node), a `wireFormat` decoder selector, and a masked API key. New provider (cloud or local model exposed via OpenAI/Anthropic/Gemini schema) = a new record, not new code.
- **Conversations** — the Copilot pane's stateful threads. Thin DB doc + on-disk JSONL transcript.
- **Master loop** — P1 placeholder master: resolves a provider, renders the template from the transcript, calls upstream, decodes the response, and streams neutral events to the pane over SSE.

## File chain

### AI Providers (admin-surface only; standalone store; excluded from backups)
| Layer | File |
|---|---|
| DB (standalone, unwrapped) | `server/db/aiProviders.js` → `ai-providers.db` |
| Service | `server/services/aiProviderService.js` (CRUD, `maskSecret`, `getRawById`, `testConnection`, `ensureDefaults`) |
| Route (admin surface only) | `server/routes/aiProviders.js` → mounted at `/admin/api/ai-providers` |
| Admin UI | `admin/src/pages/agents/AiProvidersPage.jsx` (list + Dialog form) |
| Admin API client | `admin/src/api/index.js` → `aiProvidersApi` |
| Admin nav | `admin/src/layouts/AdminLayout.jsx` → "Agents" group |

### Conversations (main surface; pipeline-wrapped; included in backups)
| Layer | File |
|---|---|
| DB (wrapped) | `server/db/index.js` → `conversations.db` (+ `collectionsByName`, `mkdir conversations/`) |
| Registry | `shared/authz/registry.js` → `TABLES` includes `conversations` |
| Service | `server/services/conversationService.js` (thin doc + `transcript.jsonl` on disk) |
| Master loop | `server/services/agentChatService.js` (`streamTurn` async generator) |
| Route (SSE chat) | `server/routes/conversations.js` → `/api/conversations`, `POST /:id/messages` (SSE) |
| User API client | `app/src/api/index.js` → `conversationsApi`; SSE via `app/src/api/copilotStream.js` |
| User UI | `app/src/components/copilot/` (CopilotPane, ConversationList, ChatView, ChatInput) + `app/src/layouts/AppLayout.jsx` (toggle + pane) |

### Provider engine (shared, pure)
| Concern | File |
|---|---|
| Template render (placeholders + `$forEachMessage`) | `server/services/templateEngineService.js` |
| Response decoders (`anthropic-sse`, `openai-sse`, `gemini-sse`, `json`) | `server/services/streamDecoders.js` |

### Routing (Phase 2 — admin-surface only; eval-set included in backups)
| Layer | File |
|---|---|
| Embeddings (local) | `server/services/embeddingService.js` (`@xenova/transformers`; model from routingConfig, default `Xenova/all-MiniLM-L6-v2`; native onnx on dev, WASM in the Alpine image; weights cached at `DATA_DIR/models`) |
| Vector index + routing + eval harness | `server/services/routingService.js` (flat file `DATA_DIR/rag/routing-index.json`, brute-force cosine, `findAgent`, leave-one-out `runEvals`) |
| Eval-set DB (standalone) | `server/db/evalExamples.js` → `eval-examples.db` |
| Eval-set service | `server/services/evalService.js` (CRUD, `runEvals`; invalidates the index on mutation) |
| Route (admin surface only) | `server/routes/evalExamples.js` → `/admin/api/eval-examples` (+ `POST /run`) |
| Admin UI (eval-set) | `admin/src/pages/agents/EvalSetPage.jsx` (CRUD + Run Evals accuracy/confusion report) |
| Engine config (single doc, backed up) | `server/db/routingConfig.js` → `routing-config.db`; `server/services/routingConfigService.js` (defaults = original constants) |
| Engine routes (admin) | `server/routes/routing.js` → `/admin/api/routing` (config, defaults, status, rebuild, tier-aware probe) |
| Admin UI (engine) | `admin/src/pages/agents/RoutingPage.jsx` (behaviour + advanced config, index status/rebuild, route probe with tier badge) |
| Admin API client | `admin/src/api/index.js` → `evalExamplesApi` |

### App tool definitions (admin-surface only; standalone store; INCLUDED in backups)
| Layer | File |
|---|---|
| DB (standalone, unwrapped) | `server/db/agentToolDefs.js` → `agent-tools.db` (unique index on `name`) |
| Handler registry + effective-tool cache | `server/services/agentToolRegistry.js` (`handlers{}` = code, `tools[]`/`toolsByName` = hydrated cache, `reloadTools`, `seedDefinitions`, `canUseTool`) |
| Service | `server/services/agentToolService.js` (CRUD, `listHandlers`, `ensureDefaults`; every mutation reloads the cache + invalidates the routing index) |
| Route (admin surface only) | `server/routes/agentTools.js` → `/admin/api/agent-tools` (+ `GET /handlers`) |
| Admin UI | `admin/src/pages/agents/AgentToolsPage.jsx` (list + Dialog form, handler dropdown, kind/enabled/missing-handler badges) |
| Admin API client | `admin/src/api/index.js` → `agentToolsApi` |
| Admin nav | `admin/src/layouts/AdminLayout.jsx` → "Agents" group → App Tools |
| Boot hook | `server/index.js` `app.listen` → `runAsSystem(() => ensureAgentToolDefaults())` (inserts any missing seed definitions by name, always hydrates the cache) |

## Golden rules

1. **Payload templates are stored as JSON strings in NeDB.** NeDB rejects object keys starting with `$` (e.g. `$forEachMessage`) or containing `.`. `aiProviderService` serialises the template on write and hydrates it on every read (`getAll`/`getById`/`getRawById`). Templates are objects everywhere else.
2. **AI provider secrets never enter backups.** `ai-providers.db` is a standalone store, not registered in `backupService`. Conversation data (thin docs + transcripts) IS backed up.
3. **`getRawById` is internal only.** It returns the real API key + hydrated template for the master loop / test-connection. Every HTTP-facing read goes through `mask()`.
4. **Masked-key retention:** an incoming `apiKey` containing `*` (or blank) keeps the stored value (aiConfig idiom).
5. **SSE errors after streaming begins are SSE `error` events, never `respondError`.** Once `res.flushHeaders()` has run, the route emits `data: {type:'error',...}` and ends the stream. Pre-stream failures (missing conversation, empty message) still use normal HTTP status codes.
6. **The master turn runs in the caller's ALS context.** The chat request's identity scope is preserved throughout — no `runAsSystem` around the loop. (P3: even the master card's tool calls run caller-scoped; only the master card *definition* read is system-scoped.)
7. **Conversation privacy is a role pre-filter, not service logic.** `conversations` is pipeline-wrapped; a role filter like `{ createdBy: '$$user.email' }` scopes reads. `conversationService` does no ownership filtering of its own. Legacy mode (AUTH off) = all visible.
8. **Assistant/AI output is untrusted — render it through `SafeMarkdown`.** AI responses can echo attacker-controlled content (external ticket titles, ICS event text, AI-parsed bank descriptions), and `MDEditor.Markdown` hardcodes `rehype-raw` (raw HTML executes; `skipHtml` is ignored by that component). The shared `app/src/components/SafeMarkdown.jsx` injects `rehype-sanitize` (runs after rehype-raw) to strip scripts/event-handlers/unsafe URLs while preserving code blocks. **Never render untrusted content with `MDEditor.Markdown` directly** — use `SafeMarkdown`. Current consumers: the Copilot `ChatView` and the daily-plan recap/briefing + timesheet-note previews. Only trusted, author-controlled content (Help topics) may use the raw renderer.
9. **Conversation ids are validated before touching the filesystem.** `conversationService` gates every on-disk path (`getConversationDir`/`getTranscriptPath`) behind `assertValidId` (charset `[A-Za-z0-9_-]{1,64}`) so a crafted id can never escape `DATA_DIR/conversations/` — defence-in-depth independent of the `findOne({_id})` gate each caller already performs.

## Template language (see `templateEngineService.js`)

- `{{$.path}}` — resolves from the root context (`model`, `system`, `messages`, `apiKey`).
- `{{$m.path}}` — resolves from the current message inside a `$forEachMessage` node.
- A string that is EXACTLY one placeholder yields the raw value (number/array/object); embedded placeholders interpolate as text.
- `{ "$forEachMessage": { "user": {...}, "assistant": {...}, "tool": {...} } }` → an array with one rendered sub-template per transcript message, keyed by role (unlisted roles skipped).

## wireFormat decoders (see `streamDecoders.js`)

Each yields neutral events `{ type: 'text'|'thinking'|'tool_use'|'stop'|'error', ... }`:
- `anthropic-sse` — Messages API SSE (`content_block_delta` text/thinking/input_json, `message_delta` stop).
- `openai-sse` — Chat Completions SSE (`choices[].delta`, `[DONE]`).
- `gemini-sse` — `generateContent` streaming (`candidates[].content.parts`).
- `json` — non-streaming; extracts text via the provider's `responseTextPath` (default `content.0.text`).

## Cross-entity consumers

- `server/services/backupService.js` — includes `conversations` (DB export + `files/conversations` dir) and `agentTools` (`agent-tools.db`, no secrets); excludes `ai-providers`. Restore ends with `reloadTools()` + `invalidateIndex()` so restored definitions go live without a restart.
- `server/routes/mcp.js` — consumes the shared `agentToolRegistry.js` cache (`tools[]`/`toolsByName`) + `handlers{}`; `tools/list` strips the merged metadata (`kind`/`access`/`handlerName`) so the MCP wire surface stays exactly `{name, description, inputSchema}`; `tools/call` resolves definition → `handlerName` → `fn`.

## Blast radius (verify after changes)

- Provider template edits: re-run a chat turn (SSE) and confirm the rendered payload is accepted by the upstream endpoint.
- New wireFormat: add a decoder in `streamDecoders.js` AND the option in `AiProvidersPage.jsx` `WIRE_FORMATS` AND `SUPPORTED_WIRE_FORMATS` validation.
- New collection field on conversations: thin-doc only — transcripts live on disk, not in the DB.
- Backup format changes: confirm restore round-trips conversation transcripts (restore clears file dirs then copies).
- Registry/definition changes: MCP `tools/list` must stay exactly `{name, description, inputSchema}` per tool (entry-shape-diff it; ordering is by name since the cache sorts, not code-declaration order); the routing index hash covers tool descriptions, so description/enabled edits rebuild the index on next use. Definition edits are RUNTIME data (cache reload + index invalidate on every mutation — no restart); handler changes in `agentToolRegistry.js` require a restart.
- Transcript row shapes (proposal/resolution/tool tags): check ALL THREE consumers — `mapMessages` (provider context), `foldTranscript` (detail endpoint), and the pane's `ChatView`/`CopilotPane` event handling.
- Loop changes: re-run the scripted mock-provider scenario suite (read exec, proposal, confirm-resume, decline, sub-loop, grant filter, discover mode) against an isolated `DATA_DIR` — never the production data dir.

### Agent cards & delegation (Phase 3)
| Layer | File |
|---|---|
| Card service (file-led folders, scan/rescan, `ensureMasterCard`) | `server/services/agentCardService.js` — folders at `DATA_DIR/agents/{slug}/` (`manifest.json` incl. `tools: [grants]`, `agent.md`, optional `payload_template.json`, `knowledge/`, `skills/`) |
| Index collection (wrapped, rebuildable) | `server/db/index.js` → `agents` (+ `shared/authz/registry.js` TABLES); index doc projects `tools` |
| App tool registry (shared with MCP) | `server/services/agentToolRegistry.js` — `handlers{}` in CODE (`{ kind, access, fn }` per handler, fn = named function reference) + `tools[]`/`toolsByName` live-binding CACHE hydrated from `agent-tools.db` by `reloadTools()`; `routes/mcp.js` imports it and STRIPS the metadata on `tools/list` |
| Agent loop + delegation | `server/services/agentChatService.js` (`streamTurn`, `runAgentLoop` — the one engine behind master turns / takeovers / confirm-resumes; `find_agent`/`ask_agent`/`find_tool`, bounded specialist sub-loops, read-exec + write-proposal dispatch, `assertChatAccess`, `executeProposal`/`declineProposal`/`resumeAfterProposal`) |
| Routes | `server/routes/agents.js` — dual-mounted: `/api/agents` (read-only, caller-scoped picker) + `/admin/api/agents` (CRUD + `POST /rescan` + `GET /tools` → `{name, description, kind, access}`); `server/routes/conversations.js` — `POST /:id/proposals/:pid/confirm` (SSE) + `/decline` (JSON) with an in-flight Set against double-confirm |
| Admin designer | `admin/src/pages/agents/AgentCardsPage.jsx` + `AgentCardEditPage.jsx` (copy-on-write template, keep-and-warn on provider switch, **Tools section** — grant checkboxes with read/write badges + stale-grant revoke) |
| App pane UI | `app/src/components/copilot/ChatInput.jsx` (picker), `ChatView.jsx` (role filter + @agent tags + proposal rows), `ActionCard.jsx` (Confirm/Decline card), `CopilotPane.jsx` (shared stream handler, confirm/decline wiring), `app/src/api/copilotStream.js` (`streamSse`/`streamChat`/`streamProposalConfirm`) |
| Boot hook | `server/index.js` `app.listen` → `ensureMasterCard()` then `scanAgents()` |

## Golden rules — Cards & delegation (Phase 3)

14. **The card folder is the truth; the `agents` collection is a disposable index.** Admin CRUD writes files then calls `scanAgents()`; hand-edited/dropped-in folders appear after boot or the admin Rescan button. Never write card fields to the DB directly.
15. **Slug = folder name = @mention handle**, strict charset `[a-z0-9][a-z0-9-]{1,48}` (path-safe, immutable after create). `master` is reserved: boot-guaranteed, undeletable, never disabled, excluded from routing candidates.
16. **Template resolution: `card payload_template.json ?? provider template`** (absent-means-inherit, like rate inheritance). Copy-on-write in the designer: the editor shows the provider's template until deliberately edited; provider switch with an override = keep + warn, never silently destroyed.
17. **The no-leak boundary**: the ONLY non-caller-scoped resolution in a turn is reading the master card's own definition files. @mention resolution, `find_agent` candidates and `ask_agent` targets all go through the caller-scoped wrapped `agents` collection (invisible ⇒ not-found). The chat access gate (`assertChatAccess` = caller-scoped `agents.count`) runs BEFORE the SSE stream opens.
18. **Tool exchanges are transcript rows** (`role: 'tool_call'|'tool_result'` with `toolCallId`/`name`), persisted by the chat service as they happen; the pane filters them out of bubbles. Rows persisted by non-master loops carry an `agent: slug` tag, and provider context is built with a **toolScope** (`mapMessages`): `null` = no tool rows (tool-less rounds — providers reject tool blocks with no tools declared), `'*'` = all (ephemeral sub-transcripts), `'master'|slug` = only that loop's rows (untagged = master). A resumed specialist sees its own exchanges but never the master's `find_agent`/`ask_agent` blocks — their tool names would be undeclared in its request.
18b. **Every specialist contribution is attributed, regardless of orchestration path.** Direct takeover (@mention / ground-truth auto-route) persists the reply with `agent: slug` and streams an `{type:'agent'}` event → pane caption `@slug`. Master delegation persists the master's post-delegation text with `agents: [slugs]` (only specialists that ACTUALLY answered via `ask_agent` count) and streams `{type:'consulted', agents}` → pane caption `via @slug[, @slug]`. Master-only answers carry no attribution. `executeMasterTool` returns `{content, consultedAgent}` to drive this — keep that contract when adding master tools.
19. **Tool wire-shaping is keyed by wireFormat, both directions**: `shapeTools()` (encode) and the decoders (tool_use events) live in `streamDecoders.js`; templates carry `"tools": "{{$.tools}}"` plus `tool_call`/`tool_result` role sub-templates. A template without those nodes simply can't tool-call (the master then answers directly) — after upgrading, re-apply the provider preset once.
20. **Specialist sub-loops are CONVERSATION-stateless bounded tool loops**: brief in + the specialist's OWN ephemeral tool exchanges (never persisted, never conversation-visible), answer out. No conversation access — the master's `ask_agent` brief must be self-contained (the master's agent.md says so). Sub-loop reads execute; sub-loop writes escape to the MAIN transcript as proposal rows (`agent: slug`, `toolCallId: null`) and the master's `ask_agent` tool_result gets a server-appended marker (`[The specialist proposed N action(s)…]`) so the master can never claim they executed. Sub-loop `tool_use`/`proposal` events bubble to the pane via generator delegation (`yield*` through `executeMasterTool`/`toolAskAgent`), preserving the rule-18b `{content, consultedAgent}` return contract.
21. **Routing consultation is STRUCTURAL, not model-discretionary.** Every master turn, `streamTurn` runs the routing query server-side (one local embed) BEFORE the model call, in three tiers, ALL governed by `routingConfig` (admin → Agents → Routing; read per turn, no restart): top filtered candidate is **agent-kind** AND score ≥ `autoRouteThreshold` (default 0.92 — effectively "this utterance is in the eval-set") ⇒ ground-truth direct takeover by the specialist (implicit @mention, `agent` event, no master round; `autoRouteEnabled` toggles the tier; tool-kind tops never take over — rule 26); score ≥ `evidenceFloor` (default 0.3, `evidenceEnabled` toggles) ⇒ a synthetic `find_agent` tool exchange (`auto: true` rows, mixed-kind candidates) is appended to the transcript so the master decides WITH evidence (also saves the round-trip of the model calling the tool); below floor ⇒ nothing attached (small talk stays clean). The master card is read BEFORE the consultation (its grants drive tool-candidate filtering). The master still holds `find_agent` for refined re-queries. Rationale: the eval-set must never depend on the model *choosing* to look — an exact exemplar match that didn't route (because the master answered from general knowledge) is how this shipped broken once. Routing failures never block the turn (warn + continue without evidence).
22. **Routing engine knobs are config, not constants.** `routingConfig` (single doc, no secrets, INCLUDED in backups) carries: tiers (`autoRouteEnabled/Threshold`, `evidenceEnabled/Floor`, `maxCandidates`) and advanced (`topK`, `aggregation` max|mean, `embeddingModel`, corpus toggles `includeEvalExamples`/`includeCardDescriptions`/`includeToolDescriptions`, `maxToolIterations`, `toolDelivery` static|discover — rule 27). Consumers read it per turn. The **embedding model id is part of the index hash** (with the corpus), so changing model or corpus toggles rebuilds the index lazily on next use; the per-model extractor cache in `embeddingService` swaps pipelines. Caveat the page hints at: `aggregation: mean` dilutes exact exemplar matches (an exact hit averaged with weaker matches can drop below the auto-route threshold) — max is the ground-truth-friendly default.
23. **The master card's `agent.md` is user-owned — code-default changes don't propagate.** `ensureMasterCard` only creates the file when missing; existing installs keep their prompt. When `DEFAULT_MASTER_AGENT_MD` changes materially (e.g. the evidence-first guidance; the tools phase added read/write tool semantics, action-card behaviour and kind-tagged evidence), the release notes/summary must tell operators to refresh their master card's agent.md in the designer.

## Golden rules — Tools & action cards

24. **Uniform tool semantics at any depth** (master loop, @mention/auto-route takeover, `ask_agent` sub-loop): granted **read** tools execute immediately under the caller's ALS identity — the pipeline enforces roles/record-scoping/fls with zero extra code; handler errors become result text (`Tool error: …`) so the loop continues. Granted **write** tools (handler `kind: 'write'`) NEVER execute inline: the loop appends a `proposal` row + a pending tool_result stating the write did NOT run, emits an SSE `{type:'proposal'}` event, and continues normally (the next round narrates the card). Grants live in `manifest.json` `tools: [names]`; assembly (`resolveGrantedTools`) warns+skips stale names and pre-filters via `canUseTool` (handler `access: {table, op}` vs the caller's grants) so a caller is never offered a tool that is guaranteed to be denied.
25. **Proposals are append-only transcript rows, folded on read.** `{role:'proposal', proposalId, toolCallId|null, name, input, agent}` + `{role:'proposal_resolution', proposalId, name, status: confirmed|declined|failed, content}` — never rewrite the JSONL. `conversationService.getById` folds resolutions into the proposal (`status`/`result`) and drops resolution rows; `readTranscript` (provider path) stays raw. In provider context (`mapMessages`): proposal rows are skipped (their tool_call + pending tool_result pair, or the rule-20 marker, already represents them); resolution rows map to **user-role** bracketed text (`[action-card X] The user CONFIRMED/DECLINED/… `) — user-role because it renders on all four wireFormats with no template changes AND survives tool-less rounds. Proposals stay confirmable until acted on; confirm executes under the CALLER's identity (natural re-validation), appends the resolution, then **resumes the proposing card's loop** (`proposal.agent` selects the card; master fallback) with the proposal's tool def force-injected so replayed tool history is never undeclared. Failed executions also resume — the model narrates the failure. Double-confirm is closed by a route-level in-flight Set + the durable resolution row (409).
26. **Tool routing matches are evidence-only.** Corpus entries carry deterministic `kind: 'agent'|'tool'`; only agent-kind candidates can auto-route (a tool's arguments still need the model, and a top-scoring tool match means the utterance is an action request — a takeover by a lower-ranked agent would be wrong). `filterCandidates` scopes per acting card: agent-kind through the caller-scoped `agents` collection, tool-kind through the card's grants + `canUseTool`. The probe endpoint applies the same agent-kind auto-route rule.
27. **Tool delivery is config, not code** (`routingConfig.toolDelivery`): `static` (default) injects all granted defs every round — best selection quality at the current 10-tool registry; `discover` gives any card with grants ONE `find_tool` meta-tool whose handler runs deterministic filters (kind=tool ∧ granted ∧ privilege-passing) then a cosine sort (`rankTools`; falls back to unranked granted tools if the tool corpus toggle is off), and injects the matched defs **for the rest of the current turn only** (next turn rediscovers). Confirm-resume always injects the proposal's own def regardless of mode; historic `find_tool` rows keep the meta-tool declared even after switching back to static (mode-switch replay defence).
28. **Tool DEFINITIONS are admin data; HANDLERS (and their safety metadata) are code.** Definitions live in `agent-tools.db` (`{name, description, inputSchema, handlerName, enabled}`): `name` is IMMUTABLE after create (the join key for card grants, transcripts, proposals, eval examples and the routing corpus — the slug rule); `inputSchema` is stored as a plain object with `$`-prefixed/dotted keys REJECTED at save (NeDB constraint — schemas must be self-contained, no `$ref`/`$defs`); `handlerName` must exist in the code `handlers{}` at save time. The effective tool = enabled definition merged with its handler's `kind`/`access` by `reloadTools()`; disabled or handler-stale definitions are warn+excluded from the cache (self-heal: grants skip, MCP omits, corpus drops, pending proposals fail "no longer available"). Execution ALWAYS resolves definition → `handlerName` → `fn`, never `handlers[toolName]` directly — N definitions may map onto one handler (variants). `kind`/`access` are deliberately NOT admin-editable: an admin edit can never turn a write handler into an unconfirmed inline execution.

## Golden rules — Routing (Phase 2)

10. **The routing index is derived and rebuildable — never a source of truth.** `DATA_DIR/rag/routing-index.json` holds embedded exemplar vectors keyed by a **corpus hash** (sha256 of the eval examples). `getIndex()` rebuilds when the hash mismatches (examples changed, even across a restart); eval mutations call `invalidateIndex()`. It is NOT backed up (rebuilds from `eval-examples.db`, which IS).
11. **`runEvals` is leave-one-out.** Each example is routed with itself excluded from the pool (`findAgent(u, {excludeId})`), or every example would trivially match itself and accuracy would be a meaningless 100%. Keep the exclusion when changing the harness.
12. **The routing corpus = eval exemplars + enabled card descriptions + enabled tool-definition descriptions** (`source: 'eval' | 'card' | 'tool'`, master excluded), every entry kind-tagged (`kind: 'agent'|'tool'`; eval entries take it from `targetKind`, toggle `includeToolDescriptions` gates tool entries). `rank()` groups by `kind:label` so an agent slug and a tool name can never collide; agent-kind candidates keep the legacy `agent` field, tool-kind carry `tool` + `description`. Corpus loads read cards under `runAsSystem` — the index is GLOBAL and derived; per-caller visibility AND per-card tool grants are applied to CANDIDATES (`filterCandidates` in the chat service), never baked into the index. `runEvals` scores eval examples only (cards/tools stay in the retrieval pool) with kind-prefixed labels (`agent:vat-help` / `tool:create_timesheet`).
13. **Routing labels are card slugs.** `expectedAgent` on eval examples and `label` on card entries are the same namespace — the card's `@slug`. Renaming a card breaks its eval examples; curate accordingly.

## Adding / retiring a tool (runbook)

A tool = a DEFINITION (`{name, description, inputSchema, handlerName, enabled}` — admin data in `agent-tools.db`, managed at admin → Agents → App Tools) + a HANDLER (`{ kind, access, fn }` — code in `server/services/agentToolRegistry.js`). Behaviour is code; what the model sees is runtime data (golden rule 28).

**New capability** (new behaviour): add a named handler function + a `handlers{}` entry (with `kind: 'read'|'write'` and `access: {table, op}`) to the registry, restart, then create a definition for it in the admin UI (or extend `seedDefinitions` — missing seeds are inserted on the next boot of every install; admins opt out of a default by disabling it, since a deleted default returns at boot). The handlers dropdown in the definition editor is derived from `Object.keys(handlers)` — no separate list to maintain.

**New variant** (existing behaviour, different name/description/schema): admin-only — create a definition mapping the existing handler. No code, no restart.

**Edit / retire a definition**: admin-only, runtime — edit description/schema/mapping, disable (reversible) or delete. Every mutation reloads the cache + invalidates the routing index; downstream follows automatically: MCP `tools/list` (metadata stripped), the `/admin/api/agents/tools` endpoint → card-designer checkboxes, the routing corpus (description embeds — corpus hash changes, index rebuilds lazily), the eval-set tool dropdown, static/discover delivery. No card is affected until an admin grants the tool.

**Remove a handler** (code change + restart): definitions still mapping it go stale — warn+excluded from the cache, badged "missing handler" on the App Tools page. Downstream self-heals exactly like a disabled definition: card manifests still listing the name warn+skip at assembly (grant kept in case it returns); pending action cards for it resolve as `failed` with a clear message on Confirm; its corpus entry disappears on the next hash check; eval examples targeting it start showing as misroutes in Run Evals — the curation signal to delete or relabel them.

## Roadmap (beyond the tools phase — reserved conversations)

- **RAG Providers**: knowledge/ folder consumption behind a retrieval-provider abstraction (parked design conversation).
- **`.cred` encrypted secrets vault** + encryption-key custody (parked).
- **Generic declarative handler**: the definitions half is DONE (admin-managed `agent-tools.db`, this doc). The remaining half is runtime-registrable BEHAVIOUR — JSON tool cards (service/endpoint + arg mapping) executed by one generic reviewed handler, so a new capability needs no code change; meshes with the dormant `skills/` folders (parked design conversation).

## Lessons learned

- **Provider records must ONLY be read through `aiProviderService` (`getRawById`/`getDefaultRaw`).** Those hydrate the stored `payloadTemplate` JSON string back to an object. Reading the raw store directly hands `renderTemplate` a string → the rendered body is a string → upstream rejects with "The request body must be a JSON object, got str." This exact bug shipped once via the default-provider fallback path. `streamTurn` now also guards that the rendered body is a plain object before posting.
- **Upstream auth errors mask body-shape errors.** Anthropic validates the API key BEFORE the body, so a smoke test with a fake key returns 401 and never exercises body validation. Verify outgoing request shape against a local mock endpoint (see the mock-provider test pattern), not just against the real API with a fake key.
- **SSE responses are HTTP 200 — errors inside them are invisible to the logs by default.** The conversations route's `send()` is the choke point: every `{type:'error'}` event forwarded to the pane is also `console.warn`ed server-side. Keep it that way when adding event types.
- **The transcript owns the current user message.** The route appends it via `appendMessage` BEFORE calling `streamTurn`; `buildContext` maps the transcript verbatim and must not push the message again (shipped once as a duplicated final user turn on every request).
- **Copy-pasted keys/headers carry invisible Unicode that breaks fetch().** A pasted API key or header value containing e.g. U+2060 (word joiner) or a zero-width space fails header encoding with the cryptic "Cannot convert argument to a ByteString (…value of NNNN…)". `renderHeaders` strips the known invisibles + NBSP at render time (covers already-stored dirty values) and throws a NAMED, positioned error for any other non-Latin-1 char; `aiProviderService.cleanSecret` also cleans keys at save time (mask-retention would otherwise keep a dirty key forever). Keep regexes for these as `\uXXXX` escapes — never literal invisible characters in source.
- **transformers.js uses the NATIVE onnx backend under Node — the Alpine image must stub it to WASM.** Both `@xenova/transformers` (v2, in use) and `@huggingface/transformers` (v3) statically import and select `onnxruntime-node` whenever `process.release.name === 'node'`; there is NO supported switch to force WASM in Node (the original "WASM on Alpine" plan was a false premise — a macOS smoke test silently used the native darwin binding). On musl Alpine the glibc-linked binding fails at first embed (`Error loading shared library ld-linux-*.so`), and the obvious shim — `apk add gcompat` — makes it WORSE: the binding then loads but **segfaults (exit 139) at import**. The working fix (Dockerfile runtime stage): replace the nested `onnxruntime-node` package with a stub re-exporting `onnxruntime-web`, `sed`-patch the backend chooser to the web branch (guarded by a `grep` that fails the build if the line changes), and set `env.backends.onnx.wasm.numThreads = 1` in `embeddingService` (ort-web's threaded WASM spawns `blob:` workers Node rejects). Result: native backend on macOS dev, single-threaded WASM in the container (~100ms/embed — fine at this corpus size). **Verify embedding changes IN the container** — local macOS runs prove nothing about the Alpine path.

- **NeDB `$`/`.` key constraint bites declarative templates.** The `$forEachMessage` node can't be stored as a live object; serialise to a string (this doc, golden rule 1). The roles engine hit the same wall and key-escapes instead — for templates, whole-string JSON is simpler.
- **The local `.env` sets `AUTH_ENABLED=true`.** Backend smoke tests against the identity-gated `/api` surface need a Cloudflare identity header, or run with `AUTH_ENABLED=false` + an isolated `DATA_DIR` to exercise legacy single-user behaviour without touching production data.
- **Seed is fire-and-forget after `app.listen`.** `ensureDefaults()` runs async in the listen callback, so the very first request after boot can race ahead of the seed insert. Harmless (idempotent; admin adds providers well after boot), but don't assert a provider exists in the first millisecond of boot.
