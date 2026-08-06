# Expenses — Entity Wiring

## File Chain

```
ExpenseForm.jsx → expensesApi (api/index.js) → routes/expenses.js → expenseService.js → db.expenses
                                                                   → expenseAttachmentService.js → disk (DATA_DIR/expenses/{id}/)
                                                                   → expenseParserService.js → Claude API

Receipt capture (two entry points, one shared pane):
ExpenseForm.jsx     → ReceiptScanDialog.jsx   ─┐
ExpenseList.jsx     → ReceiptUploadDialog.jsx ─┴→ CameraCapturePane.jsx → getUserMedia → freeze → rotate + crop + B&W/sharpen → canvas.toBlob
                                                  → expensesApi.parseReceipts / uploadAttachments
```

## Frontend

| What | File | Notes |
|------|------|-------|
| Form | `app/src/pages/expenses/ExpenseForm.jsx` | useFormTracker for dirty state, VAT live calc via shared module. Uses `useNotifyParent` for embedded mode. Scan button → `ReceiptScanDialog`; holds `pendingCapture` for new expenses (attached in `saveForm` after create) |
| List | `app/src/pages/expenses/ExpenseList.jsx` | Period toggles, client/project/type/billable/linked filters, search box, 3 view modes (grid/list/card), summary footer (billable total/non-billable total/count). "Scan Receipt" opens `ReceiptUploadDialog` |
| Receipt dialog | `app/src/pages/expenses/ReceiptUploadDialog.jsx` | Multi-file upload and/or camera capture → AI parse → editable preview → create + attach. File input **appends** (never replaces) so captures and picked files coexist |
| Scan dialog | `app/src/pages/expenses/ReceiptScanDialog.jsx` | Form-flow capture: camera → parse → per-field opt-out review table → apply via `handleChange`. Owns `FIELD_DEFS`, whose array order IS the apply order |
| Camera pane | `app/src/pages/expenses/CameraCapturePane.jsx` | Shared inline pane (not a dialog — the list flow nests it inside one). Owns the MediaStream: mount acquires, unmount releases. Two internal steps: `live` (preview → "Take photo" freezes the frame) then `adjust` (fine rotate ~2°/click for deskew, drag an adjustable crop box, optional "B&W" and "Sharpen" toggles → commit). In `adjust` the **only finish action is the primary commit button** (`captureLabel`); there is no cancel there (Retake goes back to live) — see Lessons Learned. In `live` it requests continuous autofocus and offers tap-to-focus where the device supports it (`applyFocusHints` / `canTapFocus`). Emits a named JPEG `File` of the rotated/cropped/enhanced region. Exports `isCameraSupported()` + `CAMERA_UNSUPPORTED_MESSAGE` |
| API client | `app/src/api/index.js` (expensesApi) | 10 methods: CRUD, link/unlink transaction, parse receipts, upload attachments, getTypes + 2 URL helpers (getAttachmentUrl, getThumbnailUrl) |
| Attachment UI | `app/src/components/AttachmentGallery.jsx` | Thumbnail grid, lightbox, upload, delete with confirm |

## Backend

| What | File | Notes |
|------|------|-------|
| Route | `server/routes/expenses.js` | 13 endpoints: CRUD, types, parse-receipts, link/unlink, attachments (upload, delete, serve file, serve thumbnail). Multipart via `createUpload` from `server/pipeline/uploads.js` (never multer directly); attachment upload + delete gated by `requireAction('expenses','upload')` before the body is parsed |
| Service | `server/services/expenseService.js` | VAT golden rule, currency inheritance, lock checks, enrichment, getDistinctTypes, linkTransaction/unlinkTransaction. `getAll`: `$expand` (project, client) |
| Attachments | `server/services/expenseAttachmentService.js` | File storage + sharp thumbnails at `DATA_DIR/expenses/{id}/`. `saveAttachments`/`removeAttachment` call `assertNotLocked` — attachment mutation on locked (invoiced) expenses 400s server-side |
| Receipt parser | `server/services/expenseParserService.js` | Sends file to Claude API, extracts date/amount/vat/type/description/externalRef |
| DB collection | `server/db/index.js` | `expenses` — wrapped NeDB via execution pipeline |

## Shared

| What | File | Notes |
|------|------|-------|
| VAT calc | `shared/expenseVatCalc.js` | `computeVat` (backend), `deriveVatFromPercent`/`deriveVatFromAmount` (frontend live) |
| Lock check | `server/services/lockCheck.js` | `assertNotLocked()` — used by update and remove |
| OData | `server/odata.js` | `buildQuery()` — used by getAll for filtering/sorting/pagination |

## Cross-Entity Consumers

These are the places OUTSIDE expense-specific files that read, write, or depend on expenses:

| Consumer | File | What it does | Impact |
|----------|------|-------------|--------|
| **Invoice confirm** | `server/services/invoiceService.js` | Sets `invoiceId`, `isLocked`, `isLockedReason` on expenses | Locks expense records |
| **Invoice unconfirm** | `server/services/invoiceService.js` | Clears `invoiceId`, `isLocked`, `isLockedReason` | Unlocks expense records |
| **Invoice recalculate** | `server/services/invoiceService.js` | Re-reads expense `netAmount`, `vatPercent`, `vatAmount`, `amount` | Rebuilds invoice line snapshot |
| **Invoice consistency** | `server/services/invoiceService.js` | Checks if expense values drifted from invoice line snapshot | Blocks confirm if mismatch |
| **Invoice form** | `app/src/pages/invoices/InvoiceForm.jsx` | Expense picker dialog — selects expenses as invoice line sources | Reads expense list |
| **Client read** | `server/services/clientService.js` getById/getAll | Fetches client's expenses for display (`$expand=expenses`) | Read-only |
| **Client cascade** | `server/services/clientService.js` remove | Deletes all client's expenses + attachment dirs on client delete | Destroys data |
| **Project read** | `server/services/projectService.js` getById/getAll | Fetches project's expenses for display (`$expand=expenses`) | Read-only |
| **Project cascade** | `server/services/projectService.js` remove | Deletes all project's expenses + attachment dirs on project delete | Destroys data |
| **Expense report** | `server/services/expenseReportService.js` | Reads expenses by project/date range or by IDs for PDF generation | Read-only |
| **Dashboard** | `server/services/dashboardService.js` | Queries expenses for monthly/YTD totals and by-client breakdown | Read-only |
| **Agent tools** | `server/services/agentToolRegistry.js` | `create_expense` calls `expenseService.create()`; `list_recent_expenses` and `list_unbilled_items` (`clientId` + `$filter=invoiceId eq null`) read via `getAll` (exposed over MCP + agent layer) | Creates + reads expenses |
| **Transaction service** | `server/services/transactionService.js` | `getById` finds linked expenses, computes balance | Read-only |
| **VAT report** | `server/services/vatReportService.js` | Reads expense vatAmount/amount by date range for VAT analysis | Read-only |
| **Income & Expense report** | `server/services/incomeExpenseReportService.js` | Reads expense amounts by type/date range for financial analysis | Read-only |
| **Dashboard (frontend)** | `app/src/pages/Dashboard.jsx` | Fetches monthly expenses for summary card | Read-only |
| **TransactionForm (frontend)** | `app/src/pages/transactions/TransactionForm.jsx` | Links/unlinks expenses to transactions | Read + write |
| **TransactionDrawer (frontend)** | `app/src/pages/transactions/TransactionDrawer.jsx` | Links/unlinks expenses to transactions | Read + write |
| **ExpenseReportForm (frontend)** | `app/src/pages/reports/ExpenseReportForm.jsx` | Fetches expenses for PDF report generation | Read-only |
| **Reconciliation page (frontend)** | `app/src/pages/banking/TransactionReconciliation.jsx` | Reads all expenses, calls `linkTransaction`/`unlinkTransaction` for batch reconciliation | Read + write |

## Golden Rules

**VAT golden rule** (`expenseService.create/update` + `shared/expenseVatCalc.js`):
`vatAmount` and `vatPercent` are not mutually exclusive. On create and update, if one is non-zero and the other is 0, the zero value is derived from the non-zero one. If `vatPercent` is provided and `vatAmount` is 0: `vatAmount = amount × vatPercent / (100 + vatPercent)`. If `vatAmount` is provided and `vatPercent` is 0: `vatPercent = |vatAmount| / |netAmount| × 100`. If both are non-zero or both are zero, both are kept as-is. `netAmount` is always `amount - vatAmount`. All VAT calculations use absolute values internally to support negative amounts correctly. Frontend mirrors this via `deriveVatFromPercent` / `deriveVatFromAmount` in `shared/expenseVatCalc.js`.

**Credit notes / refunds:** Expenses support negative amounts. VAT fields follow the same sign as amount (e.g. amount: -8.99, vatAmount: -1.50). The VAT golden rule handles negatives correctly.

**Currency inheritance** (`expenseService.create`): Inherited from client on creation. Read-only in form, updates when project changes.

**Receipt scanning:** Multiple receipt images/PDFs can be uploaded — or photographed with the webcam — and parsed by AI in parallel. The AI extracts date, amount, vatAmount, expenseType, description, and externalReference. Parsed fields shown in editable preview before creating expenses. Each created expense has the receipt auto-attached. System prompt configurable in Settings → AI Config.

**Content block must match media type** (`expenseParserService`): PDFs go in a `document` block, images in an `image` block. A `document` block with a base64 source accepts `application/pdf` only. Images are whitelisted to JPEG/PNG/GIF/WebP — the route only checks `mimetype.startsWith('image/')`, so `image/heic` reaches the service and must be rejected with a clear per-file error rather than an opaque API 400.

**Camera capture:** Two entry points (ExpenseForm Scan button, ReceiptUploadDialog "Use camera") share `CameraCapturePane`. Captures are 1080p JPEG at q=0.92 (~200–400KB) — the model downscales anyway, so larger costs bytes for no accuracy. Every capture MUST be a `new File([blob], 'receipt-<ts>-<rand>.jpg', {type:'image/jpeg'})`: a bare Blob gets the FormData part filename `"blob"`, and `expenseAttachmentService` derives the extension via `split('.').pop()`, saving it as `.blob`. `getUserMedia` needs a secure context — `navigator.mediaDevices` is `undefined` on plain-http origins (localhost excepted), so both entry points feature-detect via `isCameraSupported()` and show a `disabledFocusable` button (not `disabled` — a disabled Fluent Button fires no mouse events, so its Tooltip would never render) with an explanatory Tooltip.

**Rotate + crop + enhance (the adjust step):** After "Take photo" the pane freezes the frame into a pristine, never-mutated source canvas, then offers fine rotate (~2° per click, for deskewing a tilted receipt), an adjustable crop box, and two independent enhance toggles before emitting. All are applied to a *copy* of the pristine source each time, so anything can be turned off and the original returns exactly. Order at confirm: `drawRotated` → crop → enhance. `drawRotated` takes **any angle** (not just 90°): it renders into the rotated bounding box and fills the gaps white (a document on white, not black) so tilt correction never clips or blackens corners. The crop is tracked as normalized `{x,y,w,h}` fractions of the image [0,1] and mapped to source pixels only at confirm — resolution-independent, so it survives the display canvas being CSS-scaled *and* the bounding box changing size with the angle (which is why the still is shown on an aspect-preserving canvas: uniform scale, no letterbox maths). **Rotate does NOT reset the crop** (deskew is a small nudge — resetting on every 2° click would be hostile); the workflow is straighten, then crop inside. The two enhance toggles are **legibility filters, not deblurring**: `applyBlackWhite` (grayscale + contrast) and `applySharpen` (3×3 unsharp) — both off by default, combinable. `applySharpen` convolves each colour channel independently, so it works on a colour image, not only after B&W. The confirm still emits the same `new File([blob], 'receipt-<ts>-<rand>.jpg', {type:'image/jpeg'})` at q=0.92, so all downstream invariants hold and no consumer changes (`onCapture(file)` is the whole contract).

**Focus:** soft captures are usually a focus problem, not the enhance filters (sharpen ≠ deblur). On stream start the pane calls `applyFocusHints` — feature-detected `track.applyConstraints({ advanced: [{ focusMode:'continuous' }, ...] })` — to nudge cameras off a fixed/hunting default. Where `getCapabilities()` reports focus control (`focusMode`/`pointsOfInterest`), the live preview shows a "Tap to focus" hint and tapping applies a single-shot AF at that point. Both are no-ops on cameras that expose no focus control (most laptop webcams). **The hard limit software cannot fix:** holding the ticket closer than the lens's minimum focus distance — the real fix is to back off ~20–30 cm and use the crop box to zoom in.

**Filenames are NOT unique — never key anything by them.** `ReceiptUploadDialog`'s picker appends, so the same file can be chosen twice, and captures are a second producer. Items carry a `uid` assigned at parse time; the create-failure lookup keys on that. (Capture filenames still carry a unique suffix, but only so attachments don't collide on disk — it is not a uniqueness guarantee for the item list.)

**Scanned fields apply through `handleChange`, in dependency order** (`ReceiptScanDialog` → `ExpenseForm.handleScanApply`): never `setForm`/`resetBase`. See Lessons Learned for why the order is load-bearing.

**External reference:** Captures invoice numbers, order IDs, receipt numbers. Populated automatically by AI receipt scanning, carried over from transaction references, available in MCP `create_expense` tool.

**Attachment authorisation (AUTH_ENABLED):** managing attached files — upload AND delete — is the named `expenses.upload` action (registry: `shared/authz/registry.js`), NOT the `update` privilege. The route gate runs before multer so denied callers never stream the body; execution stays under the caller's identity (real attribution, scoping, fls). UI affordances (form Upload/Scan, list Scan Receipt, mobile upload page messaging) key off `canAction('expenses','upload')`. `parse-receipts` stays ungated (stateless AI parse, no DB write).

## Key Business Logic (where it lives)

| Rule | Location | Detail |
| ---- | -------- | ------ |
| VAT golden rule | `expenseService.create/update` + `shared/expenseVatCalc.js` | See Golden Rules above |
| VAT live calc in form | `ExpenseForm.jsx` using `shared/expenseVatCalc.js` | `deriveVatFromPercent` / `deriveVatFromAmount` — mirrors backend rule |
| Currency inheritance | `expenseService.create` | Fetched from client record, not from form input |
| No future dates | `expenseService.create/update` | Validated server-side |
| netAmount computation | `expenseService.create/update` | Always `amount - vatAmount` |
| Negative amounts | `shared/expenseVatCalc.js` | Uses absolute values internally, preserves sign on result |
| Lock protection | `expenseService.update/remove` | `assertNotLocked()` before any mutation |
| Attachment cascade | `expenseService.remove` | Calls `removeAllAttachments(id)` to delete disk directory |

## Blast Radius

**If you change the expense service create/update:**
- Check: VAT golden rule still works (shared module)
- Check: Invoice recalculate/consistency reads the same fields you changed
- Check: MCP create_expense still passes correct args
- Check: Receipt scanning creates expenses with correct shape

**If you change the expense form:**
- Check: VAT live calc matches backend golden rule
- Check: Dirty tracking fields match what saveForm sends
- Check: Transaction linking UI still works (link/unlink endpoints)
- Check: Attachment gallery still gets correct expense ID
- Check: `handleScanApply` still applies scanned fields in `FIELD_DEFS` order (see Lessons Learned — reversing amount/vatAmount corrupts VAT silently)
- Check: `saveForm` still uploads `pendingCapture` after create — it is the single funnel for Save, Save & Close *and* the navigation guard, so moving the attach into `handleSave` would drop the photo on "save on the way out"

**If you change receipt parsing or capture:**
- Check: `parseReceipt` still routes PDFs to a `document` block and images to an `image` block
- Check: captures are still wrapped in a named `new File(...)` (else attachments save as `.blob`)
- Check: capture filenames are still unique (else `ReceiptUploadDialog`'s failure lookup smears one error across every card)
- Check: `CameraCapturePane` still stops tracks on unmount *and* in the resolve-after-unmount window
- Check: the stream-acquisition `useEffect` (keyed `[facingMode, attempt]`) is untouched — the `adjust` step keeps the stream live rather than re-acquiring, so the leak guards stay intact
- Check: the `<video>` element stays mounted across `live`↔`adjust` (a remount would blank the preview, since the effect won't re-run to reattach `srcObject`)
- Check: crop stays in normalized [0,1] fractions mapped to source pixels only at confirm (the display canvas is CSS-scaled — pixel coords would drift)

**If you change expense data shape (add/remove/rename a field):**
- Update: expenseService create/update (field allowlist)
- Update: ExpenseForm useFormTracker keys
- Update: Invoice line snapshot (invoiceService recalculate + consistency check)
- Update: Expense report PDF columns (expenseReportService)
- Update: Dashboard aggregation (dashboardService)
- Update: MCP tool args (mcp.js)
- Update: API client if new endpoint needed
- Update: ExpenseList columns
- Update: VAT report aggregation (vatReportService)
- Update: Income & Expense report aggregation (incomeExpenseReportService)
- Update: TransactionForm/TransactionDrawer linked expense display
- Update: Dashboard.jsx summary calculations

**If you change attachment handling:**
- Check: Cascade delete in expenseService.remove
- Check: Cascade delete in clientService.remove and projectService.remove
- Check: AttachmentGallery component props/API calls
- Check: routes still use `createUpload` (never raw multer) and keep the `requireAction('expenses','upload')` gate before the upload middleware
- Check: `assertNotLocked` still guards saveAttachments/removeAttachment

## PDF Report

Same header structure as timesheet report with "EXPENSE REPORT" label. Expense table: Date, Type, Description, Amount (gross). One page per project. Same ID/date range behaviour as timesheet report.

Also included in the Combined PDF — see `invoices.md` → Invoice PDF Generation section.

## Lessons Learned

**Image receipts never parsed (fixed).** `expenseParserService` put every file — images included — in a Claude `document` content block. That block type accepts `application/pdf` only, so image receipts were rejected by the API. The route catches per-file (`routes/expenses.js:27-29`) and returns `{filename, error}`, so it surfaced as "the AI couldn't parse this receipt" rather than a malformed request, which is why it survived. **The content block type must match the file's media type**: `document` for PDF, `image` for images.

**Applying scanned fields: order is load-bearing and fails silently.** `ExpenseForm.handleChange('amount')` reads `prev.vatPercent` and re-derives `vatAmount` from it; `handleChange('vatAmount')` reads `prev.amount`. So **`amount` must be applied before `vatAmount`**. With a form at amount 100 / vatPercent 20, applying a scanned `{amount: 50, vatAmount: 5}`:
- correct order → vatAmount **5.00**, vatPercent 11.11 ✓
- reversed → `deriveVatFromAmount(100, 5)` sets vatPercent 5.26 against the *stale* amount, then `handleChange('amount')` re-derives from that wrong percent → vatAmount **2.50**, and the scanned 5.00 is silently discarded ✗

2.50 is plausible enough to pass review. `FIELD_DEFS` in `ReceiptScanDialog` is both the display order and the apply order for this reason — reordering it for cosmetic reasons corrupts VAT. The whole mechanism also depends on `setForm` staying a **functional** updater (`setForm(prev => ...)`); a "simplification" to `setForm({...form, x})` would break the sequential composition silently.

**`handleChange` already covers every field — the JSX wiring is a red herring.** `expenseType`, `description`, `externalReference` and `billable` have inline `setForm` calls in their JSX `onChange`, which looks like they bypass `handleChange`. They don't: `handleChange(field)` as a *function* handles them via its generic `else` branch, which is why `QueryStringPrefill` can already drive `?description=x`. Do **not** "fix" this by wiring `handleChange` into the JSX: Fluent's `Combobox` `onOptionSelect` passes `data.optionText`, not `data.value`, so `handleChange` would fall through to `e.target.value` and read the wrong thing.

**`ReceiptUploadDialog`'s file input must append, not replace.** It previously did `setFiles(Array.from(e.target.files))`, which silently destroyed any camera captures already taken. It now appends and clears `e.target.value` (so the same file can be re-picked after removal, and the native "N files selected" label stops contradicting the visible file list). **This has a non-obvious consequence:** replace semantics made duplicate filenames unreachable (one `multiple` pick cannot contain two identical names), so the old filename-keyed create-failure lookup was accidentally safe. Appending broke that assumption, so items now carry a `uid`. Anything keyed by filename in this dialog is a bug.

**A dialog closing is not the same as it unmounting.** `ReceiptScanDialog` is rendered unconditionally by `ExpenseForm` (`<ReceiptScanDialog open={scanOpen} .../>`); Fluent only unmounts the *surface*, so component state and any in-flight promise survive a close. Dismissing with Esc or a backdrop click mid-parse therefore let the late response repopulate the review of a discarded photo — reopening showed a stale review with a blank preview, and applying it wrote unreviewed values into the form with no photo attached. Guarded with a `parseTokenRef` generation counter checked after every await. Note this is the opposite of `CameraCapturePane`, which *is* mounted conditionally and so can rely on unmount for teardown.

**A non-fatal warning is only non-fatal if the user can see it.** `saveForm` treats a failed receipt attach as non-fatal and returns `ok: true` — correct, since the expense exists and failing would invite a duplicate. But every exit from the form unmounts it before a MessageBar can paint, so the photo vanished silently. `saveForm` now returns `attachFailed`, and **all three exits** are handled — miss one and the bug is still live:
- **Save & Close** → lands on `/expenses/:id` rather than the list (same route position, so React reconciles and the warning survives).
- **Embedded mode** → notifies the host `'save'`, not `'saveAndClose'`: the reconciliation page tears its iframe down on `saveAndClose`, which would unmount the form before the warning paints.
- **Navigation-guard dialog** → `guardSave` returns `{ok: true, stay: true}` (see `/forms-guide` → Navigation Guard). It must **not** return `{ok: false}` — that reads as "the save failed", so the guard leaves `isDirty` set and a later Save creates a duplicate of the record that already exists.

**Known gap (pre-existing, not introduced here):** in `saveForm`, if the attach fails *and* a subsequent `linkTransaction` then throws, the outer catch returns `{ok: false}` and `attachFailed` is discarded — the user is stranded on `/expenses/new` with a created record, and the next Save duplicates it.

**Attachment upload 403'd for everyone under AUTH_ENABLED (fixed).** The per-request AsyncLocalStorage store did not survive multer's body parsing (busboy's completion fires from socket I/O whose async context predates `als.run`), so `saveAttachments`' wrapped `expenses.findOne` saw `auth: null` → `checkAccess` → 403 `Not authenticated`, regardless of the caller's grants. This was never a role/privilege problem — full details, fix (`server/pipeline/uploads.js`), and the routes-never-import-multer rule are in `authorisation.md` → Lessons Learned.

**MediaStream teardown belongs to the component that owns the stream.** `CameraCapturePane` acquires on mount and releases on unmount, giving one release point that React enforces — consumers control the camera purely by mounting/unmounting. The non-obvious leak: if `getUserMedia` resolves *after* unmount (user closes the dialog while the permission prompt is open), the stream is never assigned to the ref and the camera light stays on for the life of the tab. The `cancelled` flag in the effect stops the local stream in that window.

**Adding a UI step to the camera pane must not touch the stream lifecycle.** The `adjust` (crop + enhance) step was added *around* the acquisition `useEffect`, not through it — the effect (keyed `[facingMode, attempt]`, with the `cancelled` guard above) is unchanged. Two traps this avoids: (1) the stream stays **live** during `adjust` rather than being stopped and re-acquired, so Retake is instant and there's no second permission prompt — and, more importantly, the reviewed leak guards keep working; (2) the `<video>` element stays **mounted** across `live`↔`adjust` (merely `display:none` in adjust). Unmounting it to swap in the still would blank the preview on Retake, because the effect doesn't re-run to reattach `srcObject` to a fresh element. The still is shown on a *separate* canvas layered over the hidden video.

**Crop coordinates must be normalized, and enhance is sharpen — not deblur.** The crop box stores `{x,y,w,h}` as fractions of the image [0,1], mapped to source pixels only at confirm; the display canvas is CSS-scaled, so storing device pixels would drift the moment the container resizes. To keep the mapping a single uniform multiply, the still is drawn on an aspect-preserving canvas (no letterbox). "Enhance" (`applyDocumentScan`: grayscale + contrast + 3×3 unsharp) is a **legibility filter and cannot deblur** — it's applied to a copy of the pristine source each time, so it's fully revertable and Retake remains the real fix for a bad shot. Accepted, documented quirk: the sharpen looks slightly stronger in the final (full-res) output than in the display-res preview (a 3×3 kernel bites harder on a downscaled image); grayscale/contrast match exactly.

**Don't put a cancel button next to the commit button in a capture step.** The first cut of the `adjust` step showed, side by side, a "Done" button (the pane's `onCancel`, labelled "Done" whenever a `hint` is passed — which the list flow does) and the primary commit ("Capture"). Users read "Done" as "I'm done — use this photo" and clicked it, so the cropped shot was silently discarded and the dialog returned to the file picker "as if nothing happened." Fix: in `adjust` the **only** finish action is the primary commit (`captureLabel`, e.g. "Use photo" / "Use & parse"); the cancel/"Done" affordance was removed from `adjust` (Retake returns to `live`, where "Done" correctly means *finish the capture session*). Both dialogs still expose a footer Cancel, so no exit is lost. Rule of thumb: "Done" should mean *finish the whole flow*, never *commit one item* — reserve a distinct verb ("Use", "Add") for the per-item commit.
