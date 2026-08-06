import agentToolDefs from '../db/agentToolDefs.js';
import { handlers, seedDefinitions, reloadTools } from './agentToolRegistry.js';
import { invalidateIndex } from './routingService.js';

/**
 * Agent tool definitions — admin-managed CRUD over agent-tools.db. Each record
 * maps a model-visible definition (name, description, inputSchema) onto a
 * code-side handler in agentToolRegistry.js via handlerName. Every mutation
 * rebuilds the registry's effective tool cache (reloadTools) and invalidates
 * the routing vector index (descriptions are part of the corpus) — definition
 * edits are runtime data, no restart needed.
 */

const NAME_RE = /^[a-z][a-z0-9_]{1,63}$/;

// NeDB rejects object keys starting with `$` or containing `.` — walk the
// schema tree at save time so a bad key 400s instead of 500ing at insert.
// Consequence: schemas must be self-contained (no $ref/$defs, no dotted
// property names).
function findBadKey(value, path = '') {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const bad = findBadKey(value[i], `${path}[${i}]`);
      if (bad) return bad;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const keyPath = path ? `${path}.${key}` : key;
      if (key.startsWith('$') || key.includes('.')) return keyPath;
      const bad = findBadKey(child, keyPath);
      if (bad) return bad;
    }
  }
  return null;
}

// Accept an object (or a JSON string from the admin textarea) and return the
// storable plain object.
function normaliseSchema(value) {
  // Providers (Anthropic in particular) reject a tool whose schema lacks a
  // top-level `type: 'object'`, failing the WHOLE request — never store an
  // empty/typeless schema.
  if (value == null || value === '') return { type: 'object', properties: {} };
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error('inputSchema is not valid JSON');
    }
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('inputSchema must be a JSON object');
  }
  const bad = findBadKey(value);
  if (bad) {
    throw new Error(`inputSchema key "${bad}" cannot be stored: keys must not start with "$" or contain "." — schemas must be self-contained (no $ref/$defs, no dotted property names)`);
  }
  if (Object.keys(value).length === 0) return { type: 'object', properties: {} };
  if (value.type === undefined) value = { type: 'object', ...value };
  return value;
}

function validate(data) {
  if (!data.name || !NAME_RE.test(data.name)) {
    throw new Error('Name must be lowercase letters, digits and underscores, starting with a letter (2-64 chars)');
  }
  if (!data.description || !String(data.description).trim()) throw new Error('Description is required');
  if (!data.handlerName || !handlers[data.handlerName]) {
    throw new Error(`handlerName must be one of: ${Object.keys(handlers).join(', ')}`);
  }
}

/**
 * Code-side handler list for the admin mapping dropdown — derived dynamically
 * from the registry object's keys, nothing maintained separately.
 */
export function listHandlers() {
  return Object.keys(handlers).map((name) => ({
    name,
    kind: handlers[name].kind,
    access: handlers[name].access,
  }));
}

/**
 * Guarantee every code-registry seed definition exists in the store: insert
 * any seed whose `name` is absent (handlerName === name keeps existing grants
 * working). Admins opt out of a default by DISABLING it, not deleting it —
 * a deleted default returns on the next boot. Then hydrate the effective tool
 * cache. Idempotent, boot-time.
 */
export async function ensureDefaults() {
  const now = new Date().toISOString();
  for (const def of seedDefinitions) {
    const existing = await agentToolDefs.findOne({ name: def.name });
    if (!existing) await agentToolDefs.insert({ ...def, createdAt: now, updatedAt: now });
  }
  await reloadTools();
}

export async function getAll() {
  const docs = await agentToolDefs.find({});
  docs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return docs;
}

export async function getById(id) {
  return agentToolDefs.findOne({ _id: id });
}

export async function create(data) {
  validate(data);
  const inputSchema = normaliseSchema(data.inputSchema);
  const existing = await agentToolDefs.findOne({ name: data.name });
  if (existing) throw new Error(`A tool definition named "${data.name}" already exists`);

  const now = new Date().toISOString();
  const created = await agentToolDefs.insert({
    name: data.name,
    description: String(data.description).trim(),
    inputSchema,
    handlerName: data.handlerName,
    enabled: data.enabled !== false,
    createdAt: now,
    updatedAt: now,
  });
  await reloadTools();
  invalidateIndex();
  return created;
}

export async function update(id, data) {
  const existing = await agentToolDefs.findOne({ _id: id });
  if (!existing) return null;
  // Name is the join key for card grants, transcripts, proposals and eval
  // examples — immutable after create (matches the agent card slug rule).
  if (data.name && data.name !== existing.name) {
    throw new Error('Tool name is immutable — create a new definition and retire this one instead');
  }

  const merged = { ...existing, ...data, name: existing.name };
  validate(merged);
  await agentToolDefs.update({ _id: id }, {
    $set: {
      description: String(merged.description).trim(),
      inputSchema: normaliseSchema(merged.inputSchema),
      handlerName: merged.handlerName,
      enabled: merged.enabled !== false,
      updatedAt: new Date().toISOString(),
    },
  });
  await reloadTools();
  invalidateIndex();
  return agentToolDefs.findOne({ _id: id });
}

export async function remove(id) {
  const existing = await agentToolDefs.findOne({ _id: id });
  if (!existing) return null;
  await agentToolDefs.remove({ _id: id });
  await reloadTools();
  invalidateIndex();
  return { success: true };
}
