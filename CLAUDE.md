# Timesheet Application — UK Contractor Market

## Overview

A single-user desktop timesheet application for UK technology contractors. The app runs locally on the contractor's machine and manages clients, projects, and daily timesheet entries. The UI should closely resemble a Microsoft Power Platform Model-Driven Application.

## Tech Stack

- **Runtime:** Node.js
- **Frontend:** React 18 + React Router v6
- **UI Library:** Fluent UI v9 (`@fluentui/react-components`) — primary UI framework
- **Markdown Editor:** `@uiw/react-md-editor` — used for all notes fields (clients, projects, timesheets)
- **Backend:** Express.js (local server)
- **Database:** NeDB (`nedb-promises` package) — embedded file-based database, MongoDB-like API, zero setup
- **PDF Generation:** pdfmake (`pdfmake` package) — server-side PDF creation
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
├── .env                          # Environment variables (DATA_DIR)
├── package.json
├── vite.config.js
├── server/
│   ├── index.js              # Express server entry point (loads dotenv), serves API + static frontend
│   ├── db/
│   │   ├── index.js          # NeDB datastore initialization (uses DATA_DIR env var, defaults to ./data)
│   │   └── seed.js           # Optional: seed/init logic
│   ├── services/
│   │   ├── clientService.js  # Client business logic (auto-create default project on client creation)
│   │   ├── projectService.js # Project logic (rate inheritance)
│   │   ├── timesheetService.js # Timesheet logic (filtering, grouping)
│   │   ├── reportService.js  # PDF generation via pdfmake (supports per-project filtering)
│   │   └── documentService.js # Document CRUD + PDF file storage on disk
│   └── routes/
│       ├── clients.js
│       ├── projects.js
│       ├── timesheets.js
│       ├── settings.js
│       ├── reports.js        # PDF generation endpoint (returns PDF stream)
│       └── documents.js      # Document CRUD + PDF file serving
├── data/                     # NeDB database files (auto-created at runtime, path configurable via DATA_DIR)
│   ├── clients.db
│   ├── projects.db
│   ├── timesheets.db
│   ├── settings.db
│   ├── documents.db
│   └── documents/            # Saved PDF files on disk
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
│   │   ├── CommandBar.jsx    # Reusable top command bar for list views (New, Delete, Search)
│   │   ├── ConfirmDialog.jsx # Reusable delete confirmation dialog
│   │   ├── EntityGrid.jsx    # Reusable data grid for list views (uses createTableColumn)
│   │   ├── FormCommandBar.jsx # Sticky form command bar (Back, Save, Save & Close) — used on all form pages
│   │   ├── FormSection.jsx   # Reusable form section wrapper (2-column grid, changed field indicator)
│   │   ├── MarkdownEditor.jsx # Markdown editor wrapper (@uiw/react-md-editor with Fluent UI styling)
│   │   └── UnsavedChangesDialog.jsx # Save/Discard/Cancel dialog for unsaved changes
│   ├── pages/
│   │   ├── Dashboard.jsx     # Four summary cards (week/month hours, active projects, month earnings) + recent entries grid
│   │   ├── clients/
│   │   │   ├── ClientList.jsx    # DataGrid list of all clients
│   │   │   └── ClientForm.jsx    # Client record form with tabs (General, Projects, Timesheets)
│   │   ├── projects/
│   │   │   ├── ProjectList.jsx   # DataGrid list of all projects
│   │   │   └── ProjectForm.jsx   # Project record form with tabs (General, Timesheets, Documents)
│   │   ├── timesheets/
│   │   │   ├── TimesheetList.jsx # DataGrid with date range filters (week/month/year)
│   │   │   └── TimesheetForm.jsx # Daily timesheet entry form
│   │   ├── reports/
│   │   │   └── ReportForm.jsx    # Two-column report page: parameter sidebar + PDF preview
│   │   └── settings/
│   │       └── Settings.jsx      # Contractor profile and business info
│   └── api/
│       └── index.js          # Frontend API client (fetch wrapper for all endpoints)
└── public/
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

## API Endpoints

All endpoints are prefixed with `/api`.

### Clients
- `GET /api/clients` — list all clients
- `GET /api/clients/:id` — get client with related projects and timesheets
- `POST /api/clients` — create client (auto-creates a default project)
- `PUT /api/clients/:id` — update client
- `DELETE /api/clients/:id` — delete client (cascade delete projects and timesheets)

### Projects
- `GET /api/projects` — list all projects (populate client name)
- `GET /api/projects/:id` — get project with related timesheets, compute effectiveRate
- `POST /api/projects` — create project
- `PUT /api/projects/:id` — update project
- `DELETE /api/projects/:id` — delete project (cascade delete timesheets)

### Timesheets
- `GET /api/timesheets` — list timesheets, supports query params:
  - `startDate` and `endDate` for date range filtering
  - `projectId` for filtering by project
  - `clientId` for filtering by client
  - `groupBy=week|month|year` for grouped summaries
- `GET /api/timesheets/:id` — get single entry
- `POST /api/timesheets` — create entry
- `PUT /api/timesheets/:id` — update entry
- `DELETE /api/timesheets/:id` — delete entry

### Settings
- `GET /api/settings` — get contractor profile
- `PUT /api/settings` — update contractor profile

### Reports
- `GET /api/reports/timesheet-pdf` — generate PDF, supports query params: `clientId`, `startDate`, `endDate`, optional `projectId` (filters to single project)

### Documents
- `GET /api/documents` — list documents, optional `clientId`/`projectId` query filters
- `GET /api/documents/:id` — get document metadata
- `GET /api/documents/:id/file` — serve the actual PDF file
- `POST /api/documents` — generate PDF server-side, save file + record (body: `clientId`, `projectId`, `startDate`, `endDate`, `granularity`)
- `DELETE /api/documents/:id` — delete file from disk + remove record

## API Response Enrichment

Services manually join related data (NeDB has no populate). Key enriched fields:

### `GET /api/projects` (list)
Each project includes: `clientName`, `effectiveRate`, `effectiveWorkingHours` — computed from the project's client.

### `GET /api/projects/:id` (detail)
Same enriched fields as list, plus: `timesheets[]` — all timesheet entries for this project.

### `GET /api/timesheets` (list)
Each entry includes: `projectName`, `clientName`, `clientId` — joined from the project and its client. Supports `groupBy` which returns `{ period, totalHours, totalDays, totalAmount, entries[] }[]`.

### `GET /api/timesheets/:id` (detail)
Same enriched fields as list, plus: `effectiveRate`, `effectiveWorkingHours` — for client-side display.

### `GET /api/clients/:id` (detail)
Includes: `projects[]` — all projects for this client, `timesheets[]` — all timesheets across all client projects (enriched with `projectName`).

## UI Layout — Power Platform Model-Driven App Style

### General Appearance
- Use Fluent UI v9 default theme — it already matches Power Platform's look (white background, blue accent `#0078D4`, grey navigation sidebar)
- Clean, professional, enterprise feel — no rounded playful elements
- Dense information display — favour tables and grids over cards for data

### Layout Structure
1. **Top Bar** (fixed, full width): App title "Timesheet Manager" on the left, settings button on the right. Use a subtle bottom border. Background: white.
2. **Left Sidebar** (fixed, ~220px wide): Navigation links with icons — Dashboard, Clients, Projects, Timesheets, Reports. Grey background (`#F5F5F5`). Highlight active item with blue accent.
3. **Main Content Area** (remaining space, scrollable):
   - **List Views:** Command bar on top (New button, search, filters) → DataGrid below with sortable columns, row click to open record
   - **Form Views:** Sticky FormCommandBar at top (Back, Save, Save & Close) → Breadcrumb → Form title → Tabbed sections (General, Related Records) → Form fields in 2-column layout where appropriate
   - **Dashboard:** Four summary cards (Hours This Week, Hours This Month, Active Projects, Earnings This Month) in a responsive grid → "Recent Timesheet Entries" section with an EntityGrid showing the last 10 entries (Date, Client, Project, Hours, Amount columns)

### Navigation (React Router)
- `/` → Dashboard
- `/clients` → Client list
- `/clients/new` → Client create form
- `/clients/:id` → Client record form (tabs: General, Projects, Timesheets)
- `/projects` → Project list
- `/projects/new` → Project create form
- `/projects/:id` → Project record form (tabs: General, Timesheets, Documents)
- `/reports` → Report generation page (two-column layout: parameters sidebar + PDF preview)
- `/timesheets` → Timesheet list (with date range filter toolbar)
- `/timesheets/new` → Timesheet entry form
- `/timesheets/:id` → Timesheet edit form
- `/settings` → Contractor profile form

### Key UI Behaviors
- **Client creation flow:** User fills in client form → Save creates the client (backend auto-creates default project) and redirects to the client record where the default project is visible under the Projects tab. Save & Close creates and redirects to the client list instead.
- **Project form:** Rate and Working Hours Per Day fields show placeholder text "Inherited from client: £X/day" / "Inherited from client: Xh/day" when null. User can override by entering a value. Creating a new project auto-fills rate and working hours from the selected client.
- **Timesheet list:** Default view shows current week. Period filter uses toggle buttons (This Week / This Month / All Time) for quick switching. Shows Days, Amount, and total summary row. Values are persisted — no on-the-fly recomputation.
- **Timesheet entry:** Date input (no future dates) + Project dropdown (grouped by client, with client name hint) + Hours (SpinButton 0.25–24, step 0.25, with project daily hours hint) + read-only Days and Amount fields + Markdown notes editor. Days and Amount are only computed when the user explicitly changes Hours or Project — not on form load. On edit, persisted values are shown as-is.
- **Unsaved changes guard:** All forms (Settings, ClientForm, ProjectForm, TimesheetForm) use `useFormTracker` for dirty tracking and register a navigation guard via `UnsavedChangesContext`. Changed fields show a blue left-border indicator (Power Platform style). Navigating away from a dirty form (sidebar, breadcrumb, back button, browser back/refresh) triggers a Save/Discard/Cancel dialog. The `beforeunload` event shows the browser's native "Leave page?" dialog on refresh/close.
- **Delete confirmations:** Always show a confirmation dialog before deleting
- **Reports page:** Two-column layout — narrow left sidebar (280px) with cascading dropdowns (Client → Project → Granularity → Period), wider right area for inline PDF preview. Periods are computed from actual timesheet dates (monthly or weekly). Generate button produces a PDF previewed via `<object>`. Download saves to disk via browser download. Save Document persists the PDF server-side, viewable from the project's Documents tab.
- **Project Documents tab:** Shows saved documents for the project. Clicking a row opens the PDF in a new browser tab.

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
8. A client can only be deleted if all their timesheets are deleted first (or cascade delete with confirmation).

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
- All notes fields (clients, projects, timesheets) use `@uiw/react-md-editor` with Fluent UI token overrides for consistent styling.
- Fluent UI v9 SpinButton must use uncontrolled mode (`defaultValue`, not `value`) — controlled mode breaks typing. In `onChange`, `data.value` is `null` during typing; always parse `data.displayValue` as fallback: `const val = data.value ?? parseFloat(data.displayValue); if (val != null && !isNaN(val)) ...`
- **Form dirty tracking pattern:** All forms use `useFormTracker(initialState, { excludeFields })` instead of raw `useState`. Call `setBase(...)` after API load and after successful save to reset the baseline. Provide a `saveForm` callback that returns `{ ok: boolean, id?: string }` (no navigation) and register with `useEffect(() => registerGuard({ isDirty, onSave: saveForm }), [isDirty, saveForm, registerGuard])`. Button handlers decide navigation: `handleSave` calls `saveForm` then navigates to the record on create or shows a success message on edit; `handleSaveAndClose` calls `saveForm` then navigates to the list. The guard dialog calls `saveForm` directly and handles pending navigation. Use `guardedNavigate(to)` from `useUnsavedChanges()` for breadcrumbs, back buttons, and tab row clicks. The `excludeFields` option is only needed for TimesheetForm (`['days', 'amount']` — computed fields).
- **Form page layout pattern:** Form pages use a two-layer structure: outer `page` div (no padding, so FormCommandBar spans full width) → `FormCommandBar` (sticky, `position: sticky; top: 0; z-index: 10`) → inner `pageBody` div (`padding: 16px 24px`) containing breadcrumb, title, and form content.
- **Navigation guard architecture:** Uses a context-based approach (`UnsavedChangesContext`) instead of React Router's `useBlocker` (which requires `createBrowserRouter`, not `BrowserRouter`). The provider wraps routes inside `BrowserRouter` in `App.jsx`. `AppLayout` intercepts sidebar NavLink clicks and the Settings button via `guardedNavigate`. Browser back/forward is handled via a popstate sentinel entry.
- `npm run dev` does NOT auto-restart the backend server — restart manually after server-side file changes.

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

## Future Considerations (Out of Scope Now, But Keep in Mind)

- **Custom date range picker:** Timesheet list currently supports week/month/all — add custom start/end date inputs for arbitrary date range filtering.
- **Sidebar collapsibility:** Add a toggle button or responsive breakpoint to collapse the sidebar on small screens.
- **Contractor name in top bar:** Fetch settings and display contractor name next to the settings button.
- **Invoicing:** Generate invoices from timesheet data per client per period. The data model already supports this — client has currency, projects have rates, timesheets have hours.
- **Timesheet approval workflow:** May add `status` field to timesheets (draft/submitted/approved).
- **CSV export:** CSV export of timesheets (PDF export is already implemented via the Reports page).
- **Migration to MongoDB:** NeDB API is compatible with MongoDB. If the app ever goes multi-user/cloud, migration is straightforward.
