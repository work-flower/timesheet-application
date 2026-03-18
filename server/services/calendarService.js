import ical from 'node-ical';
import { calendarSources, calendarEvents } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';

// Store active refresh intervals keyed by sourceId
const refreshIntervals = new Map();

// ── CRUD for calendar sources ──────────────────────────────────────

export async function getAll(query = {}) {
  const baseFilter = {};
  if (query.enabled != null) baseFilter.enabled = query.enabled === 'true';

  const { results, totalCount } = await buildQuery(
    calendarSources, query, { name: 1 }, baseFilter
  );

  const items = applySelect(results, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
}

export async function getById(id) {
  return calendarSources.findOne({ _id: id });
}

export async function create(data) {
  if (!data.name || !data.icsUrl) {
    throw new Error('Name and ICS URL are required');
  }
  try {
    new URL(data.icsUrl);
  } catch {
    throw new Error('Invalid ICS URL format');
  }

  const now = new Date().toISOString();
  const doc = {
    name: data.name,
    icsUrl: data.icsUrl,
    colour: data.colour || '#0078D4',
    enabled: data.enabled !== false,
    refreshIntervalMinutes: data.refreshIntervalMinutes || null,
    lastFetchedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
  const created = await calendarSources.insert(doc);
  scheduleSource(created);
  return created;
}

export async function update(id, data) {
  const existing = await calendarSources.findOne({ _id: id });
  if (!existing) return null;

  const updateData = { ...data, updatedAt: new Date().toISOString() };
  delete updateData._id;
  delete updateData.createdAt;
  delete updateData.lastFetchedAt;
  delete updateData.lastError;

  if (updateData.icsUrl) {
    try {
      new URL(updateData.icsUrl);
    } catch {
      throw new Error('Invalid ICS URL format');
    }
  }

  await calendarSources.update({ _id: id }, { $set: updateData });
  const updated = await calendarSources.findOne({ _id: id });
  scheduleSource(updated);
  return updated;
}

export async function remove(id) {
  const existing = await calendarSources.findOne({ _id: id });
  if (!existing) return null;
  clearSchedule(id);
  await calendarEvents.remove({ sourceId: id }, { multi: true });
  return calendarSources.remove({ _id: id });
}

// ── ICS fetch & cache ──────────────────────────────────────────────

export async function fetchAndCache(sourceId) {
  const source = await calendarSources.findOne({ _id: sourceId });
  if (!source) throw new Error('Calendar source not found');

  try {
    const data = await ical.async.fromURL(source.icsUrl);

    // Determine cache window: 3 months past to 3 months future
    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const windowEnd = new Date(now.getFullYear(), now.getMonth() + 4, 0);

    const events = [];
    const cachedAt = new Date().toISOString();

    for (const [, comp] of Object.entries(data)) {
      if (comp.type !== 'VEVENT') continue;

      const start = comp.start ? new Date(comp.start) : null;
      const end = comp.end ? new Date(comp.end) : null;
      if (!start) continue;

      const allDay = !!(comp.start && comp.start.dateOnly);
      const duration = end ? end.getTime() - start.getTime() : 0;
      const baseUid = comp.uid || `${start.toISOString()}-${comp.summary || ''}`;
      const baseFields = {
        sourceId,
        summary: comp.summary || '',
        description: comp.description || '',
        location: comp.location || '',
        allDay,
        cachedAt,
      };

      if (comp.rrule) {
        // Build exdate set for filtering cancelled occurrences
        const exdates = new Set();
        if (comp.exdate) {
          for (const val of Object.values(comp.exdate)) {
            if (val instanceof Date) exdates.add(val.getTime());
            else if (val?.toISOString) exdates.add(new Date(val).getTime());
          }
        }

        const occurrences = comp.rrule.between(windowStart, windowEnd, true);
        for (const occ of occurrences) {
          if (exdates.has(occ.getTime())) continue;
          const occEnd = new Date(occ.getTime() + duration);
          events.push({
            ...baseFields,
            uid: `${baseUid}_${occ.toISOString()}`,
            start: occ.toISOString(),
            end: occEnd.toISOString(),
          });
        }
      } else {
        // Single (non-recurring) event
        if (start > windowEnd) continue;
        if (end && end < windowStart) continue;
        if (!end && start < windowStart) continue;

        events.push({
          ...baseFields,
          uid: baseUid,
          start: start.toISOString(),
          end: end ? end.toISOString() : start.toISOString(),
        });
      }
    }

    // Full replace: delete all events for this source, then bulk insert
    await calendarEvents.remove({ sourceId }, { multi: true });
    if (events.length > 0) {
      await calendarEvents.insert(events);
    }

    // Update source metadata
    await calendarSources.update({ _id: sourceId }, {
      $set: { lastFetchedAt: new Date().toISOString(), lastError: null },
    });

    return { count: events.length };
  } catch (err) {
    await calendarSources.update({ _id: sourceId }, {
      $set: { lastError: err.message },
    });
    throw err;
  }
}

export async function fetchAll() {
  const sources = await calendarSources.find({ enabled: true });
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

// ── Event queries ──────────────────────────────────────────────────

export async function getEvents(query = {}) {
  const { startDate, endDate } = query;
  if (!startDate || !endDate) throw new Error('startDate and endDate are required');

  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const baseFilter = {
    start: { $lte: end.toISOString() },
    end: { $gte: start.toISOString() },
  };

  const { results, totalCount } = await buildQuery(
    calendarEvents, query, { start: 1 }, baseFilter
  );

  // Enrich with source name and colour
  const sources = await calendarSources.find({ enabled: true });
  const sourceMap = {};
  for (const s of sources) {
    sourceMap[s._id] = { name: s.name, colour: s.colour };
  }

  const enriched = results.map((e) => ({
    ...e,
    sourceName: sourceMap[e.sourceId]?.name || 'Unknown',
    sourceColour: sourceMap[e.sourceId]?.colour || '#0078D4',
  }));

  const items = applySelect(enriched, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
}

// ── Scheduler ──────────────────────────────────────────────────────

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
        console.warn(`Calendar refresh failed for "${source.name}": ${err.message}`);
      });
    }, ms);
    refreshIntervals.set(source._id, handle);
  }
}

export async function initCalendarScheduler() {
  const sources = await calendarSources.find({ enabled: true });
  for (const source of sources) {
    scheduleSource(source);
  }
  console.log(`Calendar scheduler initialised for ${sources.filter(s => s.refreshIntervalMinutes > 0).length} source(s)`);
}
