import { notebooks, projects, clients, timesheets } from '../db/index.js';
import { buildQuery, parseFilter, applySelect, formatResponse } from '../odata.js';
import { parseFilter as parseFilterAst } from 'odata-filter-to-ast';
import { fileURLToPath } from 'url';
import { basename, dirname, join } from 'path';
import { mkdirSync, rmSync, renameSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import sharp from 'sharp';
import * as git from './notebookGitService.js';

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

  for (const entry of entries) {
    (entry.relatedProjects || []).forEach((id) => projectIds.add(id));
    (entry.relatedClients || []).forEach((id) => clientIds.add(id));
    (entry.relatedTimesheets || []).forEach((id) => timesheetIds.add(id));
  }

  // Batch-fetch referenced entities
  const [projectDocs, clientDocs, timesheetDocs] = await Promise.all([
    projectIds.size > 0 ? projects.find({ _id: { $in: [...projectIds] } }) : [],
    clientIds.size > 0 ? clients.find({ _id: { $in: [...clientIds] } }) : [],
    timesheetIds.size > 0 ? timesheets.find({ _id: { $in: [...timesheetIds] } }) : [],
  ]);

  // Build lookup maps
  const projectMap = new Map(projectDocs.map((p) => [p._id, p.name]));
  const clientMap = new Map(clientDocs.map((c) => [c._id, c.companyName]));
  const timesheetMap = new Map(timesheetDocs.map((t) => [t._id, t.date]));

  return entries.map((entry) => ({
    ...entry,
    relatedProjectNames: (entry.relatedProjects || []).map((id) => projectMap.get(id)).filter(Boolean),
    relatedClientNames: (entry.relatedClients || []).map((id) => clientMap.get(id)).filter(Boolean),
    relatedTimesheetLabels: (entry.relatedTimesheets || []).map((id) => timesheetMap.get(id)).filter(Boolean),
  }));
}

// --- Virtual field resolution for OData $filter ---

const VIRTUAL_FIELDS = new Set([
  'relatedProjectNamesAll', 'relatedClientNamesAll',
  'relatedTimesheetLabelsAll', 'tagsAll',
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
      ? `/notebooks/${entry._id}/${entry.thumbnailFilename}`
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
      ? `/notebooks/${entry._id}/${entry.thumbnailFilename}`
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

  // Write template content
  writeFileSync(join(dir, 'content.md'), template, 'utf-8');

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
    createdAt: now,
    updatedAt: now,
  });

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

  // Remove from git if tracked
  if (git.isTracked(folderName)) {
    git.rm(folderName);
  }

  // Remove folder and any untracked leftovers (thumbnails etc.)
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }

  await notebooks.remove({ _id: id });
  return { success: true };
}

// --- Content (markdown file) ---

export async function getContent(id) {
  const existing = await notebooks.findOne({ _id: id });
  if (!existing) return null;

  const dir = dirFromTitle(existing.title);
  const filePath = join(dir, 'content.md');
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

  // Write content
  writeFileSync(join(dir, 'content.md'), markdown || '', 'utf-8');

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
      updatedAt: now,
    },
  });

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
  const content = readFileSync(join(dir, 'content.md'), 'utf-8');
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
  return readdirSync(dir).filter((f) => f !== 'content.md' && !f.startsWith('thumb_'));
}

// --- Entity reference extraction ---

function extractEntityReferences(markdown) {
  const relatedProjects = new Set();
  const relatedClients = new Set();
  const relatedTimesheets = new Set();

  const regex = /\[([^\]]*)\]\(\/(projects|clients|timesheets)\/([a-zA-Z0-9_-]+)\)/g;
  let match;
  while ((match = regex.exec(markdown || '')) !== null) {
    const [, , entityType, entityId] = match;
    if (entityType === 'projects') relatedProjects.add(entityId);
    else if (entityType === 'clients') relatedClients.add(entityId);
    else if (entityType === 'timesheets') relatedTimesheets.add(entityId);
  }

  return {
    relatedProjects: [...relatedProjects],
    relatedClients: [...relatedClients],
    relatedTimesheets: [...relatedTimesheets],
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
    const thumbPath = join(dir, thumbName);
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

  // Write content markdown
  writeFileSync(join(dir, 'content.md'), content || '', 'utf-8');

  // Write resource files preserving sanitized original names
  for (const file of resourceFiles) {
    const safe = basename(file.originalname);
    writeFileSync(join(dir, safe), file.buffer);
  }

  // Extract thumbnail from content
  await extractThumbnail(record._id, dir, content || '');

  return getById(record._id);
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
