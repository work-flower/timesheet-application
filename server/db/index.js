import Datastore from 'nedb-promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';
import { wrapCollection } from '../pipeline/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = process.env.DATA_DIR || join(__dirname, '..', '..', 'data');

// Ensure data directories exist
mkdirSync(dataDir, { recursive: true });
mkdirSync(join(dataDir, 'documents'), { recursive: true });
mkdirSync(join(dataDir, 'expenses'), { recursive: true });
mkdirSync(join(dataDir, 'imports'), { recursive: true });
mkdirSync(join(dataDir, 'notebooks'), { recursive: true });

// Raw datastores
const _clients = Datastore.create({ filename: join(dataDir, 'clients.db'), autoload: true });
const _projects = Datastore.create({ filename: join(dataDir, 'projects.db'), autoload: true });
const _timesheets = Datastore.create({ filename: join(dataDir, 'timesheets.db'), autoload: true });
const _settings = Datastore.create({ filename: join(dataDir, 'settings.db'), autoload: true });
const _documents = Datastore.create({ filename: join(dataDir, 'documents.db'), autoload: true });
const _expenses = Datastore.create({ filename: join(dataDir, 'expenses.db'), autoload: true });
const _invoices = Datastore.create({ filename: join(dataDir, 'invoices.db'), autoload: true });
const _transactions = Datastore.create({ filename: join(dataDir, 'transactions.db'), autoload: true });
const _importJobs = Datastore.create({ filename: join(dataDir, 'importJobs.db'), autoload: true });
const _stagedTransactions = Datastore.create({ filename: join(dataDir, 'stagedTransactions.db'), autoload: true });
const _notebooks = Datastore.create({ filename: join(dataDir, 'notebooks.db'), autoload: true });

// Wrapped with execution pipeline
const clients = wrapCollection('clients', _clients);
const projects = wrapCollection('projects', _projects);
const timesheets = wrapCollection('timesheets', _timesheets);
const settings = wrapCollection('settings', _settings);
const documents = wrapCollection('documents', _documents);
const expenses = wrapCollection('expenses', _expenses);
const invoices = wrapCollection('invoices', _invoices);
const transactions = wrapCollection('transactions', _transactions);
const importJobs = wrapCollection('importJobs', _importJobs);
const stagedTransactions = wrapCollection('stagedTransactions', _stagedTransactions);
const notebooks = wrapCollection('notebooks', _notebooks);

// Standalone datastores (not wrapped — ephemeral/infrastructure, not business entities)
const calendarSources = Datastore.create({ filename: join(dataDir, 'calendar-sources.db'), autoload: true });
const calendarEvents = Datastore.create({ filename: join(dataDir, 'calendar-events.db'), autoload: true });
const ticketSources = Datastore.create({ filename: join(dataDir, 'ticket-sources.db'), autoload: true });
const tickets = Datastore.create({ filename: join(dataDir, 'tickets.db'), autoload: true });

export { clients, projects, timesheets, settings, documents, expenses, invoices, transactions, importJobs, stagedTransactions, notebooks, calendarSources, calendarEvents, ticketSources, tickets };
