# Timesheets — Entity Wiring

## File Chain

```text
TimesheetForm.jsx → timesheetsApi (api/index.js) → routes/timesheets.js → timesheetService.js → db.timesheets
```

## Frontend

| What | File | Notes |
| ---- | ---- | ----- |
| Form | `app/src/pages/timesheets/TimesheetForm.jsx` | Project dropdown grouped by client, hours SpinButton, computed days/amount, link-to-invoice button. Uses `useNotifyParent` for embedded mode |
| List | `app/src/pages/timesheets/TimesheetList.jsx` | OData URL-driven filters via `useODataList`. Period toggles (week/month/all/custom), client/project filters, server-side pagination, `$summary` footer (hours/days/amount/entries count). Filter/sort/pagination state lives in URL as `$filter`/`$orderby`/`$top`/`$skip` — bookmarkable/shareable. |
| Drawer | `app/src/pages/timesheets/TimesheetDrawer.jsx` | Quick-view side panel from list, shows details + invoice link |
| API client | `app/src/api/index.js` (timesheetsApi) | 5 methods: getAll, getById, create, update, delete |

## Backend

| What | File | Notes |
| ---- | ---- | ----- |
| Route | `server/routes/timesheets.js` | 5 endpoints: standard CRUD |
| Service | `server/services/timesheetService.js` | Rate/hours golden rule, days/amount computation, enrichment, lock checks. `getAll`: legacy params `projectId`, `clientId` (resolved live via the client's projects, mirroring expenseService; `projectId` takes precedence), `startDate`/`endDate`; `$expand` (project, client — resolved centrally via `server/expand.js`, batched `$in`, unknown name → 400 `bad_expand`), `groupBy` (week/month/year/day), `$summary` (server-side field sums across all matching records). `create`/`update`: persists `clientId` from project for direct `$filter` support; `update` also strips read-model keys (projectName, clientName, project, client, warnings) in addition to the protected fields. `getById`: returns computed effectiveRate/effectiveWorkingHours for display (already scalar-only — no embeds) |
| DB collection | `server/db/index.js` | `timesheets` — wrapped NeDB via execution pipeline |

## Shared Utilities

| What | File | Notes |
| ---- | ---- | ----- |
| OData list hook | `app/src/hooks/useODataList.js` | Coordinator hook: URL ↔ localStorage ↔ API. Manages `$filter`, `$orderby`, `$top`, `$skip`, `$count`, `$summary`. Non-OData URL params preserved in place. |
| OData builder | `app/src/utils/odataBuilder.js` | `buildFilterString(filters)` — builds `$filter` string from filter descriptors |
| OData parser | `app/src/utils/odataParser.js` | `extractFilterValues(filterString, filterDefs)` — parses `$filter` via `odata-filter-to-ast` back to UI state |
| Migration | `scripts/backfill-timesheet-clientId.js` | One-time backfill of `clientId` on existing timesheets (`npm run migrate:timesheet-clientid`) |

## Cross-Entity Consumers

| Consumer | File | What it does | Impact |
| -------- | ---- | ------------ | ------ |
| **Invoice confirm** | `invoiceService.js` | Sets `invoiceId`, `isLocked`, `isLockedReason` on timesheets | Locks records |
| **Invoice unconfirm** | `invoiceService.js` | Clears `invoiceId`, `isLocked`, `isLockedReason` | Unlocks records |
| **Invoice addLine** | `invoiceService.js` | Reads timesheet amount, hours, days for line snapshot | Source of truth for invoice lines |
| **Invoice recalculate** | `invoiceService.js` | Re-reads amount, hours, days from current timesheet | Rebuilds line values |
| **Invoice consistency** | `invoiceService.js` | Checks if amount/rate drifted from invoice line snapshot | Blocks confirm if mismatch |
| **Client list `$expand`** | `server/expand.js` | `$expand=timesheets` on the clients list resolves batched raw timesheet docs (client detail no longer embeds them) | Read-only |
| **Client cascade** | `clientService.js` remove | Deletes all timesheets for client's projects | Destroys data |
| **Project cascade** | `projectService.js` remove | Deletes all timesheets for project | Destroys data |
| **Timesheet report** | `reportService.js` buildTimesheetPdf | Reads timesheets by project/date range or by IDs (for invoice) | PDF generation, read-only |
| **Dashboard** | `dashboardService.js` | Queries timesheets for hours/earnings totals, uninvoiced count | Read-only |
| **Agent tool create_timesheet** | `server/services/agentToolRegistry.js` | Calls `timesheetService.create()` with projectId, date, hours, notes (exposed over MCP + agent layer) | Creates timesheets |
| **Agent tool list_recent_timesheets** | `server/services/agentToolRegistry.js` | Calls `timesheetService.getAll()` with date range | Read-only |
| **Agent tool list_unbilled_items** | `server/services/agentToolRegistry.js` | Reads a client's unbilled timesheets (`clientId` legacy param + `$filter=invoiceId eq null`) | Read-only |
| **Dashboard (frontend)** | `app/src/pages/Dashboard.jsx` | Fetches weekly/monthly hours, recent entries grid | Read-only |
| **ClientForm (frontend)** | `app/src/pages/clients/ClientForm.jsx` | Timesheets tab fetches `timesheetsApi.getAll({ clientId })` for its DataGrid | Read-only |
| **ProjectForm (frontend)** | `app/src/pages/projects/ProjectForm.jsx` | Timesheets tab fetches `timesheetsApi.getAll({ projectId })` for its DataGrid | Read-only |
| **InvoiceForm (frontend)** | `app/src/pages/invoices/InvoiceForm.jsx` | ItemPickerDialog selects timesheets as invoice line sources | Read-only |
| **ReportForm (frontend)** | `app/src/pages/reports/ReportForm.jsx` | Timesheet report page for PDF generation | Read-only |

## Golden Rules

**Rate/hours golden rule** (`timesheetService.create/update`):
`effectiveRate` and `effectiveWorkingHours` are always derived from the project (and its client). On create and update, if the client provides values for either field that differ from the project's computed values, the client values are ignored and a `warnings` array is returned in the response listing each overridden field. Calculations always use project values: `days = hours / effectiveWorkingHours`, `amount = days × effectiveRate`. Neither field is stored on the timesheet record.

**Persistence rule:** `days` and `amount` are computed and persisted on save. They become the source of truth — no recomputation on read.

**`clientId` stored field:** `clientId` is persisted on `create`/`update` (derived from the project). This enables direct `$filter=clientId eq 'xxx'` at the DB level without project lookup. Backfill via `npm run migrate:timesheet-clientid`.

**Validation:** Date must not be in the future. Hours must be 0.25–24 in 0.25 increments.

## Key Business Logic (where it lives)

| Rule | Location | Detail |
| ---- | -------- | ------ |
| Rate golden rule | `timesheetService.create/update` | See Golden Rules above |
| Hours golden rule | `timesheetService.create/update` | See Golden Rules above |
| Days computation | `timesheetService.create/update` | days = hours / effectiveWorkingHours. Persisted, source of truth |
| Amount computation | `timesheetService.create/update` | amount = days x effectiveRate. Persisted, source of truth |
| Frontend live calc | `TimesheetForm.jsx` computeDaysAmount | Mirrors backend: days = hours / effectiveWorkingHours, amount = days x effectiveRate |
| No future dates | `timesheetService.create/update` | Validated server-side |
| Hours validation | `timesheetService.create/update` | 0.25-24, in 0.25 increments |
| Lock protection | `timesheetService.update/remove` | `assertNotLocked()` before any mutation |
| Dirty tracking exclusion | `TimesheetForm.jsx` useFormTracker | `excludeFields: ['days', 'amount']` — computed fields don't trigger dirty |
| Override warnings | `timesheetService.create/update` | Returns `warnings[]` when client-sent effectiveRate/effectiveWorkingHours are overridden by project values |

## Blast Radius

**If you change the timesheet service create/update:**
- Check: Frontend computeDaysAmount mirrors the same calculation
- Check: Invoice addLine/recalculate reads the same persisted fields
- Check: Invoice consistency check validates against the same values
- Check: MCP create_timesheet passes correct args

**If you change the timesheet form:**
- Check: computeDaysAmount matches backend golden rule
- Check: SpinButton uses uncontrolled mode (defaultValue, not value)
- Check: days/amount excluded from dirty tracking
- Check: Project dropdown still grouped by client with rate/hours hints

**If you change timesheet data shape:**
- Update: timesheetService create/update (field handling)
- Update: TimesheetForm useFormTracker keys
- Update: Invoice line snapshot (invoiceService addLine/recalculate/consistency)
- Update: Timesheet report PDF columns (reportService)
- Update: Dashboard aggregation (dashboardService)
- Update: MCP tool response formatting
- Update: TimesheetList/TimesheetDrawer display columns
- Update: ClientForm/ProjectForm Timesheets tab columns
- Update: Dashboard.jsx summary calculations

## PDF Report

One page per project. Structure:
1. Contractor header: business name + address lines + "TIMESHEET REPORT" label
2. Info table: Client, Project, Period, IR35 Status, Rate
3. Timesheet table: Date, Hours, Days, Notes, Rate, Amount — navy header row, alternating rows, light grey totals row
4. Page footer: "Page X of Y"

Supports filtering by date range or by specific timesheet IDs (for invoice inclusion). When both IDs and date range provided, IDs drive the query and dates drive the period label.

Also included in the Combined PDF — see `invoices.md` → Invoice PDF Generation section.

## Lessons Learned

- **Fluent UI v9 SpinButton** — MUST use uncontrolled mode (`defaultValue`, not `value`). Controlled mode breaks typing. `data.value` is `null` during typing; always parse `data.displayValue` as fallback: `const val = data.value ?? parseFloat(data.displayValue); if (val != null && !isNaN(val)) ...`
- **OData URL filtering** — `$summary` provides server-side aggregation across all matching records (ignoring pagination). The summary footer must use `$summary` values, not client-side computation from the current page. `odata-filter-to-ast` is used for parsing `$filter` from URL back to UI state — its AST uses typed nodes (`EqExpr`, `GeExpr`, etc.) not a generic `op` field.
- **`clientId` legacy param was silently ignored (fixed)** — `getAll` only handled `projectId`/`startDate`/`endDate`, so callers passing `clientId` (the InvoiceForm timesheet picker) received EVERY client's timesheets and relied on downstream filtering. Now resolved LIVE via the client's projects (mirroring expenseService), deliberately NOT via the stored `clientId` snapshot: the snapshot is absent on pre-backfill records (seed data now stamps it) and goes stale when a project is reassigned to another client (no cascade exists — `projectService.update` doesn't touch timesheets, and `timesheetService.update` only re-stamps when `hours`/`projectId` change). The direct OData `$filter=clientId eq '...'` path (list views, Dashboard links) still queries the stored snapshot and inherits both caveats.
- **`$filter=invoiceId eq null` matched nothing (fixed in `server/odata.js`)** — the AST value extraction used `??`, which swallowed null literals and leaked the AST node into the NeDB query. The Dashboard's uninvoiced-entries card links to `/timesheets?$filter=invoiceId eq null` and showed an empty list. `eq null` now compiles to a null-or-absent `$or`; `ne null` to `$exists + $ne`.
- **Enrichment scalars got persisted onto timesheet documents (fixed).** `getById` was already scalar-only (no embeds), but even scalars leak: the form PUTs the full read model back and `update()` only stripped 4 protected fields, so `projectName`/`clientName`/`warnings` ended up stored on production timesheet docs. `update()` now strips the read-model keys (projectName, clientName, project, client, warnings); previously-polluted documents are cleaned by `npm run repair:derived-fields`.
