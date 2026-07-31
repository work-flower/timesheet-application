# Agents — Wiring Doc

> **Status:** Phase 1 ("it talks") implemented. Phases 2 ("it routes") and 3 ("it delegates") are planned — see the design record and `## Roadmap` below. Update this doc as those phases land.

The agent layer adds a master conversational assistant (Copilot side pane) fronted by a provider-agnostic AI abstraction. Cards (specialist agents), routing RAG, and delegation are P2/P3 and not yet built.

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

## Roadmap (not yet implemented)

- **P2 "it routes":** `embeddingService` (local, WASM backend, `DATA_DIR/models` cache), `routingService` (flat-file vector index), `evalService` + eval-set admin page + accuracy/confusion harness.
- **P3 "it delegates":** `agents` collection (wrapped, registry, seed privilege), `agentCardService` (file-led folders under `DATA_DIR/agents/{id}/`, boot scan, rescan, `ensureMasterCard`), agents routes + card admin pages (copy-on-write template inheritance, keep-and-warn on provider switch), `agentToolRegistry` extraction, `find_agent` tool, `@mention` routing, specialist sub-loops, master-as-card, visibility=talkability enforcement.

## Lessons learned

- **Provider records must ONLY be read through `aiProviderService` (`getRawById`/`getDefaultRaw`).** Those hydrate the stored `payloadTemplate` JSON string back to an object. Reading the raw store directly hands `renderTemplate` a string → the rendered body is a string → upstream rejects with "The request body must be a JSON object, got str." This exact bug shipped once via the default-provider fallback path. `streamTurn` now also guards that the rendered body is a plain object before posting.
- **Upstream auth errors mask body-shape errors.** Anthropic validates the API key BEFORE the body, so a smoke test with a fake key returns 401 and never exercises body validation. Verify outgoing request shape against a local mock endpoint (see the mock-provider test pattern), not just against the real API with a fake key.
- **SSE responses are HTTP 200 — errors inside them are invisible to the logs by default.** The conversations route's `send()` is the choke point: every `{type:'error'}` event forwarded to the pane is also `console.warn`ed server-side. Keep it that way when adding event types.
- **The transcript owns the current user message.** The route appends it via `appendMessage` BEFORE calling `streamTurn`; `buildContext` maps the transcript verbatim and must not push the message again (shipped once as a duplicated final user turn on every request).

- **NeDB `$`/`.` key constraint bites declarative templates.** The `$forEachMessage` node can't be stored as a live object; serialise to a string (this doc, golden rule 1). The roles engine hit the same wall and key-escapes instead — for templates, whole-string JSON is simpler.
- **The local `.env` sets `AUTH_ENABLED=true`.** Backend smoke tests against the identity-gated `/api` surface need a Cloudflare identity header, or run with `AUTH_ENABLED=false` + an isolated `DATA_DIR` to exercise legacy single-user behaviour without touching production data.
- **Seed is fire-and-forget after `app.listen`.** `ensureDefaults()` runs async in the listen callback, so the very first request after boot can race ahead of the seed insert. Harmless (idempotent; admin adds providers well after boot), but don't assert a provider exists in the first millisecond of boot.
