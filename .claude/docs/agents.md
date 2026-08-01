# Agents — Wiring Doc

> **Status:** Phases 1 ("it talks"), 2 ("it routes") and 3 ("it delegates") implemented — the full v1 agent layer. Beyond v1 (see `## Roadmap`): tool grants to specialists, action-card writes, RAG Provider knowledge consumption, `.cred` secrets vault.

The agent layer: a **master agent** (the reserved `master` card) fronts every Copilot-pane conversation, routes via a `find_agent` tool (local-embeddings RAG over card descriptions + eval exemplars) and delegates via `ask_agent` (stateless specialist sub-loops). `@slug` mentions route a single turn directly. Cards are **file-led folders**; providers are declarative payload templates; visibility = talkability via the role engine.

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

- `server/services/backupService.js` — includes `conversations` (DB export + `files/conversations` dir); excludes `ai-providers`.
- `server/routes/mcp.js` — the provider-neutral `tools[]`/`handlers{}` registry. P3 extracts it to `agentToolRegistry.js` so the master loop can call the same handlers; the MCP surface is unchanged.

## Blast radius (verify after changes)

- Provider template edits: re-run a chat turn (SSE) and confirm the rendered payload is accepted by the upstream endpoint.
- New wireFormat: add a decoder in `streamDecoders.js` AND the option in `AiProvidersPage.jsx` `WIRE_FORMATS` AND `SUPPORTED_WIRE_FORMATS` validation.
- New collection field on conversations: thin-doc only — transcripts live on disk, not in the DB.
- Backup format changes: confirm restore round-trips conversation transcripts (restore clears file dirs then copies).

### Agent cards & delegation (Phase 3)
| Layer | File |
|---|---|
| Card service (file-led folders, scan/rescan, `ensureMasterCard`) | `server/services/agentCardService.js` — folders at `DATA_DIR/agents/{slug}/` (`manifest.json`, `agent.md`, optional `payload_template.json`, `knowledge/`, `skills/`) |
| Index collection (wrapped, rebuildable) | `server/db/index.js` → `agents` (+ `shared/authz/registry.js` TABLES) |
| App tool registry (shared with MCP) | `server/services/agentToolRegistry.js` (`tools[]` + `handlers{}`; `routes/mcp.js` imports it) |
| Master loop + delegation | `server/services/agentChatService.js` (`streamTurn`: @mention takeover, master tool loop with `find_agent`/`ask_agent`, specialist sub-loops, `assertChatAccess`) |
| Routes | `server/routes/agents.js` — dual-mounted: `/api/agents` (read-only, caller-scoped picker) + `/admin/api/agents` (CRUD + `POST /rescan` + `GET /tools`) |
| Admin designer | `admin/src/pages/agents/AgentCardsPage.jsx` + `AgentCardEditPage.jsx` (copy-on-write template, keep-and-warn on provider switch) |
| App @mention UI | `app/src/components/copilot/ChatInput.jsx` (picker), `ChatView.jsx` (role filter + @agent tags), `CopilotPane.jsx` (tool activity, per-round bubbles) |
| Boot hook | `server/index.js` `app.listen` → `ensureMasterCard()` then `scanAgents()` |

## Golden rules — Cards & delegation (Phase 3)

14. **The card folder is the truth; the `agents` collection is a disposable index.** Admin CRUD writes files then calls `scanAgents()`; hand-edited/dropped-in folders appear after boot or the admin Rescan button. Never write card fields to the DB directly.
15. **Slug = folder name = @mention handle**, strict charset `[a-z0-9][a-z0-9-]{1,48}` (path-safe, immutable after create). `master` is reserved: boot-guaranteed, undeletable, never disabled, excluded from routing candidates.
16. **Template resolution: `card payload_template.json ?? provider template`** (absent-means-inherit, like rate inheritance). Copy-on-write in the designer: the editor shows the provider's template until deliberately edited; provider switch with an override = keep + warn, never silently destroyed.
17. **The no-leak boundary**: the ONLY non-caller-scoped resolution in a turn is reading the master card's own definition files. @mention resolution, `find_agent` candidates and `ask_agent` targets all go through the caller-scoped wrapped `agents` collection (invisible ⇒ not-found). The chat access gate (`assertChatAccess` = caller-scoped `agents.count`) runs BEFORE the SSE stream opens.
18. **Tool exchanges are transcript rows** (`role: 'tool_call'|'tool_result'` with `toolCallId`/`name`), persisted by the chat service as they happen; the pane filters them out of bubbles. Specialist turns (`@mention`, `ask_agent`) get user/assistant history only — never the master's tool exchanges (providers reject tool blocks when no tools are declared).
18b. **Every specialist contribution is attributed, regardless of orchestration path.** Direct takeover (@mention / ground-truth auto-route) persists the reply with `agent: slug` and streams an `{type:'agent'}` event → pane caption `@slug`. Master delegation persists the master's post-delegation text with `agents: [slugs]` (only specialists that ACTUALLY answered via `ask_agent` count) and streams `{type:'consulted', agents}` → pane caption `via @slug[, @slug]`. Master-only answers carry no attribution. `executeMasterTool` returns `{content, consultedAgent}` to drive this — keep that contract when adding master tools.
19. **Tool wire-shaping is keyed by wireFormat, both directions**: `shapeTools()` (encode) and the decoders (tool_use events) live in `streamDecoders.js`; templates carry `"tools": "{{$.tools}}"` plus `tool_call`/`tool_result` role sub-templates. A template without those nodes simply can't tool-call (the master then answers directly) — after upgrading, re-apply the provider preset once.
20. **Specialist sub-loops are stateless**: brief in, text out, no tools, no conversation access — the master's `ask_agent` brief must be self-contained (the master's agent.md says so).
21. **Routing consultation is STRUCTURAL, not model-discretionary.** Every master turn, `streamTurn` runs the routing query server-side (one local embed) BEFORE the model call, in three tiers, ALL governed by `routingConfig` (admin → Agents → Routing; read per turn, no restart): score ≥ `autoRouteThreshold` (default 0.92 — effectively "this utterance is in the eval-set") ⇒ ground-truth direct takeover by the specialist (implicit @mention, `agent` event, no master round; `autoRouteEnabled` toggles the tier); score ≥ `evidenceFloor` (default 0.3, `evidenceEnabled` toggles) ⇒ a synthetic `find_agent` tool exchange (`auto: true` rows) is appended to the transcript so the master decides WITH evidence (also saves the round-trip of the model calling the tool); below floor ⇒ nothing attached (small talk stays clean). The master still holds `find_agent` for refined re-queries. Rationale: the eval-set must never depend on the model *choosing* to look — an exact exemplar match that didn't route (because the master answered from general knowledge) is how this shipped broken once. Routing failures never block the turn (warn + continue without evidence).
22. **Routing engine knobs are config, not constants.** `routingConfig` (single doc, no secrets, INCLUDED in backups) carries: tiers (`autoRouteEnabled/Threshold`, `evidenceEnabled/Floor`, `maxCandidates`) and advanced (`topK`, `aggregation` max|mean, `embeddingModel`, corpus toggles `includeEvalExamples`/`includeCardDescriptions`, `maxToolIterations`). Consumers read it per turn. The **embedding model id is part of the index hash** (with the corpus), so changing model or corpus toggles rebuilds the index lazily on next use; the per-model extractor cache in `embeddingService` swaps pipelines. Caveat the page hints at: `aggregation: mean` dilutes exact exemplar matches (an exact hit averaged with weaker matches can drop below the auto-route threshold) — max is the ground-truth-friendly default.
23. **The master card's `agent.md` is user-owned — code-default changes don't propagate.** `ensureMasterCard` only creates the file when missing; existing installs keep their prompt. When `DEFAULT_MASTER_AGENT_MD` changes materially (e.g. the evidence-first guidance), the release notes/summary must tell operators to refresh their master card's agent.md in the designer.

## Golden rules — Routing (Phase 2)

10. **The routing index is derived and rebuildable — never a source of truth.** `DATA_DIR/rag/routing-index.json` holds embedded exemplar vectors keyed by a **corpus hash** (sha256 of the eval examples). `getIndex()` rebuilds when the hash mismatches (examples changed, even across a restart); eval mutations call `invalidateIndex()`. It is NOT backed up (rebuilds from `eval-examples.db`, which IS).
11. **`runEvals` is leave-one-out.** Each example is routed with itself excluded from the pool (`findAgent(u, {excludeId})`), or every example would trivially match itself and accuracy would be a meaningless 100%. Keep the exclusion when changing the harness.
12. **The routing corpus = eval exemplars + enabled card descriptions** (`source: 'eval' | 'card'`, master excluded). Corpus loads read cards under `runAsSystem` — the index is GLOBAL and derived; per-caller visibility is applied to CANDIDATES by the `find_agent` handler (`visibleCandidates`), never baked into the index. `runEvals` scores eval examples only (cards stay in the retrieval pool).
13. **Routing labels are card slugs.** `expectedAgent` on eval examples and `label` on card entries are the same namespace — the card's `@slug`. Renaming a card breaks its eval examples; curate accordingly.

## Roadmap (beyond v1 — reserved conversations)

- **Tool grants for specialists** (`agentToolRegistry` is already shared and `GET /admin/api/agents/tools` lists it; the grants UI + in-loop execution + action-card write confirmations are the parked "tools" conversation).
- **RAG Providers**: knowledge/ folder consumption behind a retrieval-provider abstraction (parked design conversation).
- **`.cred` encrypted secrets vault** + encryption-key custody (parked).

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
