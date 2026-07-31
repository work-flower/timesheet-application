import Datastore from 'nedb-promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = process.env.DATA_DIR || join(__dirname, '..', '..', 'data');

mkdirSync(dataDir, { recursive: true });

// Standalone store — holds API keys, so excluded from backup archives
// (same invariant as ai-config.db / backup-config.db).
const aiProviders = Datastore.create({ filename: join(dataDir, 'ai-providers.db'), autoload: true });

export default aiProviders;
