/**
 * Centralised OData $expand — the ONLY place related records are attached to
 * entity read models. Detail endpoints return no embeds; list endpoints opt in
 * via $expand against the RELATIONS map below.
 *
 * Expanded docs are RAW reads through the wrapped collections: caller-scoped
 * (role pre-filters merge at the pipeline choke point), fls-masked per their
 * own table, and fail-loud 403 when the caller lacks read on the expanded
 * table. No scalar enrichment on nested docs — consumers needing enriched rows
 * fetch them from that entity's own list endpoint.
 *
 * Relation kinds:
 *   parent          item[localKey] → one doc          (timesheet.project)
 *   parentThrough   two-hop parent                    (timesheet.client via project)
 *   children        docs where [foreignKey] = item id (project.timesheets)
 *   childrenThrough children of the item's through-docs (client.timesheets via projects)
 *   idArray         item[localKey] is an id array     (invoice.linkedTransactions)
 *
 * All kinds resolve batched (ID sets → one $in find per hop) — never per-item.
 */

import { clients, projects, timesheets, expenses, invoices, documents, transactions } from './db/index.js';
import { BadRequestError } from './utils/errors.js';

const RELATIONS = {
  clients: {
    projects: { kind: 'children', collection: projects, foreignKey: 'clientId' },
    invoices: { kind: 'children', collection: invoices, foreignKey: 'clientId' },
    // Resolved via the client's projects — the stored clientId snapshot on
    // timesheet/expense rows is not trusted for scoping reads
    timesheets: {
      kind: 'childrenThrough', collection: timesheets, foreignKey: 'projectId',
      through: { collection: projects, foreignKey: 'clientId' },
    },
    expenses: {
      kind: 'childrenThrough', collection: expenses, foreignKey: 'projectId',
      through: { collection: projects, foreignKey: 'clientId' },
    },
  },
  projects: {
    client: { kind: 'parent', collection: clients, localKey: 'clientId' },
    timesheets: { kind: 'children', collection: timesheets, foreignKey: 'projectId' },
    documents: { kind: 'children', collection: documents, foreignKey: 'projectId' },
    expenses: { kind: 'children', collection: expenses, foreignKey: 'projectId' },
  },
  timesheets: {
    project: { kind: 'parent', collection: projects, localKey: 'projectId' },
    client: {
      kind: 'parentThrough', collection: clients, parentKey: 'clientId',
      through: { collection: projects, localKey: 'projectId' },
    },
  },
  expenses: {
    project: { kind: 'parent', collection: projects, localKey: 'projectId' },
    client: {
      kind: 'parentThrough', collection: clients, parentKey: 'clientId',
      through: { collection: projects, localKey: 'projectId' },
    },
    linkedTransactions: { kind: 'idArray', collection: transactions, localKey: 'transactions' },
  },
  invoices: {
    client: { kind: 'parent', collection: clients, localKey: 'clientId' },
    linkedTransactions: { kind: 'idArray', collection: transactions, localKey: 'transactions' },
  },
  documents: {
    client: { kind: 'parent', collection: clients, localKey: 'clientId' },
    project: { kind: 'parent', collection: projects, localKey: 'projectId' },
  },
};

function idSet(items, key) {
  const out = new Set();
  for (const item of items) {
    if (item[key] != null) out.add(item[key]);
  }
  return out;
}

async function mapByIds(collection, ids) {
  if (ids.size === 0) return new Map();
  const docs = await collection.find({ _id: { $in: [...ids] } });
  return new Map(docs.map((d) => [d._id, d]));
}

function groupBy(docs, key) {
  const out = new Map();
  for (const doc of docs) {
    const k = doc[key];
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(doc);
  }
  return out;
}

async function resolve(items, name, rel) {
  switch (rel.kind) {
    case 'parent': {
      const map = await mapByIds(rel.collection, idSet(items, rel.localKey));
      for (const item of items) item[name] = map.get(item[rel.localKey]) ?? null;
      return;
    }
    case 'parentThrough': {
      const throughMap = await mapByIds(rel.through.collection, idSet(items, rel.through.localKey));
      const parentIds = new Set(
        [...throughMap.values()].map((d) => d[rel.parentKey]).filter((v) => v != null)
      );
      const parentMap = await mapByIds(rel.collection, parentIds);
      for (const item of items) {
        const through = throughMap.get(item[rel.through.localKey]);
        item[name] = (through && parentMap.get(through[rel.parentKey])) ?? null;
      }
      return;
    }
    case 'children': {
      const ids = new Set(items.map((i) => i._id));
      const docs = ids.size
        ? await rel.collection.find({ [rel.foreignKey]: { $in: [...ids] } })
        : [];
      const grouped = groupBy(docs, rel.foreignKey);
      for (const item of items) item[name] = grouped.get(item._id) ?? [];
      return;
    }
    case 'childrenThrough': {
      const ids = new Set(items.map((i) => i._id));
      const throughDocs = ids.size
        ? await rel.through.collection.find({ [rel.through.foreignKey]: { $in: [...ids] } })
        : [];
      const throughByParent = groupBy(throughDocs, rel.through.foreignKey);
      const throughIds = new Set(throughDocs.map((d) => d._id));
      const childDocs = throughIds.size
        ? await rel.collection.find({ [rel.foreignKey]: { $in: [...throughIds] } })
        : [];
      const childrenByThrough = groupBy(childDocs, rel.foreignKey);
      for (const item of items) {
        item[name] = (throughByParent.get(item._id) ?? []).flatMap(
          (t) => childrenByThrough.get(t._id) ?? []
        );
      }
      return;
    }
    case 'idArray': {
      const ids = new Set(items.flatMap((i) => (Array.isArray(i[rel.localKey]) ? i[rel.localKey] : [])));
      const map = await mapByIds(rel.collection, ids);
      for (const item of items) {
        item[name] = (Array.isArray(item[rel.localKey]) ? item[rel.localKey] : [])
          .map((id) => map.get(id))
          .filter(Boolean);
      }
      return;
    }
  }
}

/**
 * Attach $expand relations to a list of items, mutating each item in place
 * (items are service-owned enriched copies, never raw NeDB store objects).
 *
 * @param {string} entityName - Pipeline collection name (registry TABLES key)
 * @param {object[]} items    - Rows to expand
 * @param {string} expandStr  - Raw $expand value ("client,timesheets")
 * @returns {Promise<object[]>} the same array
 * @throws {BadRequestError} bad_expand on names not in the relationship map
 */
export async function applyExpand(entityName, items, expandStr) {
  if (!expandStr) return items;
  const relations = RELATIONS[entityName];
  const names = expandStr.split(',').map((s) => s.trim()).filter(Boolean);
  // Validate before the empty-items early-out so bad names always 400
  for (const name of names) {
    if (!relations?.[name]) {
      throw new BadRequestError(
        `Unknown $expand "${name}" on ${entityName}. Valid: ${Object.keys(relations || {}).join(', ') || 'none'}`,
        'bad_expand'
      );
    }
  }
  if (items.length === 0) return items;
  for (const name of names) {
    await resolve(items, name, relations[name]);
  }
  return items;
}
