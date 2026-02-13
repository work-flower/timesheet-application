# Timesheet Application — UK Contractor Market

## Overview

A single-user desktop timesheet and invoicing application for UK technology contractors. Runs locally, manages clients, projects, daily timesheet entries, expenses, invoices, and PDF reports. The UI closely resembles a Microsoft Power Platform Model-Driven Application.

No authentication — single user, local app.

## Tech Stack

- **Frontend:** React 18, React Router v6, Vite, Fluent UI v9 (`@fluentui/react-components`)
- **Backend:** Node.js, Express.js, NeDB (`nedb-promises`), ESM throughout (`"type": "module"`)
- **PDF:** pdfmake (server-side), pdf-lib (PDF merging)
- **Other:** `@uiw/react-md-editor` (markdown notes), `multer` + `sharp` (expense attachments + thumbnails), `@aws-sdk/client-s3` + `archiver` + `tar` + `node-cron` (R2 cloud backup), `dotenv`

## Configuration

- `DATA_DIR` env var — database/documents path (default: `./data`)
- `PORT` env var — Express port (default: `3001`)
- `npm run dev` — runs Express + Vite dev server (port 5173) concurrently; Vite proxies `/api` to Express
- `npm run build` — Vite production build to `dist/`
- `npm start` — Express serves API + built frontend; catch-all serves `index.html` for client-side routing
- `npm run seed` — clears all data and populates sample records
- Health check at `GET /api/health`

---

## Data Model

### settings (single document)

Contractor profile + invoicing configuration.

| Field | Description |
|-------|-------------|
| name, email, phone, address | Personal details |
| businessName, utrNumber, vatNumber, companyRegistration | Business details |
| invoiceNumberSeed | Auto-incremented on invoice confirm, never decremented |
| defaultPaymentTermDays | Default days until invoice due (default: 10) |
| defaultVatRate | Default VAT rate for new projects (default: 20) |
| invoiceFooterText | Custom footer text on invoice PDFs |
| bankName, bankSortCode, bankAccountNumber, bankAccountOwner | Bank details shown on invoice PDFs |

### clients

| Field | Description |
|-------|-------------|
| companyName | Required |
| primaryContactName, primaryContactEmail, primaryContactPhone | Contact info |
| defaultRate | Daily rate in GBP (inherited by projects that don't override) |
| currency | Always "GBP" |
| workingHoursPerDay | Default 8 |
| invoicingEntityName, invoicingEntityAddress | "Bill To" section on invoices |
| notes | Markdown, internal |

### projects

| Field | Description |
|-------|-------------|
| clientId | FK → clients |
| endClientId | FK → clients, optional (end client for agency setups) |
| name | Project name |
| ir35Status | `INSIDE_IR35`, `OUTSIDE_IR35`, or `FIXED_TERM` |
| rate | Daily rate override; `null` = inherit from client.defaultRate |
| workingHoursPerDay | Override; `null` = inherit from client.workingHoursPerDay |
| vatPercent | `20` = standard, `0` = zero-rated, `null` = VAT exempt |
| isDefault | Auto-created default project flag |
| status | `active` or `archived` |
| notes | Markdown, internal |

**Computed fields (returned by API, not stored):**
- `effectiveRate = project.rate ?? client.defaultRate`
- `effectiveWorkingHours = project.workingHoursPerDay ?? client.workingHoursPerDay ?? 8`
- `clientName`

### timesheets

| Field | Description |
|-------|-------------|
| projectId | FK → projects |
| date | `YYYY-MM-DD`, no future dates allowed |
| hours | 0.25–24, in 0.25 increments |
| days | Computed on save: `hours / effectiveWorkingHours` |
| amount | Computed on save: `days × effectiveRate` |
| notes | Markdown, internal |
| invoiceId | Set by invoice confirm, cleared on unconfirm |
| isLocked, isLockedReason | Record locking fields (see Business Rules) |

One entry = one day on one project. Multiple entries per day allowed (different projects). `days` and `amount` are persisted on save and treated as the source of truth — no recomputation on read.

### expenses

| Field | Description |
|-------|-------------|
| projectId | FK → projects |
| date | `YYYY-MM-DD`, no future dates allowed |
| expenseType | Freetext with autocomplete from distinct values in collection |
| description | Client-facing (visible on invoices/reports) |
| amount | Gross total paid (including VAT) |
| vatAmount | VAT portion included in amount |
| vatPercent | Computed on save: `(vatAmount / amount) × 100`, read-only in UI |
| billable | Boolean, default true |
| currency | Inherited from client on creation, read-only; updates when project changes |
| attachments | Array of `{ filename, originalName, mimeType }` |
| notes | Markdown, internal only (not visible to client) |
| invoiceId, isLocked, isLockedReason | Record locking fields |

Attachment files stored on disk at `DATA_DIR/expenses/{expenseId}/`. Image thumbnails generated server-side (200px wide, `thumb_` prefix). Deleting an expense cascade-deletes its attachment directory.

### invoices

| Field | Description |
|-------|-------------|
| clientId | FK → clients |
| status | `draft` → `confirmed` → `posted` |
| invoiceNumber | Format `JBL{5-digit padded}` (e.g. `JBL00001`), assigned on first confirm, permanent |
| invoiceDate, dueDate | `YYYY-MM-DD`; dueDate auto-computed from paymentTermDays on creation |
| servicePeriodStart, servicePeriodEnd | Service period for the invoice |
| additionalNotes | Free text |
| lines | Array of invoice line objects (see below) |
| includeTimesheetReport | Boolean — include timesheet report pages in combined PDF |
| includeExpenseReport | Boolean — include expense report pages in combined PDF |
| paymentStatus | `unpaid`, `paid`, or `overdue` (only changeable when posted) |
| paidDate | Date when paid (posted + paid only) |
| subtotal, totalVat, total | Computed from lines, persisted on save |
| pdfPath | Absolute path to saved combined PDF file (set on confirm, cleared on unconfirm) |
| isLocked, isLockedReason | Record locking fields |

**Invoice lines** (embedded in `lines[]`):

| Field | Description |
|-------|-------------|
| id | UUID |
| type | `timesheet`, `expense`, or `write-in` |
| sourceId | FK → timesheets or expenses (`null` for write-in) |
| projectId | FK → projects |
| description, date, hours, expenseType | Display fields snapshotted from source |
| quantity | Days (timesheet), 1 (expense), user-specified (write-in) |
| unit | `days` or `item` |
| unitPrice | Rate (timesheet), net amount (expense), user-specified (write-in) |
| vatPercent | From project (timesheet/write-in), from expense (expense) |
| netAmount, vatAmount, grossAmount | Computed and stored per line |

**VAT computation:** Timesheet VAT is exclusive (added on top). Expense VAT is inclusive (already in gross amount). Write-in VAT is exclusive.

### documents

Saved timesheet/expense PDF reports for archival.

| Field | Description |
|-------|-------------|
| clientId, projectId | FK references |
| periodStart, periodEnd | Date range |
| granularity | `monthly` or `weekly` |
| filename, filePath | PDF file on disk at `DATA_DIR/documents/` |

### backupConfig (single document)

R2 cloud backup configuration. Stored in a **separate** database file — **not** included in backup archives. Secret key masked on read.

| Field | Description |
|-------|-------------|
| accountId, accessKeyId, secretAccessKey | R2 credentials |
| bucketName, endpoint | R2 bucket config |
| backupPath | R2 key prefix (change to browse another environment's backups) |
| schedule | `off`, `daily`, or `weekly` |

---

## Business Rules

### Clients & Projects

1. Creating a client auto-creates a "Default Project" (`isDefault: true`) inheriting rate, working hours, and using the IR35 status + VAT rate from the creation form.
2. Default projects cannot be deleted (can be renamed or archived).
3. Deleting a client cascade-deletes all its projects, timesheets, expenses (+ attachment files), and invoices (unlocking any locked items first).
4. Deleting a project cascade-deletes all its timesheets and expenses (+ attachment files). Cannot delete default projects.

### Timesheets

5. Date must not be in the future. Hours must be 0.25–24 in 0.25 increments.
6. `days` and `amount` computed and persisted on save. Source of truth once saved — no recomputation on read.

### Expenses

7. `vatPercent` computed and persisted on save: `(vatAmount / amount) × 100`. Read-only in UI.
8. Currency inherited from client on creation. Read-only in form, updates when project changes.
9. Date must not be in the future.

### Invoicing

10. **Lifecycle:** Draft → Confirmed → Posted.
11. **Invoice number:** Format `JBL{5-digit padded}`, seed in settings. Assigned once during first confirmation — permanent, never cleared, never reassigned. Seed incremented atomically, never decremented. Re-confirming a previously unconfirmed invoice reuses its existing number.
12. **Lines:** Each timesheet/expense added generates a persistent line with snapshotted values. Write-in lines have `type: 'write-in'`. Totals computed from lines and persisted on save.
13. **Consistency check:** Detects value drift (amount, rate, VAT changes) and item conflicts (deleted sources, items locked to other invoices). Blocks confirmation if errors exist.
14. **Recalculate:** Realigns all line values to current source data.
15. **Combined PDF on confirm:** On confirm, a combined PDF is generated (invoice page + optional timesheet report + optional expense report based on toggle fields) and saved to `DATA_DIR/invoices/{invoiceNumber}/{invoiceId}.pdf`. The `pdfPath` field is set on the invoice record. On unconfirm, the saved PDF file is deleted and `pdfPath` is cleared.
16. **Payment tracking:** Only available on posted invoices. Fields: `paymentStatus` (unpaid/paid/overdue), `paidDate`.
17. Deleting a client cascade-deletes its invoices (unlocking items first). Deleting an invoice never deletes timesheets or expenses.

### Record Locking

18. Any record can have `isLocked` (boolean) and `isLockedReason` (string). These are protected — cannot be set via regular updates, only by invoice lifecycle methods.
19. All update and delete operations check for lock status first and reject with the lock reason if locked (HTTP 400).
20. **Confirm** locks: the invoice itself, all referenced timesheets (+ sets `invoiceId`), all referenced expenses (+ sets `invoiceId`).
21. **Post** updates the invoice lock reason to "Posted invoice". Timesheets/expenses remain locked from confirmation.
22. **Unconfirm** unlocks: the invoice, all referenced timesheets (clears `invoiceId`), all referenced expenses (clears `invoiceId`).
23. **Locked record UI:** Form hides Save/Delete buttons (shows only Back), displays warning banner with lock reason, disables all form inputs.

---

## API

All endpoints prefixed with `/api`. All list endpoints support OData-style query parameters (`$filter`, `$orderby`, `$top`, `$skip`, `$count`, `$select`, `$expand`) alongside entity-specific query params. Standard CRUD per entity plus:

### Entity-specific behaviors

- **Clients:** List, detail (includes projects + timesheets + expenses), create (auto-creates default project), update, delete (cascade)
- **Projects:** List (enriched with clientName/effectiveRate/effectiveWorkingHours), detail (includes timesheets + expenses), create, update (empty string → null for rate/workingHours/vatPercent), delete (prevents default, cascade)
- **Timesheets:** List (enriched with projectName/clientName/clientId; supports `startDate`, `endDate`, `projectId`, `clientId`, `groupBy=week|month|year`), detail (includes effectiveRate/effectiveWorkingHours), create/update (validates + computes days/amount), delete
- **Expenses:** List (enriched; supports `startDate`, `endDate`, `projectId`, `clientId`, `expenseType`), distinct types endpoint, detail, create (inherits currency), update (recomputes vatPercent), delete (cascade attachments). Attachment sub-endpoints: upload (multipart, max 10 files), delete, serve original, serve thumbnail.
- **Invoices:** List (supports `clientId`, `status`, `startDate`, `endDate`), detail (enriched with client info + clientProjects with effectiveRate/vatPercent), create, update (draft/unlocked only; protects status/invoiceNumber/paymentStatus/pdfPath), delete (draft only). Lifecycle: confirm, post, unconfirm. Operations: recalculate, consistency-check. Payment update (posted only). PDF endpoints: generate on-the-fly, serve saved file (confirmed/posted only).
- **Reports:** Generate timesheet PDF (by client + date range, optional project filter). Generate expense PDF (same params). Combined PDF endpoint accepts array of report specs (invoice + timesheet + expense) and merges into single PDF.
- **Documents:** List, detail, serve PDF file, generate + save PDF, delete (removes file + record)
- **Settings:** Get/update contractor profile (single document, upserted)
- **Backup:** Config CRUD (secret masked on read), test connection, manual backup (creates .tar.gz in R2), list backups, restore (replaces all data), delete backup

### OData Query Support

All list endpoints support: `$filter` (eq, ne, gt, ge, lt, le, contains, startswith, endswith, and), `$orderby`, `$top`, `$skip`, `$count`, `$select`, `$expand`. Without `$count`: plain array response. With `$count=true`: `{ "@odata.count": N, "value": [...] }`.

**$expand relationships:**

| Entity | Expandable |
|--------|-----------|
| clients | projects, timesheets, expenses |
| projects | client, timesheets, expenses, documents |
| timesheets | project, client |
| expenses | project, client |
| documents | client, project |

---

## User Interface

### General Design

- Fluent UI v9 default theme — Power Platform look (white background, blue accent `#0078D4`, grey sidebar)
- Clean, professional, enterprise feel
- Dense information display — favour grids over cards for data
- All notes fields use markdown editor

### Layout

1. **Top Bar:** App title "Timesheet Manager" on the left with hamburger menu toggle, Settings button on the right
2. **Left Sidebar** (~220px, collapsible to icon-only with tooltips): Dashboard, Clients, Projects, Timesheets, Expenses, Invoices, Reports. Active item highlighted with blue accent border.
3. **Main Content Area** (scrollable): List views, form views, or dashboard

### Navigation

| Route | Page |
|-------|------|
| `/` | Dashboard |
| `/clients` | Client list |
| `/clients/new` | Client create form |
| `/clients/:id` | Client form (tabs: General, Projects, Timesheets, Expenses) |
| `/projects` | Project list |
| `/projects/new` | Project create form |
| `/projects/:id` | Project form (tabs: General, Timesheets, Expenses, Documents) |
| `/timesheets` | Timesheet list |
| `/timesheets/new` | Timesheet create form |
| `/timesheets/:id` | Timesheet edit form |
| `/expenses` | Expense list |
| `/expenses/new` | Expense create form |
| `/expenses/:id` | Expense edit form (with attachment gallery) |
| `/invoices` | Invoice list |
| `/invoices/new` | Invoice create form |
| `/invoices/:id` | Invoice form (tabs: Invoice, PDF Preview) |
| `/reports` | Report generation page |
| `/settings` | Settings (tabs: Profile, Invoicing, Backup) |

### List Views

All list views share a common pattern: command bar (New, Delete, Search) → sortable DataGrid → row click opens record.

- **Timesheet list:** Default period: current week. Period toggle buttons (This Week / This Month / All Time / Custom with date pickers). Client and Project dropdown filters. Summary row showing Days, Amount totals. All filter selections persisted to localStorage.
- **Expense list:** Default period: current month. Same period toggle pattern. Client, Project, and Expense Type dropdown filters. Columns: Date, Client, Project, Type, Description, Amount, VAT, Billable, Attachments count. Summary footer: Billable Total, Non-Billable Total, Entry count. All filters persisted to localStorage.
- **Invoice list:** Filters: Status (draft/confirmed/posted), Client, Payment (unpaid/paid/overdue). Columns: Invoice #, Date, Client, Period, Status badge, Amount, Payment badge. Summary footer: total invoices, total amount, unpaid amount. Filters persisted to localStorage.

### Form Views

All forms share a common pattern: sticky command bar at top (Back, Save, Save & Close, optionally Delete) → breadcrumb → title → tabbed sections → 2-column field layout.

- **Unsaved changes guard:** All forms track dirty state with changed-field indicators (blue left-border, Power Platform style). Navigating away from a dirty form triggers Save/Discard/Cancel dialog. Browser refresh/close shows native "Leave page?" dialog.
- **Save pattern:** Save on create → navigate to the new record. Save on edit → show success message. Save & Close → navigate to list.

### Dashboard

Six summary cards in a responsive grid:
1. **Hours This Week** — sum of current week's timesheet hours
2. **Hours This Month** — sum of current month's timesheet hours
3. **Active Projects** — count of active projects
4. **Earnings This Month** — sum of current month's timesheet amounts
5. **Expenses This Month** — billable total as main value, total (billable + non-billable) as hint
6. **Unpaid Invoices** — sum of unpaid/overdue posted invoice totals, with count

Below cards: "Recent Timesheet Entries" grid showing last 10 entries (Date, Client, Project, Hours, Amount).

### Entity-Specific Forms

**Client form:**
- General tab: company name, contact info, rate, currency, working hours, invoicing entity name/address, IR35 status (required for default project creation), notes
- Related tabs: Projects, Timesheets, Expenses (grids showing related records)

**Project form:**
- Rate and Working Hours fields show placeholder "Inherited from client: £X/day" when null
- Creating a new project auto-fills rate and working hours from selected client
- Documents tab shows saved report PDFs, click to open in new browser tab

**Timesheet form:**
- Project dropdown grouped by client with client name hint
- Hours SpinButton (0.25–24, step 0.25) with project daily hours hint
- Days and Amount are read-only, computed only when user changes Hours or Project (not on form load — persisted values shown as-is on edit)

**Expense form:**
- 2-column: Date | Amount (gross), Project (grouped by client) | VAT Amount, Expense Type (combobox with autocomplete from previous types) | VAT % (read-only), Billable | Currency (read-only, from client), Description (full width, client-facing), Notes (markdown, internal)
- Attachment gallery (edit only — "Save first" message on new): upload multiple, thumbnail grid with lightbox for images, file type icons for non-images, delete with confirmation

**Invoice form:**
- Invoice tab: Client (locked after creation), Invoice Number (read-only), dates, service period, additional notes
- Unified "Line Sources" section with buttons: Add Timesheets, Add Expenses, Add Line (write-in)
  - Timesheet/expense picker dialogs for selecting source records
  - Write-in lines editable inline (description, quantity, unit, unit price, VAT %)
  - Lines grid shows all types sorted by type, with error/warning indicators per line
  - Live totals (Sub Total, Total VAT, Total Due) computed from lines
- Consistency error banner (red) showing conflicts, with Recalculate button to fix
- Warning banner for dates outside service period (draft only, informational)
- Command bar: Save, Save & Close, Consistency Check, Recalculate, Confirm/Post/Unconfirm (lifecycle), Delete (draft only)
- **PDF Preview tab:** Toggle switches for "Include Timesheet Report" and "Include Expense Report" (auto-save on toggle; disabled when locked). Uses saved PDF file for confirmed/posted invoices (no regeneration). Falls back to on-the-fly combined PDF generation for drafts.
- **Payment section** (posted only): Payment Status dropdown (unpaid/paid/overdue), Paid Date field

### Reports Page

Two-column layout — narrow left sidebar (280px) with cascading dropdowns (Client → Project → Granularity → Period), wider right area for inline PDF preview. Periods computed from actual timesheet dates (monthly or weekly). Actions: Generate (preview), Download (browser save), Save Document (persists server-side, viewable from project's Documents tab). Selections persisted to localStorage.

### Settings Page

Three tabs:
- **Profile:** Contractor personal + business details form with dirty tracking
- **Invoicing:** Invoice number seed (read-only display), default payment term days, default VAT rate, invoice footer text, bank details (name, sort code, account number, account owner)
- **Backup:** R2 credentials, backup path, schedule (off/daily/weekly). Save Configuration button, Test Connection, Backup Now. Backup history grid with Restore/Delete per row. Restore shows confirmation dialog and reload banner on success.

---

## PDF Reports

### Timesheet Report

One page per project. Structure:
1. Contractor header: business name + contact details
2. Info table: Client, Project, Period, IR35 Status, Rate
3. Timesheet table: Date, Hours, Days, Notes, Rate, Amount — blue header row, light grey totals row, horizontal lines only
4. Page footer: "Page X of Y"

Supports filtering by date range or by specific timesheet IDs (for invoice inclusion).

### Expense Report

Same structure as timesheet report but with expense table: Date, Type, Description, Billable, Amount, VAT, Net. One page per project. Supports filtering by date range or by specific expense IDs.

### Invoice PDF

Structure:
1. Header: business name + "INVOICE" label
2. Two-column: "From" (contractor details) | "To" (client invoicing entity)
3. Invoice meta: number, invoice date, due date, service period
4. Lines table grouped by VAT rate (highest first, exempt last): aggregated timesheet lines by (VAT%, project), then expense lines by (project, VAT%), then write-in lines
5. Totals: Sub Total, VAT breakdown per rate, Grand Total
6. Bank details section
7. Company registration/VAT footer
8. Additional notes (if provided)

### Combined PDF

Invoice PDF + optional timesheet report pages + optional expense report pages merged into a single file. Generated and saved to disk on invoice confirm. Served from disk for confirmed/posted invoices (no regeneration). Deleted on unconfirm.

---

## Seed Data (`npm run seed`)

Clears all data and creates:
- **Settings:** John Smith, Smith Consulting Ltd, London address, UTR/VAT/company reg, bank details
- **Clients:** Barclays Bank (£650/day, 8h) + HMRC Digital (£600/day, 7.5h)
- **Projects:** 3 total — Barclays Default (Outside IR35, inherits rate), Payment Platform Migration (Outside IR35, £700/day override), HMRC Default (Inside IR35, inherits rate)
- **Timesheets:** Up to 5 entries for current week on Payment Platform Migration (8h/day, £700) + 3 entries for last week on HMRC (7.5h/day, £600). Only creates entries for non-future dates.
- **Expenses:** Travel (£45.60, billable) and Mileage (£32.40, billable) on Payment Platform Migration this week, Equipment (£24.99 + £4.17 VAT, non-billable) on Payment Platform Migration, Travel (£28.50, billable) on HMRC last week.

## Docker

Multi-stage Dockerfile: Stage 1 builds frontend, Stage 2 runs slim `node:20-alpine` with `dist/` + `server/` + production deps. Docker Compose configures port, volume, and restart.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Express server port |
| `DATA_DIR` | `./data` | Host path for database files + PDFs (mounted into container) |

Container stores no data — all `.db` files and PDFs live on the host volume.

## Future Considerations

- **Timesheet approval workflow:** May add `status` field to timesheets (draft/submitted/approved)
- **CSV export:** CSV export of timesheets (PDF export already exists via Reports)
