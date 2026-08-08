# Transactions & Import Jobs — Entity Wiring

## File Chain

```text
Import flow:
ImportJobForm.jsx → importJobsApi → routes/importJobs.js → importJobService.js → db.importJobs
                                                          → aiParserService.js → Claude API
                                                          → stagedTransactionService.js → db.stagedTransactions

Review & submit flow:
StagedTransactionReview.jsx → stagedTransactionsApi → routes/stagedTransactions.js → stagedTransactionService.js
                                                                                    → transactionService.js → db.transactions

Transaction management:
TransactionForm.jsx → transactionsApi → routes/transactions.js → transactionService.js → db.transactions
```

## Frontend

| What | File | Notes |
| ---- | ---- | ----- |
| Import job list | `app/src/pages/importJobs/ImportJobList.jsx` | Status filter, columns: filename, status badge, createdAt |
| Import job form | `app/src/pages/importJobs/ImportJobForm.jsx` | File upload on create, processing spinner with 3s polling, staged tx grid, lifecycle buttons (abandon/delete) |
| Staged tx review | `app/src/pages/stagedTransactions/StagedTransactionReview.jsx` | Field mapping config, action markers (transform/delete/unmarked), duplicate detection, submit |
| Transaction list | `app/src/pages/transactions/TransactionList.jsx` | Date/status/account filters, grid + card views |
| Transaction form | `app/src/pages/transactions/TransactionForm.jsx` | Read-only overview, status/ignoreReason editor, linked expenses/invoices with link/unlink. Fetches linked records via `invoicesApi`/`expensesApi.getAll({ transactionId })` and computes remaining = \|amount\| − invoicesTotal − \|expensesTotal\| client-side (detail response is a bare findOne) |
| Transaction drawer | `app/src/pages/transactions/TransactionDrawer.jsx` | Quick-view overlay from list. Same `{ transactionId }` list fetches + client-side balance as the form |
| API client | `app/src/api/index.js` | importJobsApi (6), stagedTransactionsApi (7), transactionsApi (7) |

## Backend

| What | File | Notes |
| ---- | ---- | ----- |
| Import job route | `server/routes/importJobs.js` | CRUD + abandon endpoint, file upload via `createUpload` from `server/pipeline/uploads.js` (never raw multer), triggers async processFile. No `upload` action: the upload IS the create/update, so CRUD privileges apply — note POST needs `importJobs.create` AND `update` (handler sets filePath after moving the file) |
| Import job service | `server/services/importJobService.js` | create, processFile (async background), abandon, cascade delete (staged txs + upload dir) |
| Staged tx route | `server/routes/stagedTransactions.js` | CRUD + submit + check-duplicates |
| Staged tx service | `server/services/stagedTransactionService.js` | CRUD, createBulk, submit (transforms to transactions), checkDuplicates |
| Transaction route | `server/routes/transactions.js` | CRUD + /mapping endpoint + $metadata schema |
| Transaction service | `server/services/transactionService.js` | CRUD, updateMapping (status + ignoreReason). `getById`: bare findOne (no linked-invoice/expense enrichment or balances — the reverse lookup moved to the invoices/expenses lists' `?transactionId=` param). `getAll`: `?ids=` entity param (comma-separated id set → `$in` — used by ExpenseForm/InvoiceForm and the `get_invoice` agent tool). `update()` strips read-model keys (linkedInvoices, linkedExpenses, invoicesTotal, expensesTotal, remainingBalance) in addition to the protected fields |
| AI parser | `server/services/aiParserService.js` | Sends file to Claude API, returns parsed JSON array of transactions |
| Transaction schema | `server/schemas/transaction.js` | Field definitions with x-mappable markers for field mapping UI |
| DB collections | `server/db/index.js` | `importJobs`, `stagedTransactions`, `transactions` — all wrapped NeDB |

## Data Flow

```text
1. User uploads file → importJobService.create() → status: 'processing'
2. Background: aiParserService.parseFile() → Claude API → JSON array of rows
3. Each row → stagedTransactionService.createBulk() with composite hash (MD5)
4. Job updated → status: 'ready_for_review'
5. Frontend polls every 3s until status changes
6. User reviews staged txs → marks action (transform/delete) → configures field mapping
7. stagedTransactionService.submit() → transforms marked rows → transactionService.create()
8. Transactions available for linking to expenses/invoices
```

## Cross-Entity Connections

| Connection | File | What it does | Impact |
| ---------- | ---- | ------------ | ------ |
| **Expense linking** | `expenseService.js` linkTransaction/unlinkTransaction | Stores transactionId in expense.transactions[] array | Bidirectional link |
| **Expense balance (frontend)** | `ExpenseForm.jsx` | Fetches linked transactions via `transactionsApi.getAll({ ids })`, computes remaining = amount + Σtx.amount client-side (expense detail no longer embeds them) | Balance calculation |
| **Invoice linking** | `invoiceService.js` linkTransaction/unlinkTransaction | Stores transactionId in invoice.transactions[] array | Bidirectional link |
| **Invoice balance (frontend)** | `InvoiceForm.jsx` | Fetches linked transactions via `transactionsApi.getAll({ ids })`, computes remaining = total − Σ\|tx.amount\| client-side (invoice detail no longer embeds them) | Balance calculation |
| **Reverse lookup** | `invoiceService.js`/`expenseService.js` getAll | `?transactionId=` entity param (NeDB array containment on stored `transactions[]`) answers "which invoices/expenses link this transaction" — used by TransactionForm/TransactionDrawer (transaction `getById` is a bare findOne) | Reverse lookup |
| **Agent tool get_invoice** | `server/services/agentToolRegistry.js` | Fetches an invoice's linked payments via `transactionService.getAll({ ids })` under the caller's identity | Read-only |
| **AI config** | `server/db/aiConfig.js` | Provides apiKey, model, systemPrompt, maxTokens, timeout for AI parsing | Config dependency |
| **Expense form** | `ExpenseForm.jsx` | Link/unlink transaction buttons, balance display | UI integration |
| **Invoice form** | `InvoiceForm.jsx` | Link/unlink transaction buttons, balance display | UI integration |
| **Reconciliation page** | `app/src/pages/banking/TransactionReconciliation.jsx` | Reads all transactions, calls `updateMapping()` for status changes during batch reconciliation | Read + write |

## Golden Rules

**File upload:** Creating an import job requires a file upload (CSV, PDF, OFX, XML, TXT, XLS, XLSX). Stored at `DATA_DIR/uploads/{jobId}/`.

**AI parsing:** File sent to Claude API with system prompt (from AI config) and job's user prompt. Returns JSON array. Parsing runs asynchronously — job created immediately with `processing` status.

**Staged transactions:** Each parsed row gets a composite hash (MD5 of `filename-date-description-amount`). Semi-structured — all AI-returned fields stored.

**Lifecycle:** `processing` → `ready_for_review` → `abandoned`. On failure: `processing` → `failed`. Failed jobs can be retried by re-uploading. Abandon deletes all staged transactions. Delete only allowed for terminal-status jobs (cascade-deletes staged txs and upload directory).

**Transactions read-only by default:** Created with `isLocked: true`. Only status and ignoreReason editable via `updateMapping`. ignoreReason required when status='ignored', auto-locks when ignored.

## Key Business Logic (where it lives)

| Rule | Location | Detail |
| ---- | -------- | ------ |
| Composite hash | `importJobService.processFile` | MD5 of filename-date-description-amount + identifier fields. Dedup key |
| Auto-detect mapping | `StagedTransactionReview.jsx` | Matches staged field names to transaction schema by name similarity |
| Transactions read-only | `transactionService.create` | Created with isLocked=true by default |
| Status update rules | `transactionService.updateMapping` | ignoreReason required when status='ignored', auto-locks when ignored |
| File storage | `importJobService.create` | Upload stored at DATA_DIR/uploads/{jobId}/{originalname} |
| Terminal-only delete | `importJobService.remove` | Only abandoned or failed jobs can be deleted |
| Abandon cascade | `importJobService.abandon` | Deletes all staged transactions, locks job |
| AI parsing | `aiParserService.parseFile` | Prefills assistant with `[` to force raw JSON, checks stop_reason for truncation |

## Blast Radius

**If you change the transaction service:**
- Check: Expense/invoice link-unlink endpoints still update the stored `transactions[]` arrays correctly
- Check: The `?ids=` param and the invoices/expenses `?transactionId=` reverse lookup still work (forms + `get_invoice` agent tool depend on them)
- Check: updateMapping lock logic still works
- Check: Transaction schema matches what staged tx submit produces

**If you change the import job / AI parsing flow:**
- Check: Staged transaction createBulk receives correct shape
- Check: Composite hash formula is consistent
- Check: Error/retry flow (failed → re-upload → reprocess)
- Check: Frontend polling detects all terminal states

**If you change staged transaction submit:**
- Check: Field mapping transforms correctly to transaction schema
- Check: transactionService.create receives all required fields
- Check: Duplicate detection uses same composite hash
- Check: The caller-scoped visibility check (`importJobService.getById` → 404) still runs BEFORE `runAsSystem` — see Lessons Learned

**If you change linking (expense/invoice ↔ transaction):**
- Check: The stored side (expense/invoice `transactions[]`) updates and the `?transactionId=` reverse lookup still finds it
- Check: Client-side balance calculations in ExpenseForm/InvoiceForm/TransactionForm/TransactionDrawer match the documented formulas
- Check: Unlink removes from correct array

## Lessons Learned

- **`stagedTransactions.submit` must scope-check the caller BEFORE `runAsSystem`.** Named-action lifecycle routes (`requireAction` gate → `runAsSystem` execution) must first prove the caller can see the target under their own grants — a caller-scoped `importJobService.getById(importJobId)` returning 404 if invisible — because `runAsSystem` bypasses the read-filter merge. Without it, a user holding the `stagedTransactions.submit` action but with scoped `importJobs`/`stagedTransactions` reads could commit a job's staged rows into locked transactions by supplying its id, despite not being able to see the job. This mirrors the invoice (`confirm`/`post`/`unconfirm`/`updatePayment`) and importJob (`abandon`) routes — keep all named-action routes consistent on this pattern.
- **Transaction detail enrichment ran two full-table scans and its read models got persisted elsewhere (fixed).** `getById` used to scan invoices + expenses to build linkedInvoices/linkedExpenses/totals/remainingBalance — and those read-model keys, echoed back by forms whose `update()` only stripped protected fields, ended up stored on documents where the related table's row filter never applies. `getById` is now a bare findOne; the reverse lookup is the invoices/expenses lists' `?transactionId=` param (array containment), the forward direction is transactions `?ids=`, and forms compute balances client-side. `update()` strips the old enrichment keys; `npm run repair:derived-fields` cleans historical pollution.
