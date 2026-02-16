# Timesheet Manager

A single-user desktop timesheet application for UK technology contractors. Manages clients, projects, and daily timesheet entries with PDF report generation. The UI follows the Microsoft Power Platform Model-Driven App style using Fluent UI v9.

## Features

- **Clients & Projects** — track multiple clients, each with projects, rates, and IR35 status
- **Daily Timesheets** — log hours per project per day with automatic days/amount calculation
- **Rate Inheritance** — projects inherit rate and working hours from their client unless overridden
- **PDF Reports** — generate and save timesheet reports per client/project with monthly or weekly granularity
- **Filtering** — timesheet list supports period (This Week / This Month / All Time / Custom date range), client, and project filters, all persisted across sessions
- **Unsaved Changes Guard** — all forms warn before navigating away with unsaved changes
- **OData Query Support** — list endpoints support `$filter`, `$orderby`, `$top`, `$skip`, `$count`, `$select`, and `$expand`

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, React Router v6, Fluent UI v9, Vite |
| Backend | Express.js, Node.js |
| Database | NeDB (embedded, file-based, MongoDB-compatible API) |
| PDF | pdfmake (server-side generation) |
| Editor | @uiw/react-md-editor (notes fields) |

## Getting Started

### Prerequisites

- Node.js 20+

### Install & Run

```bash
git clone <repo-url> && cd timesheet-app
npm install
npm run dev
```

This starts both the Express API (port 3001) and the Vite dev server (port 5173). Open [http://localhost:5173](http://localhost:5173).

### Seed Sample Data

```bash
NODE_ENV=development npm run seed
```

Creates two sample clients (Barclays Bank, HMRC Digital), three projects, and timesheet entries for the current and previous week.

> **Safety:** The seed script **deletes all data** before inserting sample records. It has three safety gates:
> 1. **Environment check** — only runs when `NODE_ENV=development` is explicitly set (any other value, including unset, is blocked)
> 2. **Explicit consent** — requires typing "yes" at the prompt
> 3. **Random code verification** — displays a 6-digit code that must be typed back to proceed

### Production Build

```bash
npm run build
npm start
```

Builds the React frontend and serves everything from Express at [http://localhost:3001](http://localhost:3001).

## Configuration

Create a `.env` file in the project root (optional):

```env
PORT=3001
DATA_DIR=./data
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Express server port |
| `DATA_DIR` | `./data` | Path to database files and PDF documents |

## Docker

```bash
# Default (port 3001, data in ./data)
docker compose up -d

# Custom port and data path
PORT=8080 DATA_DIR=/mnt/nas/timesheet-data docker compose up -d
```

The container stores no data internally — all `.db` files and PDFs live on the host via a volume mount. `DATA_DIR` controls the host-side mount path; the container always uses `/app/data` internally.

## Project Structure

```
├── server/
│   ├── index.js              # Express entry point
│   ├── db/                   # NeDB datastores + seed script
│   ├── odata.js              # OData query parser
│   ├── services/             # Business logic (clients, projects, timesheets, reports, documents)
│   └── routes/               # Express route handlers
├── src/
│   ├── App.jsx               # Root component (FluentProvider + Router)
│   ├── api/                  # Frontend API client
│   ├── components/           # Shared UI components (CommandBar, EntityGrid, FormCommandBar, etc.)
│   ├── contexts/             # Unsaved changes navigation guard
│   ├── hooks/                # Form dirty tracking
│   ├── layouts/              # App shell (top bar + sidebar + content)
│   └── pages/                # Dashboard, Clients, Projects, Timesheets, Reports, Settings
├── data/                     # Database files (auto-created at runtime)
├── Dockerfile                # Multi-stage build
├── docker-compose.yml
└── CLAUDE.md                 # Detailed development documentation
```

## API

All endpoints are prefixed with `/api`. List endpoints support OData query parameters.

| Resource | Endpoints |
|----------|-----------|
| Clients | `GET /api/clients`, `GET /:id`, `POST`, `PUT /:id`, `DELETE /:id` |
| Projects | `GET /api/projects`, `GET /:id`, `POST`, `PUT /:id`, `DELETE /:id` |
| Timesheets | `GET /api/timesheets`, `GET /:id`, `POST`, `PUT /:id`, `DELETE /:id` |
| Settings | `GET /api/settings`, `PUT /api/settings` |
| Reports | `GET /api/reports/timesheet-pdf` |
| Documents | `GET /api/documents`, `GET /:id`, `GET /:id/file`, `POST`, `DELETE /:id` |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run Express + Vite dev servers concurrently |
| `npm run build` | Production build (Vite) |
| `npm start` | Run Express only (serves API + built frontend) |
| `npm run seed` | Clear all data and populate sample records (requires `NODE_ENV=development`) |

## Built With

This project was built entirely with [Claude Code](https://claude.ai/claude-code) (Claude Opus 4.6) — from initial scaffolding through to the final feature. Architecture, backend services, React components, PDF report generation, OData query support, Docker configuration, and documentation were all authored by Claude in pair-programming sessions with the developer.

## License

Private — all rights reserved.
