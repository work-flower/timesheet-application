# Timesheet Application — UK Contractor Market

## Overview

A single-user desktop timesheet and invoicing application for UK technology contractors. Runs locally, manages clients, projects, daily timesheet entries, expenses, invoices, and PDF reports. The UI closely resembles a Microsoft Power Platform Model-Driven Application.

No authentication — single user, local app.

### Core Principles
- **Simplicity and user experience centricity** — every feature should be straightforward to use and maintain, favour minimal solutions over elaborate ones
- **Lightweight dependencies** — prefer built-in APIs or minimal custom code over adding libraries; always present alternatives to the user when a library seems warranted

## Standards (Claude Code Skills) — MANDATORY

**Before making ANY code change, you MUST load the relevant skill(s) below.** These are the project's golden rules — never create, modify, or fix code in these areas without first loading the corresponding skill. Do not rely on memory or assumptions about the patterns; always load the skill to get the current standards.

| Changing... | MUST load |
|---|---|
| Form views (any `*Form.jsx`, `*Page.jsx` with form logic) | `/forms-guide` |
| List views (any `*List.jsx`, `*Page.jsx` with DataGrid) | `/list-views-guide` |
| Backend services, routes, or frontend API clients | `/api-services-guide` |
| Route registration, sidebar menu, navigation | `/routing-guide` |
| Shared components or hooks (`FormCommandBar`, `FormSection`, `FormField`, `ConfirmDialog`, `useFormTracker`, etc.) | `/components-guide` |

If a change spans multiple areas (e.g. adding a new entity end-to-end), load ALL applicable skills before starting.

## Entity Wiring Docs

**Before modifying, fixing, or debugging any entity, read its wiring doc from `.claude/docs/`.** These map the full file chain, cross-entity consumers, and blast radius for each entity. Use them to:

1. **Find files fast** — the doc lists every file involved (frontend form, list, API client, backend route, service, DB)
2. **Know what else to check** — the "Cross-Entity Consumers" table shows every place outside the entity's own files that reads or writes its data
3. **Verify blast radius** — the "Blast Radius" section lists what to verify after making changes

Available docs: `expenses.md`, `invoices.md`, `timesheets.md`, `clients.md`, `projects.md`, `transactions.md`, `execution-pipeline.md`, `logging.md`, `calendar.md`, `tickets.md`, `notebooks.md`

### Keeping Wiring Docs Up to Date (MANDATORY)

**Wiring docs MUST be updated as part of any change that affects them.** Stale docs are worse than no docs. Update the relevant wiring doc when:

1. **Any entity change** — adding/removing/renaming fields, endpoints, service methods, or form components
2. **Any cross-entity dependency change** — a new consumer reads/writes another entity's data, or an existing one changes
3. **Any lesson learned** — a bug fix, a discovered gotcha, a pattern that caused confusion. Add it to the "Lessons Learned" section of the relevant wiring doc

### Auditing an Entity

When the user requests an audit, systematically verify the entity's documentation against its actual implementation. Audit one entity at a time.

**Step 1 — Verify wiring doc vs code:**
- **File chain:** Do all listed files exist? Are there unlisted files involved?
- **Frontend/Backend tables:** File paths, method counts, notes accuracy
- **Cross-entity consumers:** Any missing consumers? Any listed ones that no longer exist?
- **Golden rules:** Does the code implement what the doc describes?
- **Key business logic:** Correct locations, correct logic?
- **Blast radius:** Still accurate?

**Step 2 — Verify CLAUDE.md vs code** (for the audited entity):
- Data model fields match what the service actually stores/returns
- Navigation routes and form tabs match the router config
- $expand relationships match the service implementation

**Step 3 — Check both directions:** doc→code (is what's documented true?) AND code→doc (is there undocumented behaviour?)

**Step 4 — Present findings:** List all discrepancies. Discuss each one with the user — agree on alignment direction (update doc, update code, or both). **Do not proceed to planning until every discrepancy is agreed upon.**

**Step 5 — Plan:** Generate an implementation plan from the agreed findings. Review with the user — **no implementation until user confirms the plan.**

**Step 6 — Implement:** Apply the agreed plan. Update wiring doc, CLAUDE.md, and/or code as agreed.

## Tech Stack

- **Frontend:** React 18, React Router v6, Vite, Fluent UI v9 (`@fluentui/react-components`) — **MUST use Fluent UI React components for all UI. Do not replace with HTML tables, custom components, or other libraries unless explicitly asked.**
- **Backend:** Node.js, Express.js, NeDB (`nedb-promises`), ESM throughout (`"type": "module"`)
- **PDF:** pdfmake (server-side), pdf-lib (PDF merging)
- **AI:** `@anthropic-ai/sdk` (Claude API for bank statement parsing and expense receipt scanning)
- **Calendar:** `node-ical` (ICS feed fetching and parsing)
- **Tickets:** Native `fetch` with Basic auth (Jira REST API v3, Azure DevOps REST API)
- **Notebook Editor:** `@milkdown/kit` + `@milkdown/react` (WYSIWYG markdown editor for knowledge base, wrapped in swappable `NotebookEditor.jsx`)
- **Other:** `@uiw/react-md-editor` (markdown notes), `multer` + `sharp` (expense attachments + thumbnails), `@aws-sdk/client-s3` + `archiver` + `tar` + `node-cron` (R2 cloud backup), `dotenv`

## Configuration

- `DATA_DIR` env var — database/documents path (default: `./data`)
- `PORT` env var — Express port (default: `3001`)
- `npm run dev` — runs Express + both Vite dev servers (main on 5173, admin on 5174) concurrently; Vite proxies `/api` to Express
- `npm run build` — builds both apps (`dist/` + `dist-admin/`)
- `npm start` — Express serves API + both built frontends (main at `/`, admin at `/admin/`)
- `npm run dev:admin` — runs only the admin Vite dev server
- `npm run seed` — **DANGER: clears ALL data.** Never run without explicitly asking the user first. Always wait for confirmation so the user can back up.
- `npm run dev` does NOT auto-restart backend — must restart manually after server changes
- `dotenv` loads `.env` at server startup (first import in `server/index.js`)
- Health check at `GET /api/health`

## Project Structure

```text
app/                — main app (React + Vite)
  src/              — api/, components/, contexts/, hooks/, layouts/, pages/
admin/              — admin console (separate Vite app)
  src/              — api/, components/, contexts/, hooks/, layouts/, pages/
server/             — shared Express API: db/, services/, routes/
shared/             — shared code used by both server and frontends
data/               — NeDB .db files (auto-created)
vite.config.js      — main app config (root: 'app')
vite.admin.config.js — admin app config (root: 'admin', base: '/admin/')
dist/               — main app build output
dist-admin/         — admin app build output
```

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
| transactions | Array of linked transaction IDs (for payment matching) |
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
| transactions | Array of linked transaction IDs (for payment matching) |
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
| isLocked, isLockedReason | Record locking fields |

### calendarSources (standalone DB — not in backups)

ICS calendar feed registrations managed via admin app.

| Field | Description |
|-------|-------------|
| name | Display name (e.g. "Work Calendar") |
| icsUrl | Full ICS subscription URL |
| colour | Hex colour for UI display (default: #0078D4) |
| enabled | Boolean, default true |
| refreshIntervalMinutes | Optional auto-refresh interval in minutes; null = manual only |
| lastFetchedAt | ISO timestamp of last successful fetch |
| lastError | Error message from last failed fetch |

### calendarEvents (standalone DB — ephemeral cache, not in backups)

Parsed ICS events cached from calendar sources.

| Field | Description |
|-------|-------------|
| sourceId | FK → calendarSources |
| uid | ICS event UID |
| summary | Event title |
| description | Event description |
| start, end | ISO datetime strings |
| location | String |
| allDay | Boolean |

### ticketSources (standalone DB — not in backups)

Jira and Azure DevOps ticket source registrations managed via admin app.

| Field | Description |
|-------|-------------|
| name | Display name |
| type | `jira` or `azure-devops` |
| baseUrl | Instance URL (e.g. `https://foo.atlassian.net` or `https://dev.azure.com/org`) |
| email | Jira only — account email for API token auth |
| apiToken | Jira only — API token (masked on read) |
| pat | ADO only — Personal Access Token (masked on read) |
| preQuery | Optional JQL (Jira) or WIQL (ADO); empty = last 30 days |
| colour | Hex colour for UI display (default: #0078D4) |
| enabled | Boolean, default true |
| refreshIntervalMinutes | Optional auto-refresh interval; null = manual only |
| lastFetchedAt | ISO timestamp of last successful fetch |
| lastError | Error message from last failed fetch |

### tickets (standalone DB — ephemeral cache, not in backups)

Cached tickets from ticket sources in canonical shape.

| Field | Description |
|-------|-------------|
| sourceId | FK → ticketSources |
| externalId | Jira issue key (e.g. `PAY-123`) or ADO work item ID |
| title | Summary/title |
| description | Description (truncated to 500 chars) |
| state | Status/state name |
| type | Issue type (bug, story, task, etc.) |
| assignedTo | Assigned person name |
| sprint | Sprint name (if any) |
| areaPath | ADO area path or Jira project key |
| priority | Priority level |
| project | Source project name |
| url | Direct link to ticket in source system |
| created, updated | Dates from source system |

### notebooks

Knowledge base / notebook entries. Metadata in DB, content on disk as markdown files.

| Field | Description |
|-------|-------------|
| title | Required |
| summary | Short description for cards + future RAG metadata |
| tags | Array of strings |
| isDraft | Boolean marker |
| status | `active`, `archived`, `deleted` |
| ragScore | null until future AI scoring (low, low-moderate, moderate, moderate-high, high) |
| deletedAt | ISO timestamp for recycle bin |
| thumbnailFilename | Auto-generated from first image in content |
| relatedProjects | Array of project IDs referenced in content (derived on save) |
| relatedClients | Array of client IDs referenced in content (derived on save) |
| relatedTimesheets | Array of timesheet IDs referenced in content (derived on save) |

**Content** stored on disk at `DATA_DIR/notebooks/{notebookId}/content.md` — NOT in DB. Media files stored alongside in the same folder.

---

## Business Rules

### Entity-Specific Rules

Detailed business rules for each entity (golden rules, validation, computation, cascade behaviour) are documented in the entity wiring docs at `.claude/docs/`. See:

- **Clients & Projects** → `clients.md`, `projects.md` (default project auto-creation, cascade deletes, rate/hours inheritance)
- **Timesheets** → `timesheets.md` (rate/hours golden rule, days/amount computation and persistence)
- **Expenses** → `expenses.md` (VAT golden rule, credit notes, currency inheritance, receipt scanning)
- **Invoices** → `invoices.md` (lifecycle, invoice number, line computation, consistency check, PDF generation, locking, payment tracking)
- **Transactions & Import Jobs** → `transactions.md` (file upload, AI parsing, staged review, linking)

### Query String Pre-fill

All forms support URL query string pre-fill via `QueryStringPrefill` (`src/components/QueryStringPrefill.jsx`). The component calls the form's `handleChange` for each QS param — values flow through the same code path as user interaction, so all side effects fire naturally. Form state keys in `useFormTracker` MUST match database field names (QS keys map to `handleChange` field arguments). See `/forms-guide` for detailed usage.

### VAT Calculation Source of Truth

All VAT calculations MUST use `shared/expenseVatCalc.js` (`deriveVatFromPercent`, `deriveVatFromAmount`). Never duplicate VAT logic in form code.

### Record Locking

1. Any record can have `isLocked` (boolean) and `isLockedReason` (string). These are protected — cannot be set via regular updates, only by invoice lifecycle methods.
2. All update and delete operations check for lock status first and reject with the lock reason if locked (HTTP 400).
3. **Locked record UI:** Form hides Save/Delete buttons (shows only Back), displays warning banner with lock reason, disables all form inputs.
4. Invoice-specific locking behaviour (confirm/post/unconfirm) is documented in `invoices.md`.

### Logging

Full logging infrastructure is documented in `logging.md` wiring doc. Key cross-cutting rule:

- **Error logging convention (all route handlers):** `console.warn()` for 4xx (managed exceptions), `console.error()` for 5xx (unexpected failures). MCP tool errors logged as `console.error()`.

### MCP (Model Context Protocol)

1. The application exposes an MCP endpoint at `POST /mcp` (outside `/api` prefix) for AI assistants via JSON-RPC 2.0.
2. **Available tools:** `list_projects`, `create_timesheet`, `create_expense`, `list_recent_timesheets`, `list_recent_expenses`, `list_tickets`.
3. **Confirmation flow:** All MCP tools follow a confirmation flow — the AI must list projects first, confirm the project with the user, present a summary, and only submit after user confirmation.
4. **Authentication:** MCP auth configuration managed via `/api/mcp-auth` endpoints. OAuth 2.0 metadata served at `/.well-known/oauth-authorization-server`.
5. **Upload Expense Image Skill:** Downloadable Claude.ai skill for receipt image upload after expense creation via MCP.

---

## API

All endpoints prefixed with `/api`. All list endpoints support OData-style query parameters (`$filter`, `$orderby`, `$top`, `$skip`, `$count`, `$select`, `$expand`) alongside entity-specific query params. Standard CRUD per entity.

Entity-specific API behaviors (endpoints, enrichment, filters, lifecycle methods) for clients, projects, timesheets, expenses, invoices, transactions, and calendar sources are documented in their wiring docs at `.claude/docs/`.

### Other API endpoints (no wiring docs)

- **Reports:** Generate timesheet PDF (by client + date range, optional project filter). Generate expense PDF (same params). Combined PDF endpoint accepts array of report specs (invoice + timesheet + expense) and merges into single PDF.
- **Documents:** List, detail, serve PDF file, generate + save PDF, delete (removes file + record)
- **Settings:** Get/update contractor profile (single document, upserted)
- **AI Config:** Get/update config (API key masked on read), test connection (sends trivial request to Claude API). Separate from settings — own database, own endpoints.
- **Logs:** Config CRUD (secret masked on read), test R2 connection, search (supports entity params `startDate`, `endDate`, `level`, `source`, `keyword`, `traceId` + OData `$filter`, `$orderby`, `$top`, `$skip`, `$count`, `$select`), list local files, read log file (with level/source/keyword filtering), upload to R2 (integrity-verified, deletes local), safe delete local file (requires R2 backup verification), download from R2, list R2 logs, pageview tracking (with traceId).
- **Backup:** Config CRUD (secret masked on read), test connection, manual backup (creates .tar.gz in R2), list backups, restore (replaces all data), delete backup
- **Help:** Skill zip download endpoint (`GET /api/help/skills/:skillFolder/download`). Searches `src/help/{topic}/skill/{skillFolder}/` and serves as a zip archive. Help topic content is auto-discovered from `src/help/*/index.md` frontmatter (title, description, tags, optional banner image).

### OData Query Support

All list endpoints support: `$filter` (eq, ne, gt, ge, lt, le, contains, startswith, endswith, and, or, parentheses), `$orderby`, `$top`, `$skip`, `$count`, `$select`, `$expand`. Without `$count`: plain array response. With `$count=true`: `{ "@odata.count": N, "value": [...] }`.

**Virtual fields in `$filter`:** Services can define virtual field names that are resolved before the DB query. The notebook service supports `tagsAll`, `relatedProjectNamesAll`, `relatedClientNamesAll`, `relatedTimesheetLabelsAll` — these resolve array fields or cross-entity lookups into real NeDB conditions.

**$expand relationships:**

| Entity | Expandable |
|--------|-----------|
| clients | projects, timesheets, expenses, invoices |
| projects | client, timesheets, expenses, documents |
| timesheets | project, client |
| expenses | project, client |
| invoices | client |
| documents | client, project |

---

## User Interface

### General Design (applies to both main and admin apps)

- Fluent UI v9 default theme — Power Platform look (white background, blue accent `#0078D4`, grey sidebar)
- Clean, professional, enterprise feel
- Dense information display — favour grids over cards for data
- All notes fields use markdown editor

### Layout (applies to both main and admin apps)

1. **Top Bar:** App title on the left with hamburger menu toggle, Settings button on the right
2. **Left Sidebar** (~220px, collapsible to icon-only with tooltips): Menu items with expandable parent groups. Active item highlighted with blue accent border.
3. **Main Content Area** (scrollable): List views, form views, or dashboard

### Navigation

**Main app** (`/`):

| Route | Page |
|-------|------|
| `/` | Dashboard (Operations) |
| `/dashboards/reconciliation` | Reconciliation Dashboard |
| `/dashboards/financial` | Financial Dashboard |
| `/clients` | Client list |
| `/clients/new` | Client create form |
| `/clients/:id` | Client form (tabs: General, Projects, Timesheets, Expenses, Invoices) |
| `/projects` | Project list |
| `/projects/new` | Project create form |
| `/projects/:id` | Project form (tabs: General, Timesheets, Expenses, Documents, Invoices) |
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
| `/reports/income-expense` | Income & Expense report |
| `/reports/vat` | VAT report |
| `/import-jobs` | Import job list |
| `/import-jobs/new` | Import job create form (file upload) |
| `/import-jobs/:id` | Import job form (staged transactions grid, lifecycle) |
| `/staged-transactions` | Staged transaction review |
| `/transactions` | Transaction list |
| `/transactions/:id` | Transaction form (read-only details, editable status) |
| `/banking/transaction-reconciliation` | Transaction Reconciliation (three-panel batch linking) |
| `/notebooks` | Notebook list (card-based) |
| `/notebooks/new` | Create new notebook (create-on-open redirect) |
| `/notebooks/:id` | Notebook edit form (Milkdown editor) |
| `/notebooks/bin` | Recycle bin (deleted notebooks with restore/purge) |
| `/help` | Help topics index |
| `/help/:topicId` | Help topic detail (markdown content with images) |

**Admin console** (`/admin/`):

| Route | Page |
|-------|------|
| `/config/profile` | ProfilePage (contractor details) |
| `/config/invoicing` | InvoicingPage (invoice seed, payment terms, VAT, bank details) |
| `/system/ai` | AiConfigPage (Claude API key, model, prompts) |
| `/system/mcp-auth` | McpAuthPage (OAuth config) |
| `/system/calendars` | CalendarSourcesPage (ICS feed management) |
| `/system/ticket-sources` | TicketSourcesPage (Jira & Azure DevOps ticket source management) |
| `/infra/backup` | BackupPage (R2 config, backup/restore) |
| `/infra/logging` | LoggingPage (log config, R2 upload) |
| `/reports/logs` | LogViewer (search, filters, detail drawer) |

### List Views & Form Views

Generic list/form patterns are defined in Claude Code skills (`/list-views-guide`, `/forms-guide`). Entity-specific UI details (filters, columns, tabs, fields, computed values) are documented in each entity's wiring doc at `.claude/docs/`.

### Dashboards

Three dashboards accessible from the main app:

1. **Operations** (`/`) — Six summary cards (hours this week/month, active projects, earnings, expenses, unpaid invoices) + recent timesheet entries grid
2. **Reconciliation** (`/dashboards/reconciliation`) — Transaction matching and reconciliation overview
3. **Financial** (`/dashboards/financial`) — Financial summary and analysis

### Reports Pages

Four report pages sharing a two-column layout — narrow left sidebar (280px) with cascading filter dropdowns, wider right area for inline PDF preview. Selections persisted to localStorage (separate keys per report type).

1. **Timesheet Report** (`/reports/timesheets`) — Client → Project → Granularity → Period. Actions: Generate, Download, Save Document
2. **Expense Report** (`/reports/expenses`) — Same filters as timesheet. Actions: Generate, Download
3. **Income & Expense Report** (`/reports/income-expense`) — Combined financial summary
4. **VAT Report** (`/reports/vat`) — VAT analysis

### Admin Console (Settings & Infrastructure)

Settings and infrastructure pages live in the admin app (`admin/src/pages/`), served at `/admin/`:

- **config/** — ProfilePage (contractor details), InvoicingPage (invoice seed, payment terms, VAT, bank details)
- **infra/** — BackupPage (R2 config, backup/restore), LoggingPage (log config, R2 upload), LogViewer (date/level/source/keyword filters, traceId filter, detail drawer with raw JSON)
- **system/** — AiConfigPage (Claude API key, model, prompts), McpAuthPage (OAuth config)

Each is a self-contained config form with its own save logic. No wiring docs needed — minimal cross-entity dependencies.

### Help Pages

Auto-discovered from `src/help/*/index.md` files with YAML frontmatter (title, description, tags, optional banner). Help index shows topic cards. Topic detail renders markdown content with images. Topics can include downloadable Claude.ai skills (zipped from `src/help/{topic}/skill/{skillFolder}/`).

**Current topics:**
- **M2M API Authentication** — Configure OAuth for machine-to-machine API access via Cloudflare Access and Azure AD
- **Upload Expense Image Skill** — Downloadable Claude.ai skill for automatic receipt image upload after expense creation via MCP

### Embedded Mode

Forms can be loaded inside iframes by appending `?embedded=true` to the URL. When embedded:

- **App shell stripped:** `AppLayout` and `AdminLayout` skip sidebar, top bar, settings fetch, and pageview tracking — only `<Outlet />` renders.
- **Child→Parent notification:** All forms use `useNotifyParent()` hook. After successful save/delete, they call `notifyParent(handlerFn.name, base, form)` which posts a message to the parent window via `postMessage`.
- **Message format:** `{ command: string, entity: string, initialData: object, formData: object }`. Entity is derived from the first path segment. Command is the handler function name (may be mangled in production builds).
- **No-op outside iframe:** `useNotifyParent` checks `window.parent === window` and returns early when not embedded.
- **Parent→Child communication:** Via query string params (existing pattern).
- **`useFormTracker` exposes `base`:** `base: baseRef.current` is returned alongside `form` for the notification payload.

---

## PDF Reports

All PDF reports use navy (#1B2A4A) accent colour, alternating row striping, and UK currency formatting (thousands separators). Layout specs are documented in wiring docs:

- **Invoice PDF + Combined PDF** → `invoices.md` → Invoice PDF Generation section
- **Timesheet Report** → `timesheets.md` → PDF Report section
- **Expense Report** → `expenses.md` → PDF Report section

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

Multi-stage Dockerfile: Stage 1 builds both frontends (`dist/` + `dist-admin/`), Stage 2 runs slim `node:20-alpine` with both builds + `server/` + production deps. Docker Compose configures port, volume, and restart.

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
