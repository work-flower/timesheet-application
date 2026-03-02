import { createWriteStream, mkdirSync, statSync, renameSync } from 'fs';
import { join } from 'path';
import als from './asyncContext.js';

export const LOG_DIR = process.env.LOG_DIR || './logs';
mkdirSync(LOG_DIR, { recursive: true });

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
let configuredLevel = LEVELS[process.env.LOG_LEVEL || 'error'] ?? LEVELS.error;
let maxFileSize = 50 * 1024 * 1024; // 50MB default
let messageFilterRegex = null;
let logPayloads = false;

// --- File stream management ---
let currentDate = null;
let currentStream = null;
let currentPath = null;
let rotationCounter = 0;

function getDateString() {
  return new Date().toISOString().slice(0, 10);
}

function getStream() {
  const today = getDateString();

  // Check if we need rotation due to date change
  if (today !== currentDate) {
    if (currentStream) currentStream.end();
    currentDate = today;
    rotationCounter = 0;
    currentPath = join(LOG_DIR, `app-${today}.log`);
    currentStream = createWriteStream(currentPath, { flags: 'a' });
    return currentStream;
  }

  // Check if we need rotation due to file size
  if (currentPath && maxFileSize > 0) {
    try {
      const stats = statSync(currentPath);
      if (stats.size >= maxFileSize) {
        currentStream.end();
        rotationCounter++;
        const rotatedPath = join(LOG_DIR, `app-${today}-${rotationCounter}.log`);
        renameSync(currentPath, rotatedPath);
        currentStream = createWriteStream(currentPath, { flags: 'a' });
      }
    } catch {
      // File may not exist yet — ignore
    }
  }

  if (!currentStream) {
    currentPath = join(LOG_DIR, `app-${today}.log`);
    currentStream = createWriteStream(currentPath, { flags: 'a' });
  }

  return currentStream;
}

// --- Console overrides ---
let pendingLevel = null;

const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;
const origDebug = console.debug;
const origStdoutWrite = process.stdout.write.bind(process.stdout);
const origStderrWrite = process.stderr.write.bind(process.stderr);

console.log = (...args) => { pendingLevel = 'info'; origLog(...args); pendingLevel = null; };
console.warn = (...args) => { pendingLevel = 'warn'; origWarn(...args); pendingLevel = null; };
console.error = (...args) => { pendingLevel = 'error'; origError(...args); pendingLevel = null; };
console.debug = (...args) => { pendingLevel = 'debug'; origDebug(...args); pendingLevel = null; };

function interceptWrite(chunk, encoding, callback) {
  const level = pendingLevel || 'info';
  const levelNum = LEVELS[level] ?? LEVELS.info;

  // Always pass through to stdout (for docker logs)
  origStdoutWrite(chunk, encoding, typeof callback === 'function' ? callback : undefined);

  // Filter by configured level for file writing
  if (levelNum < configuredLevel) return true;

  const message = typeof chunk === 'string' ? chunk.trimEnd() : chunk.toString().trimEnd();
  if (!message) return true;

  const store = als.getStore() || {};
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(store.source && { source: store.source }),
    ...(store.method && { method: store.method }),
    ...(store.path && { path: store.path }),
    ...(store.requestId && { requestId: store.requestId }),
    ...(store.traceId && { traceId: store.traceId }),
    ...(store.toolName && { toolName: store.toolName }),
    ...(store.importJobId && { importJobId: store.importJobId }),
  };

  try {
    const serialized = JSON.stringify(entry);
    if (messageFilterRegex && !messageFilterRegex.test(serialized)) return true;
    const stream = getStream();
    stream.write(serialized + '\n');
  } catch {
    // Avoid recursive logging on write failure
  }

  return true;
}

function interceptStderrWrite(chunk, encoding, callback) {
  const level = pendingLevel || 'error';
  const levelNum = LEVELS[level] ?? LEVELS.error;

  // Always pass through to stderr
  origStderrWrite(chunk, encoding, typeof callback === 'function' ? callback : undefined);

  if (levelNum < configuredLevel) return true;

  const message = typeof chunk === 'string' ? chunk.trimEnd() : chunk.toString().trimEnd();
  if (!message) return true;

  const store = als.getStore() || {};
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(store.source && { source: store.source }),
    ...(store.method && { method: store.method }),
    ...(store.path && { path: store.path }),
    ...(store.requestId && { requestId: store.requestId }),
    ...(store.traceId && { traceId: store.traceId }),
    ...(store.toolName && { toolName: store.toolName }),
    ...(store.importJobId && { importJobId: store.importJobId }),
  };

  try {
    const serialized = JSON.stringify(entry);
    if (messageFilterRegex && !messageFilterRegex.test(serialized)) return true;
    const stream = getStream();
    stream.write(serialized + '\n');
  } catch {
    // Avoid recursive logging on write failure
  }

  return true;
}

process.stdout.write = interceptWrite;
process.stderr.write = interceptStderrWrite;

// --- Crash handlers ---
process.on('uncaughtException', (err) => {
  const entry = {
    timestamp: new Date().toISOString(),
    level: 'error',
    message: `Uncaught Exception: ${err.stack || err.message}`,
  };
  try {
    const stream = getStream();
    stream.write(JSON.stringify(entry) + '\n');
  } catch {
    // Last resort — nothing we can do
  }
});

process.on('unhandledRejection', (reason) => {
  const entry = {
    timestamp: new Date().toISOString(),
    level: 'error',
    message: `Unhandled Rejection: ${reason instanceof Error ? reason.stack || reason.message : String(reason)}`,
  };
  try {
    const stream = getStream();
    stream.write(JSON.stringify(entry) + '\n');
  } catch {
    // Last resort
  }
});

// --- Runtime config updates ---
export function setLogLevel(level) {
  if (LEVELS[level] != null) {
    configuredLevel = LEVELS[level];
  }
}

export function setMaxFileSize(bytes) {
  if (typeof bytes === 'number' && bytes > 0) {
    maxFileSize = bytes;
  }
}

export function setLogPayloads(enabled) {
  logPayloads = !!enabled;
}

export function getLogPayloads() {
  return logPayloads;
}

export function setMessageFilter(pattern) {
  if (!pattern || pattern === '.*') {
    messageFilterRegex = null;
    return;
  }
  try {
    messageFilterRegex = new RegExp(pattern);
  } catch {
    messageFilterRegex = null;
  }
}
