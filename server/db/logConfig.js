import Datastore from 'nedb-promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = process.env.DATA_DIR || join(__dirname, '..', '..', 'data');

mkdirSync(dataDir, { recursive: true });

const logConfig = Datastore.create({ filename: join(dataDir, 'log-config.db'), autoload: true });

export default logConfig;
