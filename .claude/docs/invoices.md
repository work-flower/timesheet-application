# Invoices — Entity Wiring

## File Chain

```text
InvoiceForm.jsx → invoicesApi (api/index.js) → routes/invoices.js → invoiceService.js → db.invoices
                                                                   → invoicePdfService.js → pdfmake
                                                                   → reportService.js (timesheet PDF)
                                                                   → expenseReportService.js (expense PDF)
                                                                   → pdfCombineService.js → disk (DATA_DIR/invoices/{number}/)
```

## Frontend

| What | File | Notes |
| ---- | ---- | ----- |
| Form | `app/src/pages/invoices/InvoiceForm.jsx` | 2 tabs (Invoice, PDF Preview), lifecycle buttons, line sources, payment section |
| List | `app/src/pages/invoices/InvoiceList.jsx` | Status/client/payment filters, summary footer (total, unpaid, paid) |
| API client | `app/src/api/index.js` (invoicesApi) | 16 methods: CRUD, confirm/post/unconfirm, addLine, recalculate, consistencyCheck, payment, PDF, link/unlink tx |
| Item picker | `app/src/components/ItemPickerDialog.jsx` | Multi-select dialog for timesheets and expenses, shows lock indicators |

## Backend

| What | File | Notes |
| ---- | ---- | ----- |
| Route | `server/routes/invoices.js` | 16 endpoints: CRUD, lifecycle, addLine, recalculate, consistency-check, payment, PDF serve/generate, link/unlink tx |
| Service | `server/services/invoiceService.js` | Lifecycle, line management, totals, consistency checks, cascade via removeByClientId |
| Invoice PDF | `server/services/invoicePdfService.js` | Builds pdfmake doc definition with VAT grouping, bank details, draft watermark |
| PDF combine | `server/services/pdfCombineService.js` | Merges invoice + timesheet report + expense report into single PDF |
| DB collection | `server/db/index.js` | `invoices` — wrapped NeDB via execution pipeline |

## Cross-Entity Consumers

| Consumer | File | What it does | Impact |
| -------- | ---- | ------------ | ------ |
| **Timesheets (lock)** | `invoiceService.js` confirm/unconfirm | Sets/clears `invoiceId`, `isLocked`, `isLockedReason` on timesheets | Locks/unlocks timesheet records |
| **Expenses (lock)** | `invoiceService.js` confirm/unconfirm | Sets/clears `invoiceId`, `isLocked`, `isLockedReason` on expenses | Locks/unlocks expense records |
| **Settings (read)** | `invoiceService.js` confirm, `invoicePdfService.js` | Reads invoiceNumberSeed (increments on confirm), defaultPaymentTermDays, bank details, business details | Seed is write-once per confirm |
| **Clients (cascade)** | `clientService.js` remove → `invoiceService.removeByClientId()` | Unlocks all linked timesheets/expenses, deletes PDFs, deletes all client invoices | Destroys data |
| **Projects (read)** | `invoiceService.js` addLine, recalculate, consistencyCheck | Reads effectiveRate, vatPercent for line computation | Rate/VAT source for timesheet/write-in lines |
| **Timesheet report** | `reportService.js` buildTimesheetPdf | Called during confirm if includeTimesheetReport=true | Pages merged into combined PDF |
| **Expense report** | `expenseReportService.js` buildExpensePdf | Called during confirm if includeExpenseReport=true | Pages merged into combined PDF |
| **Dashboard** | `dashboardService.js` | Reads unpaid posted invoices for summary card | Read-only |
| **Transactions** | `invoiceService.js` link/unlink | Stores transaction IDs in `invoice.transactions[]` array | Cross-reference for payment matching |

## Lifecycle State Machine

```text
draft → confirmed → posted
           ↓
        unconfirm → draft (invoiceNumber preserved)
```

| Transition | What happens |
| ---------- | ------------ |
| **Confirm** | Consistency check must pass → assigns invoiceNumber (permanent, from settings seed) → locks all source timesheets/expenses → generates combined PDF → saves to disk → locks invoice |
| **Post** | Updates invoice lock reason to "Posted invoice" → timesheets/expenses stay locked from confirm |
| **Unconfirm** | Unlocks all source timesheets/expenses (clears invoiceId) → deletes saved PDF → unlocks invoice → reverts to draft. invoiceNumber stays |

## Golden Rules

**Invoice number** (`invoiceService.confirm`): Format `JBL{5-digit padded}`, seed in settings. Assigned once during first confirmation — permanent, never cleared, never reassigned. Seed incremented atomically, never decremented. Re-confirming a previously unconfirmed invoice reuses its existing number.

**VAT computation:** Timesheet VAT is exclusive (added on top). Expense VAT is inclusive (already in gross amount). Write-in VAT is exclusive.

**Lines:** Each timesheet/expense added generates a persistent line with snapshotted values. Write-in lines have `type: 'write-in'`. Totals computed from lines and persisted on save.

**Consistency check:** Detects value drift (amount, rate, VAT changes) and item conflicts (deleted sources, items locked to other invoices). Blocks confirmation if errors exist.

**Recalculate:** Realigns all line values to current source data.

**Combined PDF on confirm:** Invoice page + optional timesheet report + optional expense report → merged → saved to `DATA_DIR/invoices/{invoiceNumber}/{invoiceId}.pdf`. On unconfirm, the saved PDF is deleted and `pdfPath` cleared.

**Payment tracking:** Only available on posted invoices. Fields: `paymentStatus` (unpaid/paid/overdue), `paidDate`.

**Locking on lifecycle:** Confirm locks the invoice itself, all referenced timesheets (+ sets `invoiceId`), all referenced expenses (+ sets `invoiceId`). Post updates the invoice lock reason to "Posted invoice". Unconfirm unlocks everything (clears `invoiceId`).

**Delete:** Only draft invoices can be deleted. Deleting a client cascade-deletes its invoices (unlocking items first). Deleting an invoice never deletes timesheets or expenses.

## Key Business Logic (where it lives)

| Rule | Location | Detail |
| ---- | -------- | ------ |
| Invoice number assignment | `invoiceService.confirm` | See Golden Rules above |
| Timesheet line VAT | `invoiceService.addLine/recalculate` | Exclusive: netAmount = ts.amount, vatAmount = netAmount x project.vatPercent / 100 |
| Expense line VAT | `invoiceService.addLine/recalculate` | Inclusive: netAmount = exp.amount - exp.vatAmount, unitPrice = netAmount |
| Write-in line VAT | `InvoiceForm.jsx` updateWriteInLine | Exclusive: netAmount = qty x unitPrice, vatAmount = netAmount x vatPercent / 100 |
| Totals computation | `invoiceService` computeTotalsFromLines | subtotal = sum(netAmount), totalVat = sum(vatAmount), total = subtotal + totalVat |
| Consistency check | `invoiceService.consistencyCheck` | Detects: deleted sources, locks to other invoices, value drift (amount, rate, VAT) |
| Recalculate | `invoiceService.recalculate` | Re-fetches sources, rebuilds all line values from current data, flags deleted sources |
| Combined PDF | `invoiceService.confirm` | Invoice PDF + optional timesheet/expense reports → merged → saved to DATA_DIR/invoices/{number}/{id}.pdf |
| Payment tracking | `invoiceService.updatePayment` | Only on posted invoices: paymentStatus (unpaid/paid/overdue), paidDate |
| Draft-only delete | `invoiceService.remove` | Rejects if not draft status |

## Blast Radius

**If you change the invoice service lifecycle (confirm/post/unconfirm):**
- Check: Timesheet/expense locking still works correctly
- Check: PDF generation still combines all parts
- Check: Invoice number seed increment is atomic
- Check: removeByClientId cascade still unlocks everything

**If you change invoice line computation (addLine/recalculate):**
- Check: Timesheet VAT is exclusive, expense VAT is inclusive
- Check: Consistency check validates the same fields you changed
- Check: Totals recomputation matches line changes
- Check: Write-in line computation in InvoiceForm matches backend pattern

**If you change the invoice form:**
- Check: Lifecycle buttons save before executing (dirty form guard)
- Check: ItemPickerDialog still filters locked items correctly
- Check: PDF preview tab uses saved file for confirmed/posted, on-the-fly for drafts
- Check: Live totals match backend computeTotalsFromLines logic
- Check: Payment section only appears for posted invoices

**If you change invoice data shape:**
- Update: invoiceService CRUD (field protection list in update)
- Update: invoicePdfService (reads invoice fields for PDF layout)
- Update: InvoiceForm useFormTracker keys
- Update: InvoiceList columns
- Update: Dashboard aggregation (dashboardService)
- Update: removeByClientId cascade logic

## Invoice PDF Generation

### Invoice Page Layout

1. Header: business name + address + "INVOICE" label (navy)
2. Billing block: "To" section (left) + invoice meta with grey background (right) — invoice date, number, due date
3. Service period line
4. Line items table in navy-bordered rectangle: Description, Qty, Unit, Unit Price, VAT %, Amount (net), VAT, Total — grouped by VAT rate, alternating rows
5. Totals block (right-aligned, below table): Sub Total, Total VAT, Total Due
6. Page footer: "Thank you" message, company number, three-column layout (Registered Address, Contact Information, Payment Details)

### Combined PDF

Invoice page + optional timesheet report pages + optional expense report pages merged into a single file on confirm.

- Timesheet/expense reports use the invoice's service period for the period label
- Generated and saved to disk: `DATA_DIR/invoices/{invoiceNumber}/{invoiceId}.pdf`
- Served from disk for confirmed/posted invoices (no regeneration)
- Deleted on unconfirm

File chain:
```text
invoiceService.confirm → invoicePdfService.js (invoice pages)
                       → reportService.js (timesheet pages, if includeTimesheetReport)
                       → expenseReportService.js (expense pages, if includeExpenseReport)
                       → pdfCombineService.js → disk
```

Entity-specific report layouts:
- **Timesheet Report** — see `timesheets.md` → PDF Report section
- **Expense Report** — see `expenses.md` → PDF Report section

## Lessons Learned

- **pdfmake font loading** — Uses `createRequire` pattern + Helvetica fonts (not file paths). Do not attempt to load fonts from disk.
