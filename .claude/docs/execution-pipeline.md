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
  context.js        — buildContext() reads ALS store, builds canonical context object
  hooks.js          — HookRegistry class, register() and run() methods
  authorisation.js  — checkAccess() stub (ready for implementation)
  cursorProxy.js    — CursorProxy class, defers post-hooks until cursor is evaluated

server/logging/asyncContext.js  — AsyncLocalStorage instance (shared with logging)
server/index.js                 — Express middleware that populates ALS store per request
server/db/index.js              — wrapCollection() called for every collection at boot
```

## How It Works

### Method Routing

| Method type | Methods | Behaviour |
| ----------- | ------- | --------- |
| Cursor | `find`, `findOne`, `count` | Returns CursorProxy (defers post-hooks until `.exec()` / `.then()`) |
| Async | `insert`, `update`, `remove` | Awaits operation, runs post-hooks, returns result |
| Pass-through | Everything else (EventEmitter, load, etc.) | Proxied directly to NeDB |

### Context Object

Built by `buildContext(collection, operation, args)` from ALS store:

```text
{
  requestId     — UUID per HTTP request
  traceId       — X-Trace-Id header (correlation across API calls)
  source        — derived from URL path (e.g. 'timesheets', 'invoices')
  method        — HTTP verb
  path          — request path
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

**Current state:** No hooks registered. Infrastructure complete, ready for audit logging, computed fields, field masking, etc.

### Authorization (`server/pipeline/authorisation.js`)

`checkAccess(context)` — currently a pass-through stub. Designed for:
- Phase 1: URL access checks
- Phase 2: Collection access checks
- Phase 3: Record scoping

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

**Not wrapped** (separate DB files, own management): `backupConfig.db`, `logConfig.db`, `ai-config.db`

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

(Empty — will be populated as issues are encountered)
