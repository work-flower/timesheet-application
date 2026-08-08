---
name: api-services-guide
description: Standards for backend services and API routes. Load this skill when creating, modifying, or fixing any service, route, or API client — covers CRUD operations, OData support, enrichment, validation, record locking, and frontend API client pattern.
user-invocable: true
allowed-tools: Read, Grep, Glob
---

# API & Services Guide

## Architecture

```
server/
  routes/{entity}.js      — Express router, thin layer
  services/{entity}Service.js — Business logic, validation, enrichment
  db/index.js             — NeDB datastores
  odata.js                — OData query parser
```

Routes delegate to services. Services handle all business logic.

## Service File Template

```js
import { entityCollection, relatedCollection } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';
import { assertNotLocked } from './lockCheck.js';
```

## Standard CRUD Operations

Every entity service must implement these five functions:

### getAll(query)

1. Build base filter from entity-specific query params
2. Call `buildQuery(collection, query, defaultSort, baseFilter)` for OData support
3. Enrich results with related data (joins)
4. Support `$expand` if the entity has relationships
5. Apply `applySelect` for `$select` support
6. Return via `formatResponse(items, totalCount, query.$count === 'true')`

```js
export async function getAll(query = {}) {
  const baseFilter = {};

  // Entity-specific filters from query params
  if (query.status) baseFilter.status = query.status;
  if (query.clientId) {
    // For entities linked via project, resolve projectIds first
    const clientProjects = await projects.find({ clientId: query.clientId });
    baseFilter.projectId = { $in: clientProjects.map((p) => p._id) };
  }
  if (query.startDate || query.endDate) {
    baseFilter.date = {};
    if (query.startDate) baseFilter.date.$gte = query.startDate;
    if (query.endDate) baseFilter.date.$lte = query.endDate;
  }

  const { results, totalCount } = await buildQuery(
    collection, query, { date: -1 }, baseFilter
  );

  // Enrich with related data
  const allProjects = await projects.find({});
  const allClients = await clients.find({});
  const projectMap = Object.fromEntries(allProjects.map((p) => [p._id, p]));
  const clientMap = Object.fromEntries(allClients.map((c) => [c._id, c]));

  const enriched = results.map((entry) => {
    const project = projectMap[entry.projectId];
    const client = project ? clientMap[project.clientId] : null;
    return {
      ...entry,
      projectName: project?.name || 'Unknown',
      clientName: client?.companyName || 'Unknown',
      clientId: project?.clientId || null,
    };
  });

  // $expand — centralised in server/expand.js. Register the entity's relations
  // in the RELATIONS map there; never hand-roll embeds in the service.
  await applyExpand('entities', enriched, query.$expand);

  const items = applySelect(enriched, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
}
```

### getById(id)

Returns a single enriched record or `null`.

**GOLDEN RULE — detail read models are LEAN:** stored fields plus scalar
enrichment ONLY (names, effective rates, derived clientId). NEVER embed related
records or aggregates computed from them on a detail response. Embeds echoed
back by form `{...form}` PUTs once got persisted onto documents and leaked past
row-level security. Related records belong to their own list endpoints
(`?clientId=`, `?projectId=`, `?transactionId=`, `?ids=`) or to `$expand` on
the list route.

```js
export async function getById(id) {
  const entry = await collection.findOne({ _id: id });
  if (!entry) return null;

  // Scalar enrichment only — never embedded collections
  const project = await projects.findOne({ _id: entry.projectId });
  const client = project ? await clients.findOne({ _id: project.clientId }) : null;

  return {
    ...entry,
    projectName: project?.name || 'Unknown',
    clientName: client?.companyName || 'Unknown',
    clientId: project?.clientId || null,
  };
}
```

### create(data)

1. Validate required fields
2. Compute derived fields
3. Set timestamps
4. Insert and return

```js
export async function create(data) {
  if (!data.requiredField) throw new Error('Field is required');

  const now = new Date().toISOString();
  return collection.insert({
    // mapped fields with defaults
    field: data.field || '',
    createdAt: now,
    updatedAt: now,
  });
}
```

### update(id, data)

1. Find existing record
2. Check lock status via `assertNotLocked(existing)`
3. Strip protected fields from update
4. Validate
5. Update and return fresh record via `getById`

```js
export async function update(id, data) {
  const existing = await collection.findOne({ _id: id });
  if (!existing) return null;
  assertNotLocked(existing);

  const now = new Date().toISOString();
  const updateData = { ...data, updatedAt: now };
  delete updateData._id;
  delete updateData.createdAt;
  delete updateData.isLocked;
  delete updateData.isLockedReason;

  await collection.update({ _id: id }, { $set: updateData });
  return getById(id);
}
```

### remove(id)

1. Find existing record
2. Check lock status
3. Cascade-delete related data if applicable
4. Remove

```js
export async function remove(id) {
  const existing = await collection.findOne({ _id: id });
  if (!existing) return null;
  assertNotLocked(existing);
  return collection.remove({ _id: id });
}
```

## OData Support

All list endpoints automatically support via `buildQuery()`:
- `$filter` — eq, ne, gt, ge, lt, le, contains, startswith, endswith, and
- `$orderby` — field asc/desc
- `$top` / `$skip` — pagination
- `$count=true` — wraps response in `{ "@odata.count": N, "value": [...] }`
- `$select` — field projection (via `applySelect`)
- `$expand` — inline related entities, centralised in `server/expand.js` (`applyExpand` + per-entity RELATIONS map; batched `$in` resolution; unknown names → 400 `bad_expand`; expanded docs are raw, caller-scoped and fls-masked; only wired entities support it — clients, projects, timesheets, expenses, invoices, documents)

Without `$count`, responses are plain arrays. With `$count=true`, responses are OData envelopes.

## Route File Template

```js
import { Router } from 'express';
import * as entityService from '../services/entityService.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await entityService.getAll(req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await entityService.getById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await entityService.create(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const result = await entityService.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await entityService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

Register the router in `server/index.js`:
```js
import entityRoutes from './routes/entity.js';
app.use('/api/entities', entityRoutes);
```

## Frontend API Client

Add to `src/api/index.js`:

```js
export const entityApi = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, v);
    }
    const query = qs.toString();
    return request(`/entities${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/entities/${id}`),
  create: (data) => request('/entities', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/entities/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/entities/${id}`, { method: 'DELETE' }),
};
```

## Record Locking

- `assertNotLocked(record)` from `server/services/lockCheck.js` — throws if locked
- All `update()` and `remove()` methods must call it before proceeding
- Lock fields (`isLocked`, `isLockedReason`) must be stripped from update data
- Lock fields are only set/cleared by specific lifecycle methods (e.g., invoice confirm/unconfirm)

## Validation Rules

- Date fields: no future dates where applicable (`data.date > today`)
- Required fields: throw `new Error('Field is required')`
- Numeric fields: coerce via `Number(data.field)` before storing
- Empty string to null: for optional override fields (e.g., `rate`, `workingHoursPerDay`)

## Error Semantics

- **Malformed `$filter` → 400 `bad_filter`** (`server/odata.js parseFilter`) — never silently ignored; a swallowed parse failure used to match everything.
- **Unknown `$expand` name → 400 `bad_expand`** (`server/expand.js applyExpand`).
- **`update()` must strip every read-model key** (enrichment scalars, embeds, aggregates, and fields owned by dedicated endpoints such as `transactions` link arrays) alongside the protected-field deletes — forms echo the full read model back on save.
