import './logging/logHook.js';
import 'dotenv/config';
import { randomUUID } from 'crypto';
import express from 'express';
import { fileURLToPath } from 'url';
import { basename, dirname, join, resolve } from 'path';
import { existsSync } from 'fs';
import als from './logging/asyncContext.js';
import { getLogPayloads } from './logging/logHook.js';
import { identityMiddleware } from './pipeline/identity.js';
import { respondError } from './utils/errors.js';
import clientRoutes from './routes/clients.js';
import projectRoutes from './routes/projects.js';
import timesheetRoutes from './routes/timesheets.js';
import settingsRoutes from './routes/settings.js';
import reportRoutes from './routes/reports.js';
import documentRoutes from './routes/documents.js';
import backupRoutes from './routes/backup.js';
import expenseRoutes from './routes/expenses.js';
import invoiceRoutes from './routes/invoices.js';
import transactionRoutes from './routes/transactions.js';
import importJobRoutes from './routes/importJobs.js';
import stagedTransactionRoutes from './routes/stagedTransactions.js';
import aiConfigRoutes from './routes/aiConfig.js';
import dashboardRoutes from './routes/dashboard.js';
import mcpRoutes from './routes/mcp.js';
import mcpAuthRoutes from './routes/mcpAuth.js';
import helpRoutes from './routes/help.js';
import logRoutes from './routes/logs.js';
import calendarSourceRoutes from './routes/calendarSources.js';
import calendarEventRoutes from './routes/calendarEvents.js';
import ticketSourceRoutes from './routes/ticketSources.js';
import ticketRoutes from './routes/tickets.js';
import notebookRoutes, { notebookGitConfigRouter } from './routes/notebooks.js';
import dailyPlanRoutes from './routes/dailyPlans.js';
import todoRoutes from './routes/todos.js';
import assetsRoutes from './routes/assets.js';
import geminiConfigRoutes, { geminiFeatureRouter } from './routes/geminiConfig.js';
import { pageviewRouter } from './routes/logs.js';
import userRoutes, { usersReadOnlyRouter } from './routes/users.js';
import roleRoutes from './routes/roles.js';
import meRoutes from './routes/me.js';
import { adminSurfaceMiddleware } from './services/cfAccessJwt.js';
import { isChromiumAvailable, closeBrowser } from './services/puppeteerBrowser.js';

import { getWellKnownMetadata } from './services/mcpAuthService.js';
import { initScheduler } from './services/backupScheduler.js';
import { initUploader } from './logging/logUploader.js';
import { initCalendarScheduler } from './services/calendarService.js';
import { initTicketScheduler } from './services/ticketService.js';
import { ensureRepo, sanitizeTitle } from './services/notebookGitService.js';
import { notebooks } from './db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '10mb' }));

// AsyncLocalStorage middleware — enriches all requests with context
app.use((req, res, next) => {
  const requestId = randomUUID();
  // Extract source from path: /api/invoices/abc123 → invoices, /mcp → mcp,
  // /admin/api/users → admin_users
  const pathParts = req.path.split('/').filter(Boolean);
  let source;
  if (pathParts[0] === 'admin' && pathParts[1] === 'api') {
    source = 'admin_' + (pathParts[2] || 'admin');
  } else {
    source = pathParts[0] === 'api' ? (pathParts[1] || 'api') : (pathParts[0] || 'root');
  }
  // Normalize hyphenated route names
  source = source.replace(/-/g, '_');
  const traceId = req.headers['x-trace-id'] || randomUUID();
  als.run({ requestId, traceId, source, method: req.method, path: req.path }, () => next());
});

// Identity resolution (AUTH_ENABLED only) — resolves the Cloudflare-authenticated
// caller to an app user + grants and stamps them into the ALS store for the
// pipeline's checkAccess. Must run inside the ALS scope (i.e. after als.run above).
app.use(identityMiddleware);

// Mask field values whose names suggest sensitive content
const SENSITIVE_KEY = /secret|password|apikey/i;
const MAX_PAYLOAD_LENGTH = 2000;

function sanitizePayload(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizePayload);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY.test(k) && typeof v === 'string') {
      out[k] = '***';
    } else if (v && typeof v === 'object') {
      out[k] = sanitizePayload(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// Request logging middleware — logs every API/MCP request with status and duration
app.use((req, res, next) => {
  // Skip static asset requests and pageview beacon
  if (req.path.match(/\.\w{2,5}$/) || req.originalUrl === '/api/logs/pageview') return next();
  const start = Date.now();

  // Log payload for mutating methods when enabled (debug level)
  if (getLogPayloads() && req.body && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const sanitized = sanitizePayload(req.body);
    let payload = JSON.stringify(sanitized);
    if (payload.length > MAX_PAYLOAD_LENGTH) {
      payload = payload.slice(0, MAX_PAYLOAD_LENGTH) + '... (truncated)';
    }
    console.debug(`PAYLOAD ${req.method} ${req.originalUrl} ${payload}`);
  }

  res.on('finish', () => {
    const duration = Date.now() - start;
    const msg = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;
    if (res.statusCode >= 500) {
      console.error(msg);
    } else if (res.statusCode >= 400) {
      console.warn(msg);
    } else {
      console.log(msg);
    }
  });
  next();
});

// API routes (main surface — identity middleware + pipeline enforcement)
app.use('/api/me', meRoutes);
app.use('/api/users', usersReadOnlyRouter); // impersonation picker; engine-gated by users.read
app.use('/api/logs', pageviewRouter); // pageview beacon only; log admin ops live on /admin/api/logs
app.use('/api/clients', clientRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/timesheets', timesheetRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/import-jobs', importJobRoutes);
app.use('/api/staged-transactions', stagedTransactionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/mcp', mcpRoutes);
app.use('/api/help', helpRoutes);
app.use('/api/calendar-sources', calendarSourceRoutes);
app.use('/api/calendar-events', calendarEventRoutes);
app.use('/api/ticket-sources', ticketSourceRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/notebooks', notebookRoutes);
app.use('/api/daily-plans', dailyPlanRoutes);
app.use('/api/todos', todoRoutes);
app.use('/api/assets', assetsRoutes);
app.use('/api/gemini-config', geminiFeatureRouter); // feature subset; config verbs on /admin/api

// ── Admin API surface (/admin/api/*) ─────────────────────────────────────────
// Covered by the admin Cloudflare Access application's /admin path scope.
// adminSurfaceMiddleware verifies the Access JWT (signature + aud) and stamps
// the caller as superuser — these routers bypass the role engine entirely.
// Routers backed by UNWRAPPED config stores (backup, ai-config, mcp-auth, logs,
// gemini config, notebook git config) exist ONLY here; wrapped-collection
// routers (settings, clients, sources, users, roles) are engine-protected on
// /api and superuser-open here.
const adminApi = express.Router();
adminApi.use(adminSurfaceMiddleware);
adminApi.use('/settings', settingsRoutes);
adminApi.use('/clients', clientRoutes);
adminApi.use('/ai-config', aiConfigRoutes);
adminApi.use('/gemini-config', geminiConfigRoutes);
adminApi.use('/mcp-auth', mcpAuthRoutes);
adminApi.use('/backup', backupRoutes);
adminApi.use('/calendar-sources', calendarSourceRoutes);
adminApi.use('/ticket-sources', ticketSourceRoutes);
adminApi.use('/logs', logRoutes);
adminApi.use('/notebooks', notebookGitConfigRouter);
adminApi.use('/users', userRoutes);
adminApi.use('/roles', roleRoutes);
app.use('/admin/api', adminApi);


// .well-known OAuth discovery endpoints (must be unauthenticated)
async function wellKnownHandler(req, res) {
  try {
    const metadata = await getWellKnownMetadata();
    if (!metadata) {
      return res.status(404).json({ error: 'MCP Auth not configured' });
    }
    res.json(metadata);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
app.get('/.well-known/oauth-authorization-server', wellKnownHandler);
app.get('/.well-known/openid-configuration', wellKnownHandler);

// Health check
import { hasRemote as gitHasRemote } from './services/notebookGitService.js';
const BUILD_TIME = new Date().toISOString();
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', buildTime: BUILD_TIME, chromium: isChromiumAvailable(), notebookGitRemote: gitHasRemote() });
});

// Serve help topic assets (images etc.) from app/src/help/
app.use('/help', express.static(join(__dirname, '..', 'app', 'src', 'help')));

// Serve admin app in production
const adminDistPath = join(__dirname, '..', 'dist-admin');
app.use('/admin', express.static(adminDistPath));
app.get('/admin/*', (req, res) => {
  res.sendFile(join(adminDistPath, 'index.html'));
});

// Serve notebook media files (relative image refs from markdown editor)
// Resolves notebook ID → sanitized title folder name
const notebooksDataDir = resolve(process.env.DATA_DIR || join(__dirname, '..', 'data'), 'notebooks');
app.get('/notebooks/:id/.contents/:filename', async (req, res, next) => {
  try {
    const notebook = await notebooks.findOne({ _id: req.params.id });
    if (!notebook) return next();
    const folderName = sanitizeTitle(notebook.title);
    const safe = basename(req.params.filename);
    const filePath = join(notebooksDataDir, folderName, '.contents', safe);
    if (existsSync(filePath)) return res.sendFile(filePath);
    next();
  } catch {
    next();
  }
});
app.get('/notebooks/:id/:filename', async (req, res, next) => {
  try {
    const notebook = await notebooks.findOne({ _id: req.params.id });
    if (!notebook) return next();
    const folderName = sanitizeTitle(notebook.title);
    const safe = basename(req.params.filename);
    // Block access to .contents via this route
    if (safe === '.contents') return next();
    const filePath = join(notebooksDataDir, folderName, safe);
    if (existsSync(filePath)) return res.sendFile(filePath);
    next();
  } catch {
    next();
  }
});

// Serve main app in production
const distPath = join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

// Central error handler — safety net mapping typed errors (e.g. ForbiddenError
// escaping a route without a catch) to their status instead of a generic 500.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  respondError(res, err, 500);
});

// Ensure notebooks git repo exists before starting
ensureRepo();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  initScheduler();
  initUploader();
  initCalendarScheduler();
  initTicketScheduler();
});

// Graceful shutdown — close singleton Puppeteer browser if running.
async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  await closeBrowser();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
