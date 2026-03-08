# Timesheet Application — UK Contractor Market

## Overview

A single-user desktop timesheet and invoicing application for UK technology contractors. Runs locally, manages clients, projects, daily timesheet entries, expenses, invoices, and PDF reports. The UI closely resembles a Microsoft Power Platform Model-Driven Application.

No authentication — single user, local app.

## Standards (Claude Code Skills)

Project standards are enforced via Claude Code skills (`.claude/skills/`). These should be loaded when **creating, modifying, or fixing** any part of the codebase they cover. Invoke with `/skill-name` or let Claude auto-load based on context:

- `/forms-guide` — Form structure, save pattern, locking, dirty tracking, field layout
- `/list-views-guide` — DataGrid, filters, pagination, search, summary footer
- `/api-services-guide` — Backend CRUD, OData support, enrichment, route/API client patterns
- `/routing-guide` — Route registration, sidebar navigation, guards, breadcrumbs
- `/components-guide` — Shared component contracts (FormCommandBar, CommandBar, FormSection, FormField, etc.)

## Entity Wiring Docs

**Before modifying, fixing, or debugging any entity, read its wiring doc from `.claude/docs/`.** These map the full file chain, cross-entity consumers, and blast radius for each entity. Use them to:

1. **Find files fast** — the doc lists every file involved (frontend form, list, API client, backend route, service, DB)
2. **Know what else to check** — the "Cross-Entity Consumers" table shows every place outside the entity's own files that reads or writes its data
3. **Verify blast radius** — the "Blast Radius" section lists what to verify after making changes

Available docs: `expenses.md`, `invoices.md`, `timesheets.md`, `clients.md`, `projects.md`, `transactions.md`

## Tech Stack

- **Frontend:** React 18, React Router v6, Vite, Fluent UI v9 (`@fluentui/react-components`) — **MUST use Fluent UI React components for all UI. Do not replace with HTML tables, custom components, or other libraries unless explicitly asked.**
- **Backend:** Node.js, Express.js, NeDB (`nedb-promises`), ESM throughout (`"type": "module"`)
- **PDF:** pdfmake (server-side), pdf-lib (PDF merging)
- **AI:** `@anthropic-ai/sdk` (Claude API for bank statement parsing and expense receipt scanning)
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
| amount | Gross total paid (including VAT). Negative for credit notes/refunds |
| vatAmount | VAT portion included in amount. Negative when amount is negative |
| vatPercent | Computed on save via golden rule (see Business Rules). Read-only in UI |
| netAmount | Computed on save: `amount - vatAmount` |
| billable | Boolean, default true |
| currency | Inherited from client on creation, read-only; updates when project changes |
| externalReference | Invoice number, order ID, receipt number, or other external reference from the source document |
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

### logConfig (single document)

Logging configuration and R2 log storage settings. Stored in a **separate** database file. Secret key masked on read.

| Field | Description |
|-------|-------------|
| logLevel | Minimum log level (`debug`, `info`, `warn`, `error`; default: `info`) |
| maxFileSize | Maximum log file size in bytes before rotation (default: 5MB) |
| messageFilter | Regex pattern tested against full serialized JSON entry; empty = log everything |
| logPayloads | Boolean — log POST/PUT/PATCH request bodies (debug level only). Sensitive fields masked by key-name pattern |
| r2Endpoint, r2AccessKeyId, r2SecretAccessKey | R2 credentials for log storage |
| r2BucketName | R2 bucket name |
| r2LogPath | R2 key prefix for log files (default: `logs`) |
| uploadEnabled | Boolean — enable automatic upload of completed log files to R2 |
| uploadIntervalMinutes | Interval in minutes for the automatic upload cycle |

### aiConfig (single document)

AI-powered transaction import configuration. Stored in a **separate** database file (`ai-config.db`) — **not** included in backup archives. API key masked on read.

| Field | Description |
|-------|-------------|
| apiKey | Claude API key (masked on read, retained on update if masked) |
| model | Claude model ID (default: `claude-sonnet-4-5-20250929`) |
| maxTokens | Maximum output tokens for AI response (default: 64000, max: 64000) |
| timeoutMinutes | Request timeout in minutes (default: 30) |
| systemPrompt | System prompt sent with every transaction import AI parsing request |
| expenseSystemPrompt | System prompt sent with every expense receipt scanning AI request |

### importJobs

| Field | Description |
|-------|-------------|
| filename | Original uploaded filename |
| filePath | Absolute path to uploaded file on disk (`DATA_DIR/uploads/{jobId}/`) |
| status | `processing` → `ready_for_review` → `abandoned`; also `failed` |
| error | Error message (set on failure, cleared on retry) |
| userPrompt | Job-specific instructions sent alongside the file to the AI (read-only after creation) |
| aiStopReason | Claude API stop reason from the parsing response |
| completedAt | Timestamp when job reached a terminal status |

Uploaded files stored on disk at `DATA_DIR/uploads/{jobId}/`. Deleting a job cascade-deletes its staged transactions and upload directory. Only terminal-status jobs (`abandoned`, `failed`) can be deleted.

### stagedTransactions

Temporary parsed transactions awaiting review before commit. Semi-structured — fields vary based on AI output.

| Field | Description |
|-------|-------------|
| importJobId | FK → importJobs |
| compositeHash | MD5 of `filename-date-description-amount` (idempotent dedup key) |
| date | `YYYY-MM-DD` (from AI) |
| description | Transaction description (from AI) |
| amount | Number, negative for debits, positive for credits (from AI) |
| *(additional)* | Any other fields the AI returns (e.g. `balance`, `reference`, `transactionType`) |

Deleted when job is abandoned.

### transactions

| Field | Description |
|-------|-------------|
| date | `YYYY-MM-DD` |
| description | Transaction description |
| amount | Number, negative for debits, positive for credits |
| importJobId | FK → importJobs (source traceability) |
| source | Full staged transaction record (audit trail) |
| status | `unmatched`, `matched`, or `ignored` |
| ignoreReason | Reason for ignoring (nullable) |

---

## Business Rules

### Entity-Specific Rules

Detailed business rules for each entity (golden rules, validation, computation, cascade behaviour) are documented in the entity wiring docs at `.claude/docs/`. See:

- **Clients & Projects** → `clients.md`, `projects.md` (default project auto-creation, cascade deletes, rate/hours inheritance)
- **Timesheets** → `timesheets.md` (rate/hours golden rule, days/amount computation and persistence)
- **Expenses** → `expenses.md` (VAT golden rule, credit notes, currency inheritance, receipt scanning)
- **Invoices** → `invoices.md` (lifecycle, invoice number, line computation, consistency check, PDF generation, locking, payment tracking)
- **Transactions & Import Jobs** → `transactions.md` (file upload, AI parsing, staged review, linking)

### Record Locking

1. Any record can have `isLocked` (boolean) and `isLockedReason` (string). These are protected — cannot be set via regular updates, only by invoice lifecycle methods.
2. All update and delete operations check for lock status first and reject with the lock reason if locked (HTTP 400).
3. **Locked record UI:** Form hides Save/Delete buttons (shows only Back), displays warning banner with lock reason, disables all form inputs.
4. Invoice-specific locking behaviour (confirm/post/unconfirm) is documented in `invoices.md`.

### Logging

5. **Log files:** JSON Lines format (`app-YYYY-MM-DD.log`), one entry per line. Files rotate when exceeding max file size (numbered suffix: `app-YYYY-MM-DD-1.log`). Stored in a dedicated log directory.
6. **TraceId correlation:** Each page navigation generates a client-side UUID. All API requests from that navigation share the same traceId via `X-Trace-Id` header. Server stores it in AsyncLocalStorage and writes it to every log entry. Enables filtering all requests triggered by a single user action.
7. **Message filter:** Regex pattern tested against the full serialized JSON log entry before writing to file. Filters by any field (source, path, level, message). Empty pattern logs everything.
8. **Payload logging:** Opt-in, debug-level only. Logs POST/PUT/PATCH request bodies. Sensitive fields automatically masked using a key-name pattern (`secret`, `password`, `apikey`). Payloads truncated at 2000 characters.
9. **R2 log lifecycle:** Completed (non-active) log files can be uploaded to R2. Upload verifies integrity (filename + size + MD5 hash) after transfer, then deletes the local copy. The active log file (today's date) cannot be uploaded or deleted. Files can be downloaded from R2 back to local for searching.
10. **Safe local delete:** Local log files can only be deleted if an identical copy exists in R2 (verified by filename + size + MD5 hash match).
11. **Error logging levels:** `console.warn()` for managed exceptions (4xx), `console.error()` for unexpected failures (5xx). MCP tool errors logged as `console.error()`.

### MCP (Model Context Protocol)

12. The application exposes an MCP endpoint at `POST /mcp` (outside `/api` prefix) for AI assistants via JSON-RPC 2.0.
13. **Available tools:** `list_projects`, `create_timesheet`, `create_expense`, `list_recent_timesheets`, `list_recent_expenses`.
14. **Confirmation flow:** All MCP tools follow a confirmation flow — the AI must list projects first, confirm the project with the user, present a summary, and only submit after user confirmation.
15. **Authentication:** MCP auth configuration managed via `/api/mcp-auth` endpoints. OAuth 2.0 metadata served at `/.well-known/oauth-authorization-server`.
16. **Upload Expense Image Skill:** Downloadable Claude.ai skill for receipt image upload after expense creation via MCP.

---

## API

All endpoints prefixed with `/api`. All list endpoints support OData-style query parameters (`$filter`, `$orderby`, `$top`, `$skip`, `$count`, `$select`, `$expand`) alongside entity-specific query params. Standard CRUD per entity.

Entity-specific API behaviors (endpoints, enrichment, filters, lifecycle methods) for clients, projects, timesheets, expenses, invoices, and transactions are documented in their wiring docs at `.claude/docs/`.

### Other API endpoints (no wiring docs)

- **Reports:** Generate timesheet PDF (by client + date range, optional project filter). Generate expense PDF (same params). Combined PDF endpoint accepts array of report specs (invoice + timesheet + expense) and merges into single PDF.
- **Documents:** List, detail, serve PDF file, generate + save PDF, delete (removes file + record)
- **Settings:** Get/update contractor profile (single document, upserted)
- **AI Config:** Get/update config (API key masked on read), test connection (sends trivial request to Claude API). Separate from settings — own database, own endpoints.
- **Logs:** Config CRUD (secret masked on read), test R2 connection, search (supports entity params `startDate`, `endDate`, `level`, `source`, `keyword`, `traceId` + OData `$filter`, `$orderby`, `$top`, `$skip`, `$count`, `$select`), list local files, read log file (with level/source/keyword filtering), upload to R2 (integrity-verified, deletes local), safe delete local file (requires R2 backup verification), download from R2, list R2 logs, pageview tracking (with traceId).
- **Backup:** Config CRUD (secret masked on read), test connection, manual backup (creates .tar.gz in R2), list backups, restore (replaces all data), delete backup
- **Help:** Skill zip download endpoint (`GET /api/help/skills/:skillFolder/download`). Searches `src/help/{topic}/skill/{skillFolder}/` and serves as a zip archive. Help topic content is auto-discovered from `src/help/*/index.md` frontmatter (title, description, tags, optional banner image).

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
2. **Left Sidebar** (~220px, collapsible to icon-only with tooltips): Dashboard, Clients, Projects, Timesheets, Expenses, Invoices, Reports (expandable parent with Timesheet and Expenses children), Data Management (expandable parent with Import Transactions and Application Logs children). Active item highlighted with blue accent border.
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
| `/reports/timesheets` | Timesheet report generation page |
| `/reports/expenses` | Expense report generation page |
| `/import-jobs` | Import job list |
| `/import-jobs/new` | Import job create form (file upload) |
| `/import-jobs/:id` | Import job form (staged transactions grid, lifecycle) |
| `/transactions` | Transaction list |
| `/transactions/:id` | Transaction form (read-only details, editable status) |
| `/logs` | Log Viewer |
| `/help` | Help topics index |
| `/help/:topicId` | Help topic detail (markdown content with images) |
| `/settings` | Settings (tabs: Profile, Invoicing, AI Config, Backup, Logging) |

### List Views & Form Views

Generic list/form patterns are defined in Claude Code skills (`/list-views-guide`, `/forms-guide`). Entity-specific UI details (filters, columns, tabs, fields, computed values) are documented in each entity's wiring doc at `.claude/docs/`.

- **Log Viewer** (no wiring doc): Date range, level, source, and keyword filters. TraceId filter (set by clicking a traceId value). Row click opens OverlayDrawer with full details and raw JSON.

### Dashboard

Six summary cards in a responsive grid:
1. **Hours This Week** — sum of current week's timesheet hours
2. **Hours This Month** — sum of current month's timesheet hours
3. **Active Projects** — count of active projects
4. **Earnings This Month** — sum of current month's timesheet amounts
5. **Expenses This Month** — billable total as main value, total (billable + non-billable) as hint
6. **Unpaid Invoices** — sum of unpaid/overdue posted invoice totals, with count

Below cards: "Recent Timesheet Entries" grid showing last 10 entries (Date, Client, Project, Hours, Amount).

### Reports Pages

Two report pages (Timesheet and Expense) sharing the same two-column layout — narrow left sidebar (280px) with cascading dropdowns (Client → Project → Granularity → Period), wider right area for inline PDF preview. Periods computed from actual entry dates (monthly or weekly). Actions: Generate (preview), Download (browser save). Timesheet report also has Save Document (persists server-side, viewable from project's Documents tab). Selections persisted to localStorage (separate keys per report type).

### Settings Page

Five tabs:
- **Profile:** Contractor personal + business details form with dirty tracking
- **Invoicing:** Invoice number seed (read-only display), default payment term days, default VAT rate, invoice footer text, bank details (name, sort code, account number, account owner)
- **AI Config:** API Key (password input, masked), Model (text input), Max Tokens (number input, default 64000, max 64000), Timeout in minutes (number input, default 30). Test Connection and Save Configuration buttons. Two system prompt sections: Transaction Import System Prompt and Expense Receipt System Prompt (both markdown editors, full width). Independent component with own save logic (not part of main Settings form tracker).
- **Backup:** R2 credentials, backup path, schedule (off/daily/weekly). Save Configuration button, Test Connection, Backup Now. Backup history grid with Restore/Delete per row. Restore shows confirmation dialog and reload banner on success.
- **Logging:** Log level, max file size, message filter (regex), payload logging toggle (debug-only, with volume warning). R2 log storage credentials (endpoint, access key, secret, bucket, path). Upload settings (enabled toggle, interval). Test Connection and Save. Local log files grid with Upload to R2 and Delete actions. R2 log files grid with Download action. Independent component with own save logic.

### Help Pages

Auto-discovered from `src/help/*/index.md` files with YAML frontmatter (title, description, tags, optional banner). Help index shows topic cards. Topic detail renders markdown content with images. Topics can include downloadable Claude.ai skills (zipped from `src/help/{topic}/skill/{skillFolder}/`).

**Current topics:**
- **M2M API Authentication** — Configure OAuth for machine-to-machine API access via Cloudflare Access and Azure AD
- **Upload Expense Image Skill** — Downloadable Claude.ai skill for automatic receipt image upload after expense creation via MCP

---

## PDF Reports

All PDF reports use navy (#1B2A4A) accent colour, alternating row striping, and UK currency formatting (thousands separators).

### Timesheet Report

One page per project. Structure:
1. Contractor header: business name + address lines + "TIMESHEET REPORT" label
2. Info table: Client, Project, Period, IR35 Status, Rate
3. Timesheet table: Date, Hours, Days, Notes, Rate, Amount — navy header row, alternating rows, light grey totals row
4. Page footer: "Page X of Y"

Supports filtering by date range or by specific timesheet IDs (for invoice inclusion). When both IDs and date range provided, IDs drive the query and dates drive the period label.

### Expense Report

Same header structure as timesheet report with "EXPENSE REPORT" label. Expense table: Date, Type, Description, Amount (gross). One page per project. Same ID/date range behaviour as timesheet report.

### Invoice PDF

Structure:
1. Header: business name + address + "INVOICE" label (navy)
2. Billing block: "To" section (left) + invoice meta with grey background (right) — invoice date, number, due date
3. Service period line
4. Line items table in navy-bordered rectangle: Description, Qty, Unit, Unit Price, VAT %, Amount (net), VAT, Total — grouped by VAT rate, alternating rows
5. Totals block (right-aligned, below table): Sub Total, Total VAT, Total Due
6. Page footer: "Thank you" message, company number, three-column layout (Registered Address, Contact Information, Payment Details)

### Combined PDF

Invoice PDF + optional timesheet report pages + optional expense report pages merged into a single file. When included in a combined PDF, timesheet/expense reports use the invoice's service period for the period label. Generated and saved to disk on invoice confirm. Served from disk for confirmed/posted invoices (no regeneration). Deleted on unconfirm.

---

## Seed Data (`npm run seed`)

Clears all data and creates:
- **Settings:** John Smith, Smith Consulting Ltd, London address, UTR/VAT/company reg, bank details
- **Clients:** Barclays Bank (£650/day, 8h) + HMRC Digital (£600/day, 7.5h)
- **Projects:** 3 total — Barclays Default (Outside IR35, inherits rate), Payment Platform Migration (Outside IR35, £700/day override), HMRC Default (Inside IR35, inherits rate)
- **Timesheets:** Up to 5 entries for current week on Payment Platform Migration (8h/day, £700) + 3 entries for last week on HMRC (7.5h/day, £600). Only creates entries for non-future dates.
- **Expenses:** Travel (£45.60, billable) and Mileage (£32.40, billable) on Payment Platform Migration this week, Equipment (£24.99 + £4.17 VAT, non-billable) on Payment Platform Migration, Travel (£28.50, billable) on HMRC last week.
- **AI Config:** Default config with empty API key, default model, and default system prompt for bank statement parsing.
- **Import Job:** 1 ready_for_review job (natwest-jan-2026.csv) + 4 linked transactions (matched, unmatched, ignored statuses).

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
- **Server-side pagination:** All list views currently use client-side pagination (`usePagination` hook slices the full array). A future `useServerPagination` hook can swap in server-side pagination via `$top`/`$skip`/`$count` OData params without changing the `PaginationControls` UI component.
- **Shared entity shapes:** Consider introducing a `shared/shapes/` folder with plain objects defining each entity's storable fields and defaults. Would serve as single source of truth for form initialization (`useFormTracker`) and service-layer `create()`/`update()` field acceptance — preventing form and API drift. Currently low-risk since it's a single-developer app, but worth revisiting if the codebase grows or multiple consumers are introduced.
