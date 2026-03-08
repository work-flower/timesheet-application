# Expenses — Entity Wiring

## File Chain

```
ExpenseForm.jsx → expensesApi (api/index.js) → routes/expenses.js → expenseService.js → db.expenses
                                                                   → expenseAttachmentService.js → disk (DATA_DIR/expenses/{id}/)
                                                                   → expenseParserService.js → Claude API
```

## Frontend

| What | File | Notes |
|------|------|-------|
| Form | `app/src/pages/expenses/ExpenseForm.jsx` | useFormTracker for dirty state, VAT live calc via shared module |
| List | `app/src/pages/expenses/ExpenseList.jsx` | Period toggles, client/project/type/billable/linked filters, search box, 3 view modes (grid/list/card), summary footer (billable total/non-billable total/count) |
| Receipt dialog | `app/src/pages/expenses/ReceiptUploadDialog.jsx` | Multi-file upload → AI parse → editable preview → create + attach |
| API client | `app/src/api/index.js` (expensesApi) | 10 methods: CRUD, link/unlink transaction, parse receipts, upload attachments, getTypes + 2 URL helpers (getAttachmentUrl, getThumbnailUrl) |
| Attachment UI | `app/src/components/AttachmentGallery.jsx` | Thumbnail grid, lightbox, upload, delete with confirm |

## Backend

| What | File | Notes |
|------|------|-------|
| Route | `server/routes/expenses.js` | 13 endpoints: CRUD, types, parse-receipts, link/unlink, attachments (upload, delete, serve file, serve thumbnail) |
| Service | `server/services/expenseService.js` | VAT golden rule, currency inheritance, lock checks, enrichment, getDistinctTypes, linkTransaction/unlinkTransaction. `getAll`: `$expand` (project, client) |
| Attachments | `server/services/expenseAttachmentService.js` | File storage + sharp thumbnails at `DATA_DIR/expenses/{id}/` |
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
| **MCP tool** | `server/routes/mcp.js` | `create_expense` — calls `expenseService.create()` directly | Creates expenses |
| **Transaction service** | `server/services/transactionService.js` | `getById` finds linked expenses, computes balance | Read-only |
| **VAT report** | `server/services/vatReportService.js` | Reads expense vatAmount/amount by date range for VAT analysis | Read-only |
| **Income & Expense report** | `server/services/incomeExpenseReportService.js` | Reads expense amounts by type/date range for financial analysis | Read-only |
| **Dashboard (frontend)** | `app/src/pages/Dashboard.jsx` | Fetches monthly expenses for summary card | Read-only |
| **TransactionForm (frontend)** | `app/src/pages/transactions/TransactionForm.jsx` | Links/unlinks expenses to transactions | Read + write |
| **TransactionDrawer (frontend)** | `app/src/pages/transactions/TransactionDrawer.jsx` | Links/unlinks expenses to transactions | Read + write |
| **ExpenseReportForm (frontend)** | `app/src/pages/reports/ExpenseReportForm.jsx` | Fetches expenses for PDF report generation | Read-only |

## Golden Rules

**VAT golden rule** (`expenseService.create/update` + `shared/expenseVatCalc.js`):
`vatAmount` and `vatPercent` are not mutually exclusive. On create and update, if one is non-zero and the other is 0, the zero value is derived from the non-zero one. If `vatPercent` is provided and `vatAmount` is 0: `vatAmount = amount × vatPercent / (100 + vatPercent)`. If `vatAmount` is provided and `vatPercent` is 0: `vatPercent = |vatAmount| / |netAmount| × 100`. If both are non-zero or both are zero, both are kept as-is. `netAmount` is always `amount - vatAmount`. All VAT calculations use absolute values internally to support negative amounts correctly. Frontend mirrors this via `deriveVatFromPercent` / `deriveVatFromAmount` in `shared/expenseVatCalc.js`.

**Credit notes / refunds:** Expenses support negative amounts. VAT fields follow the same sign as amount (e.g. amount: -8.99, vatAmount: -1.50). The VAT golden rule handles negatives correctly.

**Currency inheritance** (`expenseService.create`): Inherited from client on creation. Read-only in form, updates when project changes.

**Receipt scanning:** Multiple receipt images/PDFs can be uploaded and parsed by AI in parallel. The AI extracts date, amount, vatAmount, expenseType, description, and externalReference. Parsed fields shown in editable preview before creating expenses. Each created expense has the receipt auto-attached. System prompt configurable in Settings → AI Config.

**External reference:** Captures invoice numbers, order IDs, receipt numbers. Populated automatically by AI receipt scanning, carried over from transaction references, available in MCP `create_expense` tool.

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

## PDF Report

Same header structure as timesheet report with "EXPENSE REPORT" label. Expense table: Date, Type, Description, Amount (gross). One page per project. Same ID/date range behaviour as timesheet report.

Also included in the Combined PDF — see `invoices.md` → Invoice PDF Generation section.

## Lessons Learned

(Empty — will be populated as issues are encountered)
