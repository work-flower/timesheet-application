# Authorisation — Multiuser Granular Roles (Wiring)

## Overview

Authentication is fully offloaded to Cloudflare Access (tunnel). The app owns **authorisation**: granular, role-based, default-deny, enforced at the execution-pipeline choke point by merging role-defined **pre-filter queries** into every NeDB operation. No ownership fields exist on records — scoping is purely filter-driven.

Everything is gated by the **`AUTH_ENABLED`** env var. Unset/false = legacy single-user behaviour (no identity, no enforcement, no attribution — byte-identical). Only meaningful behind the Cloudflare tunnel: identity headers are forgeable on a LAN, so never enable it for a directly-exposed deployment.

## File Chain

```text
shared/authz/
  registry.js       — TABLES (19 wrapped collections), ACTIONS per table, BASELINE_READ_TABLES, PROTECTED_FIELDS (never fls-excludable)
  macros.js         — resolveMacros(): $$user.*, $$today, $$startOfMonth, $$today±Nd, $regex rehydration
  filterValidate.js — validateFilter() / validatePrivileges() (bans $where, unknown macros/tables/actions; fls wrapper validation), opValue() normaliser
  filterCodec.js    — encodePrivileges()/decodePrivileges() — NeDB storage escaping (see Lessons)
  redaction.js      — REDACTED sentinel ('***redacted***') shared by the server mask hook and the app UI

server/pipeline/
  authFlag.js       — isAuthEnabled()
  identity.js       — identityMiddleware: header → user lookup → JIT-pending → grants → ALS
  authorisation.js  — checkAccess() (sync, 3 phases), enforceWriteScope() (async post-image), requireAction()
  attribution.js    — wildcard pre-hooks stamping createdBy/updatedBy (registered via db/index.js import)
  fieldSecurity.js  — wildcard fls hooks: mask read-hidden fields post-find/findOne, strip write-hidden fields pre-insert/update (registered AFTER attribution)
  systemContext.js  — runAsSystem(fn, extraStore) — system identity for background/engine work
  uploads.js        — createUpload()/contextualDiskStorage(): ALS-preserving multer wrappers — the ONLY sanctioned multipart middleware (see Lessons)
  context.js        — buildContext() now includes `auth` from ALS
  index.js          — write path awaits enforceWriteScope between checkAccess and pre-hooks; proxy exposes `collectionName`

server/services/
  userService.js    — users CRUD, findByEmail, createPending (JIT), syncMembership (M2M both sides)
  roleService.js    — roles CRUD, privilege validation, filter encode/decode at the storage boundary
  accessService.js  — resolveGrants(user): union roles → macro-resolve → grant shape for checkAccess; per-op fls intersection

server/odata.js        — buildQuery() rejects $filter/$orderby/$summary/baseFilter refs to read-hidden fields (400 field_forbidden)
server/utils/errors.js — ForbiddenError (403 + code), BadRequestError (400 + code), respondError(res, err, fallback)
server/index.js        — identityMiddleware registered right after the ALS middleware; central error handler
server/db/index.js     — users.db/roles.db wrapped; calendar/ticket stores now wrapped; unique users.email index; collectionsByName map

admin/src/pages/access/
  RolesPage.jsx        — role card list (add/edit navigate to the editor page; delete stays here)
  RoleEditPage.jsx     — full-page privilege matrix editor (/access/roles/new, /access/roles/:id)
  roleEditorState.js   — editor state ↔ privileges mapping (buildEditorState/fromEditorState)
admin/src/components/FlsPicker.jsx — shared fls tag-picker (sampled suggestions + free-text Enter)
```

## Data Model

### users

| Field | Description |
|-------|-------------|
| email | Unique (lowercased). Identity key from Cloudflare header/JWT |
| status | `pending` (JIT default, no access) / `active` / `disabled` (403 everywhere) |
| roleIds | Array of role ids (bidirectional with role.userIds) |
| roleNames | Computed on read (not stored) |

### roles

| Field | Description |
|-------|-------------|
| name | Required |
| description | Optional |
| privileges | `{ [table]: { read: filter\|bool\|{access, fls:[fields]}, create: bool\|{access, fls}, update: <as read>, delete: filter\|bool, actions: [names] } }` — stored ENCODED (see Lessons), decoded on every read. The `{ access, fls }` wrapper is written ONLY when fls is non-empty (the `fls` key IS the discriminator — zero migration for plain-shaped roles). `delete` never carries fls (whole-record op, rejected at validation) |
| userIds | Array of member user ids — managed ONLY via `userService.syncMembership` |
| userCount | Computed on read (not stored) |

Backup: both collections are included in R2 backup archives and restore (backupService collection lists).

## Enforcement Semantics

- **Default deny**: a table absent from the user's merged grants (or an unlisted action) is inaccessible.
- **Reads (`find`/`findOne`/`count`)**: filter merged as `{ $and: [roleFilter, query] }` by mutating `context.args[0]` inside the synchronous `checkAccess` — out-of-scope records behave as not-found. Covers OData `$count`/`$summary` and every cross-entity/enrichment read, since all go through the wrapped collections.
- **update/delete**: same selector merge (pre-image). Updates additionally get a **post-image check** (`enforceWriteScope`, async on the write path): every candidate is modified in memory (`model.modify` from `@seald-io/nedb/lib/model.js`) and re-tested against the raw grant filter (`model.match`) — an update that would move a record outside the caller's scope is rejected 403 `code:scope_escape`.
- **create**: boolean privilege only. **Upserts** additionally require `create: true` (insert branch not scope-checked — documented limitation).
- **Multiple roles union**: any `true` wins; otherwise filters OR together (`{$or:[...]}`); `create` ORs; actions set-union.
- **Named actions** (`requireAction(table, action)` route middleware): gates lifecycle endpoints. Two shapes, chosen by what runs after the gate:
  - **Lifecycle shape** (invoice confirm/post/unconfirm/updatePayment): gate → **caller-scoped existence check** (`getById` under user grants → 404 if invisible) → execute under **system identity** (`runAsSystem`), because lifecycle ops perform privileged cross-entity writes (locks on timesheets/expenses, invoice seed) that table grants shouldn't have to cover.
  - **Caller-identity shape** (`upload` actions, staged `submit`, import `abandon`, source `refresh`): gate → execute under the **caller's** identity so attribution records the real actor and record scoping/fls still apply. Upload gates sit BEFORE the multipart middleware, so denied callers are rejected before the body is consumed.
  - Current actions: invoices `confirm/post/unconfirm/updatePayment`, stagedTransactions `submit`, importJobs `abandon`, calendarSources/ticketSources `refresh`, users `impersonate`, expenses/notebooks/dailyPlans `upload` (= manage attached files: add AND remove/rename — expense attachments incl. the mobile upload page, notebook media/artifacts/TTS audio, daily-plan TTS audio). Create-style uploads (import-jobs POST/PUT, notebooks/import) are NOT actions — the upload IS the create/update, so CRUD privileges apply.
- **Attribution**: wildcard pre-hooks stamp `createdBy`/`updatedBy` (acting email, or `system`) on every insert/update when AUTH_ENABLED. These fields are audit-only — **never** used in filter evaluation by the engine or services. **Documented exception (agent layer, user-approved):** *role-authored* pre-filters on the `conversations` table may reference `createdBy` via the `$$user.email` macro to give each user private assistant threads — this stays inside the standard role-filter mechanism (admin-authored data, merged by checkAccess phase 3), not hardcoded service logic. The seeded roles carry `{ createdBy: '$$user.email' }` on conversations read/update/delete.
- **403 surfacing**: pipeline throws `ForbiddenError` (statusCode 403 + machine `code`: `unauthenticated`/`pending`/`disabled`/`forbidden`/`scope_escape`); route catch blocks call `respondError(res, err, fallback)`; a central Express error handler is the safety net.

## Field-Level Security (fls)

Per role, per table, **per operation** (`read`/`create`/`update` — never `delete`), an fls list hides individual fields from members. Field names are free-form (schemaless data layer): the Roles editor samples suggestions from records (`GET /admin/api/roles/table-fields/:table`, ~200-doc sample minus PROTECTED_FIELDS) but custom values are always allowed; names not present on a record are ignored silently. In the matrix editor the fls picker lives in a per-cell popover; suggestions are fetched lazily the first time a table's popover opens (never prefetched for all tables).

**Read masking** (`fieldSecurity.js` post-hook on `find`/`findOne`): read-hidden fields are masked in place on every fetched doc — strings → `"***redacted***"` (shared `REDACTED` constant), everything else → `null`; keys stay present, absent keys stay absent; `count` untouched. Covers lists, detail, `$expand` nested docs (masked per their own table), enrichment reads, MCP, reports — everything through the wrapped collections. NeDB returns deep copies, so in-place mutation is safe.

**Write stripping** (pre-hooks on `insert`/`update`, registered after attribution so `updatedBy` lands first): effective sets are **insert = read ∪ create**, **update = read ∪ update** — read-hidden implies write-stripped. Write-only fields are deliberately unsupported: forms save full objects, so honouring a write-only combination would echo masked values over real data. Strips match the full modifier key AND its first dot-segment (`$set['resources.0.dailyRate']` → `resources`). Because services write with `$set` and the strip runs AFTER all service logic, a stripped field is simply never mentioned in the modifier — the stored value survives byte-for-byte even when a service invents values for absent fields (projectService `undefined → null` inheritance) or normalises a masked echo (`normalizeResources(null) → []`). **Replacement-style updates (modifier with no `$` operators) are REJECTED 403 `fls_replacement_update`, never stripped** — stripping a replacement doc would erase the hidden fields.

**Query-inference rejection** (`server/odata.js` `buildQuery`): `$filter` probes, `$orderby`, `$summary`, and legacy params folded into `baseFilter` referencing a read-hidden field → **400 `field_forbidden`** (typed `BadRequestError`, so GET routes surface 400 despite their 500 fallback). `$select` is allowed — masking runs first and it only narrows. `useODataList` drops read-hidden fields from its auto-`$summary` client-side so one hidden money column doesn't 400 the whole list.

**Merge across roles** (`resolveGrants`): per-op most-permissive **intersection** — a field is hidden for an op only when EVERY role granting that op lists it; a granting role with no fls ⇒ no exclusions for that op. Grant shape: `grants[table].fls = { read?: Set, create?: Set, update?: Set }` (keys only when non-empty). `/api/me` mirrors it as arrays in `tables[t].fls`.

**PROTECTED_FIELDS** (registry; rejected at role save): `_id, createdAt, updatedAt, createdBy, updatedBy, impersonatedBy, isLocked, isLockedReason`. Masking `isLocked` would blind `assertNotLocked` (services read lock state through the masked collection) and silently disable record locking; stripping attribution fields would erase audit stamps.

**Bypasses**: system identity (`runAsSystem`), superuser (admin surface), and flag-off legacy mode are untouched by construction — `fieldSecurity` bails exactly like attribution.

### Caveats (admin configuration rules)

- **Computed/enriched fields derive their visibility from their SOURCE fields — by design** (user ruling, not a limitation): enrichment runs per-service AFTER the pipeline, so a computed field is never masked by name (a computed name in an fls list is ignored silently, per the elasticity rule) and instead reflects whatever its masked/visible inputs produce. Hiding `projects.rate` alone lets `effectiveRate` fall back to the still-visible `client.defaultRate` (projectService.js:74) — that is correct behaviour; to degrade the computation, hide its sources (`projects.rate` + `clients.defaultRate` ⇒ `effectiveRate` computes 0). Do NOT add response-level masking for computed fields.
- **Masked internal reads degrade derived recomputation**: services recompute stored values from cross-entity reads under user identity (timesheet days/amount from project rates; invoice lines snapshot timesheet/expense values). Partial exclusion stores degraded math; excluding the full group means the recomputed outputs are stripped too.
- **Exclude arithmetic siblings together** (from the service audit):

| Entity | Hide together | Why |
|---|---|---|
| timesheets | hours, days, amount (+ projectId, clientId if scoping matters) | days/amount recomputed from hours + project rates on every save |
| expenses | amount, vatAmount, vatPercent, netAmount | VAT recompute cross-derives all four |
| expenses | projectId, clientId | clientId is a snapshot of projects.clientId |
| invoices | lines, transactions, subtotal, totalVat, total | totals recomputed from lines; RMW link/unlink flows |
| transactions | status, ignoreReason | lock state derived from both |
| notebooks | title, summary, tags, related* — title effectively un-hideable | all re-derived from content on save; title drives on-disk folder resolution |
| projects ⇄ clients | rate + defaultRate (→ effectiveRate); workingHoursPerDay pair | inheritance fallback leaks/zeroes the computed value |
| cross-entity | projects.rate/workingHoursPerDay/clientId/vatPercent, clients.defaultRate/workingHoursPerDay/currency must stay READABLE for roles that write timesheets/expenses/invoices | masked inputs → £0 amounts, wrong days, redacted currency snapshots |

- **Array fields on RMW endpoints** (invoices.lines/transactions, dailyPlans link arrays, expenses.transactions/attachments): read-hiding them for a role that still holds update makes read-modify-write endpoints see `null` — keep them readable wherever writable.
- **Status fields must stay readable for update roles**: guards were hardened to fail closed (invoice update whitelists draft/confirmed; transaction status validated against the vocabulary), so a masked status now errors loudly instead of failing open — but the sensible config is simply not to read-hide `status` from writers.
- **Hiding a field used by a list's default `$orderby`/filters or a role pre-filter** makes those views 400 by design (no graceful degradation).
- **On-disk content bypasses fls entirely** (notebooks content.md/media, daily-plan content/recap/briefing files) — fls governs DB fields only.
- **Required fields**: hiding a create-required field (e.g. timesheets.projectId) makes that create form a dead end (Save disabled, field shows the hidden hint) — deliberate loud failure.

### Frontend rendering

- `/api/me` `tables[t].fls` → `CurrentUserContext.fls(table)` → `{ read, create, update }` Sets (shared empties in legacy mode).
- **`FormDataProvider`** (in `FormSection.jsx`) — per-form context `{ table, isNew, fls, changedFields, locked }`; declared once at the form root. **`FormField name="field"`** derives everything: read-hidden → standard redacted control (label preserved by cloning the Fluent `Field`; plain `Input` showing `***redacted***` + eye-off icon + "Hidden by your security role" hint; children never rendered, so dropdown options stay out of the DOM); write-blocked-only → real value inside a per-field disabled fieldset with "Read-only for your security role". `changed`/`redacted` props remain as provider-less fallbacks. The `name` prop replaces `changed={changedFields.has(...)}` at every call site.
- Forms also: strip `read ∪ (isNew ? create : update)` keys from create defaults, `QueryStringPrefill exclude`, and the save payload (server strips authoritatively regardless — the client strip keeps masked values out of service validation).
- Lists: numeric cells/cards/footers render `—` when their field is read-hidden (never a fake £0.00); string columns show the sentinel naturally.

## Identity Lifecycle

1. **Resolution** (`identityMiddleware`, guards `/api/*`, `/mcp`, `/notebooks/*`; skips `/api/health`): email from `Cf-Access-Authenticated-User-Email`, falling back to the `Cf-Access-Jwt-Assertion` payload's `email`/`common_name` (service tokens / MCP). Main-surface JWT is not signature-verified — the tunnel is the trust boundary.
2. **JIT-pending provisioning**: unknown email → user auto-created `status:pending`, request answered 403 `code:pending`. Unique email index guards concurrent-first-request races.
3. **Grants**: active users get `resolveGrants(user)` per request (no caching — role changes bite on the next request). Result stamped into ALS as `store.auth = { user:{id,email,status}, grants }`.
4. **`/api/me` exception**: pending/disabled users are NOT rejected on this path (they get `auth` with empty grants) so the frontend can render the awaiting-access page from one call.
5. **Suspension**: `disabled` → 403 `code:disabled` everywhere regardless of Cloudflare session.
6. **System identity**: background execution (calendar/ticket schedulers, backup cron, log uploader, import AI parsing, seed) runs under `runAsSystem` — full access, attribution `system`. The engine's own users/roles reads also run as system (avoids chicken-and-egg denial).
7. **Admin surface** (`/admin/api/*`): guarded by `adminSurfaceMiddleware` (`server/services/cfAccessJwt.js`) — verifies the `Cf-Access-Jwt-Assertion` signature against the team JWKS (`jose`) plus `aud === CF_ADMIN_AUD` and issuer, then stamps `{ superuser: true }` (bypasses the engine entirely). No app-level admin role, no bootstrap. Flag on + missing `CF_TEAM_DOMAIN`/`CF_ADMIN_AUD` → 503 fail-closed; flag off → open (local dev). Routers backed by UNWRAPPED config stores exist only here (backup, ai-config, mcp-auth, logs minus the pageview beacon, gemini config verbs, notebook git config) plus `/admin/api/users` + `/admin/api/roles`; wrapped-collection routers are dual-mounted (engine-protected on `/api`). The admin SPA (`admin/src/api/index.js`) points at `/admin/api`; the Users/Roles pages live at `admin/src/pages/access/` (role list at `/access/roles`, matrix editor at `/access/roles/new` + `/access/roles/:id` — `RoleEditPage.jsx`). Note: admins visiting the admin console still trigger the main-surface pageview beacon, so they appear as pending users in the Users list — expected.

## Filter Language

Stored filters are Mongo-style JSON in the NeDB dialect: `$lt $lte $gt $gte $ne $in $nin $exists $size $elemMatch $or $and $not` (+ implicit equality, dot paths). **`$where` is banned** (validated at role save AND unknown macros throw at resolution). Regex uses `{"$regex":"pattern","$flags":"i"}` — rehydrated to a real RegExp at grant resolution (NeDB throws on string patterns).

Macros (resolved per-request in `accessService` before the pipeline sees them):

| Macro | Resolves to |
|-------|-------------|
| `$$user.id` / `$$user.email` | Requesting user's id / email |
| `$$now` | ISO timestamp |
| `$$today` | `YYYY-MM-DD` |
| `$$startOfWeek` (Mon) / `$$startOfMonth` / `$$startOfYear` | `YYYY-MM-DD` |
| `$$today+Nd` / `$$today-Nd` | Day-offset `YYYY-MM-DD` |
| `$$idsOf(...)` | RESERVED — rejected until lookup macros ship |

## Impersonation ("View As")

Full write-through impersonation for System Admin-style users — the app behaves EXACTLY as the target (their filters, `$$user.*` macros, gated UI, even the awaiting-access screen for pending targets).

- **Privilege:** the `users.impersonate` named action. Role recipe: `users: { read: true, actions: ['impersonate'] }` **plus `roles: { read: true }`** (the users list enriches roleNames through the wrapped roles collection and 403s without it).
- **Signal:** httpOnly session cookie `impersonate=<email>` (SameSite=Lax, Path=/, dies with the browser) set by `POST /api/me/impersonate {email}` and cleared by `DELETE /api/me/impersonate`. A cookie — not a header — so it rides on `<img>` thumbnails, PDF iframes, notebook media and every raw fetch automatically. `Secure` is set when the request reached the edge over https (gated on `X-Forwarded-Proto: https`, which Cloudflare sets), so the tunnelled deployment gets `Secure` while local http dev still works — no `trust proxy` is configured, so read the forwarded header directly rather than `req.secure`.
- **Per-request swap** (`identity.js`): after resolving the REAL user + grants, a valid cookie swaps `store.auth` to the target's identity + grants with `impersonatedBy: realEmail`; `store.user` stays the REAL email and `store.impersonating` carries the target (log entries show both). Invalid cookies (no grant, unknown target, self, impersonation-capable target) warn + fall through to self — stale cookies after demotion are harmless.
- **Guard rail:** impersonation-capable users cannot be impersonated (checked at start AND per request). Self-impersonation rejected. Nested impersonation impossible by construction.
- **CRITICAL — skip-swap:** the middleware skips the swap for `path.startsWith('/api/me/impersonate')` so start/stop always run as the REAL user. Without this, switching targets would 403 (target grants never include impersonate) and stopping while impersonating a pending/disabled target would be blocked before the route could clear the httpOnly cookie — a permanent lock-out.
- **Attribution:** impersonated writes → `createdBy`/`updatedBy` = target, `impersonatedBy` = real admin. Updates ALWAYS set `impersonatedBy` (null when not impersonating) so stale values can't misrepresent the latest write. Caveat: lifecycle actions (invoice confirm etc.) execute under `runAsSystem`, so those record writes show `updatedBy: 'system'` — the log entries retain `user` (real) + `impersonating` (target).
- **Picker data:** GET-only users router mounted at `/api/users` (engine-gated by `users.read`). Deliberately not the full router — a partially-granted PUT could half-write the bidirectional membership via `syncMembership`.
- **Frontend:** `CurrentUserProvider` renders a persistent `ImpersonationBanner` (target + Stop) above BOTH the app and the BlockedScreen (Stop must be reachable when impersonating a blocked user; covers embedded mode). Top-bar Impersonate button in `AppLayout` gated on `enabled && canAction('users','impersonate')` — the `enabled &&` matters because `canAction` returns true in flag-off legacy mode. Start/stop trigger `window.location.reload()` (page state is scoped to the old identity).
- **Constraint:** SameSite=Lax means cross-site iframing would drop the cookie; same-origin `?embedded=true` is unaffected.

## Frontend (main app)

- **`GET /api/me`** (`server/routes/me.js`) returns `{ enabled, email, status, tables: {t: {read,create,update,delete}}, actions: {t: [names]} }` — booleans only, never raw filters (filter ⇒ `true` = "some access"). Flag off ⇒ `{ enabled: false }`. Pending/disabled users get a 200 here (identity middleware exemption) so the UI can render the block screen from one call.
- **`CurrentUserProvider`** (`app/src/contexts/CurrentUserContext.jsx`) fetches `/api/me` once, exposes `useCurrentUser()` → `{ me, enabled, canRead/canCreate/canUpdate/canDelete/canAction }` (all-true when `enabled: false`). The provider itself renders the awaiting-access / disabled screen — mounted in `App.jsx` ABOVE the layout so it also covers `?embedded=true` iframes.
- **Sidebar**: `AppLayout.jsx` filters `navItems` through the `NAV_TABLES` route→table map before rendering; groups hide when all children hide. Unlisted routes (`/`, `/help`) always show.
- **Forms** (clients/projects/timesheets/expenses/invoices): the locked-record trio is extended — `isLocked = record.isLocked || (isNew ? !canCreate(table) : !canUpdate(table))`. Lists hide the New button via `onNew={canCreate(t) ? ... : undefined}`. Invoice Confirm/Post/Unconfirm buttons gate on `canAction('invoices', ...)`.
- **`ApiError`** (both `app/src/api/index.js` and `admin/src/api/index.js`): every request/fetch error now carries `status` + machine `code` — react to `err.status === 403` / `err.code`, never parse messages.
- All UI gating is **cosmetic** — the pipeline enforces server-side regardless. Secondary pages (notebooks, daily plans, import jobs UI internals, etc.) rely on nav hiding + server 403s surfacing through existing error MessageBars.

## Admin Roles Editor (matrix)

Full-page editor at `/access/roles/new` + `/access/roles/:id` (`RoleEditPage.jsx`; the old dialog editor is gone). One row per registry table — all 19 always shown; rows left at all-none are omitted from the saved payload (default deny). Read/Update/Delete cells cycle No access → All records → Filtered on click; Create is boolean-only (No access → All records). Filter JSON is edited in a dialog (macro hints included); a Filtered cell with empty/unparseable JSON shows a warning icon and save is rejected client-side. Per-op fls popovers (read/create/update, never delete) use the shared `FlsPicker`; the `{access, fls}` wrapper is emitted only when fls is non-empty. Actions are a per-row count-badge popover over `ACTIONS[table]`. Baseline-read rows are tinted and a warning bar appears when any baseline read is missing; new roles pre-grant baseline reads. Cycling a cell never clears its filter/fls state — serialization follows the final mode only (`roleEditorState.js`). Client-side `validatePrivileges` runs before save; dirty tracking is a JSON snapshot wired into the shared unsaved-changes guard.

## Agent Layer (agents + conversations tables)

Two Phase-3 tables ride the standard engine (full wiring in `agents.md`):

- **`agents`** — the rebuildable index over agent card folders. Rule: **whatever agent the caller can see, they can talk to.** `GET /api/agents` (the @mention picker), `@mention` slug resolution (invisible ⇒ not-found ⇒ "unknown agent"), and `find_agent` routing candidates are all resolved through the caller-scoped wrapped collection; a role may narrow visibility with an ordinary pre-filter. **Chat access gate:** the SSE chat endpoint requires the caller to hold *some* `agents` read grant (`assertChatAccess` = caller-scoped `count`, before the stream opens) — no grant, no assistant.
- **Master no-leak boundary:** the reserved `master` card fronts every turn; its *definition* (boot-guaranteed files) is the ONLY non-caller-scoped resolution in a chat turn. Everything the master *does* — tool calls, candidate filtering, `ask_agent` specialist resolution — executes in the caller's ALS scope. Never wrap the agent loop in `runAsSystem`.
- **`conversations`** — thin docs + disk transcripts; privacy via the role `createdBy` filter (see the attribution exception above). Legacy mode (AUTH off) bypasses everything as usual.

## Golden Rules

1. **Baseline reads**: list enrichment reads `clients`, `projects`, `settings` — every functional role MUST grant read on these (see `BASELINE_READ_TABLES`) or list endpoints 403 mid-request. This is deliberate (no graceful degradation): misconfigured roles fail loudly.
2. Filters can only reference fields ON the record itself (no joins, no lookup macros yet) — e.g. scoping timesheets by client requires enumerating `projectId $in [...]` statically.
3. Membership writes go through `userService.syncMembership` only — never touch `roleIds`/`userIds` directly.
4. Role privilege writes go through `roleService` only — it validates AND encodes; raw `roles.update` with plain filters will corrupt the store (see Lessons).

## Rollout Runbook (first enablement on the tunnel deployment)

1. **Deploy with the flag off** (default). Everything behaves as the legacy single-user build.
2. In Cloudflare Zero Trust, note the **team name** and the admin Access application's **AUD tag**; provide `CF_TEAM_DOMAIN` and `CF_ADMIN_AUD` to the deployment's environment. Confirm the admin Access app's path scope covers `/admin` (it then also covers `/admin/api` — no CF change needed).
3. Visit `/admin` (through the admin Access app) → **Access Control → Roles**: create roles (or run seed on a dev copy to see the two examples). Remember every functional role needs the baseline reads (clients, projects, settings).
4. Have each person visit the app once (they appear as **pending** in Users) or pre-create them; assign roles and set status **active**.
5. Set `AUTH_ENABLED=true` in the deployment's environment and restart.
6. Verify: `/api/health` 200 from the Cloudflare health monitor; one scoped user sees only their rows; one scheduler cycle logs cleanly (system identity); an admin page saves (JWT verification working). Roll back at any time by unsetting `AUTH_ENABLED`.

## Blast Radius

**If you change checkAccess/enforceWriteScope:** re-run the curl matrix (unauthenticated 403; JIT-pending; scoped list excludes out-of-scope rows; out-of-scope GET/PUT → 404; scope-escaping PUT → 403 scope_escape; no-grant table → 403; ungran­ted action → 403; create + attribution stamps). Verify flag-off is byte-identical (no createdBy on writes).

**If you add a collection:** wrap it in `db/index.js`, add to `shared/authz/registry.js` TABLES, decide backup inclusion (backupService lists), add lifecycle actions to ACTIONS if any.

**If you add a lifecycle route:** gate with `requireAction`, add the action to the registry, follow the scoped-getById-then-runAsSystem pattern.

**If you add a multipart (file upload) route:** use `createUpload` from `server/pipeline/uploads.js` — NEVER import multer directly (busboy callbacks lose the ALS store: 403 'Not authenticated' under enforcement, lost trace ids always). If a diskStorage callback touches a wrapped collection, build it with `contextualDiskStorage`. Attach-style endpoints (file onto an existing record) get `requireAction(table, 'upload')` BEFORE the upload middleware and run under caller identity; create-style uploads rely on CRUD privileges. Remember the rollout step: existing role documents must be granted the new action or the endpoint 403s for everyone.

**If you add a background job:** wrap its entry point in `runAsSystem` or it will be denied (or fail open with flag off and surprise you later).

**If you change fieldSecurity.js, the fls grant resolution, or buildQuery's rejection:** re-run the fls curl matrix (masked list/detail incl. string sentinel + null numerics; per-op intersection across two roles; write-blocked-only role reads real value but PUT leaves it unchanged; read-hidden echo PUT leaves stored values byte-identical — verify via raw .db read; 400 field_forbidden on $filter/$orderby/$summary; $select still masked-200; /api/me per-op fls arrays; role save rejects protected/dotted/fls-on-delete; flag-off byte-identical; sampling endpoint sorted-minus-protected).

**If you change identity.js or the impersonation flow:** re-run the impersonation curl matrix — start (Set-Cookie), `/api/me` shows target + `impersonating.by`, scoped reads/writes as target with `updatedBy: target` + `impersonatedBy: admin`, guard rails (self 400, admin target 403, non-admin 403), switch-target while impersonating works (skip-swap), pending target answers `/api/me` but 403s data, DELETE works while impersonating, non-impersonated update sets `impersonatedBy: null`, flag-off POST → 400.

## Lessons Learned

- **NeDB forbids stored document keys beginning with `$` or containing `.`** — the datastore refuses to LOAD a file containing them, bricking the whole collection. Role filters are therefore stored escaped (`$gte` → `＄gte` U+FF04, `a.b` → `a．b` U+FF0E) via `shared/authz/filterCodec.js`, and decoded on every read (roleService responses, accessService grant resolution). Never insert raw filters into `roles` directly.
- **zsh does not word-split unquoted variables** — when curl-testing with a header in a shell var, quote per-flag or requests silently break.
- **The cursor path cannot await** — all read-side enforcement must stay inside the synchronous `checkAccess`; async work (post-image checks, identity resolution) happens at the request boundary or on the write path, which does await.
- **Partial fls exclusion of a derived group stores desynced math — observed live, not theoretical.** A role with `update.fls: ['hours']` alone let a PUT with `hours: 2` recompute `amount` (2h × rate = £175) from the payload BEFORE the pipeline stripped `hours` from `$set` — stored result: `hours: 8, amount: 175`. The strip guarantees no field is *overwritten*, but derived outputs computed from a stripped input still persist unless the whole sibling group (`hours/days/amount`) is excluded together. This is why the sibling-group table above exists and is echoed in the Roles editor hint.
- **The per-request ALS store does not survive multer's body parsing — verified, not theoretical.** Busboy's completion callback fires from the request socket's I/O events, whose async context predates the `als.run` middleware, so `als.getStore()` is `undefined` in every post-multer handler (and in diskStorage callbacks, which run mid-parse). Under enforcement each wrapped-collection call then saw `auth: null` → 403 `Not authenticated` even for Root; with the flag off, those requests silently logged without requestId/traceId/user. Every historical multipart route had this bug (expense attachments, import-job create — the upload IS the create — notebook import). Fix: `server/pipeline/uploads.js` captures the store before parsing and re-enters it (`als.run`) around the continuation, errors included; `contextualDiskStorage` does the same for storage callbacks via a Symbol-keyed stash on `req`. Nested `als.run` is safe (`runAsSystem` inside handlers still layers on top). Routes-never-import-multer is grep-enforced: `grep -rn "from 'multer'" server/routes` must return nothing.
- **The impersonation cookie's `Secure` flag is gated on `X-Forwarded-Proto`, not `req.secure`** — the tunnel terminates https at the edge and forwards plain http to the app, and no `trust proxy` is set, so `req.secure` is always false server-side. Read `req.headers['x-forwarded-proto'] === 'https'` to decide `Secure` so the cookie is `Secure` in the tunnelled deployment yet still works over local http dev. `clearCookie` matches on name/path/domain only, so the `DELETE` handler needs no matching `secure` attribute.
