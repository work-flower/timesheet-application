/**
 * Migration: Backfill clientId on all expense records.
 *
 * For each expense, looks up its project and sets clientId = project.clientId.
 * Safe to run multiple times (idempotent).
 *
 * Usage: node scripts/backfill-expense-clientId.js
 */

import Datastore from 'nedb-promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const DATA_DIR = process.env.DATA_DIR || './data';

const expenses = Datastore.create({ filename: path.join(DATA_DIR, 'expenses.db'), autoload: true });
const projects = Datastore.create({ filename: path.join(DATA_DIR, 'projects.db'), autoload: true });

async function run() {
  const allExpenses = await expenses.find({});
  const allProjects = await projects.find({});
  const projectMap = Object.fromEntries(allProjects.map((p) => [p._id, p]));

  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const exp of allExpenses) {
    const project = projectMap[exp.projectId];
    if (!project) {
      console.warn(`Expense ${exp._id} references unknown project ${exp.projectId} — skipped`);
      missing++;
      continue;
    }

    if (exp.clientId === project.clientId) {
      skipped++;
      continue;
    }

    await expenses.update({ _id: exp._id }, { $set: { clientId: project.clientId } });
    updated++;
  }

  console.log(`Done. Updated: ${updated}, Already correct: ${skipped}, Missing project: ${missing}`);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
