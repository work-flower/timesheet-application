import { readdirSync } from 'fs';
import als from './asyncContext.js';
import { LOG_DIR } from './logHook.js';

let intervalHandle = null;

function getDateString() {
  return new Date().toISOString().slice(0, 10);
}

export function getCompletedLogFiles() {
  const today = `app-${getDateString()}.log`;
  try {
    return readdirSync(LOG_DIR)
      .filter((f) => f.startsWith('app-') && f.endsWith('.log') && f !== today)
      .sort();
  } catch {
    return [];
  }
}

async function uploadCycle() {
  try {
    const { uploadToR2, getRawConfig } = await import('../services/logService.js');
    const config = await getRawConfig();
    if (!config || !config.uploadEnabled) return;

    const files = getCompletedLogFiles();
    for (const filename of files) {
      try {
        const result = await uploadToR2(filename);
        if (result.skipped) {
          console.log(`[LogUploader] ${filename} identical copy in R2, removed local`);
        } else {
          console.log(`[LogUploader] Uploaded, verified, and removed ${filename}`);
        }
      } catch (err) {
        console.warn(`[LogUploader] ${filename}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`[LogUploader] Upload cycle error: ${err.message}`);
  }
}

export function startUploader(intervalMinutes) {
  stopUploader();
  if (!intervalMinutes || intervalMinutes <= 0) return;

  const ms = intervalMinutes * 60 * 1000;
  intervalHandle = setInterval(() => {
    als.run({ source: 'log_uploader' }, uploadCycle);
  }, ms);
  console.log(`[LogUploader] Started with ${intervalMinutes} minute interval`);
}

export function stopUploader() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log('[LogUploader] Stopped');
  }
}

export async function initUploader() {
  try {
    const { getRawConfig } = await import('../services/logService.js');
    const { setLogLevel, setMaxFileSize, setMessageFilter, setLogPayloads } = await import('./logHook.js');
    const config = await getRawConfig();
    if (!config) return;

    // Apply saved log config on startup
    if (config.logLevel) setLogLevel(config.logLevel);
    if (config.maxFileSize) setMaxFileSize(config.maxFileSize);
    if (config.messageFilter) setMessageFilter(config.messageFilter);
    if (config.logPayloads) setLogPayloads(config.logPayloads);

    if (config.uploadEnabled && config.uploadIntervalMinutes > 0) {
      startUploader(config.uploadIntervalMinutes);
    }
  } catch {
    // Log service may not be ready yet — that's fine
  }
}
