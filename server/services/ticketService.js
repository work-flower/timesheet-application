import { ticketSources, tickets } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';
import { getProvider } from './providers/index.js';

const MASK = '••••••••';

// Store active refresh intervals keyed by sourceId
const refreshIntervals = new Map();

// ── CRUD for ticket sources ──────────────────────────────────────

export async function getAll(query = {}) {
  const baseFilter = {};
  if (query.enabled != null) baseFilter.enabled = query.enabled === 'true';
  if (query.type) baseFilter.type = query.type;

  const { results, totalCount } = await buildQuery(
    ticketSources, query, { name: 1 }, baseFilter
  );

  const masked = results.map(maskCredentials);
  const items = applySelect(masked, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
}

export async function getById(id) {
  const source = await ticketSources.findOne({ _id: id });
  return source ? maskCredentials(source) : null;
}

export async function create(data) {
  validateSource(data);

  const now = new Date().toISOString();
  const doc = {
    name: data.name,
    type: data.type,
    baseUrl: data.baseUrl,
    email: data.type === 'jira' ? (data.email || '') : undefined,
    apiToken: data.type === 'jira' ? (data.apiToken || '') : undefined,
    pat: data.type === 'azure-devops' ? (data.pat || '') : undefined,
    preQuery: data.preQuery || '',
    colour: data.colour || '#0078D4',
    enabled: data.enabled !== false,
    refreshIntervalMinutes: data.refreshIntervalMinutes || null,
    lastFetchedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };

  // Remove undefined fields (type-specific credentials)
  Object.keys(doc).forEach((k) => doc[k] === undefined && delete doc[k]);

  const created = await ticketSources.insert(doc);
  scheduleSource(created);
  return maskCredentials(created);
}

export async function update(id, data) {
  const existing = await ticketSources.findOne({ _id: id });
  if (!existing) return null;

  const updateData = { ...data, updatedAt: new Date().toISOString() };
  delete updateData._id;
  delete updateData.createdAt;
  delete updateData.lastFetchedAt;
  delete updateData.lastError;
  delete updateData.type; // type cannot be changed

  // Retain masked credentials — if the value is the mask, keep the original
  if (updateData.apiToken === MASK) delete updateData.apiToken;
  if (updateData.pat === MASK) delete updateData.pat;

  if (updateData.baseUrl) {
    try { new URL(updateData.baseUrl); } catch { throw new Error('Invalid base URL format'); }
  }

  await ticketSources.update({ _id: id }, { $set: updateData });
  const updated = await ticketSources.findOne({ _id: id });
  scheduleSource(updated);
  return maskCredentials(updated);
}

export async function remove(id) {
  const existing = await ticketSources.findOne({ _id: id });
  if (!existing) return null;
  clearSchedule(id);
  await tickets.remove({ sourceId: id }, { multi: true });
  return ticketSources.remove({ _id: id });
}

// ── Test connection ──────────────────────────────────────────────

export async function testConnection(id) {
  const source = await ticketSources.findOne({ _id: id });
  if (!source) throw new Error('Ticket source not found');
  const provider = getProvider(source.type);
  return provider.testConnection(source);
}

// ── Fetch & cache ────────────────────────────────────────────────

export async function fetchAndCache(sourceId) {
  const source = await ticketSources.findOne({ _id: sourceId });
  if (!source) throw new Error('Ticket source not found');

  try {
    const provider = getProvider(source.type);
    const items = await provider.fetchTickets(source);

    const cachedAt = new Date().toISOString();
    const docs = items.map((item) => ({
      ...item,
      sourceId,
      cachedAt,
    }));

    // Full replace: delete all tickets for this source, then bulk insert
    await tickets.remove({ sourceId }, { multi: true });
    if (docs.length > 0) {
      await tickets.insert(docs);
    }

    await ticketSources.update({ _id: sourceId }, {
      $set: { lastFetchedAt: new Date().toISOString(), lastError: null },
    });

    return { count: docs.length };
  } catch (err) {
    await ticketSources.update({ _id: sourceId }, {
      $set: { lastError: err.message },
    });
    throw err;
  }
}

export async function fetchAll() {
  const sources = await ticketSources.find({ enabled: true });
  const results = [];
  for (const source of sources) {
    try {
      const result = await fetchAndCache(source._id);
      results.push({ sourceId: source._id, name: source.name, ...result });
    } catch (err) {
      results.push({ sourceId: source._id, name: source.name, error: err.message });
    }
  }
  return results;
}

// ── Ticket queries ───────────────────────────────────────────────

export async function getTickets(query = {}) {
  const baseFilter = {};
  if (query.sourceId) baseFilter.sourceId = query.sourceId;
  if (query.state) baseFilter.state = query.state;
  if (query.assignedTo) baseFilter.assignedTo = { $regex: new RegExp(query.assignedTo, 'i') };
  if (query.type) baseFilter.type = query.type;

  const { results, totalCount } = await buildQuery(
    tickets, query, { updated: -1 }, baseFilter
  );

  // Enrich with source name and colour
  const sources = await ticketSources.find({});
  const sourceMap = {};
  for (const s of sources) {
    sourceMap[s._id] = { name: s.name, colour: s.colour, type: s.type };
  }

  const enriched = results.map((t) => ({
    ...t,
    sourceName: sourceMap[t.sourceId]?.name || 'Unknown',
    sourceColour: sourceMap[t.sourceId]?.colour || '#0078D4',
    sourceType: sourceMap[t.sourceId]?.type || '',
  }));

  const items = applySelect(enriched, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
}

// ── Scheduler ────────────────────────────────────────────────────

function clearSchedule(sourceId) {
  const handle = refreshIntervals.get(sourceId);
  if (handle) {
    clearInterval(handle);
    refreshIntervals.delete(sourceId);
  }
}

function scheduleSource(source) {
  clearSchedule(source._id);
  if (source.enabled && source.refreshIntervalMinutes && source.refreshIntervalMinutes > 0) {
    const ms = source.refreshIntervalMinutes * 60 * 1000;
    const handle = setInterval(() => {
      fetchAndCache(source._id).catch((err) => {
        console.warn(`Ticket refresh failed for "${source.name}": ${err.message}`);
      });
    }, ms);
    refreshIntervals.set(source._id, handle);
  }
}

export async function initTicketScheduler() {
  const sources = await ticketSources.find({ enabled: true });
  for (const source of sources) {
    scheduleSource(source);
  }
  console.log(`Ticket scheduler initialised for ${sources.filter(s => s.refreshIntervalMinutes > 0).length} source(s)`);
}

// ── Helpers ──────────────────────────────────────────────────────

function maskCredentials(source) {
  const masked = { ...source };
  if (masked.apiToken) masked.apiToken = MASK;
  if (masked.pat) masked.pat = MASK;
  return masked;
}

function validateSource(data) {
  if (!data.name) throw new Error('Name is required');
  if (!data.type || !['jira', 'azure-devops'].includes(data.type)) {
    throw new Error('Type must be "jira" or "azure-devops"');
  }
  if (!data.baseUrl) throw new Error('Base URL is required');
  try { new URL(data.baseUrl); } catch { throw new Error('Invalid base URL format'); }

  if (data.type === 'jira') {
    if (!data.email) throw new Error('Email is required for Jira sources');
    if (!data.apiToken) throw new Error('API Token is required for Jira sources');
  }
  if (data.type === 'azure-devops') {
    if (!data.pat) throw new Error('Personal Access Token is required for Azure DevOps sources');
  }
}
