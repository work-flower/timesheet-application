/**
 * Repair: remove persisted read-model fields from stored documents.
 *
 * Before update() stripped read-model echoes, form saves persisted enrichment
 * scalars and embedded related-record arrays onto documents (e.g. a project doc
 * carrying a frozen copy of every timesheet). Those stored snapshots bypass
 * row-level security on reads. This script $unsets every derived key from the
 * six affected collections. Safe to run multiple times (idempotent).
 *
 * IMPORTANT: stop the server/container first (single NeDB writer), and back up
 * DATA_DIR before running:
 *   docker compose stop timesheet
 *   tar -czf data-backup-$(date +%Y%m%d-%H%M%S).tar.gz <DATA_DIR>
 *   node scripts/repair-derived-fields.js
 *   docker compose up -d timesheet
 *
 * Usage: node scripts/repair-derived-fields.js   (DATA_DIR from env/.env)
 */

import Datastore from 'nedb-promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const DATA_DIR = process.env.DATA_DIR || './data';

// Derived keys per collection — every key a read model has ever injected.
// Legitimately stored fields (timesheets/expenses clientId, days, amount,
// transactions link arrays, project resources) are NOT listed.
const DERIVED_KEYS = {
  'clients.db': ['projects', 'timesheets', 'expenses', 'invoices', 'clientName'],
  'projects.db': ['clientName', 'effectiveRate', 'effectiveWorkingHours', 'timesheets', 'expenses', 'client', 'documents'],
  'timesheets.db': ['projectName', 'clientName', 'project', 'client', 'warnings', 'effectiveRate', 'effectiveWorkingHours'],
  'expenses.db': ['projectName', 'clientName', 'project', 'client', 'linkedTransactions', 'transactionsTotal', 'remainingBalance'],
  'invoices.db': ['clientName', 'client', 'clientProjects', 'linkedTransactions', 'transactionsTotal', 'remainingBalance'],
  'transactions.db': ['linkedInvoices', 'linkedExpenses', 'invoicesTotal', 'expensesTotal', 'remainingBalance'],
};

async function run() {
  let totalRepaired = 0;
  for (const [file, keys] of Object.entries(DERIVED_KEYS)) {
    const store = Datastore.create({ filename: path.join(DATA_DIR, file), autoload: true });
    const pollutedQuery = { $or: keys.map((k) => ({ [k]: { $exists: true } })) };
    const before = await store.count(pollutedQuery);
    if (before === 0) {
      console.log(`${file}: clean`);
      continue;
    }
    const unset = Object.fromEntries(keys.map((k) => [k, true]));
    const repaired = await store.update(pollutedQuery, { $unset: unset }, { multi: true });
    const after = await store.count(pollutedQuery);
    console.log(`${file}: repaired ${repaired} doc(s) (polluted before: ${before}, after: ${after})`);
    if (after !== 0) throw new Error(`${file}: ${after} doc(s) still polluted after repair`);
    totalRepaired += repaired;
  }
  console.log(`Done. Total repaired: ${totalRepaired}`);
}

run().catch((err) => {
  console.error('Repair failed:', err);
  process.exit(1);
});
