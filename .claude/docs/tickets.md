# Ticket Sources Integration — Wiring Doc

## Overview

Read-only ticket integration from Jira and Azure DevOps. Users register ticket sources (with credentials and optional pre-queries) via the admin app. The backend fetches tickets via provider-specific APIs, maps them to a canonical shape, and caches them locally. The main app displays tickets on the Operations Dashboard. A unified `/api/tickets` endpoint merges all sources transparently.

## File Chain

### Backend

| File | Purpose |
|------|---------|
| `server/db/index.js` | Standalone NeDB datastores: `ticketSources`, `tickets` (not in backups) |
| `server/services/providers/jiraProvider.js` | Jira REST API v3 integration — auth, fetch, map to canonical shape |
| `server/services/providers/azureDevOpsProvider.js` | Azure DevOps REST API integration — auth, WIQL, fetch, map to canonical shape |
| `server/services/providers/index.js` | Provider factory: `getProvider(type)` |
| `server/services/ticketService.js` | CRUD for sources, fetch/cache, ticket queries, scheduler, credential masking |
| `server/routes/ticketSources.js` | CRUD + refresh + test connection endpoints |
| `server/routes/tickets.js` | Unified canonical ticket query endpoint |
| `server/index.js` | Route mounting + scheduler init |

### Admin App (Ticket Sources Management)

| File | Purpose |
|------|---------|
| `admin/src/pages/system/TicketSourcesPage.jsx` | Tabbed CRUD page (Jira \| Azure DevOps tabs, card layout + dialog) |
| `admin/src/App.jsx` | Route registration |
| `admin/src/layouts/AdminLayout.jsx` | Nav item under System Config |
| `admin/src/api/index.js` | `ticketSourcesApi` client |

### Main App (Dashboard Integration)

| File | Purpose |
|------|---------|
| `app/src/pages/Dashboard.jsx` | Fetches tickets, renders DataGrid section |
| `app/src/api/index.js` | `ticketsApi` client |

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

### tickets (cache)

| Field | Description |
|-------|-------------|
| sourceId | FK → ticketSources |
| externalId | Jira issue key or ADO work item ID |
| title | Summary/title |
| description | Truncated description (max 500 chars) |
| state | Status/state name |
| type | Issue type (bug, story, task, etc.) |
| assignedTo | Assigned person name |
| sprint | Sprint name (if any) |
| areaPath | ADO area path or Jira project key |
| priority | Priority level |
| project | Source project name |
| url | Direct link to ticket in source system |
| created | Created date |
| updated | Last updated date |
| cachedAt | When this record was cached |

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/ticket-sources` | List all sources (with OData support) |
| GET | `/api/ticket-sources/:id` | Get one source |
| POST | `/api/ticket-sources` | Create source |
| PUT | `/api/ticket-sources/:id` | Update source |
| DELETE | `/api/ticket-sources/:id` | Delete source + cascade tickets |
| POST | `/api/ticket-sources/:id/refresh` | Fetch & cache one source |
| POST | `/api/ticket-sources/refresh-all` | Fetch & cache all enabled sources |
| POST | `/api/ticket-sources/:id/test` | Test connection to source |
| GET | `/api/tickets` | Unified canonical query (OData support) |

## Key Business Logic

- **Provider pattern:** `getProvider(type)` returns the Jira or ADO provider. Each implements `testConnection(source)` and `fetchTickets(source)`.
- **Jira auth:** Basic auth with `email:apiToken`. Uses REST API v3 `/rest/api/3/search` with JQL.
- **ADO auth:** Basic auth with `:pat`. Uses WIQL query then batch work item detail fetch.
- **Default pre-query:** When empty, fetches items updated in the last 30 days.
- **Cache strategy:** Full replace per source on refresh (delete all tickets for source, re-insert).
- **Credential masking:** `apiToken` and `pat` masked on read. Masked values retained on update.
- **Scheduler:** Sources with `refreshIntervalMinutes` get auto-refresh via `setInterval`. Managed by `initTicketScheduler()` on server startup.
- **Dashboard display:** DataGrid card showing title (with source colour dot), state, assigned to, sprint, area path. Clickable open link to source system.

## Cross-Entity Consumers

| Consumer | How it uses ticket data |
|----------|------------------------|
| `Dashboard.jsx` | Fetches tickets on load, renders DataGrid section |
| `server/routes/mcp.js` | `list_tickets` tool queries cached tickets |

## Blast Radius

Changes to ticket sources/tickets affect:
1. Admin TicketSourcesPage — CRUD UI
2. Dashboard — tickets DataGrid section
3. MCP — `list_tickets` tool
4. Server startup — scheduler init

## Dependencies

- No external npm dependencies — uses native `fetch` with Basic auth for both Jira and ADO REST APIs

## Lessons Learned

(Add here as issues are discovered)
