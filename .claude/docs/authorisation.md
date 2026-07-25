# Authorisation — Multiuser Granular Roles (Wiring)

## Overview

Authentication is fully offloaded to Cloudflare Access (tunnel). The app owns **authorisation**: granular, role-based, default-deny, enforced at the execution-pipeline choke point by merging role-defined **pre-filter queries** into every NeDB operation. No ownership fields exist on records — scoping is purely filter-driven.

Everything is gated by the **`AUTH_ENABLED`** env var. Unset/false = legacy single-user behaviour (no identity, no enforcement, no attribution — byte-identical). Only meaningful behind the Cloudflare tunnel: identity headers are forgeable on a LAN, so never enable it for a directly-exposed deployment.

## File Chain

```text
shared/authz/
  registry.js       — TABLES (19 wrapped collections), ACTIONS per table, BASELINE_READ_TABLES
  macros.js         — resolveMacros(): $$user.*, $$today, $$startOfMonth, $$today±Nd, $regex rehydration
  filterValidate.js — validateFilter() / validatePrivileges() (bans $where, unknown macros/tables/actions)
  filterCodec.js    — encodePrivileges()/decodePrivileges() — NeDB storage escaping (see Lessons)

server/pipeline/
  authFlag.js       — isAuthEnabled()
  identity.js       — identityMiddleware: header → user lookup → JIT-pending → grants → ALS
  authorisation.js  — checkAccess() (sync, 3 phases), enforceWriteScope() (async post-image), requireAction()
  attribution.js    — wildcard pre-hooks stamping createdBy/updatedBy (registered via db/index.js import)
  systemContext.js  — runAsSystem(fn, extraStore) — system identity for background/engine work
  context.js        — buildContext() now includes `auth` from ALS
  index.js          — write path awaits enforceWriteScope between checkAccess and pre-hooks

server/services/
  userService.js    — users CRUD, findByEmail, createPending (JIT), syncMembership (M2M both sides)
  roleService.js    — roles CRUD, privilege validation, filter encode/decode at the storage boundary
  accessService.js  — resolveGrants(user): union roles → macro-resolve → grant shape for checkAccess

server/utils/errors.js — ForbiddenError (403 + code), respondError(res, err, fallback)
server/index.js        — identityMiddleware registered right after the ALS middleware; central error handler
server/db/index.js     — users.db/roles.db wrapped; calendar/ticket stores now wrapped; unique users.email index
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
| privileges | `{ [table]: { read: filter\|bool, create: bool, update: filter\|bool, delete: filter\|bool, actions: [names] } }` — stored ENCODED (see Lessons), decoded on every read |
| userIds | Array of member user ids — managed ONLY via `userService.syncMembership` |
| userCount | Computed on read (not stored) |

Backup: both collections are included in R2 backup archives and restore (backupService collection lists).

## Enforcement Semantics

- **Default deny**: a table absent from the user's merged grants (or an unlisted action) is inaccessible.
- **Reads (`find`/`findOne`/`count`)**: filter merged as `{ $and: [roleFilter, query] }` by mutating `context.args[0]` inside the synchronous `checkAccess` — out-of-scope records behave as not-found. Covers OData `$count`/`$summary` and every cross-entity/enrichment read, since all go through the wrapped collections.
- **update/delete**: same selector merge (pre-image). Updates additionally get a **post-image check** (`enforceWriteScope`, async on the write path): every candidate is modified in memory (`model.modify` from `@seald-io/nedb/lib/model.js`) and re-tested against the raw grant filter (`model.match`) — an update that would move a record outside the caller's scope is rejected 403 `code:scope_escape`.
- **create**: boolean privilege only. **Upserts** additionally require `create: true` (insert branch not scope-checked — documented limitation).
- **Multiple roles union**: any `true` wins; otherwise filters OR together (`{$or:[...]}`); `create` ORs; actions set-union.
- **Named actions** (`requireAction(table, action)` route middleware): gates lifecycle endpoints. After the gate passes, routes do a **caller-scoped existence check** (`getById` under user grants → 404 if invisible) then execute the operation under **system identity** (`runAsSystem`) because lifecycle ops perform privileged cross-entity writes (invoice confirm sets locks on timesheets/expenses and bumps the invoice seed) that table grants shouldn't have to cover. Current actions: invoices `confirm/post/unconfirm/updatePayment`, stagedTransactions `submit`, importJobs `abandon`, calendarSources/ticketSources `refresh`.
- **Attribution**: wildcard pre-hooks stamp `createdBy`/`updatedBy` (acting email, or `system`) on every insert/update when AUTH_ENABLED. These fields are audit-only — **never** used in filter evaluation.
- **403 surfacing**: pipeline throws `ForbiddenError` (statusCode 403 + machine `code`: `unauthenticated`/`pending`/`disabled`/`forbidden`/`scope_escape`); route catch blocks call `respondError(res, err, fallback)`; a central Express error handler is the safety net.

## Identity Lifecycle

1. **Resolution** (`identityMiddleware`, guards `/api/*`, `/mcp`, `/notebooks/*`; skips `/api/health`): email from `Cf-Access-Authenticated-User-Email`, falling back to the `Cf-Access-Jwt-Assertion` payload's `email`/`common_name` (service tokens / MCP). Main-surface JWT is not signature-verified — the tunnel is the trust boundary.
2. **JIT-pending provisioning**: unknown email → user auto-created `status:pending`, request answered 403 `code:pending`. Unique email index guards concurrent-first-request races.
3. **Grants**: active users get `resolveGrants(user)` per request (no caching — role changes bite on the next request). Result stamped into ALS as `store.auth = { user:{id,email,status}, grants }`.
4. **`/api/me` exception**: pending/disabled users are NOT rejected on this path (they get `auth` with empty grants) so the frontend can render the awaiting-access page from one call.
5. **Suspension**: `disabled` → 403 `code:disabled` everywhere regardless of Cloudflare session.
6. **System identity**: background execution (calendar/ticket schedulers, backup cron, log uploader, import AI parsing, seed) runs under `runAsSystem` — full access, attribution `system`. The engine's own users/roles reads also run as system (avoids chicken-and-egg denial).
7. **Admin surface** (`/admin/api/*`): guarded by `adminSurfaceMiddleware` (`server/services/cfAccessJwt.js`) — verifies the `Cf-Access-Jwt-Assertion` signature against the team JWKS (`jose`) plus `aud === CF_ADMIN_AUD` and issuer, then stamps `{ superuser: true }` (bypasses the engine entirely). No app-level admin role, no bootstrap. Flag on + missing `CF_TEAM_DOMAIN`/`CF_ADMIN_AUD` → 503 fail-closed; flag off → open (local dev). Routers backed by UNWRAPPED config stores exist only here (backup, ai-config, mcp-auth, logs minus the pageview beacon, gemini config verbs, notebook git config) plus `/admin/api/users` + `/admin/api/roles`; wrapped-collection routers are dual-mounted (engine-protected on `/api`). The admin SPA (`admin/src/api/index.js`) points at `/admin/api`; the Users/Roles pages live at `admin/src/pages/access/`. Note: admins visiting the admin console still trigger the main-surface pageview beacon, so they appear as pending users in the Users list — expected.

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

**If you add a background job:** wrap its entry point in `runAsSystem` or it will be denied (or fail open with flag off and surprise you later).

**If you change identity.js or the impersonation flow:** re-run the impersonation curl matrix — start (Set-Cookie), `/api/me` shows target + `impersonating.by`, scoped reads/writes as target with `updatedBy: target` + `impersonatedBy: admin`, guard rails (self 400, admin target 403, non-admin 403), switch-target while impersonating works (skip-swap), pending target answers `/api/me` but 403s data, DELETE works while impersonating, non-impersonated update sets `impersonatedBy: null`, flag-off POST → 400.

## Lessons Learned

- **NeDB forbids stored document keys beginning with `$` or containing `.`** — the datastore refuses to LOAD a file containing them, bricking the whole collection. Role filters are therefore stored escaped (`$gte` → `＄gte` U+FF04, `a.b` → `a．b` U+FF0E) via `shared/authz/filterCodec.js`, and decoded on every read (roleService responses, accessService grant resolution). Never insert raw filters into `roles` directly.
- **zsh does not word-split unquoted variables** — when curl-testing with a header in a shell var, quote per-flag or requests silently break.
- **The cursor path cannot await** — all read-side enforcement must stay inside the synchronous `checkAccess`; async work (post-image checks, identity resolution) happens at the request boundary or on the write path, which does await.
- **The impersonation cookie's `Secure` flag is gated on `X-Forwarded-Proto`, not `req.secure`** — the tunnel terminates https at the edge and forwards plain http to the app, and no `trust proxy` is set, so `req.secure` is always false server-side. Read `req.headers['x-forwarded-proto'] === 'https'` to decide `Secure` so the cookie is `Secure` in the tunnelled deployment yet still works over local http dev. `clearCookie` matches on name/path/domain only, so the `DELETE` handler needs no matching `secure` attribute.
