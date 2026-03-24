import { notebooks, projects, clients, timesheets, tickets } from '../db/index.js';
import { buildQuery, parseFilter, applySelect, formatResponse } from '../odata.js';
import { parseFilter as parseFilterAst } from 'odata-filter-to-ast';
import { fileURLToPath } from 'url';
import { basename, dirname, join, extname } from 'path';
import { mkdirSync, rmSync, renameSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import sharp from 'sharp';
import * as git from './notebookGitService.js';

const CONTENTS_DIR = '.contents';

function guessMimeType(filename) {
  const ext = extname(filename).toLowerCase();
  const map = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp',
    '.pdf': 'application/pdf', '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json',
    '.html': 'text/html', '.md': 'text/markdown', '.xml': 'application/xml',
    '.zip': 'application/zip', '.tar': 'application/x-tar', '.gz': 'application/gzip',
    '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  };
  return map[ext] || 'application/octet-stream';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function getDataDir() { return process.env.DATA_DIR || join(__dirname, '..', '..', 'data'); }
function getNotebooksDir() { return join(getDataDir(), 'notebooks'); }

// Re-export sanitizeTitle for consumers (e.g. multer destination in routes)
export { sanitizeTitle } from './notebookGitService.js';

/**
 * Resolve a notebook's folder path from its title (sync — when title is known).
 */
function dirFromTitle(title) {
  return join(getNotebooksDir(), git.sanitizeTitle(title));
}

/**
 * Resolve a notebook's folder path from its DB id (async — looks up title).
 */
export async function getNotebookDir(id) {
  const notebook = await notebooks.findOne({ _id: id });
  if (!notebook) throw new Error('Notebook not found');
  return dirFromTitle(notebook.title);
}

// --- Entity reference enrichment ---

async function enrichEntityNames(entries) {
  // Collect all unique IDs across all notebooks
  const projectIds = new Set();
  const clientIds = new Set();
  const timesheetIds = new Set();
  const ticketIds = new Set();

  for (const entry of entries) {
    (entry.relatedProjects || []).forEach((id) => projectIds.add(id));
    (entry.relatedClients || []).forEach((id) => clientIds.add(id));
    (entry.relatedTimesheets || []).forEach((id) => timesheetIds.add(id));
    (entry.relatedTickets || []).forEach((id) => ticketIds.add(id));
  }

  // Batch-fetch referenced entities
  const [projectDocs, clientDocs, timesheetDocs, ticketDocs] = await Promise.all([
    projectIds.size > 0 ? projects.find({ _id: { $in: [...projectIds] } }) : [],
    clientIds.size > 0 ? clients.find({ _id: { $in: [...clientIds] } }) : [],
    timesheetIds.size > 0 ? timesheets.find({ _id: { $in: [...timesheetIds] } }) : [],
    ticketIds.size > 0 ? tickets.find({ _id: { $in: [...ticketIds] } }) : [],
  ]);

  // Build lookup maps
  const projectMap = new Map(projectDocs.map((p) => [p._id, p.name]));
  const clientMap = new Map(clientDocs.map((c) => [c._id, c.companyName]));
  const timesheetMap = new Map(timesheetDocs.map((t) => [t._id, t.date]));
  const ticketMap = new Map(ticketDocs.map((t) => [t._id, t.externalId || t.title]));

  return entries.map((entry) => ({
    ...entry,
    relatedProjectNames: (entry.relatedProjects || []).map((id) => projectMap.get(id)).filter(Boolean),
    relatedClientNames: (entry.relatedClients || []).map((id) => clientMap.get(id)).filter(Boolean),
    relatedTimesheetLabels: (entry.relatedTimesheets || []).map((id) => timesheetMap.get(id)).filter(Boolean),
    relatedTicketLabels: (entry.relatedTickets || []).map((id) => ticketMap.get(id)).filter(Boolean),
  }));
}

// --- Virtual field resolution for OData $filter ---

const VIRTUAL_FIELDS = new Set([
  'relatedProjectNamesAll', 'relatedClientNamesAll',
  'relatedTimesheetLabelsAll', 'relatedTicketLabelsAll', 'tagsAll',
]);

/**
 * Check if an AST node references any virtual field.
 */
function hasVirtualFields(node) {
  if (!node) return false;
  if (node.type === 'FunctionExpr') {
    return VIRTUAL_FIELDS.has(node.arguments?.[0]?.value);
  }
  return hasVirtualFields(node.left) || hasVirtualFields(node.right);
}

/**
 * Resolve a single virtual field contains() clause to a NeDB condition.
 */
async function resolveVirtualContains(field, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = { $regex: new RegExp(escaped, 'i') };

  switch (field) {
    case 'tagsAll':
      // NeDB $regex matches within array elements natively
      return { tags: regex };

    case 'relatedProjectNamesAll': {
      const matches = await projects.find({ name: regex });
      const ids = matches.map((p) => p._id);
      return ids.length > 0
        ? { relatedProjects: { $in: ids } }
        : { relatedProjects: '__no_match__' };
    }

    case 'relatedClientNamesAll': {
      const matches = await clients.find({ companyName: regex });
      const ids = matches.map((c) => c._id);
      return ids.length > 0
        ? { relatedClients: { $in: ids } }
        : { relatedClients: '__no_match__' };
    }

    case 'relatedTimesheetLabelsAll': {
      const matches = await timesheets.find({ date: regex });
      const ids = matches.map((t) => t._id);
      return ids.length > 0
        ? { relatedTimesheets: { $in: ids } }
        : { relatedTimesheets: '__no_match__' };
    }

    case 'relatedTicketLabelsAll': {
      const matches = await tickets.find({ $or: [{ externalId: regex }, { title: regex }] });
      const ids = matches.map((t) => t._id);
      return ids.length > 0
        ? { relatedTickets: { $in: ids } }
        : { relatedTickets: '__no_match__' };
    }

    default:
      return {};
  }
}

/**
 * Recursively convert an OData AST to a NeDB query, resolving virtual fields.
 * Uses the standard parseFilter from odata.js for real field nodes.
 */
async function resolveAstToNedb(node) {
  if (!node) return {};

  switch (node.type) {
    case 'AndExpr': {
      const [left, right] = await Promise.all([
        resolveAstToNedb(node.left),
        resolveAstToNedb(node.right),
      ]);
      const leftHasLogical = '$or' in left || '$and' in left;
      const rightHasLogical = '$or' in right || '$and' in right;
      if (!leftHasLogical && !rightHasLogical) {
        const overlap = Object.keys(left).some((k) => k in right);
        if (!overlap) return { ...left, ...right };
      }
      return { $and: [left, right] };
    }

    case 'OrExpr': {
      const [left, right] = await Promise.all([
        resolveAstToNedb(node.left),
        resolveAstToNedb(node.right),
      ]);
      return { $or: [left, right] };
    }

    case 'FunctionExpr': {
      const field = node.arguments?.[0]?.value;
      const val = node.arguments?.[1]?.value;
      if (VIRTUAL_FIELDS.has(field)) {
        return resolveVirtualContains(field, val);
      }
      // Real field — delegate to standard parser by reconstructing the clause
      const escaped = String(val).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let pattern;
      switch (node.name?.toLowerCase()) {
        case 'contains': pattern = escaped; break;
        case 'startswith': pattern = `^${escaped}`; break;
        case 'endswith': pattern = `${escaped}$`; break;
        default: return {};
      }
      return { [field]: { $regex: new RegExp(pattern, 'i') } };
    }

    // Comparison expressions — delegate to standard odata.js logic
    default: {
      // Reconstruct the single clause and use parseFilter
      // For simple comparisons, build inline
      const ops = { EqExpr: null, NeExpr: '$ne', GtExpr: '$gt', GeExpr: '$gte', LtExpr: '$lt', LeExpr: '$lte' };
      if (node.type in ops) {
        const field = node.left?.value;
        const value = node.right?.value ?? node.right;
        const op = ops[node.type];
        if (value === null && op === null) {
          return { $or: [{ [field]: null }, { [field]: { $exists: false } }] };
        }
        if (value === null && op === '$ne') {
          return { [field]: { $exists: true, $ne: null } };
        }
        if (op === null) return { [field]: value };
        return { [field]: { [op]: value } };
      }
      return {};
    }
  }
}

// --- Git status enrichment ---

function enrichGitStatus(entries) {
  const dirtyFolders = git.getDirtyFolders();
  return entries.map((entry) => {
    const folderName = git.sanitizeTitle(entry.title);
    const isDraft = dirtyFolders.has(folderName);
    return { ...entry, isDraft };
  });
}

function enrichGitStatusSingle(entry) {
  const folderName = git.sanitizeTitle(entry.title);
  const isDraft = git.isDirty(folderName);
  const canDiscard = isDraft && git.isCommitted(folderName);
  return { ...entry, isDraft, canDiscard };
}

// --- CRUD ---

export async function getAll(query = {}) {
  const baseFilter = {};

  // Status filter (always exclude deleted; OData $filter narrows further)
  if (query.status) {
    baseFilter.status = query.status;
  } else {
    baseFilter.status = { $ne: 'deleted' };
  }

  // Tag filter (legacy direct param — prefer OData tagsAll)
  if (query.tag) {
    baseFilter.tags = { $elemMatch: query.tag };
  }

  // Resolve virtual fields in $filter before passing to buildQuery
  let queryForDb = query;
  if (query.$filter) {
    try {
      const ast = parseFilterAst(query.$filter);
      if (hasVirtualFields(ast)) {
        const resolvedFilter = await resolveAstToNedb(ast);
        Object.assign(baseFilter, resolvedFilter);
        queryForDb = { ...query, $filter: undefined };
      }
    } catch {
      // If AST parsing fails, fall through to standard buildQuery
    }
  }

  const { results, totalCount } = await buildQuery(
    notebooks, queryForDb, { updatedAt: -1 }, baseFilter
  );

  // Enrich with media URL for thumbnail
  const withThumbnails = results.map((entry) => ({
    ...entry,
    thumbnailUrl: entry.thumbnailFilename
      ? `/notebooks/${entry._id}/.contents/${entry.thumbnailFilename}`
      : null,
  }));

  // Enrich with resolved entity names
  const enriched = await enrichEntityNames(withThumbnails);

  // Enrich with git draft status
  const withGitStatus = enrichGitStatus(enriched);

  const items = applySelect(withGitStatus, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
}

export async function getById(id) {
  const entry = await notebooks.findOne({ _id: id });
  if (!entry) return null;

  const withThumbnail = {
    ...entry,
    thumbnailUrl: entry.thumbnailFilename
      ? `/notebooks/${entry._id}/.contents/${entry.thumbnailFilename}`
      : null,
  };

  const [enriched] = await enrichEntityNames([withThumbnail]);
  return enrichGitStatusSingle(enriched);
}

export async function create(data) {
  const now = new Date().toISOString();

  // Template content for new notebooks
  const template = `# Title

Summary paragraph here.

#tags`;
  const meta = parseContentMeta(template);
  const folderName = git.sanitizeTitle(meta.title);
  const dir = dirFromTitle(meta.title);

  // Create folder — EEXIST = duplicate title
  try {
    mkdirSync(dir);
  } catch (err) {
    if (err.code === 'EEXIST') {
      throw new Error(`A notebook with the title "${meta.title}" already exists`);
    }
    throw err;
  }

  // Create .contents subfolder for system files
  mkdirSync(join(dir, CONTENTS_DIR));

  // Write template content
  writeFileSync(join(dir, CONTENTS_DIR, 'content.md'), template, 'utf-8');

  // Insert DB record (no isDraft — derived from git status)
  const record = await notebooks.insert({
    title: meta.title,
    summary: meta.summary,
    tags: meta.tags,
    status: 'active',
    ragScore: null,
    deletedAt: null,
    thumbnailFilename: null,
    relatedProjects: [],
    relatedClients: [],
    relatedTimesheets: [],
    relatedTickets: [],
    createdAt: now,
    updatedAt: now,
  });

  // Stage new folder in git index
  git.addAll(folderName);

  return record;
}

export async function update(id, data) {
  const existing = await notebooks.findOne({ _id: id });
  if (!existing) return null;

  const now = new Date().toISOString();
  const updateData = { updatedAt: now };

  await notebooks.update({ _id: id }, { $set: updateData });
  return getById(id);
}

// Soft delete
export async function remove(id) {
  const existing = await notebooks.findOne({ _id: id });
  if (!existing) return null;

  const now = new Date().toISOString();
  await notebooks.update({ _id: id }, {
    $set: { status: 'deleted', deletedAt: now, updatedAt: now },
  });
  return { success: true };
}

// Restore from recycle bin
export async function restore(id) {
  const existing = await notebooks.findOne({ _id: id });
  if (!existing) return null;
  if (existing.status !== 'deleted') {
    throw new Error('Only deleted notebooks can be restored');
  }

  const now = new Date().toISOString();
  await notebooks.update({ _id: id }, {
    $set: { status: 'active', deletedAt: null, updatedAt: now },
  });
  return getById(id);
}

// Archive
export async function archive(id) {
  const existing = await notebooks.findOne({ _id: id });
  if (!existing) return null;

  const now = new Date().toISOString();
  await notebooks.update({ _id: id }, {
    $set: { status: 'archived', updatedAt: now },
  });
  return getById(id);
}

// Unarchive (back to active)
export async function unarchive(id) {
  const existing = await notebooks.findOne({ _id: id });
  if (!existing) return null;
  if (existing.status !== 'archived') {
    throw new Error('Only archived notebooks can be unarchived');
  }

  const now = new Date().toISOString();
  await notebooks.update({ _id: id }, {
    $set: { status: 'active', updatedAt: now },
  });
  return getById(id);
}

// Permanent delete
export async function purge(id) {
  const existing = await notebooks.findOne({ _id: id });
  if (!existing) return null;
  if (existing.status !== 'deleted') {
    throw new Error('Only deleted notebooks can be permanently purged');
  }

  const folderName = git.sanitizeTitle(existing.title);
  const dir = dirFromTitle(existing.title);

  // Remove from git if tracked — stage removal and commit
  if (git.isTracked(folderName)) {
    git.rm(folderName);
    git.commit(`Delete notebook: ${existing.title}`);
  }

  // Remove folder and any untracked leftovers (thumbnails etc.)
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }

  await notebooks.remove({ _id: id });
  return { success: true };
}

// --- Content (markdown file) ---

function getContentPath(dir) {
  const newPath = join(dir, CONTENTS_DIR, 'content.md');
  if (existsSync(newPath)) return newPath;
  // Fallback for legacy notebooks without .contents/
  const legacyPath = join(dir, 'content.md');
  if (existsSync(legacyPath)) return legacyPath;
  return newPath; // default to new location
}

export async function getContent(id) {
  const existing = await notebooks.findOne({ _id: id });
  if (!existing) return null;

  const dir = dirFromTitle(existing.title);
  const filePath = getContentPath(dir);
  if (!existsSync(filePath)) return '';
  return readFileSync(filePath, 'utf-8');
}

export async function updateContent(id, markdown) {
  const existing = await notebooks.findOne({ _id: id });
  if (!existing) return null;

  // Derive new title from content
  const meta = parseContentMeta(markdown);
  const newTitle = meta.title || 'Untitled';
  const oldFolderName = git.sanitizeTitle(existing.title);
  const newFolderName = git.sanitizeTitle(newTitle);

  let dir = dirFromTitle(existing.title);

  // Handle title change → folder rename
  if (oldFolderName !== newFolderName) {
    const newDir = join(getNotebooksDir(), newFolderName);

    // Check if target folder already exists (duplicate title)
    if (existsSync(newDir)) {
      throw new Error(`A notebook with the title "${newTitle}" already exists`);
    }

    // Use git mv if tracked, otherwise plain rename
    if (git.isTracked(oldFolderName)) {
      git.mv(oldFolderName, newFolderName);
    } else {
      renameSync(dir, newDir);
    }

    dir = newDir;
  }

  // Ensure .contents dir exists
  const contentsDir = join(dir, CONTENTS_DIR);
  mkdirSync(contentsDir, { recursive: true });

  // Write content
  writeFileSync(join(contentsDir, 'content.md'), markdown || '', 'utf-8');

  // Extract first image reference and generate thumbnail
  await extractThumbnail(id, dir, markdown || '');

  // Extract entity references from markdown links
  const refs = extractEntityReferences(markdown);

  const now = new Date().toISOString();
  await notebooks.update({ _id: id }, {
    $set: {
      title: newTitle,
      summary: meta.summary,
      tags: meta.tags,
      relatedProjects: refs.relatedProjects,
      relatedClients: refs.relatedClients,
      relatedTimesheets: refs.relatedTimesheets,
      relatedTickets: refs.relatedTickets,
      updatedAt: now,
    },
  });

  // Stage entire folder so all changes are in the git index
  const folderName = git.sanitizeTitle(newTitle);
  git.addAll(folderName);

  return { success: true };
}

// --- Publish & Discard ---

export async function publish(id, message) {
  const existing = await notebooks.findOne({ _id: id });
  if (!existing) return null;

  if (!message || !message.trim()) {
    throw new Error('Commit message is required');
  }

  const folderName = git.sanitizeTitle(existing.title);
  git.publish(folderName, message.trim());

  return getById(id);
}

export async function discard(id) {
  const existing = await notebooks.findOne({ _id: id });
  if (!existing) return null;

  const folderName = git.sanitizeTitle(existing.title);

  if (!git.isCommitted(folderName)) {
    throw new Error('Notebook has never been published — nothing to revert');
  }

  // Restore to last committed state
  git.discard(folderName);

  // Re-read restored content and re-derive DB metadata
  const dir = dirFromTitle(existing.title);
  const content = readFileSync(getContentPath(dir), 'utf-8');
  const meta = parseContentMeta(content);
  const refs = extractEntityReferences(content);

  const now = new Date().toISOString();
  await notebooks.update({ _id: id }, {
    $set: {
      title: meta.title || 'Untitled',
      summary: meta.summary,
      tags: meta.tags,
      relatedProjects: refs.relatedProjects,
      relatedClients: refs.relatedClients,
      relatedTimesheets: refs.relatedTimesheets,
      relatedTickets: refs.relatedTickets,
      updatedAt: now,
    },
  });

  // Regenerate thumbnail
  await extractThumbnail(id, dir, content);

  return getById(id);
}

// --- Media (images/files in notebook folder) ---

export async function listMedia(id) {
  const dir = await getNotebookDir(id);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) =>
    f !== 'content.md' && !f.startsWith('thumb_') && f !== CONTENTS_DIR
  );
}

// --- Entity reference extraction ---

function extractEntityReferences(markdown) {
  const relatedProjects = new Set();
  const relatedClients = new Set();
  const relatedTimesheets = new Set();
  const relatedTickets = new Set();

  const regex = /\[([^\]]*)\]\(\/(projects|clients|timesheets|tickets)\/([a-zA-Z0-9_-]+)\)/g;
  let match;
  while ((match = regex.exec(markdown || '')) !== null) {
    const [, , entityType, entityId] = match;
    if (entityType === 'projects') relatedProjects.add(entityId);
    else if (entityType === 'clients') relatedClients.add(entityId);
    else if (entityType === 'timesheets') relatedTimesheets.add(entityId);
    else if (entityType === 'tickets') relatedTickets.add(entityId);
  }

  return {
    relatedProjects: [...relatedProjects],
    relatedClients: [...relatedClients],
    relatedTimesheets: [...relatedTimesheets],
    relatedTickets: [...relatedTickets],
  };
}

// --- Content metadata extraction ---

function parseContentMeta(markdown) {
  const lines = (markdown || '').split('\n');
  let title = '';
  let summary = '';
  let tags = [];

  // Find first non-empty line index
  let titleLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().length > 0) {
      titleLineIdx = i;
      break;
    }
  }
  if (titleLineIdx === -1) return { title, summary, tags };

  // Title: heading line or first sentence
  const titleLine = lines[titleLineIdx].trim();
  if (/^#{1,6}\s+/.test(titleLine)) {
    title = titleLine.replace(/^#{1,6}\s+/, '');
  } else {
    // First sentence ending with '.'
    const dotIdx = titleLine.indexOf('.');
    if (dotIdx >= 0) {
      title = titleLine.slice(0, dotIdx + 1);
    } else {
      title = titleLine;
    }
  }
  // Truncate at last space before 200 chars
  if (title.length > 200) {
    const cut = title.lastIndexOf(' ', 200);
    title = cut > 0 ? title.slice(0, cut) : title.slice(0, 200);
  }

  // Summary: first paragraph after title (skip blank lines, collect until next blank line)
  let summaryStart = -1;
  for (let i = titleLineIdx + 1; i < lines.length; i++) {
    if (lines[i].trim().length > 0) {
      summaryStart = i;
      break;
    }
  }
  if (summaryStart >= 0) {
    const paraLines = [];
    for (let i = summaryStart; i < lines.length; i++) {
      if (lines[i].trim().length === 0) break;
      paraLines.push(lines[i].trim());
    }
    summary = paraLines.join(' ');

    // Truncate at last space before 500 chars
    if (summary.length > 500) {
      const cut = summary.lastIndexOf(' ', 500);
      summary = cut > 0 ? summary.slice(0, cut) : summary.slice(0, 500);
    }

    // Tags: the line immediately after the summary paragraph
    const afterSummaryIdx = summaryStart + paraLines.length;
    // Skip blank lines to find the tags line
    for (let i = afterSummaryIdx; i < lines.length; i++) {
      if (lines[i].trim().length > 0) {
        const candidate = lines[i].trim();
        // Extract all #hashtag tokens from the line
        const found = candidate.match(/#[a-zA-Z0-9_-]+/g);
        if (found) {
          tags = found.map((t) => t.slice(1));
        }
        break;
      }
    }
  }

  return { title, summary, tags };
}

// --- Thumbnail extraction ---

async function extractThumbnail(id, dir, markdown) {
  // Find first image reference in markdown: ![...](filename)
  const match = markdown.match(/!\[.*?\]\(([^)]+)\)/);
  if (!match) {
    await notebooks.update({ _id: id }, { $set: { thumbnailFilename: null } });
    return;
  }

  const imageRef = match[1];
  const isDataUri = imageRef.startsWith('data:');
  const isExternal = imageRef.startsWith('http://') || imageRef.startsWith('https://');

  try {
    let imageBuffer;

    if (isDataUri) {
      // Decode base64 data URI (e.g. data:image/png;base64,...)
      const commaIdx = imageRef.indexOf(',');
      if (commaIdx === -1) {
        await notebooks.update({ _id: id }, { $set: { thumbnailFilename: null } });
        return;
      }
      imageBuffer = Buffer.from(imageRef.slice(commaIdx + 1), 'base64');
    } else if (isExternal) {
      const res = await fetch(imageRef);
      if (!res.ok) {
        await notebooks.update({ _id: id }, { $set: { thumbnailFilename: null } });
        return;
      }
      imageBuffer = Buffer.from(await res.arrayBuffer());
    } else {
      const imagePath = join(dir, imageRef);
      if (!existsSync(imagePath)) {
        await notebooks.update({ _id: id }, { $set: { thumbnailFilename: null } });
        return;
      }
      imageBuffer = readFileSync(imagePath);
    }

    const thumbName = (isDataUri || isExternal) ? 'thumb_embedded.jpg' : `thumb_${imageRef}`;
    const thumbDir = join(dir, CONTENTS_DIR);
    mkdirSync(thumbDir, { recursive: true });
    const thumbPath = join(thumbDir, thumbName);
    await sharp(imageBuffer)
      .resize(400, 250, { fit: 'cover' })
      .jpeg()
      .toFile(thumbPath);
    await notebooks.update({ _id: id }, { $set: { thumbnailFilename: thumbName } });
  } catch {
    // If thumbnail generation fails, clear it
    await notebooks.update({ _id: id }, { $set: { thumbnailFilename: null } });
  }
}

// --- Import ---

export async function importNotebook(content, resourceFiles) {
  const meta = parseContentMeta(content);
  const title = meta.title || 'Untitled';
  const dir = dirFromTitle(title);

  // Create folder — EEXIST = duplicate title
  try {
    mkdirSync(dir);
  } catch (err) {
    if (err.code === 'EEXIST') {
      throw new Error(`A notebook with the title "${title}" already exists`);
    }
    throw err;
  }

  const now = new Date().toISOString();

  const record = await notebooks.insert({
    title,
    summary: meta.summary,
    tags: meta.tags,
    status: 'active',
    ragScore: null,
    deletedAt: null,
    thumbnailFilename: null,
    createdAt: now,
    updatedAt: now,
  });

  // Create .contents subfolder and write content markdown
  const contentsDir = join(dir, CONTENTS_DIR);
  mkdirSync(contentsDir);
  writeFileSync(join(contentsDir, 'content.md'), content || '', 'utf-8');

  // Write resource files preserving sanitized original names (artifacts go to root)
  for (const file of resourceFiles) {
    const safe = basename(file.originalname);
    writeFileSync(join(dir, safe), file.buffer);
  }

  // Extract thumbnail from content
  await extractThumbnail(record._id, dir, content || '');

  // Stage imported folder in git index
  const importFolderName = git.sanitizeTitle(title);
  git.addAll(importFolderName);

  return getById(record._id);
}

// --- Git Config ---

export function getGitConfig() {
  return git.getConfig();
}

export function setGitConfig(data) {
  git.setConfig(data);
  return git.getConfig();
}

export function testGitConnection() {
  return git.testConnection();
}

export function hasGitRemote() {
  return git.hasRemote();
}

export function listGitBranches() {
  return git.listBranches();
}

// --- History ---

export async function getHistory(id) {
  const existing = await notebooks.findOne({ _id: id });
  if (!existing) return null;
  const folderName = git.sanitizeTitle(existing.title);
  return git.log(folderName);
}

export function getCommitDiff(hash, id) {
  // If id provided, scope to that notebook's folder
  return notebooks.findOne({ _id: id }).then((entry) => {
    const folderName = entry ? git.sanitizeTitle(entry.title) : null;
    return git.show(hash, folderName);
  });
}

export function getCompareDiff(fromHash, toHash, id) {
  return notebooks.findOne({ _id: id }).then((entry) => {
    const folderName = entry ? git.sanitizeTitle(entry.title) : null;
    return git.diff(fromHash, toHash, folderName);
  });
}

// --- Push / Pull ---

/**
 * Prepare push: fetch, then return unpushed info + conflict check.
 */
export async function preparePush() {
  const fetchResult = git.fetchOrigin();
  if (!fetchResult.ok) return { ok: false, error: fetchResult.error };

  const unpushed = git.getUnpushedInfo();
  const conflicts = git.checkConflicts();

  // Resolve folder names to notebook titles
  const allNotebooks = await notebooks.find({ status: { $ne: 'deleted' } });
  const folderToTitle = new Map(allNotebooks.map((n) => [git.sanitizeTitle(n.title), n.title]));

  const affectedNotebooks = unpushed.folders.map((f) => folderToTitle.get(f) || f);
  const conflictingNotebooks = conflicts.conflictingFolders.map((f) => folderToTitle.get(f) || f);

  return {
    ok: true,
    commits: unpushed.commits,
    affectedNotebooks,
    isFirstPush: unpushed.isFirstPush || false,
    hasConflicts: conflicts.hasConflicts,
    conflictingNotebooks,
  };
}

/**
 * Execute push (fires in background).
 */
export function executePush(force = false) {
  return git.push(force);
}

/**
 * Get current background operation status.
 */
export function getOperationStatus() {
  return git.getOperationStatus();
}

/**
 * Clear completed/errored operation.
 */
export function clearOperation() {
  git.clearOperation();
}

/**
 * Prepare pull: fetch, then return incoming info + conflict check + DB sync preview.
 */
export async function preparePull() {
  const fetchResult = git.fetchOrigin();
  if (!fetchResult.ok) return { ok: false, error: fetchResult.error };

  const incoming = git.getIncomingInfo();
  const conflicts = git.checkConflicts();
  const dirtyFolders = git.getDirtyFolders();

  // Resolve folder names to notebook titles
  const allNotebooks = await notebooks.find({ status: { $ne: 'deleted' } });
  const folderToTitle = new Map(allNotebooks.map((n) => [git.sanitizeTitle(n.title), n.title]));

  const affectedNotebooks = incoming.folders.map((f) => folderToTitle.get(f) || f);
  const conflictingNotebooks = conflicts.conflictingFolders.map((f) => folderToTitle.get(f) || f);

  // Preview DB sync: what will happen after pull
  let newFolders = [];
  let orphanNotebooks = [];

  // Preview: which folders will appear/disappear after pull
  const currentDiskFolders = new Set(git.listFolders());
  const dbFolders = new Set(allNotebooks.map((n) => git.sanitizeTitle(n.title)));

  // New folders coming from remote (in incoming changed folders, not in DB)
  for (const f of incoming.folders) {
    if (!dbFolders.has(f) && !currentDiskFolders.has(f)) {
      newFolders.push(f);
    }
  }

  // Check for orphan DB records (folder doesn't exist on disk)
  const diskFolders = new Set(git.listFolders());
  for (const n of allNotebooks) {
    const folder = git.sanitizeTitle(n.title);
    if (!diskFolders.has(folder)) {
      orphanNotebooks.push({ id: n._id, title: n.title });
    }
  }

  // Drafts that conflict with incoming changes
  const draftsAtRisk = [];
  for (const f of incoming.folders) {
    if (dirtyFolders.has(f)) {
      draftsAtRisk.push(folderToTitle.get(f) || f);
    }
  }

  return {
    ok: true,
    commits: incoming.commits,
    affectedNotebooks,
    hasConflicts: conflicts.hasConflicts,
    conflictingNotebooks,
    draftsAtRisk,
    dbSync: {
      newFolders,
      orphanNotebooks,
    },
  };
}

/**
 * Execute pull (fires in background), then sync DB with disk when done.
 */
export function executePull(force = false) {
  const pullPromise = git.pull(force);

  // If it failed synchronously (e.g. another op running), return that
  if (pullPromise && typeof pullPromise.then === 'function') {
    pullPromise.then(async (result) => {
      if (result.ok) {
        await syncDbWithDisk();
      }
    }).catch(() => {});
  }

  // Return immediately — operation runs in background
  const status = git.getOperationStatus();
  if (status?.status === 'running') return { ok: true, started: true };
  return pullPromise;
}

/**
 * Sync DB with disk after pull: create records for new folders, remove orphan records.
 */
async function syncDbWithDisk() {
  const diskFolders = new Set(git.listFolders());
  const allNotebooks = await notebooks.find({ status: { $ne: 'deleted' } });
  const dbFolderMap = new Map(allNotebooks.map((n) => [git.sanitizeTitle(n.title), n]));

  const imported = [];
  const removed = [];

  // New folders on disk → create DB records (import)
  for (const folderName of diskFolders) {
    if (!dbFolderMap.has(folderName)) {
      const dir = join(getNotebooksDir(), folderName);
      const contentPath = getContentPath(dir);
      if (!existsSync(contentPath)) continue;

      const content = readFileSync(contentPath, 'utf-8');
      const meta = parseContentMeta(content);
      const refs = extractEntityReferences(content);
      const now = new Date().toISOString();

      const record = await notebooks.insert({
        title: meta.title || folderName,
        summary: meta.summary,
        tags: meta.tags,
        status: 'active',
        ragScore: null,
        deletedAt: null,
        thumbnailFilename: null,
        relatedProjects: refs.relatedProjects,
        relatedClients: refs.relatedClients,
        relatedTimesheets: refs.relatedTimesheets,
        relatedTickets: refs.relatedTickets,
        createdAt: now,
        updatedAt: now,
      });

      // Generate thumbnail
      await extractThumbnail(record._id, dir, content);
      imported.push({ id: record._id, title: meta.title || folderName });
    }
  }

  // Orphan DB records → remove
  for (const [folderName, record] of dbFolderMap) {
    if (!diskFolders.has(folderName)) {
      await notebooks.remove({ _id: record._id });
      removed.push({ id: record._id, title: record.title });
    }
  }

  return { imported, removed };
}

// --- Artifacts (files in notebook root, excluding .contents/) ---

export async function listArtifacts(id) {
  const dir = await getNotebookDir(id);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f !== CONTENTS_DIR && !f.startsWith('.'))
    .map((filename) => {
      const filePath = join(dir, filename);
      const stat = statSync(filePath);
      if (stat.isDirectory()) return null;
      return {
        filename,
        size: stat.size,
        mimeType: guessMimeType(filename),
        lastModified: stat.mtime.toISOString(),
      };
    })
    .filter(Boolean);
}

export async function stageArtifact(id) {
  const existing = await notebooks.findOne({ _id: id });
  if (!existing) throw new Error('Notebook not found');
  git.addAll(git.sanitizeTitle(existing.title));
}

export async function deleteArtifact(id, filename) {
  const existing = await notebooks.findOne({ _id: id });
  if (!existing) throw new Error('Notebook not found');
  const dir = dirFromTitle(existing.title);
  const safe = basename(filename);
  if (safe === CONTENTS_DIR || safe.startsWith('.')) {
    throw new Error('Cannot delete system files');
  }
  const filePath = join(dir, safe);
  if (!existsSync(filePath)) throw new Error('File not found');

  rmSync(filePath);
  git.addAll(git.sanitizeTitle(existing.title));
  return { success: true };
}

export async function renameArtifact(id, oldName, newName) {
  const existing = await notebooks.findOne({ _id: id });
  if (!existing) throw new Error('Notebook not found');
  const dir = dirFromTitle(existing.title);
  const safeOld = basename(oldName);
  const safeNew = basename(newName);

  if (safeOld === CONTENTS_DIR || safeOld.startsWith('.')) {
    throw new Error('Cannot rename system files');
  }
  if (safeNew === CONTENTS_DIR || safeNew.startsWith('.')) {
    throw new Error('Invalid filename');
  }
  if (!safeNew || safeNew.length === 0) {
    throw new Error('Filename is required');
  }

  const oldPath = join(dir, safeOld);
  const newPath = join(dir, safeNew);

  if (!existsSync(oldPath)) throw new Error('File not found');
  if (existsSync(newPath)) throw new Error('A file with that name already exists');

  renameSync(oldPath, newPath);

  // Update markdown references if the file is referenced in content
  const contentPath = getContentPath(dir);
  if (existsSync(contentPath)) {
    const content = readFileSync(contentPath, 'utf-8');
    if (content.includes(safeOld)) {
      const updated = content.split(safeOld).join(safeNew);
      writeFileSync(contentPath, updated, 'utf-8');
    }
  }

  // Stage all changes (rename + possible content update)
  git.addAll(git.sanitizeTitle(existing.title));
  return { success: true, filename: safeNew };
}

export async function readArtifact(id, filename) {
  const dir = await getNotebookDir(id);
  const safe = basename(filename);
  const filePath = join(dir, safe);
  if (!existsSync(filePath)) throw new Error('File not found');
  return readFileSync(filePath, 'utf-8');
}

// --- Tags autocomplete ---

export async function getAllTags() {
  const all = await notebooks.find({ status: { $ne: 'deleted' } });
  const tagSet = new Set();
  for (const entry of all) {
    if (Array.isArray(entry.tags)) {
      entry.tags.forEach((t) => tagSet.add(t));
    }
  }
  return [...tagSet].sort();
}
