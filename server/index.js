import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
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
import { getWellKnownMetadata } from './services/mcpAuthService.js';
import { initScheduler } from './services/backupScheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// API routes
app.use('/api/clients', clientRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/timesheets', timesheetRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/import-jobs', importJobRoutes);
app.use('/api/staged-transactions', stagedTransactionRoutes);
app.use('/api/ai-config', aiConfigRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/mcp', mcpRoutes);
app.use('/api/mcp-auth', mcpAuthRoutes);

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
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve help topic assets (images etc.) from src/help/
app.use('/help', express.static(join(__dirname, '..', 'src', 'help')));

// Serve static frontend in production
const distPath = join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  initScheduler();
});
