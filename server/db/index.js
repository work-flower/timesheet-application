import Datastore from 'nedb-promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = process.env.DATA_DIR || join(__dirname, '..', '..', 'data');

// Ensure data directories exist
mkdirSync(dataDir, { recursive: true });
mkdirSync(join(dataDir, 'documents'), { recursive: true });
mkdirSync(join(dataDir, 'expenses'), { recursive: true });

const clients = Datastore.create({ filename: join(dataDir, 'clients.db'), autoload: true });
const projects = Datastore.create({ filename: join(dataDir, 'projects.db'), autoload: true });
const timesheets = Datastore.create({ filename: join(dataDir, 'timesheets.db'), autoload: true });
const settings = Datastore.create({ filename: join(dataDir, 'settings.db'), autoload: true });
const documents = Datastore.create({ filename: join(dataDir, 'documents.db'), autoload: true });
const expenses = Datastore.create({ filename: join(dataDir, 'expenses.db'), autoload: true });
const invoices = Datastore.create({ filename: join(dataDir, 'invoices.db'), autoload: true });

export { clients, projects, timesheets, settings, documents, expenses, invoices };
