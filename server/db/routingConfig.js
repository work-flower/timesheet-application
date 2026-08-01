import Datastore from 'nedb-promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = process.env.DATA_DIR || join(__dirname, '..', '..', 'data');

mkdirSync(dataDir, { recursive: true });

// Routing engine configuration (single document). No secrets — INCLUDED in
// backups (unlike ai-providers). Admin-surface only.
const routingConfig = Datastore.create({ filename: join(dataDir, 'routing-config.db'), autoload: true });

export default routingConfig;
