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
  // Tickets are NOT cascade-deleted — they persist as evidence of work
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
    const remoteItems = await provider.fetchTickets(source);
    const cachedAt = new Date().toISOString();

    console.log(`Ticket sync started for "${source.name}" (${source.type}) — ${remoteItems.length} remote ticket(s)`);

    // Build a set of remote externalIds for reconciliation
    const remoteIdSet = new Set(remoteItems.map((item) => item.externalId));

    // Fetch all existing local tickets for this source
    const localTickets = await tickets.find({ sourceId });
    const localMap = {};
    for (const t of localTickets) {
      localMap[t.externalId] = t;
    }

    let created = 0;
    let updated = 0;

    // Upsert: create new or update existing from remote query results
    for (const item of remoteItems) {
      const existing = localMap[item.externalId];
      if (existing) {
        // Update synced fields but preserve extension data
        const { extension, _id, ...rest } = existing;
        await tickets.update({ _id: existing._id }, {
          $set: { ...item, sourceId, cachedAt },
        });
        updated++;
      } else {
        await tickets.insert({ ...item, sourceId, cachedAt, extension: { comments: '' } });
        created++;
      }
    }

    // Reconcile: check local tickets not present in the remote query response
    const missingLocals = localTickets.filter((t) => !remoteIdSet.has(t.externalId));
    let rechecked = 0;
    let notFound = 0;

    if (missingLocals.length > 0) {
      console.log(`Ticket sync "${source.name}": ${missingLocals.length} local ticket(s) not in remote query — re-checking individually`);
    }

    const recheckResults = await Promise.allSettled(
      missingLocals.map(async (local) => {
        try {
          const fresh = await provider.fetchTicketById(source, local.externalId);
          if (fresh) {
            await tickets.update({ _id: local._id }, {
              $set: { ...fresh, sourceId, cachedAt },
            });
            console.log(`Ticket sync "${source.name}": re-checked ${local.externalId} — updated`);
            return 'updated';
          } else {
            // Ticket no longer exists on remote — mark in description
            const notice = `\n\n⚠️ [${cachedAt.slice(0, 10)}] This ticket could not be found on the remote source.`;
            const desc = local.description || '';
            if (!desc.includes('could not be found on the remote source')) {
              await tickets.update({ _id: local._id }, {
                $set: { description: desc + notice, cachedAt },
              });
            }
            console.warn(`Ticket sync "${source.name}": ${local.externalId} not found on remote — marked locally`);
            return 'not_found';
          }
        } catch (err) {
          console.warn(`Ticket sync "${source.name}": re-check failed for ${local.externalId}: ${err.message}`);
          return 'error';
        }
      }),
    );

    for (const r of recheckResults) {
      if (r.status === 'fulfilled') {
        if (r.value === 'updated') rechecked++;
        if (r.value === 'not_found') notFound++;
      }
    }

    await ticketSources.update({ _id: sourceId }, {
      $set: { lastFetchedAt: new Date().toISOString(), lastError: null },
    });

    const count = created + updated + rechecked;
    console.log(`Ticket sync completed for "${source.name}": ${created} created, ${updated} updated, ${rechecked} re-checked, ${notFound} not found on remote`);
    return { count, created, updated, rechecked, notFound };
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

// ── Single ticket + patch ────────────────────────────────────────

export async function getTicketById(id) {
  const ticket = await tickets.findOne({ _id: id });
  if (!ticket) return null;

  // Enrich with source info
  const source = await ticketSources.findOne({ _id: ticket.sourceId });
  return {
    ...ticket,
    sourceName: source?.name || 'Unknown',
    sourceColour: source?.colour || '#0078D4',
    sourceType: source?.type || '',
  };
}

export async function patchTicket(id, data) {
  const existing = await tickets.findOne({ _id: id });
  if (!existing) return null;

  // Deep merge extension: preserve existing extension fields, overlay incoming
  const mergedExtension = {
    ...(existing.extension || {}),
    ...(data.extension || {}),
  };

  await tickets.update({ _id: id }, {
    $set: { extension: mergedExtension },
  });

  return getTicketById(id);
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
