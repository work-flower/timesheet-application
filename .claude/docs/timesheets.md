# Timesheets — Entity Wiring

## File Chain

```text
TimesheetForm.jsx → timesheetsApi (api/index.js) → routes/timesheets.js → timesheetService.js → db.timesheets
```

## Frontend

| What | File | Notes |
| ---- | ---- | ----- |
| Form | `app/src/pages/timesheets/TimesheetForm.jsx` | Project dropdown grouped by client, hours SpinButton, computed days/amount, link-to-invoice button |
| List | `app/src/pages/timesheets/TimesheetList.jsx` | Period toggles (week/month/all/custom), client/project filters, summary footer (hours/days/amount) |
| Drawer | `app/src/pages/timesheets/TimesheetDrawer.jsx` | Quick-view side panel from list, shows details + invoice link |
| API client | `app/src/api/index.js` (timesheetsApi) | 5 methods: getAll, getById, create, update, delete |

## Backend

| What | File | Notes |
| ---- | ---- | ----- |
| Route | `server/routes/timesheets.js` | 5 endpoints: standard CRUD |
| Service | `server/services/timesheetService.js` | Rate/hours golden rule, days/amount computation, enrichment, lock checks |
| DB collection | `server/db/index.js` | `timesheets` — wrapped NeDB via execution pipeline |

## Cross-Entity Consumers

| Consumer | File | What it does | Impact |
| -------- | ---- | ------------ | ------ |
| **Invoice confirm** | `invoiceService.js` | Sets `invoiceId`, `isLocked`, `isLockedReason` on timesheets | Locks records |
| **Invoice unconfirm** | `invoiceService.js` | Clears `invoiceId`, `isLocked`, `isLockedReason` | Unlocks records |
| **Invoice addLine** | `invoiceService.js` | Reads timesheet amount, hours, days for line snapshot | Source of truth for invoice lines |
| **Invoice recalculate** | `invoiceService.js` | Re-reads amount, hours, days from current timesheet | Rebuilds line values |
| **Invoice consistency** | `invoiceService.js` | Checks if amount/rate drifted from invoice line snapshot | Blocks confirm if mismatch |
| **Client cascade** | `clientService.js` remove | Deletes all timesheets for client's projects | Destroys data |
| **Project cascade** | `projectService.js` remove | Deletes all timesheets for project | Destroys data |
| **Timesheet report** | `reportService.js` buildTimesheetPdf | Reads timesheets by project/date range or by IDs (for invoice) | PDF generation, read-only |
| **Dashboard** | `dashboardService.js` | Queries timesheets for hours/earnings totals, uninvoiced count | Read-only |
| **MCP create_timesheet** | `server/routes/mcp.js` | Calls `timesheetService.create()` with projectId, date, hours, notes | Creates timesheets |
| **MCP list_recent** | `server/routes/mcp.js` | Calls `timesheetService.getAll()` with date range | Read-only |

## Golden Rules

**Rate/hours golden rule** (`timesheetService.create/update`):
`effectiveRate` and `effectiveWorkingHours` are always derived from the project (and its client). On create and update, if the client provides values for either field that differ from the project's computed values, the client values are ignored and a `warnings` array is returned in the response listing each overridden field. Calculations always use project values: `days = hours / effectiveWorkingHours`, `amount = days × effectiveRate`. Neither field is stored on the timesheet record.

**Persistence rule:** `days` and `amount` are computed and persisted on save. They become the source of truth — no recomputation on read.

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

## PDF Report

One page per project. Structure:
1. Contractor header: business name + address lines + "TIMESHEET REPORT" label
2. Info table: Client, Project, Period, IR35 Status, Rate
3. Timesheet table: Date, Hours, Days, Notes, Rate, Amount — navy header row, alternating rows, light grey totals row
4. Page footer: "Page X of Y"

Supports filtering by date range or by specific timesheet IDs (for invoice inclusion). When both IDs and date range provided, IDs drive the query and dates drive the period label.

Also included in the Combined PDF — see `invoices.md` → Invoice PDF Generation section.

## Lessons Learned

(Empty — will be populated as issues are encountered)
