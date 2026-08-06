import Datastore from 'nedb-promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = process.env.DATA_DIR || join(__dirname, '..', '..', 'data');

mkdirSync(dataDir, { recursive: true });

// Agent tool definitions: admin-managed { name, description, inputSchema,
// handlerName, enabled } records mapped onto code-side handlers in
// services/agentToolRegistry.js. No secrets, so INCLUDED in backups.
// Standalone store, admin-surface only.
const agentToolDefs = Datastore.create({ filename: join(dataDir, 'agent-tools.db'), autoload: true });

agentToolDefs.ensureIndex({ fieldName: 'name', unique: true });

export default agentToolDefs;
