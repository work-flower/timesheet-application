/**
 * Migration: Backfill clientId on all timesheet records.
 *
 * For each timesheet, looks up its project and sets clientId = project.clientId.
 * Safe to run multiple times (idempotent).
 *
 * Usage: node scripts/backfill-timesheet-clientId.js
 */

import Datastore from 'nedb-promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const DATA_DIR = process.env.DATA_DIR || './data';

const timesheets = Datastore.create({ filename: path.join(DATA_DIR, 'timesheets.db'), autoload: true });
const projects = Datastore.create({ filename: path.join(DATA_DIR, 'projects.db'), autoload: true });

async function run() {
  const allTimesheets = await timesheets.find({});
  const allProjects = await projects.find({});
  const projectMap = Object.fromEntries(allProjects.map((p) => [p._id, p]));

  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const ts of allTimesheets) {
    const project = projectMap[ts.projectId];
    if (!project) {
      console.warn(`Timesheet ${ts._id} references unknown project ${ts.projectId} — skipped`);
      missing++;
      continue;
    }

    if (ts.clientId === project.clientId) {
      skipped++;
      continue;
    }

    await timesheets.update({ _id: ts._id }, { $set: { clientId: project.clientId } });
    updated++;
  }

  console.log(`Done. Updated: ${updated}, Already correct: ${skipped}, Missing project: ${missing}`);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
