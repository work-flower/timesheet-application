# Calendar Integration — Wiring Doc

## Overview

Read-only ICS calendar feed integration. Users register ICS subscription URLs (from O365, Google, etc.) via the admin app. The backend fetches, parses, and caches calendar events. The main app displays calendar events as coloured dots on the Timesheet Coverage card in the Operations Dashboard.

## File Chain

### Backend

| File | Purpose |
|------|---------|
| `server/db/calendarSources.js` | Standalone NeDB datastore for calendar sources (not in backups) |
| `server/db/calendarEvents.js` | Standalone NeDB datastore for cached events (ephemeral cache) |
| `server/services/calendarService.js` | CRUD for sources, ICS fetch/parse/cache, event queries, scheduler |
| `server/routes/calendarSources.js` | CRUD + refresh endpoints for calendar sources |
| `server/routes/calendarEvents.js` | Read-only event query endpoint |
| `server/index.js` | Route mounting + scheduler init |

### Admin App (Calendar Sources Management)

| File | Purpose |
|------|---------|
| `admin/src/pages/system/CalendarSourcesPage.jsx` | Inline CRUD page (DataGrid + dialog) |
| `admin/src/App.jsx` | Route registration |
| `admin/src/layouts/AdminLayout.jsx` | Nav item under System Config |
| `admin/src/api/index.js` | `calendarSourcesApi` client |

### Main App (Dashboard Integration)

| File | Purpose |
|------|---------|
| `app/src/pages/Dashboard.jsx` | Fetches events, renders dots + enhanced tooltips on Timesheet Coverage card |
| `app/src/api/index.js` | `calendarEventsApi` client |

## Data Models

### calendarSources

| Field | Description |
|-------|-------------|
| name | Display name (e.g. "Work Calendar") |
| icsUrl | Full ICS subscription URL |
| colour | Hex colour for UI display (default: #0078D4) |
| enabled | Boolean, default true |
| refreshIntervalMinutes | Optional auto-refresh interval; null = manual only |
| lastFetchedAt | ISO timestamp of last successful fetch |
| lastError | Error message from last failed fetch |
| createdAt, updatedAt | Timestamps |

### calendarEvents (cache)

| Field | Description |
|-------|-------------|
| sourceId | FK → calendarSources |
| uid | ICS event UID |
| summary | Event title |
| description | Event description |
| start, end | ISO datetime strings |
| location | String |
| allDay | Boolean |
| attendees | Array of `{ name, email, type, role, status }` — parsed from ICS ATTENDEE property |
| cachedAt | When this event was cached |

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/calendar-sources` | List all sources |
| GET | `/api/calendar-sources/:id` | Get one source |
| POST | `/api/calendar-sources` | Create source |
| PUT | `/api/calendar-sources/:id` | Update source |
| DELETE | `/api/calendar-sources/:id` | Delete source + cascade events |
| POST | `/api/calendar-sources/:id/refresh` | Fetch & cache one source |
| POST | `/api/calendar-sources/refresh-all` | Fetch & cache all enabled sources |
| GET | `/api/calendar-events?startDate=&endDate=` | Query cached events by date range |

## Key Business Logic

- **ICS parsing:** Uses `node-ical` library. Fetches URL, filters VEVENT components, caches within 3-month window (past and future).
- **Cache strategy:** Full replace per source on refresh (delete all events for source, re-insert parsed ones).
- **Event enrichment:** `getEvents()` joins events with source name and colour for display.
- **Scheduler:** Sources with `refreshIntervalMinutes` get a `setInterval` that auto-refreshes. Managed via `initCalendarScheduler()` on server startup.
- **Dashboard display:** Coloured dots (max 4) on Timesheet Coverage day cells. Tooltips show event time, summary, and source name.

## Cross-Entity Consumers

| Consumer | How it uses calendar data |
|----------|--------------------------|
| `Dashboard.jsx` | Fetches events for viewed month, renders dots + tooltips |

## Blast Radius

Changes to calendar sources/events affect:
1. Admin CalendarSourcesPage — CRUD UI
2. Dashboard Timesheet Coverage — dot rendering and tooltips
3. Server startup — scheduler init

## Dependencies

- `node-ical` — ICS feed fetching and parsing

## Lessons Learned

(Add here as issues are discovered)
