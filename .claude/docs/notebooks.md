# Notebooks — Wiring Doc

## Overview

Knowledge base / notebook entity. Markdown-native content stored as files on disk, metadata in DB. Foundation for future RAG-powered chat assistant.

## File Chain

| Layer | File | Notes |
|-------|------|-------|
| **DB** | `server/db/index.js` | `notebooks` wrapped collection + `DATA_DIR/notebooks/` dir |
| **Service** | `server/services/notebookService.js` | CRUD, soft delete, content file I/O, media, thumbnail |
| **Routes** | `server/routes/notebooks.js` | REST endpoints, multer for media upload |
| **Server mount** | `server/index.js` | `app.use('/api/notebooks', notebookRoutes)` |
| **API client** | `app/src/api/index.js` | `notebooksApi` export |
| **Form** | `app/src/pages/notebooks/NotebookForm.jsx` | Edit form with Milkdown editor |
| **Create redirect** | `app/src/pages/notebooks/NotebookNew.jsx` | Create-on-open pattern |
| **List** | `app/src/pages/notebooks/NotebookList.jsx` | Card-based list view |
| **Recycle Bin** | `app/src/pages/notebooks/NotebookBin.jsx` | Deleted notebooks with restore/purge |
| **Editor** | `app/src/components/editors/NotebookEditor.jsx` | Milkdown wrapper (swappable), slash menu entity linking |
| **Entity Search Dialog** | `app/src/components/editors/EntitySearchDialog.jsx` | Fluent UI search dialog for entity linking |
| **PDF Service** | `server/services/notebookPdfService.js` | Shells out to pandoc + xelatex for PDF generation |
| **PDF Style** | `server/assets/notebook-pdf-style.tex` | LaTeX style header (Lato font, alternating row tables, code wrapping) |
| **Routes reg** | `app/src/App.jsx` | `/notebooks`, `/notebooks/new`, `/notebooks/bin`, `/notebooks/:id` (trailing slash enforced) |
| **Media serving** | `server/index.js`, `vite.config.js` | `GET /notebooks/:id/:filename` — serves media from data dir (both Express and Vite) |
| **Sidebar** | `app/src/layouts/AppLayout.jsx` | "Notebook" expandable group |
| **Backup** | `server/services/backupService.js` | Collection + files dir included |

## Data Model (DB record — metadata only)

| Field | Type | Description |
|-------|------|-------------|
| title | string | Derived from content on save (first heading or first sentence) |
| summary | string | Derived from content on save (first paragraph after title) |
| tags | string[] | Derived from content on save (hashtag line after summary) |
| isDraft | boolean | Draft marker |
| status | string | `active`, `archived`, `deleted` |
| ragScore | string\|null | Future AI scoring: low, low-moderate, moderate, moderate-high, high |
| deletedAt | string\|null | ISO timestamp for recycle bin |
| thumbnailFilename | string\|null | Auto-generated thumbnail from first image |
| relatedProjects | string[] | IDs of projects referenced in content (derived on save) |
| relatedClients | string[] | IDs of clients referenced in content (derived on save) |
| relatedTimesheets | string[] | IDs of timesheets referenced in content (derived on save) |
| createdAt | string | ISO timestamp |
| updatedAt | string | ISO timestamp |

**Content** stored on disk at `DATA_DIR/notebooks/{notebookId}/content.md` — NOT in DB.

**Computed fields (returned by API, not stored):** `relatedProjectNames`, `relatedClientNames`, `relatedTimesheetLabels` — resolved from ID arrays via batch lookup.

## File Storage

```
DATA_DIR/notebooks/{notebookId}/
  ├── content.md         ← markdown file
  ├── image1.png         ← uploaded media
  ├── thumb_image1.png   ← auto-generated thumbnail (400x250, cover)
  └── ...
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/notebooks` | GET | List (OData, default status=active) |
| `/api/notebooks` | POST | Create (returns metadata record) |
| `/api/notebooks/tags` | GET | All distinct tags |
| `/api/notebooks/:id` | GET | Get metadata |
| `/api/notebooks/:id` | PUT | Update metadata (isDraft only — title/summary/tags derived from content) |
| `/api/notebooks/:id` | DELETE | Soft delete |
| `/api/notebooks/:id/restore` | POST | Restore from bin |
| `/api/notebooks/:id/archive` | POST | Archive |
| `/api/notebooks/:id/unarchive` | POST | Unarchive |
| `/api/notebooks/:id/purge` | DELETE | Permanent delete |
| `/api/notebooks/:id/pdf` | GET | Generate PDF (returns application/pdf + X-Skipped-Images header) |
| `/api/notebooks/:id/content` | GET | Get markdown (text/markdown) |
| `/api/notebooks/:id/content` | PUT | Save markdown (derives title, summary, tags from content) |
| `/api/notebooks/:id/media` | POST | Upload file (multipart) |
| `/api/notebooks/:id/media` | GET | List media files |
| `/api/notebooks/import` | POST | Import notebook from files (multipart: content, files[]) |
| `/notebooks/:id/:filename` | GET | Serve media file (Express + Vite, non-API route) |

## Cross-Entity Consumers

| Consumer | Reads/Writes | Why |
|----------|-------------|-----|
| `backupService.js` | reads notebooks collection + files dir | Backup/restore |
| `projectService.js` | read by notebook enrichment | Resolve relatedProjects → names |
| `clientService.js` | read by notebook enrichment | Resolve relatedClients → names |
| `timesheetService.js` | read by notebook enrichment | Resolve relatedTimesheets → dates |

## Key Business Logic

- **Create-on-open:** `/notebooks/new` route immediately creates a draft record + folder with template content, redirects to form
- **Content-derived metadata:** On every content save, `parseContentMeta()` extracts title (first heading or first sentence ≤200 chars), summary (first paragraph after title ≤500 chars), and tags (hashtag line after summary, e.g. `#azure #migration`). These are persisted to the DB record. Form has no separate title/summary/tags fields — only the editor
- **Template:** New notebooks start with `# Title\n\nSummary paragraph here.\n\n#tags` to guide structure
- **Soft delete:** `DELETE /api/notebooks/:id` sets `status: 'deleted'` + `deletedAt`
- **Purge:** `DELETE /api/notebooks/:id/purge` permanently removes record + folder (only for deleted status)
- **Thumbnail:** On content save, extracts first `![...](filename)` from markdown, generates 400x250 thumbnail via sharp
- **Editor abstraction:** Only `NotebookEditor.jsx` imports Milkdown — swappable interface
- **Entity linking:** Slash menu (`/`) exposes Project, Client, Timesheet items via Crepe's `buildMenu`. Each opens `EntitySearchDialog` (Fluent UI) for searching via existing OData APIs. Selection inserts a markdown link `[Name](/entities/id)`. On content save, `extractEntityReferences()` parses links and stores `relatedProjects`, `relatedClients`, `relatedTimesheets` ID arrays. On read, IDs are enriched with resolved names
- **PDF link stripping:** `notebookPdfService.js` strips any markdown link with a `/`-prefixed URL to plain text before passing to pandoc. External links (http/https) are preserved
- **Virtual field search:** `getAll` supports virtual fields in OData `$filter`: `tagsAll` (searches `tags` array), `relatedProjectNamesAll` (resolves project names → IDs → filters `relatedProjects`), `relatedClientNamesAll`, `relatedTimesheetLabelsAll`. Uses `odata-filter-to-ast` to parse the AST, detect virtual fields, resolve them to NeDB conditions, then passes the resolved query as `baseFilter` to `buildQuery` with `$filter` cleared. Supports `or` grouping for cross-field search.
- **Import:** Multipart upload of files → largest `.md`/`.markdown` becomes `content.md`, rest stored as media resources. Metadata derived from content via same `parseContentMeta()`. Uses memory storage multer (separate from per-notebook disk storage multer)

## Blast Radius

| Change | Verify |
|--------|--------|
| Rename/remove fields | Update NotebookForm, NotebookList, NotebookBin, API client |
| Change file storage path | Update notebookService, backupService |
| Swap editor | Only replace NotebookEditor.jsx, keep same props interface |
| Add new status | Update list filters, bin logic, service validation |
| Rename/delete projects/clients/timesheets | Enrichment handles missing records gracefully (skips) |
| Add new entity type to linking | Update `extractEntityReferences` regex, `enrichEntityNames`, `EntitySearchDialog` config, `NotebookEditor` slash items |

## Lessons Learned

- **Trailing slash on form URL:** Notebook form enforces trailing slash (`/notebooks/:id/`) so that relative image refs in markdown (e.g. `image.png`) resolve to `/notebooks/:id/image.png`. Both Express and Vite serve media files at this path from `DATA_DIR/notebooks/:id/`. Without the trailing slash, relative refs lose the notebook ID in the resolved URL.
- **PDF generation uses pandoc + xelatex, not Milkdown DOM or pdfmake:** Milkdown's rendered HTML is unsuitable for print/PDF (font issues, viewport clipping). pdfmake's declarative model couldn't handle links and complex markdown reliably. Instead, the server shells out to `pandoc` with `--pdf-engine=xelatex` and a LaTeX style header (`server/assets/notebook-pdf-style.tex`). Pandoc handles all markdown features natively. Requires `pandoc` + `texlive-xetex` + `texmf-dist-fontsextra` as system dependencies (installed in Dockerfile).
- **Import file sanitization:** Imported resource files must NOT have filenames sanitized (only `basename()` for path traversal safety), otherwise markdown image references break. The old `replace(/[^a-zA-Z0-9._-]/g, '_')` pattern was removed for this reason.
