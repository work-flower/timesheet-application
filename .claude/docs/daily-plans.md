# Daily Plans — Entity Wiring

## File Chain

```text
DailyPlanForm.jsx / DailyPlanList.jsx → dailyPlansApi (api/index.js) → routes/dailyPlans.js → dailyPlanService.js / dailyPlanAiService.js → db.dailyPlans + filesystem
```

## Frontend

| What | File | Notes |
| ---- | ---- | ----- |
| Form | `app/src/pages/dailyPlans/DailyPlanForm.jsx` | 3-column grid: todos, tickets+comments, timeline. Milkdown editor for miscellaneous. Recap/briefing tab panel. Embedded timesheet popup. Comment-to-todo and ticket-to-todo flows. |
| List | `app/src/pages/dailyPlans/DailyPlanList.jsx` | Card view with WeekIndicator, badges for todos/timesheets/meetings/recap status. Create-on-open pattern (navigates to date-keyed form). |
| API client | `app/src/api/index.js` (dailyPlansApi) | ~20 methods: CRUD, content read/write, todo/timesheet/meeting-note management, recap/briefing generate/status/content, briefing day check, timesheet description |
| WeekIndicator | `app/src/components/WeekIndicator.jsx` | Reusable week day indicator showing which days have plans |
| TicketsListCard | `app/src/components/cards/TicketsListCard.jsx` | Compact ticket list with comments panel, used in DailyPlanForm. Supports onCommentClick, onTicketShortcutClick. |

## Backend

| What | File | Notes |
| ---- | ---- | ----- |
| Routes | `server/routes/dailyPlans.js` | ~20 endpoints: CRUD, content, todos, timesheets, meeting notes, change-date, recap (generate/status/content), briefing (generate/status/content/check-days) |
| Service | `server/services/dailyPlanService.js` | CRUD, todo/timesheet/meeting-note linking, file-based content/recap/briefing management, recap status detection from filesystem |
| AI service | `server/services/dailyPlanAiService.js` | generateRecap, generateBriefing, checkBriefingDays. File-based state machine (backup → generate → restore on failure). |
| DB collection | `server/db/index.js` | `dailyPlans` — wrapped NeDB via execution pipeline |

## Data Model

| Field | Description |
|-------|-------------|
| _id | Date string `YYYY-MM-DD` (primary key, one plan per day) |
| status | `active` or `archived` |
| todos | Array of todo IDs (FK → todos) |
| timesheetIds | Array of timesheet IDs (FK → timesheets) |
| meetingNotes | Array of `{ calendarEventUid, eventSummary, notebookId }` |
| ticketIds | Array of ticket IDs |
| createdAt | ISO timestamp |
| updatedAt | ISO timestamp |

**Disk files** (at `DATA_DIR/daily-plans/{date}/`):
- `content.md` — Milkdown editor content (miscellaneous notes)
- `recap.md` — AI-generated end-of-day recap
- `recap.md.bak` — Backup during recap generation
- `recap.error` — Error file if recap generation failed
- `briefing.md` — AI-generated morning briefing
- `briefing.md.bak` — Backup during briefing generation
- `briefing.error` — Error file if briefing generation failed

**Computed fields (enriched on read, not stored):**
- `todosData` — Full todo objects with `planRefCount` (from getById)
- `timesheetsData` — Enriched timesheet objects with project/client names (from getById)
- `totalTodos`, `completedTodos`, `hasTimesheet`, `recapStatus`, `recapIsStale` (from getAll)

## Cross-Entity Consumers

| Consumer | File | What it does | Impact |
| -------- | ---- | ------------ | ------ |
| **todoService** | `todoService.js` | Todos are standalone records linked via `todos` array | Read/write |
| **timesheetService** | `timesheetService.js` | Timesheets linked by date + `timesheetIds` array. AI context reads timesheets for recap/briefing. | Read-only |
| **calendarService** | `calendarService.js` | Calendar events fetched by date for recap AI context and timeline card | Read-only |
| **notebookService** | `notebookService.js` | Meeting notes link to notebooks. Content read for recap AI context. | Read-only |
| **notebookGitService** | `notebookGitService.js` | `sanitizeTitle` used to find notebook content on disk | Read-only |
| **ticketsApi** | `ticketsApi` (frontend) | TicketsListCard fetches tickets for display in form | Read-only |
| **aiConfigService** | `aiConfigService.js` | Reads recap/briefing system prompts and API key | Read-only |
| **backupService** | `backupService.js` | Includes dailyPlans collection and daily-plans directory in backup archives | Read-only |
| **DayTimelineCard** | `DayTimelineCard.jsx` | Calendar timeline displayed in form, event click creates meeting notes | Read-only |

## Golden Rules

1. **Date as primary key** — `_id` is the date string `YYYY-MM-DD`. One plan per day. Create-on-open pattern: navigating to a date auto-creates the plan if it doesn't exist.
2. **File-based state machine for recap/briefing** — Backup existing file → generate → on success remove backup → on failure restore backup and write error file. Never lose a previously good recap/briefing.
3. **Recap before briefing** — Briefing requires fresh recaps for selected days. Day picker dialog shows recap status. Stale/missing recaps are generated sequentially before briefing.
4. **Timesheet-first AI context** — Both recap and briefing contexts lead with timesheet entries. Missing timesheets are flagged as RED FLAG in the context for the AI to surface.
5. **Content auto-save** — Milkdown editor content is debounce-saved to disk, not to the DB. Content is read/written via dedicated API endpoints.
6. **Recap staleness** — Determined by comparing `recap.md` mtime against `plan.updatedAt`. If plan was updated after recap was generated, recap is stale.
7. **Briefing todo carry-forward** — `generateBriefing` carries forward incomplete todos from all scoped days into the current plan via `addTodo`.
8. **Timesheet description** — Deterministic (no AI): bullet list of meeting titles + completed todos. Passed to timesheet form via query string pre-fill.

## Key Business Logic

| Rule | Location |
|------|----------|
| Create-on-open | `DailyPlanList.jsx` — navigates to date; `dailyPlans.js` POST creates if needed |
| Content auto-save | `DailyPlanForm.jsx` — debounced write via `dailyPlansApi.updateContent` |
| Recap generation | `dailyPlanAiService.generateRecap` — buildContext + callClaude + file write |
| Briefing generation | `dailyPlanAiService.generateBriefing` — todo carry-forward + recap collection + callClaude |
| Recap status detection | `dailyPlanService.getRecapStatus` — checks recap.md existence, mtime, error file |
| Briefing day check | `dailyPlanAiService.checkBriefingDays` — returns days with plan existence + recap status |
| Meeting note lifecycle | `DailyPlanForm.jsx` — calendar event click creates/opens notebook, stores link in meetingNotes |
| Timesheet popup | `DailyPlanForm.jsx` — embedded iframe with query string pre-fill (date + notes from meetings/todos) |
| Comment-to-todo | `DailyPlanForm.jsx` — TicketsListCard onCommentClick → dialog → create todo |
| Ticket-to-todo | `DailyPlanForm.jsx` — TicketsListCard onTicketShortcutClick → dialog → create todo |

## Blast Radius

| Change | Check |
|--------|-------|
| Changing plan data shape | `dailyPlanService` (CRUD + getAll enrichment), `dailyPlanAiService` (context building), `DailyPlanForm` + `DailyPlanList` (display) |
| Changing recap/briefing file paths | `dailyPlanService` (getRecapFilePaths/getBriefingFilePaths), `dailyPlanAiService` (generate functions), `backupService` (backup/restore) |
| Changing AI prompts | `aiConfigService` (defaults), admin `AiConfigPage` (editor), `dailyPlanAiService` (reads config) |
| Changing todo linking | `dailyPlanService` (add/remove/delete), `dailyPlanAiService` (carry-forward), `DailyPlanForm` (all todo handlers) |
| Changing meeting note structure | `DailyPlanForm` (event click handler), `dailyPlanAiService.buildContext` (reads notebook content) |
| Changing timesheet description logic | `DailyPlanForm.handleTimesheetWithAi` only (deterministic, frontend-only) |

## Lessons Learned

- **Recap/briefing are frontend-driven** — The backend generates and saves the file, but the UI initiates the call. If the user navigates away mid-generation, the file still saves but the UI won't update until next visit. Acceptable for now; proper background jobs would be the right fix.
- **File-based state machine is robust** — Backup → generate → restore on failure ensures no data loss. The pattern is identical for recap and briefing.
- **Timesheet description went through 3 iterations** — Started as AI-generated from full context, then AI from recap, finally settled on deterministic bullet list. Simpler is better for predictable output.
- **planRefCount O(N)** — Scans all plans for todo ref counting. Fine for single-user app.
