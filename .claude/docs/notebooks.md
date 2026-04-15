# Notebooks — Wiring Doc

## Overview

Knowledge base / notebook entity. Markdown-native content stored as files on disk, metadata in DB. Foundation for future RAG-powered chat assistant.

## File Chain

| Layer | File | Notes |
|-------|------|-------|
| **DB** | `server/db/index.js` | `notebooks` wrapped collection + `DATA_DIR/notebooks/` dir |
| **Git Service** | `server/services/notebookGitService.js` | Git operations: publish, discard, history, push, pull, remote config |
| **Service** | `server/services/notebookService.js` | CRUD, soft delete, content file I/O, media, thumbnail, git wrappers |
| **Routes** | `server/routes/notebooks.js` | REST endpoints, multer for media upload |
| **Server mount** | `server/index.js` | `app.use('/api/notebooks', notebookRoutes)` |
| **API client** | `app/src/api/index.js` | `notebooksApi` export |
| **Form** | `app/src/pages/notebooks/NotebookForm.jsx` | Edit form with Milkdown editor |
| **Artifacts Panel** | `app/src/pages/notebooks/NotebookArtifactsPanel.jsx` | Toggled drawer for file management (upload, preview, rename, delete) |
| **Create redirect** | `app/src/pages/notebooks/NotebookNew.jsx` | Create-on-open pattern |
| **List** | `app/src/pages/notebooks/NotebookList.jsx` | Card-based list view |
| **Recycle Bin** | `app/src/pages/notebooks/NotebookBin.jsx` | Deleted notebooks with restore/purge |
| **Git Wizards** | `app/src/pages/notebooks/NotebookGitWizards.jsx` | Push/Pull wizard dialogs (used by NotebookList) |
| **Diff Viewer** | `app/src/components/DiffViewer.jsx` | Unified diff renderer (red/green lines, no library) |
| **Editor** | `app/src/components/editors/NotebookEditor.jsx` | Milkdown wrapper (swappable), slash menu entity linking |
| **Entity Search Dialog** | `app/src/components/editors/EntitySearchDialog.jsx` | Fluent UI search dialog for entity linking |
| **PDF Service** | `server/services/notebookPdfService.js` | markdown-it + highlight.js → HTML → Puppeteer (Chromium) → PDF |
| **PDF Style** | `server/assets/notebook-pdf-style.css` | CSS stylesheet (IBM Plex Sans/Mono via @font-face, alternating row tables, code blocks, page-break rules) |
| **PDF Browser** | `server/services/puppeteerBrowser.js` | Singleton Puppeteer browser, lazy launch, auto-recovery on disconnect, graceful shutdown |
| **Assets Route** | `server/routes/assets.js` | Serves bundled fonts (`/api/assets/fonts/*.ttf`) and CSS (`/api/assets/css/*.css`) — consumed by Puppeteer when rendering notebook PDFs |
| **Routes reg** | `app/src/App.jsx` | `/notebooks`, `/notebooks/new`, `/notebooks/bin`, `/notebooks/:id` (trailing slash enforced) |
| **Media serving** | `server/index.js`, `vite.config.js` | `GET /notebooks/:id/:filename` — serves media from data dir (both Express and Vite) |
| **Sidebar** | `app/src/layouts/AppLayout.jsx` | "Notebook" expandable group |
| **Backup** | `server/services/backupService.js` | Collection + files dir included |
| **Admin Git Page** | `admin/src/pages/system/NotebookGitPage.jsx` | Git remote URL + author identity config |
| **Admin API client** | `admin/src/api/index.js` | `notebookGitApi` export |
| **Admin routing** | `admin/src/App.jsx` | `/system/notebook-git` route |
| **Admin sidebar** | `admin/src/layouts/AdminLayout.jsx` | System Config → Notebook Git item |

## Data Model (DB record — metadata only)

| Field | Type | Description |
|-------|------|-------------|
| title | string | Derived from content on save (first heading or first sentence) |
| summary | string | Derived from content on save (first paragraph after title) |
| tags | string[] | Derived from content on save (hashtag line after summary) |
| isDraft | boolean | Computed from git status (not stored — dirty folder = draft) |
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
  ├── .contents/
  │   ├── content.md       ← markdown file (system-managed)
  │   ├── audio.wav        ← TTS audio cache (auto-invalidated when content is newer)
  │   └── thumb_*.png      ← auto-generated thumbnails (400x250, cover)
  ├── image1.png           ← editor media upload (referenced in markdown)
  ├── report.pdf           ← user artifact
  └── ...
```

System files (`content.md`, thumbnails) live in `.contents/`. All other files in root are user artifacts and editor media. Legacy notebooks without `.contents/` are supported via fallback reads (content path checks `.contents/content.md` first, then root `content.md`).

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
| `/api/notebooks/:id/pdf` | GET | Generate PDF (returns application/pdf) — rendered via Puppeteer singleton |
| `/api/notebooks/:id/audio` | GET | Serve cached TTS audio (audio/wav, 404 if stale or missing) |
| `/api/notebooks/:id/audio` | POST | Upload generated TTS audio (multipart, memory storage) |
| `/api/notebooks/:id/content` | GET | Get markdown (text/markdown) |
| `/api/notebooks/:id/content` | PUT | Save markdown (derives title, summary, tags from content) |
| `/api/notebooks/:id/media` | POST | Upload file (multipart) |
| `/api/notebooks/:id/media` | GET | List media files |
| `/api/notebooks/:id/artifacts` | GET | List artifact files (name, size, mimeType, lastModified) |
| `/api/notebooks/:id/artifacts` | POST | Upload artifact file (multipart) |
| `/api/notebooks/:id/artifacts/:filename` | DELETE | Delete artifact |
| `/api/notebooks/:id/artifacts/:filename` | PUT | Rename artifact (body: `{ newName }`) |
| `/api/notebooks/import` | POST | Import notebook from files (multipart: content, files[]) |
| `/api/notebooks/:id/publish` | POST | Publish (git commit folder with message) |
| `/api/notebooks/:id/discard` | POST | Discard uncommitted changes (git checkout + clean) |
| `/api/notebooks/:id/history` | GET | Commit log for notebook folder |
| `/api/notebooks/:id/history/:hash` | GET | Show diff for a single commit (text/plain) |
| `/api/notebooks/:id/compare/:from/:to` | GET | Diff between two commits (text/plain) |
| `/api/notebooks/git/config` | GET | Git remote URL + author identity |
| `/api/notebooks/git/config` | PUT | Set git remote + identity (stored in .git/config) |
| `/api/notebooks/git/test-connection` | POST | Test remote connectivity (git ls-remote) |
| `/api/notebooks/git/has-remote` | GET | Check if origin remote is configured |
| `/api/notebooks/git/push/prepare` | POST | Fetch + return unpushed commits, affected notebooks, conflicts |
| `/api/notebooks/git/push/execute` | POST | Push to origin (optional force) |
| `/api/notebooks/git/pull/prepare` | POST | Fetch + return incoming commits, DB sync preview, conflicts |
| `/api/notebooks/git/pull/execute` | POST | Pull from origin (optional force) + sync DB |
| `/notebooks/:id/:filename` | GET | Serve media file (Express + Vite, non-API route) |

## Cross-Entity Consumers

| Consumer | Reads/Writes | Why |
|----------|-------------|-----|
| `backupService.js` | reads notebooks collection + files dir | Backup/restore |
| `projectService.js` | read by notebook enrichment | Resolve relatedProjects → names |
| `clientService.js` | read by notebook enrichment | Resolve relatedClients → names |
| `timesheetService.js` | read by notebook enrichment | Resolve relatedTimesheets → dates |

## Golden Rule — Git Awareness

**Every notebook-related file/folder change MUST be git-aware.** Any addition, removal, or rename of files in a notebook folder must be staged in the git index. This includes content, media, artifacts, thumbnails — everything.

- **Upload** (media or artifact) → `git add` the new file
- **Delete** (artifact) → `git rm` the file (fallback to plain delete if untracked)
- **Rename** (artifact) → `git mv` (fallback to rename + `git add` if untracked)
- **Content save** → file is written; staged on next publish via `git add -A`
- **Publish** → `git add -A` the entire folder + `git commit` (captures all staged changes)
- **Discard** → `git checkout` + `git clean` (reverts all changes including artifacts)
- **Purge** → `git rm` folder + `git commit` (must commit, not just stage, so deletion can be pushed)

## Key Business Logic

- **Create-on-open:** `/notebooks/new` route immediately creates a draft record + folder with template content, redirects to form
- **Content-derived metadata:** On every content save, `parseContentMeta()` extracts title (first heading or first sentence ≤200 chars), summary (first paragraph after title ≤500 chars), and tags (hashtag line after summary, e.g. `#azure #migration`). These are persisted to the DB record. Form has no separate title/summary/tags fields — only the editor
- **`.contents/` folder:** System-managed files (`content.md`, `thumb_*`) stored in `.contents/` subfolder. User artifacts and editor media live in root. `getContentPath()` falls back to root `content.md` for legacy notebooks
- **Artifacts panel:** Toggled drawer in NotebookForm (`NotebookArtifactsPanel.jsx`) listing all root-level files. Supports upload, browser-native preview (images/PDFs), download, rename (auto-updates markdown refs), and delete
- **Template:** New notebooks start with `# Title\n\nSummary paragraph here.\n\n#tags` to guide structure
- **Soft delete:** `DELETE /api/notebooks/:id` sets `status: 'deleted'` + `deletedAt`
- **Purge:** `DELETE /api/notebooks/:id/purge` permanently removes record + folder (only for deleted status)
- **Thumbnail:** On content save, extracts first `![...](filename)` from markdown, generates 400x250 thumbnail via sharp
- **Editor abstraction:** Only `NotebookEditor.jsx` imports Milkdown — swappable interface
- **Entity linking:** Slash menu (`/`) exposes Project, Client, Timesheet items via Crepe's `buildMenu`. Each opens `EntitySearchDialog` (Fluent UI) for searching via existing OData APIs. Selection inserts a markdown link `[Name](/entities/id)`. On content save, `extractEntityReferences()` parses links and stores `relatedProjects`, `relatedClients`, `relatedTimesheets` ID arrays. On read, IDs are enriched with resolved names
- **PDF internal-link flattening:** `notebookPdfService.js` overrides markdown-it's `link_open`/`link_close` renderer rules so that any link whose `href` is not `http://` or `https://` renders as plain text (no anchor tag). Source markdown is never modified — only the renderer's behaviour changes. Image refs are unaffected (different token type). External links remain clickable in the PDF.
- **Virtual field search:** `getAll` supports virtual fields in OData `$filter`: `tagsAll` (searches `tags` array), `relatedProjectNamesAll` (resolves project names → IDs → filters `relatedProjects`), `relatedClientNamesAll`, `relatedTimesheetLabelsAll`. Uses `odata-filter-to-ast` to parse the AST, detect virtual fields, resolve them to NeDB conditions, then passes the resolved query as `baseFilter` to `buildQuery` with `$filter` cleared. Supports `or` grouping for cross-field search.
- **Import:** Multipart upload of files → largest `.md`/`.markdown` becomes `content.md`, rest stored as media resources. Metadata derived from content via same `parseContentMeta()`. Uses memory storage multer (separate from per-notebook disk storage multer)
- **TTS audio:** `TextToSpeechButton` in toolbar reads notebook content aloud via Gemini TTS. Generated audio cached as `.contents/audio.wav`. Stale detection: if `content.md` mtime > `audio.wav` mtime, GET returns 404 (forces regeneration). Same pattern as daily plan recap/briefing audio. Background music enabled.
- **Git versioning:** Local git repo at `DATA_DIR/notebooks/`. Each notebook is a folder named by sanitized title. `notebookGitService.js` handles all git operations. isDraft computed from git status (dirty folder = draft). Publish = git add + commit with user message. Discard = git checkout + clean to last commit.
- **Git remote:** Configured via admin page (`/admin/system/notebook-git`). Remote URL with embedded token stored in `.git/config`. Push/Pull wizards on notebook list.
- **Push flow:** Prepare (fetch + list unpushed commits + check conflicts) → Review (wizard shows commits, affected notebooks, conflict warnings) → Execute (git push, optional force). Conflicts = remote diverged; resolved with --force.
- **Pull flow:** Prepare (fetch + list incoming commits + check conflicts + preview DB sync) → Review (wizard shows incoming, DB imports/removals, draft conflicts) → Execute (git pull or reset --hard, then sync DB). DB sync creates records for new folders, removes orphan records.
- **History:** Per-notebook commit log via `git log -- folder/`. Diff viewer shows unified diff (git show or git diff between commits). Compare mode: select two commits to diff between them.
- **Discard (revert):** Folder-level only. Restores all files in notebook folder to last committed state. Only available when notebook has been published at least once (isCommitted check).

## Blast Radius

| Change | Verify |
|--------|--------|
| Rename/remove fields | Update NotebookForm, NotebookList, NotebookBin, API client |
| Change file storage path | Update notebookService, backupService |
| Swap editor | Only replace NotebookEditor.jsx, keep same props interface |
| Add new status | Update list filters, bin logic, service validation |
| Rename/delete projects/clients/timesheets | Enrichment handles missing records gracefully (skips) |
| Add new entity type to linking | Update `extractEntityReferences` regex, `enrichEntityNames`, `EntitySearchDialog` config, `NotebookEditor` slash items |
| Change git remote config | Update NotebookGitPage (admin), notebookGitService |
| Change push/pull flow | Update NotebookGitWizards, notebookService (preparePush/Pull, executePush/Pull) |
| Change history/diff UI | Update NotebookForm (history dialog), DiffViewer |
| Change artifact management | Update NotebookArtifactsPanel, notebookService (artifact methods), notebooks routes |

## Lessons Learned

- **Trailing slash on form URL:** Notebook form enforces trailing slash (`/notebooks/:id/`) so that relative image refs in markdown (e.g. `image.png`) resolve to `/notebooks/:id/image.png`. Both Express and Vite serve media files at this path from `DATA_DIR/notebooks/:id/`. Without the trailing slash, relative refs lose the notebook ID in the resolved URL.
- **PDF generation uses Puppeteer + markdown-it, not Milkdown DOM, pdfmake, or pandoc:** Milkdown's rendered HTML is unsuitable for print/PDF (font issues, viewport clipping). pdfmake's declarative model couldn't handle links and complex markdown reliably. Pandoc + xelatex worked but added ~1.5GB of LaTeX system dependencies to the Docker image and made build/publish slow. The current renderer parses markdown with `markdown-it` (+ `highlight.js` for code blocks), wraps it in an HTML template that links `notebook-pdf-style.css`, and runs it through a singleton Puppeteer browser (system Chromium, ~300MB). All notebook features (tables, code, images, links, lists, blockquotes) render via the same engine that powers the in-app preview. System dependencies in Dockerfile: `chromium nss freetype harfbuzz ca-certificates ttf-freefont`.
- **Puppeteer base URL pattern:** The HTML wrapper injects `<base href="http://127.0.0.1:${PORT}/">` so relative image refs (`/notebooks/:id/foo.png`) resolve to the local Express server via loopback. Markdown image src is not rewritten — only the wrapper carries the base URL. Loopback bypasses Cloudflare/auth/TLS entirely; works because Puppeteer runs in the same container as Express. If they're ever split, this assumption breaks.
- **Puppeteer fonts must wait for `document.fonts.ready`:** `setContent` with `waitUntil: 'networkidle0'` blocks until font files are *fetched*, but Chromium's font system applies them a few ms later. Without `await page.evaluateHandle('document.fonts.ready')` before `page.pdf()`, the first page occasionally renders in the fallback font. This is a well-known Puppeteer gotcha.
- **Puppeteer singleton lifecycle:** `puppeteerBrowser.js` lazy-launches one browser per process and reuses it across requests. New `page` per request (closed in `finally`). Browser auto-recovers via `disconnected` event. Graceful shutdown on SIGTERM/SIGINT in `index.js` calls `closeBrowser()`. Never reuse pages — state leaks between renders.
- **Asset serving for PDF:** Bundled fonts and CSS are served via `/api/assets/fonts/:filename` and `/api/assets/css/:filename` ([server/routes/assets.js](../../server/routes/assets.js)) with extension allowlists (`.ttf`, `.css`) and `basename()` sanitisation. Puppeteer fetches them over loopback during `setContent`.
- **Puppeteer v22+ returns Uint8Array, not Buffer:** `page.pdf()` returns a `Uint8Array`. Express's `res.send()` only treats Node `Buffer` as binary — a raw `Uint8Array` gets JSON-stringified into `{"0":37,"1":80,...}`, producing a corrupted PDF that fails with "Invalid PDF structure" in the viewer (and the network response is silently `application/json` despite the explicit `application/pdf` header). Always wrap with `Buffer.from(pdfBytes)` before returning. This was the "PDF generation fails silently in Docker" bug.
- **Import file sanitization:** Imported resource files must NOT have filenames sanitized (only `basename()` for path traversal safety), otherwise markdown image references break. The old `replace(/[^a-zA-Z0-9._-]/g, '_')` pattern was removed for this reason.
- **Git hooks security:** The notebook git repo may contain user-writable `.git/hooks/`. During security testing, a pre-commit hook was created that curled an external URL on every publish. Always check for unexpected hooks if behaviour is anomalous. The console feature that enabled this was removed.
- **Git timeout:** All git commands in `notebookGitService.js` have a 10-second timeout via `execSync`. Push/pull to slow remotes may need this increased.
- **DB sync after pull:** `syncDbWithDisk()` compares disk folders against DB records. New folders → import (create DB record + thumbnail). Missing folders → remove orphan DB records. This runs automatically after every successful pull.
