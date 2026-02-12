import cron from 'node-cron';
import { createBackup, getConfig } from './backupService.js';
import backupConfig from '../db/backupConfig.js';

let currentTask = null;

const SCHEDULE_MAP = {
  daily: '0 2 * * *',       // 2:00 AM every day
  weekly: '0 2 * * 1',      // 2:00 AM every Monday
};

export function updateSchedule(schedule) {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
    console.log('[Backup] Scheduled backup stopped');
  }

  const cronExpr = SCHEDULE_MAP[schedule];
  if (!cronExpr) return; // 'off' or unknown

  currentTask = cron.schedule(cronExpr, async () => {
    console.log(`[Backup] Scheduled backup starting (${schedule})...`);
    try {
      const result = await createBackup();
      console.log(`[Backup] Scheduled backup completed: ${result.key}`);
    } catch (err) {
      console.error(`[Backup] Scheduled backup failed:`, err.message);
    }
  });

  console.log(`[Backup] Scheduled backup set to ${schedule} (${cronExpr})`);
}

export async function initScheduler() {
  try {
    const docs = await backupConfig.find({});
    const config = docs[0];
    if (config && config.schedule && config.schedule !== 'off') {
      updateSchedule(config.schedule);
    }
  } catch (err) {
    console.error('[Backup] Failed to initialize scheduler:', err.message);
  }
}
