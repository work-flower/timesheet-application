import Datastore from 'nedb-promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = process.env.DATA_DIR || join(__dirname, '..', '..', 'data');

mkdirSync(dataDir, { recursive: true });

// Routing eval-set: labeled utterance → expected agent examples. Curated data,
// no secrets, so INCLUDED in backups (unlike ai-providers). Standalone store,
// admin-surface only.
const evalExamples = Datastore.create({ filename: join(dataDir, 'eval-examples.db'), autoload: true });

export default evalExamples;
