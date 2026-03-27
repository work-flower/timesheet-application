import { execSync, exec } from 'child_process';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
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
  // Remove leading dots (hidden files on Linux) and dashes (git interprets as flags)
  name = name.replace(/^[.\-]+/, '');
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
 * Check if the folder has ever been committed (safe to discard).
 */
export function isCommitted(folderName) {
  try {
    const output = git(`log --oneline -1 -- "${folderName}/"`);
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * git mv — for renaming tracked folders.
 */
export function mv(from, to) {
  git(`mv -- "${from}" "${to}"`);
}

/**
 * git rm -rf — for removing tracked files/folders.
 */
export function rm(folderName) {
  git(`rm -rf "${folderName}"`);
}

/**
 * git add -A — stage all changes in a folder.
 */
export function addAll(folderName) {
  git(`add -A "${folderName}/"`);
}

/**
 * git add — stage a specific file path (relative to notebooks root).
 */
export function add(filePath) {
  git(`add "${filePath}"`);
}

/**
 * git rm — remove a single tracked file.
 */
export function rmFile(filePath) {
  git(`rm -f "${filePath}"`);
}

/**
 * Commit currently staged changes with the given message.
 */
export function commit(message) {
  const escaped = message.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
  git(`commit -m "${escaped}"`);
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

// --- Remote / Config ---

// --- Background operation tracker ---

let currentOp = null; // { type: 'push'|'pull', status: 'running'|'done'|'error', error?, result?, startedAt }

export function getOperationStatus() {
  return currentOp;
}

export function clearOperation() {
  currentOp = null;
}

/**
 * Async git for long-running operations (push/pull). Returns a Promise.
 */
function gitAsync(args, timeoutMs = 120000) {
  const notebooksDir = getNotebooksDir();
  return new Promise((resolve, reject) => {
    const child = exec(`git -c core.quotePath=false ${args}`, {
      cwd: notebooksDir,
      encoding: 'utf-8',
      timeout: timeoutMs,
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
    }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve((stdout || '').trim());
    });
  });
}

const MASK = '••••••••';

/**
 * Parse a git remote URL into base URL and token.
 * Handles: https://TOKEN@github.com/... → { url: https://github.com/..., token: TOKEN }
 */
function parseRemoteUrl(fullUrl) {
  if (!fullUrl) return { url: '', token: '' };
  try {
    const parsed = new URL(fullUrl);
    const token = parsed.username || '';
    parsed.username = '';
    parsed.password = '';
    return { url: parsed.toString(), token };
  } catch {
    return { url: fullUrl, token: '' };
  }
}

/**
 * Build a full remote URL with token embedded.
 */
function buildRemoteUrl(url, token) {
  if (!url) return '';
  if (!token) return url;
  try {
    const parsed = new URL(url);
    parsed.username = token;
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Get current git config for the notebooks repo.
 * Returns { remoteUrl, token (masked), userName, userEmail }.
 */
export function getConfig() {
  let rawUrl = '';
  let userName = '';
  let userEmail = '';
  try { rawUrl = git('config --local --get remote.origin.url'); } catch { /* no remote */ }
  try { userName = git('config --local --get user.name'); } catch { /* not set */ }
  try { userEmail = git('config --local --get user.email'); } catch { /* not set */ }

  const { url, token } = parseRemoteUrl(rawUrl);
  const branch = getCurrentBranch();
  return {
    remoteUrl: url,
    token: token ? MASK : '',
    branch,
    userName,
    userEmail,
  };
}

/**
 * Get raw (unmasked) config for internal use (e.g. test connection).
 */
export function getRawConfig() {
  let rawUrl = '';
  try { rawUrl = git('config --local --get remote.origin.url'); } catch { /* no remote */ }
  const { url, token } = parseRemoteUrl(rawUrl);
  return { remoteUrl: url, token };
}

/**
 * Save git config — remote URL + token (separate fields), user.name, user.email.
 * If token is the mask value, retain the existing token.
 */
export function setConfig({ remoteUrl, token, branch, userName, userEmail }) {
  // Branch — switch if different from current
  if (branch && branch !== getCurrentBranch()) {
    try {
      // Try checkout existing branch first
      git(`checkout ${branch}`);
    } catch {
      // Create and switch to new branch
      git(`checkout -b ${branch}`);
    }
  }
  // Remote
  if (remoteUrl !== undefined) {
    // Resolve actual token
    let actualToken = token;
    if (token === MASK) {
      // Retain existing token
      actualToken = getRawConfig().token;
    }
    const fullUrl = buildRemoteUrl(remoteUrl, actualToken || '');

    let hasOrigin = false;
    try { git('config --local --get remote.origin.url'); hasOrigin = true; } catch { /* noop */ }
    if (fullUrl) {
      if (hasOrigin) {
        git(`remote set-url origin "${fullUrl}"`);
      } else {
        git(`remote add origin "${fullUrl}"`);
      }
    } else if (hasOrigin) {
      git('remote remove origin');
    }
  }
  // User identity
  if (userName !== undefined) {
    if (userName) git(`config --local user.name "${userName}"`);
    else try { git('config --local --unset user.name'); } catch { /* noop */ }
  }
  if (userEmail !== undefined) {
    if (userEmail) git(`config --local user.email "${userEmail}"`);
    else try { git('config --local --unset user.email'); } catch { /* noop */ }
  }
}

/**
 * List remote branches (requires fetch first).
 * Returns { branches: [string], current: string }.
 */
export function listBranches() {
  const current = getCurrentBranch();
  let branches = [];
  try {
    // Fetch to ensure remote refs are up to date
    git('fetch origin');
    const output = git('branch -r --no-color');
    branches = output.split('\n').filter(Boolean)
      .map((b) => b.trim())
      .filter((b) => !b.includes('->'))
      .map((b) => b.replace('origin/', ''));
  } catch { /* no remote branches */ }
  return { branches, current };
}

/**
 * Test connection to the remote. Returns { ok, error? }.
 */
export function testConnection() {
  try {
    git('ls-remote --heads origin');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * Check if origin remote is configured.
 */
export function hasRemote() {
  try {
    const url = git('config --local --get remote.origin.url');
    return !!url;
  } catch {
    return false;
  }
}

// --- History ---

/**
 * Get commit log for a specific folder (or all if folderName is null).
 * Returns array of { hash, date, message }.
 */
export function log(folderName, maxCount = 50) {
  const scope = folderName ? `-- "${folderName}/"` : '';
  try {
    const output = git(`log --format="%H|%aI|%s" -n ${maxCount} ${scope}`);
    if (!output) return [];
    return output.split('\n').filter(Boolean).map((line) => {
      const [hash, date, ...rest] = line.split('|');
      return { hash, date, message: rest.join('|') };
    });
  } catch {
    return [];
  }
}

/**
 * Get diff between two commits for a folder (or between commit and working tree).
 * If toHash is null, diffs against working tree.
 */
export function diff(fromHash, toHash, folderName) {
  const scope = folderName ? `-- "${folderName}/"` : '';
  const range = toHash ? `${fromHash} ${toHash}` : fromHash;
  try {
    return git(`diff ${range} ${scope}`);
  } catch {
    return '';
  }
}

/**
 * Show a single commit's diff.
 */
export function show(hash, folderName) {
  const scope = folderName ? `-- "${folderName}/"` : '';
  try {
    return git(`show --format="" ${hash} ${scope}`);
  } catch {
    return '';
  }
}

// --- Push / Pull ---

/**
 * Fetch from origin. Returns { ok, error? }.
 */
export function fetchOrigin() {
  try {
    git('fetch origin');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * Get the current branch name.
 */
export function getCurrentBranch() {
  try {
    return git('rev-parse --abbrev-ref HEAD');
  } catch {
    return 'main';
  }
}

/**
 * Ensure the current branch tracks origin. Sets upstream if not already set.
 */
function ensureUpstream(branch) {
  try {
    git(`config --local --get branch.${branch}.remote`);
  } catch {
    // No upstream set — check if origin has this branch
    try {
      git(`rev-parse --verify origin/${branch}`);
      git(`branch --set-upstream-to=origin/${branch} ${branch}`);
    } catch {
      // origin doesn't have this branch yet — that's fine, push will create it
    }
  }
}

/**
 * Get unpushed commits (local commits not on origin).
 * Returns { commits: [{hash, date, message}], folders: [string] }.
 */
export function getUnpushedInfo() {
  const branch = getCurrentBranch();
  ensureUpstream(branch);
  try {
    // Check if origin/branch exists
    git(`rev-parse --verify origin/${branch}`);

    const output = git(`log --format="%H|%aI|%s" origin/${branch}..HEAD`);
    const commits = output ? output.split('\n').filter(Boolean).map((line) => {
      const [hash, date, ...rest] = line.split('|');
      return { hash, date, message: rest.join('|') };
    }) : [];

    // Get affected folders from the diff
    const folders = new Set();
    if (commits.length > 0) {
      const files = git(`diff --name-only origin/${branch}..HEAD`);
      for (const f of files.split('\n').filter(Boolean)) {
        const folder = unquotePath(f).split('/')[0];
        if (folder && folder !== '.gitignore') folders.add(folder);
      }
    }

    return { commits, folders: [...folders] };
  } catch {
    // No origin/branch — everything is unpushed
    try {
      const output = git('log --format="%H|%aI|%s"');
      const commits = output ? output.split('\n').filter(Boolean).map((line) => {
        const [hash, date, ...rest] = line.split('|');
        return { hash, date, message: rest.join('|') };
      }) : [];
      // All tracked folders
      const allFiles = git('ls-files');
      const folders = new Set();
      for (const f of allFiles.split('\n').filter(Boolean)) {
        const folder = unquotePath(f).split('/')[0];
        if (folder && folder !== '.gitignore') folders.add(folder);
      }
      return { commits, folders: [...folders], isFirstPush: true };
    } catch {
      return { commits: [], folders: [], isFirstPush: true };
    }
  }
}

/**
 * Get incoming commits from origin (after fetch).
 * Returns { commits: [{hash, date, message}], folders: [string] }.
 */
export function getIncomingInfo() {
  const branch = getCurrentBranch();
  try {
    git(`rev-parse --verify origin/${branch}`);
    const output = git(`log --format="%H|%aI|%s" HEAD..origin/${branch}`);
    const commits = output ? output.split('\n').filter(Boolean).map((line) => {
      const [hash, date, ...rest] = line.split('|');
      return { hash, date, message: rest.join('|') };
    }) : [];

    const folders = new Set();
    if (commits.length > 0) {
      const files = git(`diff --name-only HEAD..origin/${branch}`);
      for (const f of files.split('\n').filter(Boolean)) {
        const folder = unquotePath(f).split('/')[0];
        if (folder && folder !== '.gitignore') folders.add(folder);
      }
    }

    return { commits, folders: [...folders] };
  } catch {
    return { commits: [], folders: [] };
  }
}

/**
 * Check for conflicts between local and remote.
 * Returns { hasConflicts, conflictingFolders: [string] }.
 */
export function checkConflicts() {
  const branch = getCurrentBranch();
  try {
    git(`rev-parse --verify origin/${branch}`);
    // Check if there are both local and remote changes
    const local = git(`log --format="%H" origin/${branch}..HEAD`);
    const remote = git(`log --format="%H" HEAD..origin/${branch}`);
    if (!local || !remote) return { hasConflicts: false, conflictingFolders: [] };

    // Both diverged — check for overlapping files
    const localFiles = git(`diff --name-only origin/${branch}..HEAD`).split('\n').filter(Boolean);
    const remoteFiles = git(`diff --name-only HEAD..origin/${branch}`).split('\n').filter(Boolean);
    const remoteSet = new Set(remoteFiles.map(unquotePath));
    const conflicting = new Set();
    for (const f of localFiles) {
      if (remoteSet.has(unquotePath(f))) {
        const folder = unquotePath(f).split('/')[0];
        if (folder && folder !== '.gitignore') conflicting.add(folder);
      }
    }
    return { hasConflicts: conflicting.size > 0, conflictingFolders: [...conflicting] };
  } catch {
    return { hasConflicts: false, conflictingFolders: [] };
  }
}

/**
 * Push to origin (async background). Sets currentOp and resolves in background.
 */
export function push(force = false) {
  if (currentOp?.status === 'running') {
    return { ok: false, error: 'Another operation is already in progress' };
  }
  const branch = getCurrentBranch();
  const forceFlag = force ? ' --force' : '';
  currentOp = { type: 'push', status: 'running', startedAt: new Date().toISOString() };

  gitAsync(`push -u origin ${branch}${forceFlag}`)
    .then(() => {
      currentOp = { ...currentOp, status: 'done', completedAt: new Date().toISOString() };
    })
    .catch((err) => {
      currentOp = { ...currentOp, status: 'error', error: err.message || String(err), completedAt: new Date().toISOString() };
    });

  return { ok: true, started: true };
}

/**
 * Pull from origin (async background). Sets currentOp and resolves in background.
 * Returns a Promise that resolves when done (for DB sync to chain onto).
 */
export function pull(force = false) {
  if (currentOp?.status === 'running') {
    return Promise.resolve({ ok: false, error: 'Another operation is already in progress' });
  }
  const branch = getCurrentBranch();
  currentOp = { type: 'pull', status: 'running', startedAt: new Date().toISOString() };

  const op = force
    ? gitAsync('fetch origin').then(() => gitAsync(`reset --hard origin/${branch}`))
    : gitAsync(`pull --ff-only origin ${branch}`);

  return op
    .then(() => {
      currentOp = { ...currentOp, status: 'done', completedAt: new Date().toISOString() };
      return { ok: true };
    })
    .catch((err) => {
      currentOp = { ...currentOp, status: 'error', error: err.message || String(err), completedAt: new Date().toISOString() };
      return { ok: false, error: err.message || String(err) };
    });
}

/**
 * List all notebook folders on disk (for DB sync after pull).
 */
export function listFolders() {
  const dir = getNotebooksDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '.git')
    .map((d) => d.name);
}
