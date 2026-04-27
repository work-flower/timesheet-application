# Ticket Sources Integration — Wiring Doc

## Overview

Ticket integration from Jira and Azure DevOps. Users register ticket sources (with credentials and optional pre-queries) via the admin app. The backend fetches tickets via provider-specific APIs, maps them to a canonical shape, and syncs them locally using incremental upsert (no purge). The main app displays tickets on the Operations Dashboard and provides a detail form for viewing ticket data and adding personal comments. A unified `/api/tickets` endpoint merges all sources transparently.

**Key rules:** Synced tickets are never deleted. Source deletion does not cascade to tickets (they persist as evidence of work). Tickets not found on remote during re-check are marked with a warning notice in their description.

## File Chain

### Backend

| File | Purpose |
|------|---------|
| `server/db/index.js` | Standalone NeDB datastores: `ticketSources`, `tickets` (not in backups) |
| `server/services/providers/jiraProvider.js` | Jira REST API v3 integration — auth, fetch, fetchById, map to canonical shape |
| `server/services/providers/azureDevOpsProvider.js` | Azure DevOps REST API integration — auth, WIQL, fetch, fetchById, map to canonical shape (includes `System.Rev`) |
| `server/services/providers/index.js` | Provider factory: `getProvider(type)` |
| `server/services/ticketService.js` | CRUD for sources, incremental sync, ticket queries, getTicketById, patchTicket, getCommentsByDate, scheduler, credential masking |
| `server/routes/ticketSources.js` | CRUD + refresh + test connection endpoints |
| `server/routes/tickets.js` | GET list, GET comments-by-date, GET by ID, PATCH (extension data) endpoints |
| `server/index.js` | Route mounting + scheduler init |

### Admin App (Ticket Sources Management)

| File | Purpose |
|------|---------|
| `admin/src/pages/system/TicketSourcesPage.jsx` | Tabbed CRUD page (Jira \| Azure DevOps tabs, card layout + dialog) |
| `admin/src/App.jsx` | Route registration |
| `admin/src/layouts/AdminLayout.jsx` | Nav item under System Config |
| `admin/src/api/index.js` | `ticketSourcesApi` client |

### Main App (Dashboard + Ticket Form)

| File | Purpose |
|------|---------|
| `app/src/pages/Dashboard.jsx` | Renders TicketsCard (click copies URL to clipboard) |
| `app/src/components/cards/TicketsCard.jsx` | Card grid of tickets on dashboard |
| `app/src/components/cards/TicketsListCard.jsx` | Compact tickets list with backend search/state-filter/pagination + comments-by-date panel (used by daily plans) |
| `app/src/pages/tickets/TicketList.jsx` | Ticket list page — DataGrid with source/state/type filters, search, pagination via `useODataList` |
| `app/src/pages/tickets/TicketForm.jsx` | Ticket detail form — read-only source fields, editable extension comments |
| `app/src/App.jsx` | Route registration: `/tickets`, `/tickets/:id` |
| `app/src/layouts/AppLayout.jsx` | "External" nav group with "Tickets" child item |
| `app/src/api/index.js` | `ticketsApi` client (getAll, getById, getCommentsByDate, patch, refreshAll) |

### MCP

| File | Purpose |
|------|---------|
| `server/routes/mcp.js` | `list_tickets` tool definition and handler |

## Data Models

### ticketSources

| Field | Description |
|-------|-------------|
| name | Display name |
| type | `jira` or `azure-devops` |
| baseUrl | Instance URL |
| email | Jira only — account email |
| apiToken | Jira only — API token (masked on read) |
| pat | ADO only — Personal Access Token (masked on read) |
| preQuery | Optional JQL (Jira) or WIQL (ADO); empty = last 30 days |
| colour | Hex colour for UI display (default: #0078D4) |
| enabled | Boolean, default true |
| refreshIntervalMinutes | Optional auto-refresh; null = manual only |
| lastFetchedAt | ISO timestamp of last successful fetch |
| lastError | Error message from last failed fetch |
| createdAt, updatedAt | Timestamps |

### tickets

| Field | Description |
|-------|-------------|
| sourceId | FK → ticketSources |
| externalId | Jira issue key or ADO work item ID |
| title | Summary/title |
| description | Truncated description (max 500 chars). May include remote-not-found warning |
| state | Status/state name |
| type | Issue type (bug, story, task, etc.) |
| assignedTo | Assigned person name |
| sprint | Sprint name (if any) |
| areaPath | ADO area path or Jira project key |
| priority | Priority level |
| project | Source project name |
| url | Direct link to ticket in source system |
| rev | ADO revision number (ADO only, null for Jira) |
| created | Created date |
| updated | Last updated date |
| cachedAt | When this record was last synced |
| comments | Array of remote comments synced from source (see below) |
| extension | Object — user's local extension data (see below) |

### comments array (synced from source)

| Field | Description |
|-------|-------------|
| id | Comment ID from source system (Jira comment ID or ADO comment ID) |
| author | Display name of comment author |
| body | Comment content — stored in original format from source |
| format | `text` (Jira, extracted from ADF), `markdown` or `html` (ADO) |
| created | ISO timestamp from source |

### extension object

| Field | Description |
|-------|-------------|
| comments | Markdown — user's personal comments/notes on the ticket |

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/ticket-sources` | List all sources (with OData support) |
| GET | `/api/ticket-sources/:id` | Get one source |
| POST | `/api/ticket-sources` | Create source |
| PUT | `/api/ticket-sources/:id` | Update source |
| DELETE | `/api/ticket-sources/:id` | Delete source (tickets NOT cascade-deleted) |
| POST | `/api/ticket-sources/:id/refresh` | Fetch & sync one source |
| POST | `/api/ticket-sources/refresh-all` | Fetch & sync all enabled sources |
| POST | `/api/ticket-sources/:id/test` | Test connection to source |
| GET | `/api/tickets` | Unified canonical query (OData support) |
| GET | `/api/tickets/comments?date=YYYY-MM-DD` | Flattened comments across all tickets posted on a single date (enriched with `ticketId`, `externalId`, `ticketTitle`, `sourceColour`, `sourceName`); registered before `/:id` to avoid route capture |
| GET | `/api/tickets/:id` | Single ticket detail (enriched with source info) |
| PATCH | `/api/tickets/:id` | Update extension data only (deep merge) |

## Key Business Logic

- **Provider pattern:** `getProvider(type)` returns the Jira or ADO provider. Each implements `testConnection(source)`, `fetchTickets(source)`, `fetchTicketById(source, externalId)`, and `fetchComments(source, externalId)`.
- **Jira auth:** Basic auth with `email:apiToken`. Uses REST API v3 `/rest/api/3/search/jql` with JQL (includes `comment` field for inline comments). Single issue: `/rest/api/3/issue/{key}`. Comments: `/rest/api/3/issue/{key}/comment`.
- **ADO auth:** Basic auth with `:pat`. Uses WIQL query then batch work item detail fetch. Single item: `_apis/wit/workitems/{id}`. Comments: `_apis/wit/workitems/{id}/comments`. Fetches `System.Rev` for revision tracking.
- **Default pre-query:** When empty, fetches items updated in the last 30 days.
- **Comment sync:** Comments are fetched in parallel during sync. Jira search includes inline comments (last ~5); if a ticket has more, a dedicated call fetches the full set. ADO always requires a per-ticket call. Comments are stored as-is in source format (text for Jira/ADF-extracted, markdown or html for ADO). The full `comments` array is replaced on each sync (idempotent by comment ID).
- **Incremental sync (fetchAndCache):**
  1. Fetch remote tickets via provider query
  2. Fetch comments in parallel for all remote tickets via `fetchCommentsParallel`
  3. For each remote ticket: upsert by `sourceId` + `externalId` (create if new with empty extension, update if existing — preserving extension data). Comments array fully replaced.
  4. For local tickets NOT in remote response: re-check individually via `fetchTicketById` + `fetchComments`
  5. If individual re-check returns 404/null: append warning notice to description (once only)
  6. Tickets are NEVER deleted during sync
  7. Detailed logging throughout: counts of created, updated, re-checked, not-found
- **No ticket deletion:** Synced tickets persist as evidence of work. Source deletion does NOT cascade to tickets.
- **Extension data:** Each ticket has an `extension` object for user-local data. Currently supports `comments` (markdown). PATCH endpoint deep-merges into existing extension.
- **Credential masking:** `apiToken` and `pat` masked on read. Masked values retained on update.
- **Scheduler:** Sources with `refreshIntervalMinutes` get auto-refresh via `setInterval`. Managed by `initTicketScheduler()` on server startup.
- **Dashboard display:** Card grid showing title (with source colour), state badge, assigned to, sprint, area path. Click copies ticket URL to clipboard.
- **Ticket list:** DataGrid with source/state/type dropdown filters, client-side search, server-side pagination via `useODataList`. Row click navigates to ticket form.
- **Ticket form:** Tabbed layout — "Details" tab (read-only source fields + editable extension comments via MarkdownEditor), "Ticket Comments" tab (chronological list of synced remote comments rendered by format: html, markdown via MarkdownEditor preview mode, or plain text). Link to open ticket in source system.

## Cross-Entity Consumers

| Consumer | How it uses ticket data |
|----------|------------------------|
| `Dashboard.jsx` | Renders TicketsCard, navigates to ticket form on click |
| `TicketsCard.jsx` | Fetches and displays ticket cards on dashboard |
| `TicketsListCard.jsx` | Backend search/state-filter/pagination over `/api/tickets`; comments panel uses `/api/tickets/comments?date=…`. Used in `DailyPlanForm.jsx` |
| `TicketForm.jsx` | Displays ticket detail, allows editing extension comments |
| `server/routes/mcp.js` | `list_tickets` tool queries cached tickets |

## Blast Radius

Changes to ticket sources/tickets affect:
1. Admin TicketSourcesPage — CRUD UI
2. Dashboard — TicketsCard component
3. TicketForm — ticket detail view
4. MCP — `list_tickets` tool
5. Server startup — scheduler init
6. AppLayout sidebar — "External" menu group

## Dependencies

- No external npm dependencies — uses native `fetch` with Basic auth for both Jira and ADO REST APIs

## Lessons Learned

- Incremental sync replaces the earlier full-purge strategy to preserve extension data and prevent data loss
- ADO `System.Rev` field enables revision tracking; Jira has no equivalent (uses `updated` timestamp)
- `Promise.allSettled` used for individual re-checks to isolate failures per ticket without breaking the sync
- Jira comments are ADF (Atlassian Document Format) in API v3 — extracted to plain text via `extractText()` rather than storing raw ADF JSON
- ADO comments have a `format` field (`markdown` or `html`) — stored as-is to preserve original formatting
- Jira search includes inline comments (last ~5 per ticket) — avoids extra API calls for most tickets. Only tickets with `total > returned` need a dedicated fetch
- ADO has no expand/batch option for comments — one API call per ticket required, fetched in parallel via `Promise.allSettled`
- MarkdownEditor component supports `preview` prop for read-only markdown rendering (uses `MDEditor.Markdown`)
- `/api/tickets/comments?date=…` must be registered before `/api/tickets/:id` in [server/routes/tickets.js](../../server/routes/tickets.js); Express otherwise treats `comments` as an `:id` and the request hits `getTicketById`
- `TicketsListCard` uses `storageKey` as a **prefix** (default `ticketsListCard`), with sibling sub-keys `${prefix}.search`, `${prefix}.page`, `${prefix}.stateFilter`. State filter buttons are populated by a separate "states discovery" fetch (`$select=state`, no `$top`/`$skip`, search filter applied) so toggle options stay coherent across pages
