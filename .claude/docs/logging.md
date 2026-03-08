# Logging — Infrastructure Wiring

## File Chain

```text
Console interception:
  console.log/warn/error → logHook.js → JSON Lines file (app-YYYY-MM-DD.log)
                                       ← ALS context (requestId, traceId, source, method, path)

TraceId flow:
  traceId.js (client) → X-Trace-Id header → Express middleware → ALS store → logHook → log entry

Config & management:
  LoggingPage.jsx → logApi → routes/logs.js → logService.js → logConfig.db
                                                             → R2 (S3 SDK)

Search:
  LogViewer.jsx → logApi → routes/logs.js → logService.searchLogs → odata.js → JSON Lines files

Auto-upload:
  logUploader.js → logService.uploadToR2 → R2 (integrity-verified, deletes local)
```

## Backend

| What | File | Notes |
| ---- | ---- | ----- |
| Log hook | `server/logging/logHook.js` | Intercepts console.log/warn/error/debug, writes JSON Lines, file rotation |
| ALS context | `server/logging/asyncContext.js` | Shared AsyncLocalStorage instance (also used by execution pipeline) |
| Log uploader | `server/logging/logUploader.js` | Auto-upload cycle, initUploader() called at server startup |
| Config DB | `server/db/logConfig.js` | Separate NeDB file (`log-config.db`), not included in backups |
| Service | `server/services/logService.js` | Config CRUD, search (OData), local file ops, R2 upload/download/delete |
| Route | `server/routes/logs.js` | 11 endpoints: config, search, file list/read, upload/download/delete, R2 list, pageview |
| ALS middleware | `server/index.js` `als.run()` block | Sets requestId, traceId, source, method, path per request |
| Request logging | `server/index.js` `res.on('finish')` handler | Logs HTTP status line, optional payload logging |

## Frontend

| What | File | Notes |
| ---- | ---- | ----- |
| LogViewer | `admin/src/pages/infra/LogViewer.jsx` | Search with date/level/source/keyword/traceId filters, detail drawer |
| LoggingPage | `admin/src/pages/infra/LoggingPage.jsx` | Config form, R2 settings, local/R2 file grids |
| TraceId (main) | `app/src/api/traceId.js` | `newTraceId()` per navigation, `getTraceId()` on all API requests |
| TraceId (admin) | `admin/src/api/traceId.js` | Same pattern as main app |
| Pageview (main) | `app/src/layouts/AppLayout.jsx` | Calls `POST /api/logs/pageview` on navigation, generates new traceId |
| Pageview (admin) | `admin/src/layouts/AdminLayout.jsx` | Same pattern as main app |
| API client | Both `app/src/api/index.js` and `admin/src/api/index.js` | All requests include `X-Trace-Id` header |

## Golden Rules

**Error logging convention (all route handlers):**
- `console.warn(err.message)` for 4xx — managed exceptions (validation, business rules, lock checks)
- `console.error(err.message)` for 5xx — unexpected failures
- MCP tool errors: `console.error()` because tools return HTTP 200 with `isError: true` and would otherwise be invisible
- Request logging middleware separately logs HTTP status line (`METHOD /path STATUS duration`)

**TraceId correlation:** Each page navigation generates a client-side UUID. All API requests from that navigation share the same traceId via `X-Trace-Id` header. Server stores it in ALS and writes it to every log entry. Enables filtering all requests triggered by a single user action.

**File rotation:** Log files named `app-YYYY-MM-DD.log`. Rotated on size (`app-YYYY-MM-DD-{N}.log`). Active file (today's date) cannot be uploaded or deleted.

**Payload logging:** Opt-in, debug-level only. Sensitive fields masked by key pattern (`/secret|password|apikey/i`). Truncated at 2000 chars.

**R2 integrity:** Upload verifies filename + size + MD5 hash after transfer, then deletes local. Safe local delete requires R2 backup verification. Mismatches block deletion.

**Message filter:** Regex pattern tested against full serialized JSON entry. Filters by any field. Empty pattern logs everything.

## Key Integration Points

| What | How it connects |
| ---- | --------------- |
| **Execution pipeline** | Shares the same ALS instance (`asyncContext.js`). Pipeline context reads traceId, requestId, source from ALS store |
| **All route handlers** | Use `console.warn`/`console.error` which logHook intercepts. ALS context enriches every entry |
| **Server startup** | `logHook.js` imported first (before dotenv). `initUploader()` loads config and starts auto-upload |
| **OData** | `logService.searchLogs()` uses `parseFilter`, `parseOrderBy`, `applySelect`, `formatResponse` from `odata.js` |

## Blast Radius

**If you change logHook.js (console interception, file writing):**
- Check: All log levels still captured (debug/info/warn/error)
- Check: ALS context still enriches entries (requestId, traceId, source)
- Check: File rotation still works (date-based + size-based)
- Check: Crash handlers (uncaughtException, unhandledRejection) still log

**If you change ALS middleware (server/index.js):**
- Check: Execution pipeline context still gets all fields
- Check: logHook still reads traceId/requestId from ALS
- Check: Background tasks (AI parsing, log uploader) still provide ALS context via `als.run()`

**If you change logService (search, R2 ops):**
- Check: OData search still works (filter, orderby, skip, top, count, select)
- Check: R2 integrity verification still blocks mismatched deletions
- Check: Active file protection still prevents operations on today's log

**If you change the error logging convention:**
- Update: This wiring doc's Golden Rules section
- Check: All route catch blocks follow the same pattern (warn for 4xx, error for 5xx)

## Lessons Learned

(Empty — will be populated as issues are encountered)
