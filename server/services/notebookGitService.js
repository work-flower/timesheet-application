import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Sanitize a notebook title into a filesystem-safe folder name.
 */
export function sanitizeTitle(title) {
  let name = (title || 'Untitled')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  // Remove leading dots (hidden files on Linux)
  name = name.replace(/^\.+/, '');
  if (!name) name = 'Untitled';
  if (name.length > 200) name = name.slice(0, 200).trim();
  return name;
}

function getDataDir() {
  return process.env.DATA_DIR || join(__dirname, '..', '..', 'data');
}

function getNotebooksDir() {
  return join(getDataDir(), 'notebooks');
}

function git(args) {
  const notebooksDir = getNotebooksDir();
  return execSync(`git -c core.quotePath=false ${args}`, {
    cwd: notebooksDir,
    encoding: 'utf-8',
    timeout: 10000,
    env: {
      ...process.env,
      GIT_CONFIG_COUNT: '3',
      GIT_CONFIG_KEY_0: 'safe.directory',
      GIT_CONFIG_VALUE_0: notebooksDir,
      GIT_CONFIG_KEY_1: 'user.name',
      GIT_CONFIG_VALUE_1: process.env.GIT_AUTHOR_NAME || 'Timesheet App',
      GIT_CONFIG_KEY_2: 'user.email',
      GIT_CONFIG_VALUE_2: process.env.GIT_AUTHOR_EMAIL || 'app@localhost',
    },
  }).trim();
}

/**
 * Ensure the notebooks directory is a git repo. Idempotent.
 */
export function ensureRepo() {
  const dir = getNotebooksDir();
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, '.git'))) {
    git('init');
  }
  // Ensure .gitignore for generated thumbnails
  const ignorePath = join(dir, '.gitignore');
  if (!existsSync(ignorePath)) {
    writeFileSync(ignorePath, 'thumb_*\n', 'utf-8');
  }
}

/**
 * Returns a Set of folder names that have uncommitted changes (= draft).
 */
/**
 * Strip git's quoting from porcelain paths.
 * Git quotes paths with spaces/special chars: "folder name/file" → folder name/file
 */
function unquotePath(p) {
  if (p.startsWith('"') && p.endsWith('"')) return p.slice(1, -1);
  return p;
}

export function getDirtyFolders() {
  const output = git('status --porcelain');
  const dirty = new Set();
  for (const line of output.split('\n').filter(Boolean)) {
    const filePath = unquotePath(line.slice(3));
    const folder = filePath.split('/')[0];
    if (folder && folder !== '.gitignore') {
      dirty.add(folder);
    }
  }
  return dirty;
}

/**
 * Check if a specific folder has uncommitted changes.
 */
export function isDirty(folderName) {
  const output = git('status --porcelain');
  for (const line of output.split('\n').filter(Boolean)) {
    const filePath = unquotePath(line.slice(3));
    if (filePath.startsWith(folderName + '/') || filePath === folderName) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a folder has tracked files (i.e. has been committed at least once).
 */
export function isTracked(folderName) {
  try {
    const output = git(`ls-files "${folderName}/"`);
    return output.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if the folder exists in the last commit (safe to discard).
 */
export function isCommitted(folderName) {
  try {
    git(`cat-file -e HEAD:"${folderName}/content.md"`);
    return true;
  } catch {
    return false;
  }
}

/**
 * git mv — for renaming tracked folders.
 */
export function mv(from, to) {
  git(`mv "${from}" "${to}"`);
}

/**
 * git rm -rf — for removing tracked files/folders.
 */
export function rm(folderName) {
  git(`rm -rf "${folderName}"`);
}

/**
 * Stage a folder and commit with the given message.
 */
export function publish(folderName, message) {
  git(`add -A "${folderName}/"`);
  // Also stage .gitignore
  git('add .gitignore');
  const escaped = message.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
  git(`commit -m "${escaped}"`);
}

/**
 * Discard all uncommitted changes in a folder, restoring to last commit.
 */
export function discard(folderName) {
  git(`checkout HEAD -- "${folderName}/"`);
  // Remove any untracked files in the folder
  git(`clean -fd "${folderName}/"`);
}
