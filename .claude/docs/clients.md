# Clients — Entity Wiring

## File Chain

```text
ClientForm.jsx → clientsApi (api/index.js) → routes/clients.js → clientService.js → db.clients
                                                                                   → projectService (auto-create default project)
```

## Frontend

| What | File | Notes |
| ---- | ---- | ----- |
| Form | `app/src/pages/clients/ClientForm.jsx` | Tabs: General, Projects, Timesheets, Expenses, Invoices. IR35 + VAT required on create (for default project). Uses `useNotifyParent` for embedded mode |
| List | `app/src/pages/clients/ClientList.jsx` | Search by name/contact, columns: company, contact, email, rate, currency |
| API client | `app/src/api/index.js` (clientsApi) | 5 methods: getAll, getById, create, update, delete |

## Backend

| What | File | Notes |
| ---- | ---- | ----- |
| Route | `server/routes/clients.js` | 5 endpoints: standard CRUD with OData support |
| Service | `server/services/clientService.js` | CRUD, auto-creates default project on create, cascade delete on remove |
| DB collection | `server/db/index.js` | `clients` — wrapped NeDB via execution pipeline |

## Inheritance Chains (clients as the root)

```text
Rate:     client.defaultRate → project.rate (null = inherit) → timesheet.amount computation
Hours:    client.workingHoursPerDay → project.workingHoursPerDay (null = inherit) → timesheet.days computation
Currency: client.currency → expense.currency (set on create, read-only in form)
Billing:  client.invoicingEntityName/Address → invoice PDF "Bill To" section
```

## Cross-Entity Consumers

| Consumer | File | What it does | Impact |
| -------- | ---- | ------------ | ------ |
| **Project enrichment** | `projectService.js` getAll/getById | Reads defaultRate, workingHoursPerDay for effectiveRate/effectiveWorkingHours | Computed fields on every project |
| **Default project creation** | `clientService.js` create | Auto-creates project with isDefault=true, inherits ir35Status/vatPercent | Always happens on client create |
| **Timesheet computation** | `timesheetService.js` create/update | Reads client via project for rate/hours inheritance | Drives days/amount calculation |
| **Expense currency** | `expenseService.js` create | Reads client.currency via project | Currency set once on expense creation |
| **Invoice creation** | `invoiceService.js` create | Reads defaultPaymentTermDays from settings for dueDate | Indirect: client selected on invoice |
| **Invoice PDF** | `invoicePdfService.js` | Reads invoicingEntityName/Address for "Bill To", companyName as fallback | PDF layout |
| **Invoice line building** | `invoiceService.js` addLine/recalculate | Reads client.defaultRate for effectiveRate computation on lines | Rate source for timesheet lines |
| **Reports** | `reportService.js`, `expenseReportService.js` | Reads companyName, defaultRate for PDF headers | PDF layout |
| **Dashboard** | `dashboardService.js` | Aggregates across all clients | Read-only |

## Cascade Delete (client removal)

This is the most destructive operation in the system. Order matters:

```text
clientService.remove(id)
  1. assertNotLocked(client)
  2. Find all projects for client
  3. For each project's timesheets → delete all
  4. For each project's expenses → removeAllAttachments() then delete all
  5. Delete all projects
  6. invoiceService.removeByClientId(clientId):
     a. For each confirmed/posted invoice → unlock all linked timesheets/expenses
     b. Delete saved PDF files
     c. Delete all invoices for client
  7. Delete the client
```

## Golden Rules

**Default project auto-creation** (`clientService.create`): Creating a client auto-creates a "Default Project" (`isDefault: true`) inheriting rate, working hours, and using the IR35 status + VAT rate from the creation form.

**Default projects cannot be deleted** (can be renamed or archived).

**Cascade delete** (`clientService.remove`): Deleting a client cascade-deletes all its projects, timesheets, expenses (+ attachment files), and invoices (unlocking any locked items first). See "Cascade Delete" section above for exact order.

## Key Business Logic (where it lives)

| Rule | Location | Detail |
| ---- | -------- | ------ |
| Default project auto-creation | `clientService.create` | See Golden Rules above |
| Rate inheritance | `projectService.js` getAll/getById | effectiveRate = project.rate ?? client.defaultRate ?? 0 |
| Hours inheritance | `projectService.js` getAll/getById | effectiveWorkingHours = project.workingHoursPerDay ?? client.workingHoursPerDay ?? 8 |
| Currency inheritance | `expenseService.create` | currency = client.currency ?? 'GBP' |
| Lock protection | `clientService.update/remove` | `assertNotLocked()` before mutation |

## Blast Radius

**If you change client fields (defaultRate, workingHoursPerDay, currency):**
- Check: Project effectiveRate/effectiveWorkingHours computation uses these as fallback
- Check: Timesheet days/amount computation chains through project inheritance
- Check: Expense currency inheritance on create
- Check: Invoice line rate computation via project
- Check: Reports use client rate for PDF display

**If you change the cascade delete:**
- Check: All attachment directories cleaned up (expenses)
- Check: Invoice unlocking happens before deletion (prevents orphaned locks)
- Check: Order of deletion prevents FK violations

**If you change client data shape:**
- Update: clientService create/update
- Update: ClientForm useFormTracker keys
- Update: ClientList columns
- Update: projectService enrichment (clientName, rate, hours)
- Update: invoicePdfService (billing info fields)
- Update: Default project creation fields

## Lessons Learned

(Empty — will be populated as issues are encountered)
