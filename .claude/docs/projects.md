# Projects — Entity Wiring

## File Chain

```text
ProjectForm.jsx → projectsApi (api/index.js) → routes/projects.js → projectService.js → db.projects
```

## Frontend

| What | File | Notes |
| ---- | ---- | ----- |
| Form | `app/src/pages/projects/ProjectForm.jsx` | Tabs: General, Resources, Timesheets, Expenses, Documents, Invoices. Rate/hours show "Inherited from client: £X" placeholder when null. Uses `useNotifyParent` for embedded mode. Resources tab: read-only DataGrid + Add/Edit dialog, deferred save (array rides the form's normal Save). Timesheets/Expenses tabs fetch their own lists via `timesheetsApi`/`expensesApi.getAll({ projectId })` (Documents/Invoices already did) — the detail response carries no embeds |
| Resource dialog | `app/src/pages/projects/ResourceDialog.jsx` | Add/Edit dialog for one resource. Owns the `usersApi.getAll()` fetch, prefills dailyRate from `projectData.effectiveRate` on add, dedupes already-assigned users, injects a snapshot `<option>` when the user record is missing |
| List | `app/src/pages/projects/ProjectList.jsx` | showArchived toggle, columns: name, client, IR35, effectiveRate, status |
| API client | `app/src/api/index.js` (projectsApi) | 5 methods: getAll, getById, create, update, delete |

## Backend

| What | File | Notes |
| ---- | ---- | ----- |
| Route | `server/routes/projects.js` | 5 endpoints: standard CRUD |
| Service | `server/services/projectService.js` | CRUD, effectiveRate/Hours computation, null coercion, isDefault protection, cascade delete. `getAll`: `?clientId=` entity param; `$expand` (client, timesheets, expenses, documents) resolved centrally via `server/expand.js` (batched `$in`, unknown name → 400 `bad_expand`). `getById`: stored fields + clientName/effectiveRate/effectiveWorkingHours scalars only (no embedded timesheets/expenses). `update()` strips read-model keys (clientName, effectiveRate, effectiveWorkingHours, timesheets, expenses, client, documents) in addition to the protected fields |
| DB collection | `server/db/index.js` | `projects` — wrapped NeDB via execution pipeline |

## Inheritance Chain

```text
client.defaultRate ──→ project.rate (null = inherit) ──→ effectiveRate
client.workingHoursPerDay ──→ project.workingHoursPerDay (null = inherit) ──→ effectiveWorkingHours
```

Computed in `projectService.js` getAll/getById:
- `effectiveRate = project.rate != null ? project.rate : (client.defaultRate || 0)`
- `effectiveWorkingHours = project.workingHoursPerDay != null ? project.workingHoursPerDay : (client.workingHoursPerDay || 8)`

## Resources (embedded 1:N)

Projects hold an embedded `resources` array — people (users) assigned to the project. Managed exclusively on the project form's Resources tab (main app); no separate collection, routes, or API client methods.

**Object shape (per item, whitelisted by `normalizeResources` in `projectService.js`):**

```js
{
  id: string,             // crypto.randomUUID(), row key (client-generated; server fallback for direct-API payloads)
  userId: string,         // users._id — required; items without it are dropped
  userEmail: string,      // SNAPSHOT of the user's email at add/edit time — display label
  dailyRate: number|null, // SNAPSHOT of project effectiveRate at add-time, then independent
  engagement: 'FULL_TIME' | 'PART_TIME',
  description: string
}
```

**Snapshot semantics (golden rule):**
- `dailyRate` is copied from the project's effective rate when the resource is added (`ResourceDialog` prefill) and is thereafter independent — later changes to project.rate or client.defaultRate do NOT propagate.
- `userEmail` is captured at add/edit time (users have no display-name field). It does NOT auto-update if the user's email changes or the user is deleted; re-selecting the user in the edit dialog refreshes it. This is deliberate: the grid renders without needing the `users.read` grant and rows survive user deletion.
- Server-side, `normalizeResources` runs on create (whitelist) and on update only when `resources` is present in the payload (so partial PUTs don't wipe the array). It drops items lacking `userId`, dedupes by `userId`, and coerces `dailyRate` (`''`/NaN → null).

**Authorisation / legacy mode:** `resources` is a field on `projects` — enforced by existing `projects` grants, no registry change. The dialog's user picker needs `users.read` (+ `roles.read` for enrichment); on 403 it shows a warning MessageBar and the snapshot labels still render. With `AUTH_ENABLED` off the users collection is empty, so the picker only offers the placeholder — the tab itself is always visible and editable (deliberate, no `enabled &&` gating).

## Null Coercion Pattern

Both `projectService.create` and `projectService.update` convert empty strings to null for rate, workingHoursPerDay, and vatPercent. This enables inheritance — a null value means "use client's value."

Frontend mirrors this: `ProjectForm.jsx` saveForm converts `form.rate !== '' ? Number(form.rate) : null`.

## Cross-Entity Consumers

| Consumer | File | What it does | Impact |
| -------- | ---- | ------------ | ------ |
| **Client auto-creation** | `clientService.js` create | Creates default project with isDefault=true, rate/hours=null | Every client gets one |
| **Timesheet computation** | `timesheetService.js` create/update | Reads effectiveRate + effectiveWorkingHours to compute days/amount | Core calculation dependency |
| **Timesheet form dropdown** | `TimesheetForm.jsx` | Groups projects by clientName, shows rate/hours hints | UI grouping |
| **Expense form dropdown** | `ExpenseForm.jsx` | Groups projects by clientName, inherits currency via project→client | UI grouping + currency |
| **Expense currency** | `expenseService.js` create | Looks up project → client → currency | Indirect inheritance |
| **Invoice line building** | `invoiceService.js` addLine/recalculate | Reads project.vatPercent + effectiveRate for timesheet/write-in lines | VAT and rate source |
| **Invoice form project data** | `InvoiceForm.jsx` | Fetches the client's projects via `projectsApi.getAll({ clientId })` for effectiveRate/vatPercent (invoice detail no longer embeds clientProjects) | UI data |
| **Client cascade** | `clientService.js` remove | Deletes all client's projects (after deleting their timesheets/expenses) | Destroys data |
| **Reports** | `reportService.js`, `expenseReportService.js` | Groups by project for PDF generation, shows project name/rate | PDF layout |
| **MCP list_projects** | `server/routes/mcp.js` | Lists active projects with effectiveWorkingHours (rate excluded for confidentiality) | Read-only |
| **Documents** | `documentService.js` | Documents reference projectId, shown in project Documents tab | FK reference |
| **User picker (resources)** | `ResourceDialog.jsx` | Reads `usersApi.getAll()` to populate the resource user dropdown (`users.read` + `roles.read` gated; empty array in legacy mode) | 403 shown in-dialog; grid unaffected (email snapshots) |

## Key Business Logic (where it lives)

| Rule | Location | Detail |
| ---- | -------- | ------ |
| Effective rate | `projectService.js` getAll/getById | project.rate ?? client.defaultRate ?? 0 |
| Effective hours | `projectService.js` getAll/getById | project.workingHoursPerDay ?? client.workingHoursPerDay ?? 8 |
| Null coercion | `projectService.js` create/update | Empty string → null for rate, workingHoursPerDay, vatPercent |
| isDefault protection | `projectService.js` remove | Cannot delete default projects |
| Cascade delete | `projectService.js` remove | Deletes timesheets, expenses (with attachment cleanup) |
| VAT config | `project.vatPercent` | null = exempt, 0 = zero-rated, 20 = standard. Used by invoice lines |
| Lock protection | `projectService.update/remove` | `assertNotLocked()` before mutation |
| Resource rate snapshot | `ResourceDialog.jsx` (prefill) + `projectService.js` normalizeResources | dailyRate copied from effectiveRate at add-time, then independent; array normalized on write |

## Blast Radius

**If you change effectiveRate/effectiveWorkingHours computation:**
- Check: timesheetService uses same formula for days/amount
- Check: invoiceService uses same formula for line building
- Check: TimesheetForm/ExpenseForm dropdown hints show correct values
- Check: Reports use same formula for PDF display
- Check: MCP list_projects returns correct effectiveWorkingHours

**If you change project VAT (vatPercent):**
- Check: Invoice timesheet/write-in lines use project.vatPercent
- Check: Invoice consistency check validates against project.vatPercent
- Check: Invoice recalculate rebuilds lines with current vatPercent

**If you change cascade delete:**
- Check: Expense attachments cleaned up before expense records deleted
- Check: isDefault projects cannot be deleted

**If you change project data shape:**
- Update: projectService create/update (null coercion, field handling)
- Update: `normalizeResources` per-item whitelist if the resource shape changes
- Update: ProjectForm useFormTracker keys + inheritance placeholders
- Update: ProjectList columns
- Update: timesheetService enrichment (projectName, effective values)
- Update: expenseService enrichment (projectName)
- Update: InvoiceForm clientProjects fetch (`projectsApi.getAll({ clientId })`)
- Update: MCP tool response fields

**If you change user email/deletion semantics:**
- Check: resource `userEmail` snapshots do not auto-update — grid labels and the edit dialog's injected snapshot option rely on them

## Lessons Learned

- **Project documents were found carrying frozen copies of their entire timesheet and expense sets.** `getById` used to embed both arrays; `ProjectForm` `resetBase()` the full response and PUT it back, and `update()` only stripped 4 protected fields — so the embeds (plus clientName/effectiveRate/effectiveWorkingHours) were persisted onto the document. Stored copies bypass row-level security: the timesheets table's row filter never applies to fields of a project document. Fix: lean `getById` (scalars only), per-tab list fetches, `update()` read-model strips, and `npm run repair:derived-fields` (server stopped, after a backup) to `$unset` the polluted keys.
