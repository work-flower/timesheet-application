# Projects — Entity Wiring

## File Chain

```text
ProjectForm.jsx → projectsApi (api/index.js) → routes/projects.js → projectService.js → db.projects
```

## Frontend

| What | File | Notes |
| ---- | ---- | ----- |
| Form | `app/src/pages/projects/ProjectForm.jsx` | Tabs: General, Timesheets, Expenses, Documents, Invoices. Rate/hours show "Inherited from client: £X" placeholder when null |
| List | `app/src/pages/projects/ProjectList.jsx` | showArchived toggle, columns: name, client, IR35, effectiveRate, status |
| API client | `app/src/api/index.js` (projectsApi) | 5 methods: getAll, getById, create, update, delete |

## Backend

| What | File | Notes |
| ---- | ---- | ----- |
| Route | `server/routes/projects.js` | 5 endpoints: standard CRUD |
| Service | `server/services/projectService.js` | CRUD, effectiveRate/Hours computation, null coercion, isDefault protection, cascade delete |
| DB collection | `server/db/index.js` | `projects` — wrapped NeDB via execution pipeline |

## Inheritance Chain

```text
client.defaultRate ──→ project.rate (null = inherit) ──→ effectiveRate
client.workingHoursPerDay ──→ project.workingHoursPerDay (null = inherit) ──→ effectiveWorkingHours
```

Computed in `projectService.js` getAll/getById:
- `effectiveRate = project.rate != null ? project.rate : (client.defaultRate || 0)`
- `effectiveWorkingHours = project.workingHoursPerDay != null ? project.workingHoursPerDay : (client.workingHoursPerDay || 8)`

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
| **Invoice enrichment** | `invoiceService.js` getById | Returns clientProjects with effectiveRate, vatPercent for form | UI data |
| **Client cascade** | `clientService.js` remove | Deletes all client's projects (after deleting their timesheets/expenses) | Destroys data |
| **Reports** | `reportService.js`, `expenseReportService.js` | Groups by project for PDF generation, shows project name/rate | PDF layout |
| **MCP list_projects** | `server/routes/mcp.js` | Lists active projects with effectiveWorkingHours (rate excluded for confidentiality) | Read-only |
| **Documents** | `documentService.js` | Documents reference projectId, shown in project Documents tab | FK reference |

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
- Update: ProjectForm useFormTracker keys + inheritance placeholders
- Update: ProjectList columns
- Update: timesheetService enrichment (projectName, effective values)
- Update: expenseService enrichment (projectName)
- Update: invoiceService clientProjects enrichment
- Update: MCP tool response fields
