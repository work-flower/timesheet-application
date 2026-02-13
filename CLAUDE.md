# Timesheet Application — UK Contractor Market

## Overview

A single-user desktop timesheet application for UK technology contractors. The app runs locally on the contractor's machine and manages clients, projects, and daily timesheet entries. The UI should closely resemble a Microsoft Power Platform Model-Driven Application.

## Tech Stack

- **Runtime:** Node.js
- **Frontend:** React 18 + React Router v6
- **UI Library:** Fluent UI v9 (`@fluentui/react-components`) — primary UI framework
- **Markdown Editor:** `@uiw/react-md-editor` — used for all notes fields (clients, projects, timesheets, expenses)
- **File Uploads:** `multer` — multipart form parsing for expense attachment uploads (memory storage)
- **Image Processing:** `sharp` — server-side thumbnail generation (200px wide) for expense receipt images
- **Backend:** Express.js (local server)
- **Database:** NeDB (`nedb-promises` package) — embedded file-based database, MongoDB-like API, zero setup
- **PDF Generation:** pdfmake (`pdfmake` package) — server-side PDF creation
- **Cloud Backup:** `@aws-sdk/client-s3` (Cloudflare R2), `archiver` (create .tar.gz), `tar` (extract .tar.gz), `node-cron` (scheduled backups)
- **Build Tool:** Vite
- **Environment:** `dotenv` — loads `.env` file for configuration (e.g. `DATA_DIR`)

## Configuration

### Environment Variables (`.env`)
- `DATA_DIR` — path to the database/documents directory (default: `./data`)
- `PORT` — Express server port (default: `3001`)


### npm Scripts
- `npm run dev` — runs Express (port 3001) + Vite dev server (port 5173) via `concurrently`
- `npm run build` — Vite production build to `dist/`
- `npm start` — runs Express only (serves API + built frontend from `dist/`)
- `npm run seed` — clears all data and populates sample records

### Vite Config
- Proxy: `/api` requests forwarded to `http://localhost:3001`
- Dev server port: `5173`

## Project Structure

```
timesheet-app/
├── CLAUDE.md
├── .env                          # Environment variables (PORT, DATA_DIR)
├── Dockerfile                    # Multi-stage build (build frontend → slim production image)
├── docker-compose.yml            # Port, volume, restart config
├── .dockerignore                 # Excludes node_modules, dist, data, .env, *.md, .git, .gitignore from build context
├── .gitignore
├── index.html                    # Vite HTML entry point
├── package.json
├── vite.config.js
├── server/
│   ├── index.js              # Express server entry point (loads dotenv), serves API + static frontend
│   ├── db/
│   │   ├── index.js          # NeDB datastore initialization (uses DATA_DIR env var, defaults to ./data)
│   │   ├── backupConfig.js   # Separate NeDB datastore for backup configuration (not included in backups)
│   │   └── seed.js           # Optional: seed/init logic
│   ├── odata.js              # Shared OData query parser/applier (parseFilter, parseOrderBy, buildQuery, applySelect, formatResponse)
│   ├── services/
│   │   ├── lockCheck.js      # Shared assertNotLocked(record) helper for record locking
│   │   ├── clientService.js  # Client business logic (auto-create default project on client creation)
│   │   ├── projectService.js # Project logic (rate inheritance)
│   │   ├── timesheetService.js # Timesheet logic (filtering, grouping)
│   │   ├── expenseService.js # Expense CRUD, filtering, enrichment, distinct types
│   │   ├── expenseAttachmentService.js # Expense file storage, thumbnails via sharp, cleanup
│   │   ├── invoiceService.js  # Invoice CRUD, lifecycle (confirm/post/unconfirm), consistency checks, totals
│   │   ├── invoicePdfService.js # Invoice PDF generation via pdfmake (VAT grouping, bank details)
│   │   ├── reportService.js  # PDF generation via pdfmake (supports per-project filtering)
│   │   ├── documentService.js # Document CRUD + PDF file storage on disk
│   │   ├── backupService.js  # R2 backup: config CRUD, test connection, create/list/restore/delete backups
│   │   └── backupScheduler.js # node-cron lifecycle for scheduled backups (daily/weekly)
│   └── routes/
│       ├── clients.js
│       ├── projects.js
│       ├── timesheets.js
│       ├── expenses.js       # Expense CRUD + attachment upload/download/delete (multer)
│       ├── settings.js
│       ├── invoices.js       # Invoice CRUD + lifecycle + PDF generation endpoints
│       ├── reports.js        # PDF generation endpoint (returns PDF stream)
│       ├── documents.js      # Document CRUD + PDF file serving
│       └── backup.js         # Backup config, test, create, list, restore, delete endpoints
├── data/                     # NeDB database files (auto-created at runtime, path configurable via DATA_DIR)
│   ├── clients.db
│   ├── projects.db
│   ├── timesheets.db
│   ├── settings.db
│   ├── documents.db
│   ├── expenses.db
│   ├── invoices.db
│   ├── backup-config.db      # Backup configuration (R2 credentials, schedule — not included in backups)
│   ├── documents/            # Saved PDF files on disk
│   └── expenses/             # Expense attachment files on disk (subdirectory per expense ID)
├── src/
│   ├── main.jsx              # React entry point
│   ├── App.jsx               # Root component with FluentProvider and Router
│   ├── theme.js              # Fluent UI theme config (default theme, Power Platform look)
│   ├── hooks/
│   │   └── useFormTracker.js # Form dirty tracking hook (base vs current state, changedFields)
│   ├── contexts/
│   │   └── UnsavedChangesContext.jsx # Navigation guard context + provider (beforeunload, popstate, dialog)
│   ├── layouts/
│   │   └── AppLayout.jsx     # Main layout: top bar + left nav sidebar + main content area
│   ├── components/
│   │   ├── AttachmentGallery.jsx # Reusable attachment grid: thumbnail cards, image lightbox, upload/delete
│   │   ├── CommandBar.jsx    # Reusable top command bar for list views (New, Delete, Search)
│   │   ├── ConfirmDialog.jsx # Reusable confirmation dialog (title + message props)
│   │   ├── EntityGrid.jsx    # Reusable data grid for list views (uses createTableColumn)
│   │   ├── FormCommandBar.jsx # Sticky form command bar (Back, Save, Save & Close, optional Delete) — used on all form pages
│   │   ├── FormSection.jsx   # Reusable form section wrapper (2-column grid, changed field indicator)
│   │   ├── MarkdownEditor.jsx # Markdown editor wrapper (@uiw/react-md-editor with Fluent UI styling)
│   │   ├── ItemPickerDialog.jsx # Reusable dialog for selecting timesheets/expenses to add to invoices
│   │   └── UnsavedChangesDialog.jsx # Save/Discard/Cancel dialog for unsaved changes
│   ├── pages/
│   │   ├── Dashboard.jsx     # Five summary cards (week/month hours, active projects, month earnings, month expenses) + recent entries grid
│   │   ├── clients/
│   │   │   ├── ClientList.jsx    # DataGrid list of all clients
│   │   │   └── ClientForm.jsx    # Client record form with tabs (General, Projects, Timesheets, Expenses)
│   │   ├── projects/
│   │   │   ├── ProjectList.jsx   # DataGrid list of all projects
│   │   │   └── ProjectForm.jsx   # Project record form with tabs (General, Timesheets, Expenses, Documents)
│   │   ├── timesheets/
│   │   │   ├── TimesheetList.jsx # DataGrid with period/client/project filters, localStorage-persisted
│   │   │   └── TimesheetForm.jsx # Daily timesheet entry form
│   │   ├── expenses/
│   │   │   ├── ExpenseList.jsx   # DataGrid with period/client/project/type filters, localStorage-persisted
│   │   │   └── ExpenseForm.jsx   # Expense entry form with attachments
│   │   ├── invoices/
│   │   │   ├── InvoiceList.jsx   # DataGrid with status/client/payment filters, localStorage-persisted
│   │   │   └── InvoiceForm.jsx   # Invoice form with 4 tabs: Invoice, Timesheets, Expenses, PDF Preview
│   │   ├── reports/
│   │   │   └── ReportForm.jsx    # Two-column report page: parameter sidebar + PDF preview
│   │   └── settings/
│   │       ├── Settings.jsx      # Settings page with Profile, Invoicing, and Backup tabs
│   │       ├── InvoicingSettings.jsx # Invoicing tab: bank details, invoice seed, VAT rate, payment terms
│   │       └── BackupSettings.jsx # Backup tab: R2 config, schedule, backup history with restore/delete
│   └── api/
│       └── index.js          # Frontend API client (fetch wrapper for all endpoints)
```

## Data Model

### settings (single document — contractor profile)

```json
{
  "_id": "auto",
  "name": "",
  "email": "",
  "phone": "",
  "address": "",
  "businessName": "",
  "utrNumber": "",
  "vatNumber": "",
  "companyRegistration": "",
  "invoiceNumberSeed": 0,
  "defaultPaymentTermDays": 10,
  "defaultVatRate": 20,
  "invoiceFooterText": "",
  "bankName": "",
  "bankSortCode": "",
  "bankAccountNumber": "",
  "bankAccountOwner": "",
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

### clients

```json
{
  "_id": "auto",
  "companyName": "",
  "primaryContactName": "",
  "primaryContactEmail": "",
  "primaryContactPhone": "",
  "defaultRate": 0,
  "currency": "GBP",
  "workingHoursPerDay": 8,
  "invoicingEntityName": "",
  "invoicingEntityAddress": "",
  "notes": "",
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

### projects

```json
{
  "_id": "auto",
  "clientId": "FK → clients._id",
  "endClientId": "FK → clients._id | null",
  "name": "",
  "ir35Status": "INSIDE_IR35 | OUTSIDE_IR35 | FIXED_TERM",
  "rate": null,
  "workingHoursPerDay": null,
  "vatPercent": 20,
  "isDefault": false,
  "status": "active | archived",
  "notes": "",
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

**Rate inheritance rule:** If `project.rate` is `null`, the effective rate is `project.client.defaultRate`. The API should return an `effectiveRate` computed field.

**Working hours inheritance rule:** `effectiveWorkingHours = project.workingHoursPerDay ?? client.workingHoursPerDay`. The API should return an `effectiveWorkingHours` computed field.

### timesheets

```json
{
  "_id": "auto",
  "projectId": "FK → projects._id",
  "date": "YYYY-MM-DD",
  "hours": 0,
  "days": 0,
  "amount": 0,
  "notes": "",
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

**Constraint:** One timesheet entry = one day on one project. A contractor can have multiple entries per day if working on different projects.

**Computed on save:** `days = hours / effectiveWorkingHours`, `amount = days × effectiveRate`. These are persisted at create/update time and treated as the source of truth. The API returns persisted values as-is — no fallback recomputation on read. Old records without these fields will show as null/empty until re-saved.

### expenses

```json
{
  "_id": "auto",
  "projectId": "FK → projects._id",
  "date": "YYYY-MM-DD",
  "expenseType": "",
  "description": "",
  "amount": 0,
  "vatAmount": 0,
  "vatPercent": 0,
  "billable": true,
  "currency": "GBP",
  "attachments": [
    { "filename": "uuid-receipt.jpg", "originalName": "IMG_001.jpg", "mimeType": "image/jpeg" }
  ],
  "notes": "",
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

- `expenseType` — freetext with autocomplete from distinct values in the collection
- `currency` — inherited from client on creation, stored per expense, read-only in the form
- `amount` — gross amount (total paid including VAT)
- `vatAmount` — VAT portion included in the amount
- `vatPercent` — computed on save: `(vatAmount / amount) * 100`, read-only in the form
- `attachments` — array embedded in the expense doc; files on disk at `data/expenses/{expenseId}/`, thumbnails prefixed with `thumb_`
- `description` — client-facing (visible on invoices/reports)
- `notes` — internal only (not visible to client)

### invoices

```json
{
  "_id": "auto",
  "clientId": "FK → clients._id",
  "status": "draft | confirmed | posted",
  "invoiceNumber": "JBL00001 | null",
  "invoiceDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "servicePeriodStart": "YYYY-MM-DD",
  "servicePeriodEnd": "YYYY-MM-DD",
  "additionalNotes": "",
  "lines": [
    {
      "id": "uuid",
      "type": "timesheet | expense | write-in",
      "sourceId": "FK → timesheets._id or expenses._id or null",
      "projectId": "FK → projects._id or null",
      "description": "",
      "date": "YYYY-MM-DD (display, from source)",
      "hours": 0,
      "expenseType": "",
      "quantity": 1,
      "unit": "days | item",
      "unitPrice": 0,
      "vatPercent": 20,
      "netAmount": 0,
      "vatAmount": 0,
      "grossAmount": 0
    }
  ],
  "paymentStatus": "unpaid | paid | overdue",
  "paidDate": null,
  "subtotal": 0,
  "totalVat": 0,
  "total": 0,
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

**Invoice lifecycle:** Draft → Confirmed → Posted. Draft invoices are editable when unlocked. Confirming assigns an invoice number (once only — permanent, never reassigned), and locks the invoice itself plus referenced timesheets/expenses (sets `invoiceId`, `isLocked`, `isLockedReason`). Posted invoices are immutable except for payment tracking. Unconfirming reverts to draft and unlocks the invoice and all items, but retains the invoice number.

**Invoice lines model:** Each timesheet/expense added to an invoice generates a persistent invoice line with snapshotted values (amount, rate, VAT). Write-in lines are regular lines with `type: 'write-in'`. Lines store all computed values (`netAmount`, `vatAmount`, `grossAmount`) so the form and PDF can render without re-fetching source records.

**VAT computation:** Timesheet VAT is exclusive (added on top of net amount using `project.vatPercent`). Expense VAT is inclusive (persisted `vatAmount`). Write-in line VAT is exclusive (user-specified rate). `project.vatPercent: null` means no VAT (exempt), `0` means zero-rated.

**Item locking:** On confirm, the invoice itself is locked, and each referenced timesheet/expense (derived from `lines[].sourceId`) gets `invoiceId`, `isLocked`, and `isLockedReason` set. All three are cleared on unconfirm. Consistency checks verify: (1) items aren't locked to other invoices, (2) line values match current source data (amount drift, rate changes, VAT changes). Recalculate realigns stored line values to current source data.

### documents

```json
{
  "_id": "auto",
  "clientId": "FK → clients._id",
  "projectId": "FK → projects._id",
  "periodStart": "YYYY-MM-DD",
  "periodEnd": "YYYY-MM-DD",
  "granularity": "monthly | weekly",
  "filename": "timesheet-xxx.pdf",
  "filePath": "/absolute/path/to/file",
  "createdAt": "ISO date"
}
```

PDF files are stored on disk in `data/documents/`. Each document record references its file via `filePath`.

### backupConfig (single document — R2 backup configuration)

```json
{
  "_id": "auto",
  "accountId": "",
  "accessKeyId": "",
  "secretAccessKey": "",
  "bucketName": "",
  "backupPath": "backups",
  "endpoint": "https://<accountId>.r2.cloudflarestorage.com",
  "schedule": "off | daily | weekly",
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

Stored in a separate `backup-config.db` file — **not** included in backup archives so credentials stay local. Secret key is masked on read. `backupPath` determines the R2 key prefix for backups — change it to browse/restore from another environment's backups.

## API Endpoints

All endpoints are prefixed with `/api`.

### Clients
- `GET /api/clients` — list all clients (supports OData query params)
- `GET /api/clients/:id` — get client with related projects and timesheets
- `POST /api/clients` — create client (auto-creates a default project)
- `PUT /api/clients/:id` — update client
- `DELETE /api/clients/:id` — delete client (cascade delete projects, timesheets, and expenses + attachment files)

### Projects
- `GET /api/projects` — list all projects, populate client name (supports OData query params)
- `GET /api/projects/:id` — get project with related timesheets, compute effectiveRate
- `POST /api/projects` — create project
- `PUT /api/projects/:id` — update project
- `DELETE /api/projects/:id` — delete project (cascade delete timesheets and expenses + attachment files)

### Timesheets
- `GET /api/timesheets` — list timesheets (supports OData query params), also supports legacy query params:
  - `startDate` and `endDate` for date range filtering
  - `projectId` for filtering by project
  - `clientId` for filtering by client
  - `groupBy=week|month|year` for grouped summaries
- `GET /api/timesheets/:id` — get single entry
- `POST /api/timesheets` — create entry
- `PUT /api/timesheets/:id` — update entry
- `DELETE /api/timesheets/:id` — delete entry

### Expenses
- `GET /api/expenses` — list expenses (supports OData query params), also supports legacy query params:
  - `startDate` and `endDate` for date range filtering
  - `projectId` for filtering by project
  - `clientId` for filtering by client
  - `expenseType` for filtering by type
- `GET /api/expenses/types` — get distinct expense types (sorted alphabetically)
- `GET /api/expenses/:id` — get single expense with enriched fields
- `POST /api/expenses` — create expense (inherits currency from client)
- `PUT /api/expenses/:id` — update expense (recomputes `vatPercent` when amount/vatAmount changes)
- `DELETE /api/expenses/:id` — delete expense (cascade deletes attachment files)
- `POST /api/expenses/:id/attachments` — upload files (multipart, field `files`, max 10)
- `DELETE /api/expenses/:id/attachments/:filename` — delete single attachment
- `GET /api/expenses/:id/attachments/:filename` — serve original file
- `GET /api/expenses/:id/attachments/:filename/thumbnail` — serve thumbnail (images only)

### Invoices
- `GET /api/invoices` — list invoices (OData + legacy `clientId`, `status`, `startDate`, `endDate` filters)
- `GET /api/invoices/:id` — get invoice with enriched timesheets, expenses, client info
- `POST /api/invoices` — create draft invoice
- `PUT /api/invoices/:id` — update invoice (draft/confirmed only)
- `DELETE /api/invoices/:id` — delete draft invoice only
- `POST /api/invoices/:id/confirm` — confirm invoice (assign number, lock items)
- `POST /api/invoices/:id/post` — post invoice (seal)
- `POST /api/invoices/:id/unconfirm` — revert confirmed to draft (unlock items)
- `POST /api/invoices/:id/recalculate` — recompute totals from current items
- `POST /api/invoices/:id/consistency-check` — check for item conflicts
- `PUT /api/invoices/:id/payment` — update payment status (posted only)
- `GET /api/invoices/:id/pdf` — generate and stream invoice PDF

### Settings
- `GET /api/settings` — get contractor profile (includes invoicing fields)
- `PUT /api/settings` — update contractor profile (includes invoicing fields)

### Reports
- `GET /api/reports/timesheet-pdf` — generate PDF, supports query params: `clientId`, `startDate`, `endDate`, optional `projectId` (filters to single project)

### Documents
- `GET /api/documents` — list documents (supports OData query params), also supports legacy `clientId`/`projectId` query filters
- `GET /api/documents/:id` — get document metadata
- `GET /api/documents/:id/file` — serve the actual PDF file
- `POST /api/documents` — generate PDF server-side, save file + record (body: `clientId`, `projectId`, `startDate`, `endDate`, `granularity`)
- `DELETE /api/documents/:id` — delete file from disk + remove record

### Backup
- `GET /api/backup/config` — get backup config (secret key masked)
- `PUT /api/backup/config` — update config + restart cron scheduler
- `POST /api/backup/test-connection` — test R2 credentials via `ListObjectsV2Command`
- `POST /api/backup/create` — trigger manual backup (creates .tar.gz archive in R2)
- `GET /api/backup/list` — list backups from R2 (sorted newest-first)
- `POST /api/backup/restore` — restore from backup (body: `{ backupKey }`) — replaces all data
- `DELETE /api/backup/:key(*)` — delete backup from R2

## API Response Enrichment

Services manually join related data (NeDB has no populate). Key enriched fields:

### `GET /api/projects` (list)
Each project includes: `clientName`, `effectiveRate`, `effectiveWorkingHours` — computed from the project's client.

### `GET /api/projects/:id` (detail)
Same enriched fields as list, plus: `timesheets[]` — all timesheet entries for this project, `expenses[]` — all expenses for this project.

### `GET /api/timesheets` (list)
Each entry includes: `projectName`, `clientName`, `clientId` — joined from the project and its client. Supports `groupBy` which returns `{ period, totalHours, totalDays, totalAmount, entries[] }[]`.

### `GET /api/timesheets/:id` (detail)
Same enriched fields as list, plus: `effectiveRate`, `effectiveWorkingHours` — for client-side display.

### `GET /api/expenses` (list)
Each entry includes: `projectName`, `clientName`, `clientId` — joined from the project and its client.

### `GET /api/expenses/:id` (detail)
Same enriched fields as list.

### `GET /api/clients/:id` (detail)
Includes: `projects[]` — all projects for this client, `timesheets[]` — all timesheets across all client projects (enriched with `projectName`), `expenses[]` — all expenses across all client projects (enriched with `projectName`).

## OData Query Support

All list endpoints (`GET /api/clients`, `GET /api/projects`, `GET /api/timesheets`, `GET /api/expenses`, `GET /api/documents`) support OData-style query parameters via a shared utility (`server/odata.js`). Legacy custom params (e.g. `startDate`, `endDate`, `groupBy`, `clientId`, `projectId`) continue to work alongside OData — filters are merged additively.

### Supported Operations

| Parameter | Syntax | NeDB mapping |
|-----------|--------|--------------|
| `$filter` | `field eq 'value'`, `field gt 123`, `contains(field,'val')`, `and` | NeDB query object |
| `$orderby` | `field asc, field2 desc` | `.sort()` |
| `$top` | integer | `.limit()` |
| `$skip` | integer | `.skip()` |
| `$count` | `true` | Count total before pagination |
| `$select` | `field1,field2` | Post-query field projection (always includes `_id`) |
| `$expand` | `projects,timesheets` | Post-query related entity inclusion |

### $filter Operators
- **Comparison:** `eq`, `ne`, `gt`, `ge`, `lt`, `le`
- **String functions:** `contains(field,'val')`, `startswith(field,'val')`, `endswith(field,'val')` — case-insensitive regex
- **Logical:** `and` (multiple conditions)
- **Types:** strings in single quotes, numbers unquoted, booleans unquoted (`true`/`false`), `null`

### Response Format
- **Without `$count`:** plain array (backward compatible)
- **With `$count=true`:** `{ "@odata.count": N, "value": [...] }`

### $expand Relationships

| Entity | Expandable | Source |
|--------|-----------|--------|
| clients | `projects`, `timesheets`, `expenses` | projects by clientId, timesheets via client's projects, expenses via client's projects |
| projects | `client`, `timesheets`, `expenses`, `documents` | client by clientId, timesheets by projectId, expenses by projectId, documents by projectId |
| timesheets | `project`, `client` | project by projectId, client via project.clientId |
| expenses | `project`, `client` | project by projectId, client via project.clientId |
| documents | `client`, `project` | client by clientId, project by projectId |

### Examples
```
GET /api/clients?$filter=defaultRate gt 500&$orderby=companyName desc
GET /api/projects?$expand=client,timesheets&$top=10
GET /api/timesheets?startDate=2025-01-01&$filter=hours ge 8&$orderby=date desc&$top=10&$expand=project
GET /api/clients?$count=true&$select=companyName,defaultRate
GET /api/documents?projectId=abc123&$count=true
```

## UI Layout — Power Platform Model-Driven App Style

### General Appearance
- Use Fluent UI v9 default theme — it already matches Power Platform's look (white background, blue accent `#0078D4`, grey navigation sidebar)
- Clean, professional, enterprise feel — no rounded playful elements
- Dense information display — favour tables and grids over cards for data

### Layout Structure
1. **Top Bar** (fixed, full width): App title "Timesheet Manager" on the left, settings button on the right. Use a subtle bottom border. Background: white.
2. **Left Sidebar** (fixed, ~220px wide): Navigation links with icons — Dashboard, Clients, Projects, Timesheets, Expenses, Reports. Grey background (`#F5F5F5`). Highlight active item with blue accent.
3. **Main Content Area** (remaining space, scrollable):
   - **List Views:** Command bar on top (New button, search, filters) → DataGrid below with sortable columns, row click to open record
   - **Form Views:** Sticky FormCommandBar at top (Back, Save, Save & Close) → Breadcrumb → Form title → Tabbed sections (General, Related Records) → Form fields in 2-column layout where appropriate
   - **Dashboard:** Five summary cards (Hours This Week, Hours This Month, Active Projects, Earnings This Month, Expenses This Month) in a responsive grid → "Recent Timesheet Entries" section with an EntityGrid showing the last 10 entries (Date, Client, Project, Hours, Amount columns). Expenses card shows billable total as the main value with total (billable + non-billable) as a hint below.

### Navigation (React Router)
- `/` → Dashboard
- `/clients` → Client list
- `/clients/new` → Client create form
- `/clients/:id` → Client record form (tabs: General, Projects, Timesheets, Expenses)
- `/projects` → Project list
- `/projects/new` → Project create form
- `/projects/:id` → Project record form (tabs: General, Timesheets, Expenses, Documents)
- `/reports` → Report generation page (two-column layout: parameters sidebar + PDF preview)
- `/timesheets` → Timesheet list (with date range filter toolbar)
- `/timesheets/new` → Timesheet entry form
- `/timesheets/:id` → Timesheet edit form
- `/expenses` → Expense list (with date range/client/project/type filter toolbar)
- `/expenses/new` → Expense entry form
- `/expenses/:id` → Expense edit form (with attachment gallery)
- `/invoices` → Invoice list (with status/client/payment filters)
- `/invoices/new` → Invoice create form
- `/invoices/:id` → Invoice form (tabs: Invoice, Timesheets, Expenses, PDF Preview)
- `/settings` → Contractor profile form (tabs: Profile, Invoicing, Backup)

### Key UI Behaviors
- **Client creation flow:** User fills in client form → Save creates the client (backend auto-creates default project) and redirects to the client record where the default project is visible under the Projects tab. Save & Close creates and redirects to the client list instead.
- **Project form:** Rate and Working Hours Per Day fields show placeholder text "Inherited from client: £X/day" / "Inherited from client: Xh/day" when null. User can override by entering a value. Creating a new project auto-fills rate and working hours from the selected client.
- **Timesheet list:** Default view shows current week. Period filter uses toggle buttons (This Week / This Month / All Time / Custom) for quick switching — Custom reveals start/end date inputs for arbitrary date ranges. Client and Project dropdown filters narrow results further. All filter selections are persisted to localStorage and restored on revisit. Shows Days, Amount, and total summary row. Values are persisted — no on-the-fly recomputation.
- **Timesheet entry:** Date input (no future dates) + Project dropdown (grouped by client, with client name hint) + Hours (SpinButton 0.25–24, step 0.25, with project daily hours hint) + read-only Days and Amount fields + Markdown notes editor. Days and Amount are only computed when the user explicitly changes Hours or Project — not on form load. On edit, persisted values are shown as-is.
- **Expense list:** Default view shows current month. Same filter bar pattern as timesheets: Period (This Week / This Month / All Time / Custom), Client, Project, plus Expense Type dropdown (populated from `GET /api/expenses/types`). All filters persisted to localStorage (`expenses.*` keys). Columns: Date, Client, Project, Type, Description, Amount, VAT, Billable, Attachments (count). Summary footer: Billable Total, Non-Billable Total, Entries count.
- **Expense entry:** Form layout (2-column grid): Date | Amount (gross), Project (grouped by client) | VAT Amount, Expense Type (freeform Combobox with autocomplete from previous types) | VAT % (read-only, auto-computed), Billable checkbox | Currency (read-only, inherited from client), Description (full width, client-facing). Then Markdown notes (internal). Then Attachments section (visible on edit only — "Save the expense first to add attachments" on new). Amount is gross (total paid including VAT). VAT Amount is the VAT portion within that. VAT % is auto-calculated: `(vatAmount / amount) * 100`. Currency updates automatically when the project changes. `vatPercent` is excluded from dirty tracking (computed field).
- **Expense attachments:** Uses `AttachmentGallery` component. Upload button triggers hidden file input (multiple). Thumbnail grid: images show `thumb_` thumbnails with fallback to original, non-images show file type icon. Click image → lightbox dialog (centered, shrink-wrapped to image). Click non-image → opens in new tab. Delete (X) button per thumbnail with confirmation dialog.
- **Unsaved changes guard:** All forms (Settings, ClientForm, ProjectForm, TimesheetForm, ExpenseForm) use `useFormTracker` for dirty tracking and register a navigation guard via `UnsavedChangesContext`. Changed fields show a blue left-border indicator (Power Platform style). Navigating away from a dirty form (sidebar, breadcrumb, back button, browser back/refresh) triggers a Save/Discard/Cancel dialog. The `beforeunload` event shows the browser's native "Leave page?" dialog on refresh/close.
- **Delete confirmations:** Always show a confirmation dialog before deleting
- **Reports page:** Two-column layout — narrow left sidebar (280px) with cascading dropdowns (Client → Project → Granularity → Period), wider right area for inline PDF preview. Periods are computed from actual timesheet dates (monthly or weekly). Generate button produces a PDF previewed via `<object>`. Download saves to disk via browser download. Save Document persists the PDF server-side, viewable from the project's Documents tab. Client, Project, and Granularity selections are persisted to localStorage and restored on revisit.
- **Project Documents tab:** Shows saved documents for the project. Clicking a row opens the PDF in a new browser tab.
- **Settings page:** Two tabs — "Profile" (contractor profile form with dirty tracking / navigation guard) and "Backup" (self-contained R2 backup management). FormCommandBar save buttons are disabled on the Backup tab. The Backup tab has its own Save Configuration button, Test Connection, Backup Now, and a backup history grid with Restore/Delete actions per row. Restore shows a confirmation dialog and a reload banner on success.

## Business Rules

1. When a client is created, automatically create one project with:
   - `name`: "Default Project"
   - `isDefault`: true
   - `rate`: null (inherits client default rate)
   - `workingHoursPerDay`: null (inherits client working hours)
   - `ir35Status`: set from the client creation form (IR35 status is required when creating a client because the default project needs it)
   - `clientId`: the new client's ID
2. A default project cannot be deleted (it can be renamed or archived).
3. Rate inheritance: `effectiveRate = project.rate ?? client.defaultRate`
4. Working hours inheritance: `effectiveWorkingHours = project.workingHoursPerDay ?? client.workingHoursPerDay ?? 8`
5. Timesheet `days` and `amount` are computed and persisted at save time: `days = hours / effectiveWorkingHours`, `amount = days × effectiveRate`. Once saved, these are the source of truth — the API and UI display persisted values without recomputation. Reports (PDF) also read persisted values directly.
6. Timesheet date must not be in the future.
7. Hours must be between 0.25 and 24 in 0.25 increments.
8. Deleting a client cascade-deletes all its projects, timesheets, and expenses + attachment files (with confirmation dialog).
9. Deleting a project cascade-deletes all its timesheets and expenses + attachment files.
10. Expense `vatPercent` is computed and persisted at save time: `vatPercent = (vatAmount / amount) * 100` (0 if amount is 0). Read-only in the UI.
11. Expense `currency` is inherited from the client on creation. Read-only in the form, updates when the project changes.
12. Expense date must not be in the future.
13. Expense attachments are stored on disk at `data/expenses/{expenseId}/`. Image thumbnails are generated via `sharp` (200px wide, `thumb_` prefix). Deleting an expense cascade-deletes its attachment directory.
14. **Invoice lifecycle:** Draft → Confirmed → Posted. Only unlocked drafts can be deleted. See rules 19–24 for locking behaviour at each stage.
15. Invoice lines: Each timesheet/expense added to an invoice generates a persistent line with snapshotted values. Write-in lines are regular lines with `type: 'write-in'`. Totals (`subtotal`, `totalVat`, `total`) are computed from lines and persisted on save. Consistency check detects value drift between lines and source records. Recalculate realigns lines to current source data.
16. `project.vatPercent`: `20` = standard VAT, `0` = zero-rated, `null` = no VAT (exempt). These are distinct groups on the invoice PDF.
17. Deleting a client cascade-deletes its invoices (and unlocks any locked items). Deleting an invoice NEVER deletes timesheets or expenses.
18. **Invoice number:** Format `JBL{5-digit padded}`, seed in settings (`invoiceNumberSeed`). Assigned once during the first confirmation. **Permanent** — never cleared, never reassigned. The seed is incremented atomically on assignment and never decremented. Re-confirming an unconfirmed invoice reuses the existing number. The `invoiceNumber` field is protected in `update()` — only `confirm()` can set it.
19. **Record locking — data model:** Any record can have two optional fields: `isLocked: true | undefined` and `isLockedReason: string | undefined`. These are **protected** — regular `update()` calls delete them from the spread. Only lifecycle methods (`confirm`, `post`, `unconfirm`) set/clear them via direct NeDB `$set`/`$unset`.
20. **Record locking — API enforcement:** All service `update()` and `remove()` methods call `assertNotLocked(existing)` (from `server/services/lockCheck.js`) at the top before proceeding. If the record is locked, the call throws with the lock reason (HTTP 400).
21. **Record locking — invoice confirm:** Locks **three things**: the invoice itself (`isLockedReason: "Confirmed invoice JBL00001"`), all referenced timesheets (`isLockedReason: "Locked by invoice JBL00001"`, also sets `invoiceId`), and all referenced expenses (same). This prevents any edits or deletes to the invoice or its source records while confirmed.
22. **Record locking — invoice post:** Updates the invoice lock reason to `"Posted invoice"`. Timesheets/expenses remain locked from confirmation.
23. **Record locking — invoice unconfirm:** Unlocks **three things**: the invoice (`$unset isLocked/isLockedReason`), all referenced timesheets (`$unset invoiceId/isLocked/isLockedReason`), and all referenced expenses (same). The invoice reverts to draft status but keeps its invoice number.
24. **Record locking — cascade deletes:** `removeByClientId()` in `invoiceService` clears `invoiceId`/`isLocked`/`isLockedReason` from timesheets and expenses before deleting client invoices.
25. **Locked record UI:** Forms detect `isLocked` from loaded API data. When locked: `FormCommandBar` hides Save/Save & Close/Delete (shows only Back), a warning `MessageBar` displays the lock reason, and form content is wrapped in `<fieldset disabled>` to natively disable all descendant inputs/buttons. `server/services/lockCheck.js` provides the shared `assertNotLocked(record)` helper.

## Development Notes

- Use `nedb-promises` (not raw `nedb`) for async/await support.
- The Express server should serve both the API and the built React frontend (Vite build output from `dist/`). In production, a catch-all `app.get('*')` serves `index.html` for client-side routing. A health check is available at `GET /api/health`.
- The server entry point (`server/index.js`) imports `dotenv/config` as its first import to load `.env` before any other module initialises.
- For development, `npm run dev` uses `concurrently` to run Vite dev server + Express API in parallel. Vite proxies `/api` to `localhost:3001`.
- Database files are stored in the directory specified by the `DATA_DIR` environment variable (defaults to `./data/`), auto-created on first run. `npm run seed` populates sample data. The `.env` file is loaded via `dotenv` at server startup.
- No authentication needed — single user, local app.
- All monetary values stored as numbers (not strings). Currency is always on the client record. Rates are per day.
- Dates stored as `YYYY-MM-DD` strings for timesheets, ISO strings for timestamps.
- DataGrid columns must use `createTableColumn()` from Fluent UI to avoid sort crashes — columns with a `compare` function are sortable, others are not.
- All notes fields (clients, projects, timesheets, expenses) use `@uiw/react-md-editor` with Fluent UI token overrides for consistent styling.
- Fluent UI v9 SpinButton must use uncontrolled mode (`defaultValue`, not `value`) — controlled mode breaks typing. In `onChange`, `data.value` is `null` during typing; always parse `data.displayValue` as fallback: `const val = data.value ?? parseFloat(data.displayValue); if (val != null && !isNaN(val)) ...`
- **Form dirty tracking pattern:** All forms use `useFormTracker(initialState, { excludeFields })` instead of raw `useState`. Call `setBase(...)` after API load and after successful save to reset the baseline. Provide a `saveForm` callback that returns `{ ok: boolean, id?: string }` (no navigation) and register with `useEffect(() => registerGuard({ isDirty, onSave: saveForm }), [isDirty, saveForm, registerGuard])`. Button handlers decide navigation: `handleSave` calls `saveForm` then navigates to the record on create or shows a success message on edit; `handleSaveAndClose` calls `saveForm` then navigates to the list. The guard dialog calls `saveForm` directly and handles pending navigation. Use `guardedNavigate(to)` from `useUnsavedChanges()` for breadcrumbs, back buttons, and tab row clicks. The `excludeFields` option is used for computed fields: TimesheetForm (`['days', 'amount']`), ExpenseForm (`['vatPercent']`).
- **Form page layout pattern:** Form pages use a two-layer structure: outer `page` div (no padding, so FormCommandBar spans full width) → `FormCommandBar` (sticky, `position: sticky; top: 0; z-index: 10`) → inner `pageBody` div (`padding: 16px 24px`) containing breadcrumb, title, and form content.
- **Navigation guard architecture:** Uses a context-based approach (`UnsavedChangesContext`) instead of React Router's `useBlocker` (which requires `createBrowserRouter`, not `BrowserRouter`). The provider wraps routes inside `BrowserRouter` in `App.jsx`. `AppLayout` intercepts sidebar NavLink clicks and the Settings button via `guardedNavigate`. Browser back/forward is handled via a popstate sentinel entry.
- `npm run dev` does NOT auto-restart the backend server — restart manually after server-side file changes.
- The `tar` npm package does not have a default ESM export — must use `import * as tar from 'tar'` (not `import tar from 'tar'`).
- **Service update pattern (spread):** All service `update()` methods use the spread approach — `const updateData = { ...data, updatedAt: now }` — then delete protected fields (`_id`, `createdAt`, `isLocked`, `isLockedReason`, plus entity-specific fields like `status`, `invoiceNumber`, `attachments`). Do NOT use field-by-field whitelists. This ensures new fields are automatically persisted without requiring service changes. Type coercion and computed field recomputation happen after the spread.
- **Record locking pattern:** All service `update()` and `remove()` methods fetch the existing record first, then call `assertNotLocked(existing)` before proceeding. The helper is in `server/services/lockCheck.js`. Lock fields (`isLocked`, `isLockedReason`) are always deleted from the update spread (protected). They are set/cleared only by invoice lifecycle methods (`confirm`, `post`, `unconfirm`) via direct NeDB `$set`/`$unset`. Frontend forms derive `isLocked`/`lockReason` from loaded API data, pass `locked` to `FormCommandBar` (hides Save/Delete), show a warning `MessageBar`, and wrap form content in `<fieldset disabled>` for native input disabling.

## PDF Report Layout (pdfmake)

Generated via `reportService.js`. One page per project with entries in the period.

**Structure per page:**
1. **Contractor header:** Business name (or personal name) + contact details (address | email | phone)
2. **Info table** (no borders): Client, Project, Period, IR35 Status, Rate
3. **Timesheet table:** Columns — Date, Hours, Days, Notes, Rate, Amount. Blue header row (`#0078D4`), light grey totals row. Horizontal lines only (no vertical).
4. **Footer:** "Page X of Y" centred

**Styles:** A4, 40px margins, Roboto font, 9pt table cells, 14pt contractor name. Period labels auto-detect full months (e.g. "January 2025") vs arbitrary ranges ("1 Jan 2025 – 15 Jan 2025").

## Seed Data (`npm run seed`)

Clears all data and creates:
- **Settings:** John Smith, Smith Consulting Ltd, London address, UTR/VAT/company reg
- **Clients:** Barclays Bank (£650/day, 8h) + HMRC Digital (£600/day, 7.5h)
- **Projects:** 3 total — Barclays Default Project (Outside IR35, inherits rate), Payment Platform Migration (Outside IR35, £700/day override), HMRC Default Project (Inside IR35, inherits rate)
- **Timesheets:** Up to 5 entries for current week on Payment Platform Migration (8h/day, £700) + 3 entries for last week on HMRC (7.5h/day, £600). Only creates entries for dates that are not in the future.
- **Expenses:** 4 total — Travel (£45.60, billable) and Mileage (£32.40, billable) on Payment Platform Migration this week, Equipment (£24.99 + £4.17 VAT, non-billable) on Payment Platform Migration, Travel (£28.50, billable) on HMRC last week.

## Docker

The app is fully containerised via a multi-stage Dockerfile.

### Files
- `Dockerfile` — Stage 1 builds the React frontend (`npm run build`), Stage 2 copies `dist/` + `server/` + production deps into a slim `node:20-alpine` image.
- `.dockerignore` — excludes `node_modules`, `dist`, `data`, `.env`, `*.md`, `.git`, `.gitignore` from build context.
- `docker-compose.yml` — configures port, volume mount, and restart policy.

### Configuration
Both `PORT` and `DATA_DIR` are configurable via environment variables (in `.env` or inline):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Express server port (both container-internal and host mapping) |
| `DATA_DIR` | `./data` | Host path for database files and PDF documents (mounted to `/app/data` inside the container). Only controls the host-side volume mount — the container always uses `/app/data` internally. |

### Usage
```bash
# Default (port 3001, data in ./data)
docker compose up -d

# Custom port and data path
PORT=8080 DATA_DIR=/mnt/nas/timesheet-data docker compose up -d

# Or set in .env file:
# PORT=8080
# DATA_DIR=/mnt/nas/timesheet-data
```

The container stores no data — all `.db` files and PDFs live on the host at the mounted path. Access the app from other machines at `http://<host-ip>:<PORT>`.

## Future Considerations (Out of Scope Now, But Keep in Mind)

- **Sidebar collapsibility:** Add a toggle button or responsive breakpoint to collapse the sidebar on small screens.
- **Contractor name in top bar:** Fetch settings and display contractor name next to the settings button.
- **Invoicing:** Generate invoices from timesheet data per client per period. The data model already supports this — client has currency, projects have rates, timesheets have hours.
- **Timesheet approval workflow:** May add `status` field to timesheets (draft/submitted/approved).
- **CSV export:** CSV export of timesheets (PDF export is already implemented via the Reports page).
- **Migration to MongoDB:** NeDB API is compatible with MongoDB. If the app ever goes multi-user/cloud, migration is straightforward.
