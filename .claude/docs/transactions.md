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
| Transaction form | `app/src/pages/transactions/TransactionForm.jsx` | Read-only overview, status/ignoreReason editor, linked expenses/invoices with link/unlink |
| Transaction drawer | `app/src/pages/transactions/TransactionDrawer.jsx` | Quick-view overlay from list |
| API client | `app/src/api/index.js` | importJobsApi (6), stagedTransactionsApi (7), transactionsApi (7) |

## Backend

| What | File | Notes |
| ---- | ---- | ----- |
| Import job route | `server/routes/importJobs.js` | CRUD + abandon endpoint, multer file upload, triggers async processFile |
| Import job service | `server/services/importJobService.js` | create, processFile (async background), abandon, cascade delete (staged txs + upload dir) |
| Staged tx route | `server/routes/stagedTransactions.js` | CRUD + submit + check-duplicates |
| Staged tx service | `server/services/stagedTransactionService.js` | CRUD, createBulk, submit (transforms to transactions), checkDuplicates |
| Transaction route | `server/routes/transactions.js` | CRUD + /mapping endpoint + $metadata schema |
| Transaction service | `server/services/transactionService.js` | CRUD, updateMapping (status + ignoreReason), enrichment with linked expenses/invoices |
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
| **Expense enrichment** | `expenseService.js` getById | Fetches linked transactions, computes transactionsTotal + remainingBalance | Balance calculation |
| **Invoice linking** | `invoiceService.js` linkTransaction/unlinkTransaction | Stores transactionId in invoice.transactions[] array | Bidirectional link |
| **Invoice enrichment** | `invoiceService.js` getById | Fetches linked transactions, computes transactionsTotal + remainingBalance | Balance calculation |
| **Transaction enrichment** | `transactionService.js` getById | Finds expenses/invoices that reference this tx ID, computes totals | Reverse lookup |
| **AI config** | `server/db/aiConfig.js` | Provides apiKey, model, systemPrompt, maxTokens, timeout for AI parsing | Config dependency |
| **Expense form** | `ExpenseForm.jsx` | Link/unlink transaction buttons, balance display | UI integration |
| **Invoice form** | `InvoiceForm.jsx` | Link/unlink transaction buttons, balance display | UI integration |

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
- Check: Expense linking/enrichment still reads correct fields
- Check: Invoice linking/enrichment still reads correct fields
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

**If you change linking (expense/invoice ↔ transaction):**
- Check: Both sides of the link are updated (expense.transactions[] and transaction enrichment)
- Check: Balance calculations match (remainingBalance formula)
- Check: Unlink removes from correct array
