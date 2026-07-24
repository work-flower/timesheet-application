# Execution Pipeline — Infrastructure Wiring

## Overview

The execution pipeline sits between services and the database. It wraps every NeDB collection transparently via ES6 Proxy so services use the same API they always did, but every operation flows through: authorization → pre-hooks → adapter → post-hooks.

```text
Service → wrapped collection (Proxy) → checkAccess → pre-hooks → NeDB adapter → post-hooks → result
```

## File Chain

```text
server/pipeline/
  index.js          — wrapCollection(), Proxy handler, method routing
  context.js        — buildContext() reads ALS store (incl. auth), builds canonical context object
  hooks.js          — HookRegistry class, register() and run() methods
  authorisation.js  — checkAccess() (IMPLEMENTED), enforceWriteScope(), requireAction()
  attribution.js    — wildcard pre-hooks stamping createdBy/updatedBy (AUTH_ENABLED only)
  identity.js       — Express middleware resolving Cloudflare identity → user + grants → ALS
  systemContext.js  — runAsSystem() for background/engine execution
  authFlag.js       — isAuthEnabled() (AUTH_ENABLED env gate)
  cursorProxy.js    — CursorProxy class, defers post-hooks until cursor is evaluated

server/logging/asyncContext.js  — AsyncLocalStorage instance (shared with logging)
server/index.js                 — Express middleware that populates ALS store per request
server/db/index.js              — wrapCollection() called for every collection at boot
```

See `.claude/docs/authorisation.md` for the full authorisation wiring (grants, macros, lifecycle).

## How It Works

### Method Routing

| Method type | Methods | Behaviour |
| ----------- | ------- | --------- |
| Cursor | `find`, `findOne`, `count` | checkAccess (sync) → pre-hooks (NOT awaited) → CursorProxy (defers post-hooks until `.exec()` / `.then()`) |
| Async | `insert`, `update`, `remove` | checkAccess → `await enforceWriteScope` (post-image) → awaited pre-hooks → operation → post-hooks |
| Pass-through | Everything else (EventEmitter, load, etc.) | Proxied directly to NeDB |

**Cursor-path constraint:** `checkAccess` must stay synchronous (a chainable cursor must be returned immediately) and read pre-hooks are fire-and-forget — ALL read-side logic lives in `checkAccess`, which works by mutating `context.args[0]` (the same array reference spread into the real call). Async enforcement is only possible on the write path.

### Context Object

Built by `buildContext(collection, operation, args)` from ALS store:

```text
{
  requestId     — UUID per HTTP request
  traceId       — X-Trace-Id header (correlation across API calls)
  source        — derived from URL path (e.g. 'timesheets', 'invoices')
  method        — HTTP verb
  path          — request path
  auth          — { system?, superuser?, user?, grants? } stamped by identity middleware / runAsSystem
  collection    — collection name (e.g. 'timesheets')
  operation     — DB operation (e.g. 'find', 'insert', 'update', 'remove')
  args          — original arguments to the DB operation
}
```

### ALS Setup (Express middleware in `server/index.js`)

Every request populates ALS with `{ requestId, traceId, source, method, path }`. The pipeline reads this via `buildContext()`. Background tasks (e.g. AI parsing) use `als.run()` to provide context outside HTTP requests.

### Hook System (`server/pipeline/hooks.js`)

```text
hooks.register({
  collection: 'timesheets' | '*',   — specific collection or wildcard
  operation: 'insert' | '*',        — specific operation or wildcard
  phase: 'pre' | 'post',
  filter?: (context) => boolean,     — optional guard
  fn: (context, data?) => void       — hook function (data only for post-hooks)
})

hooks.run(phase, collection, operation, context, data?)
  — filters registered hooks by phase + collection + operation + guard
  — executes matching hooks sequentially
```

**Current state:** First hooks registered — `pipeline/attribution.js` (wildcard pre-hooks on insert/update stamping `createdBy`/`updatedBy` when AUTH_ENABLED), registered by side-effect import in `db/index.js`.

### Authorization (`server/pipeline/authorisation.js`)

`checkAccess(context)` — IMPLEMENTED (see `.claude/docs/authorisation.md`):
- Phase 0: bypass — `!AUTH_ENABLED` / system / superuser
- Phase 1: identity — unauthenticated / pending / disabled → ForbiddenError with code
- Phase 2: collection privilege — operation mapped to read/create/update/delete; default deny
- Phase 3: record scoping — role filter merged into the selector via `context.args[0] = {$and:[filter, query]}`

Plus `enforceWriteScope(context, rawDatastore)` (async post-image check for filtered updates + upsert create requirement) and `requireAction(table, action)` (Express middleware for named lifecycle actions).

### CursorProxy (`server/pipeline/cursorProxy.js`)

Wraps NeDB cursors to defer post-hook execution. Preserves chainable API:

```text
collection.find({ status: 'active' }).sort({ date: -1 }).limit(10)
  → CursorProxy chains sort/skip/limit/project on real cursor
  → post-hooks run only when .exec() or .then() resolves
```

This matters because NeDB cursors are lazy — data isn't fetched until evaluation. Post-hooks need the actual data, so they must wait.

## Wrapped Collections

All collections wrapped at boot in `server/db/index.js`:

| Collection | DB File | Key Services |
| ---------- | ------- | ------------ |
| `clients` | `clients.db` | clientService, projectService, timesheetService, expenseService, invoiceService |
| `projects` | `projects.db` | projectService, clientService, timesheetService, expenseService, invoiceService |
| `timesheets` | `timesheets.db` | timesheetService, invoiceService, reportService, dashboardService |
| `expenses` | `expenses.db` | expenseService, invoiceService, expenseReportService, dashboardService |
| `invoices` | `invoices.db` | invoiceService, clientService, dashboardService |
| `settings` | `settings.db` | invoiceService, reportService, invoicePdfService |
| `documents` | `documents.db` | documentService, projectService |
| `transactions` | `transactions.db` | transactionService, expenseService, invoiceService, dashboardService |
| `importJobs` | `importJobs.db` | importJobService, dashboardService |
| `stagedTransactions` | `stagedTransactions.db` | stagedTransactionService, importJobService |
| `notebooks` | `notebooks.db` | notebookService, dailyPlanService, dailyPlanAiService |
| `dailyPlans` | `dailyPlans.db` | dailyPlanService |
| `todos` | `todos.db` | todoService, dailyPlanService |
| `users` | `users.db` | userService, identity middleware (via runAsSystem) |
| `roles` | `roles.db` | roleService, accessService (via runAsSystem) |
| `calendarSources` | `calendar-sources.db` | calendarService |
| `calendarEvents` | `calendar-events.db` | calendarService, dailyPlanService |
| `ticketSources` | `ticket-sources.db` | ticketService |
| `tickets` | `tickets.db` | ticketService, notebookService, dailyPlanAiService |

**Not wrapped** (separate DB files, own management, config-only): `backupConfig.db`, `logConfig.db`, `ai-config.db`, `gemini-config.db`, `mcp-auth.db`

## Key Design Decisions

| Decision | Rationale |
| -------- | --------- |
| ES6 Proxy | Transparent wrapping — services don't know they're using wrapped collections. No code changes needed. |
| CursorProxy separate class | NeDB cursors are thenable. Post-hooks must run after fetch, not cursor creation. Separate class preserves chaining. |
| ALS for context | Avoids threading context through every service method parameter. Request metadata flows automatically. |
| Wildcard hooks | Cross-cutting concerns (audit logging, etc.) can listen to all collections/operations with `'*'`. |
| No hooks registered yet | Infrastructure is ready but unused. Hooks will be added incrementally as needs arise. |

## Blast Radius

**If you change the Proxy handler (`pipeline/index.js`):**
- Check: All 10 wrapped collections still work (cursor + async methods)
- Check: CursorProxy chaining (sort, skip, limit, project) still defers correctly
- Check: Context is built correctly for both cursor and async paths
- Check: Services that use `find().sort().limit()` chains still resolve

**If you add/modify hooks:**
- Check: Hook filter correctly matches collection + operation + phase
- Check: Pre-hooks don't break if they throw (error propagation)
- Check: Post-hooks receive correct data shape (array for find, object for findOne/insert)
- Check: Wildcard hooks don't fire on unwanted operations

**If you change the ALS middleware (`server/index.js`):**
- Check: Pipeline context still has all fields (requestId, traceId, source, method, path)
- Check: Background tasks (AI parsing in importJobService) still provide ALS context via `als.run()`
- Check: Logging still reads from the same ALS store

**If you add a new collection:**
- Add: `wrapCollection()` call in `server/db/index.js`
- Add: Row to Wrapped Collections table above
- Check: Export the wrapped version, not the raw datastore

## Lessons Learned

- **Cursor-path pre-hooks are fire-and-forget** — `hooks.run('pre', ...)` is not awaited on `find/findOne/count`. Any read-side behaviour that must complete before the query belongs in the synchronous `checkAccess`, not in a pre-hook.
- **`context.args` is the live argument array** — mutating `context.args[0]` in a sync hook/checkAccess changes what the real datastore call receives (this is how filter injection works). Treat with care.
- **Background execution needs `runAsSystem`** — interval/cron callbacks (calendar/ticket schedulers, backup cron, log uploader, import AI parsing, seed) run with an empty ALS store; without the system identity wrapper they are denied when AUTH_ENABLED is on.
- **NeDB refuses to load datastores containing `$`-prefixed or dotted keys** — stored role filters must go through `shared/authz/filterCodec.js` (see authorisation.md Lessons).
