---
name: list-views-guide
description: Standards for entity list views. Load this skill when creating, modifying, or fixing any list page — covers DataGrid, columns, OData URL-driven filters, server-side pagination, summary footers, period toggles, and delete pattern.
user-invocable: true
allowed-tools: Read, Grep, Glob
---

# List Views Guide

## File Location

`src/pages/{entity}/{EntityName}List.jsx`

## Required Imports

```jsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  makeStyles, tokens, Text, ToggleButton, Select, Badge,
  DataGrid, DataGridHeader, DataGridHeaderCell, DataGridBody,
  DataGridRow, DataGridCell, TableCellLayout, createTableColumn, Spinner,
} from '@fluentui/react-components';
import CommandBar from '../../components/CommandBar.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import PaginationControls from '../../components/PaginationControls.jsx';
import { useODataList } from '../../hooks/useODataList.js';
import { entityApi } from '../../api/index.js';

// Optional — only when using alternative view modes:
// import ViewToggle from '../../components/ViewToggle.jsx';
// import ListView from '../../components/ListView.jsx';
// import CardView, { CardMetaItem } from '../../components/CardView.jsx';
```

## Standard Styles

```jsx
const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: { padding: '16px 16px 0 16px' },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase500,
  },
  filters: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 16px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexWrap: 'wrap',
  },
  summary: {
    display: 'flex',
    gap: '24px',
    padding: '12px 16px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  summaryItem: { display: 'flex', flexDirection: 'column' },
  summaryLabel: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  summaryValue: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400 },
  dateInput: {
    height: '24px',
    fontSize: tokens.fontSizeBase200,
    fontFamily: tokens.fontFamilyBase,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '0 8px',
    outline: 'none',
    ':focus': { borderColor: tokens.colorBrandStroke1 },
  },
  loading: {
    display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '48px',
  },
  empty: {
    display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '48px',
    color: tokens.colorNeutralForeground3,
  },
  row: {
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
});
```

## Render Structure

```
page
  └── header (title)
  └── CommandBar (New, Delete, Search)
  └── filters (ToggleButtons, Selects, date pickers, optional ViewToggle at right)
  └── grid wrapper (flex: 1, overflow: auto)
        └── loading spinner OR empty message OR DataGrid (or ListView/CardView)
  └── PaginationControls
  └── summary footer (server-side totals via $summary)
  └── ConfirmDialog for delete
```

## Columns Definition

Define columns outside the component as a constant array:

```jsx
const columns = [
  createTableColumn({
    columnId: 'fieldName',
    compare: (a, b) => (a.fieldName || '').localeCompare(b.fieldName || ''),
    renderHeaderCell: () => 'Header Label',
    renderCell: (item) => <TableCellLayout>{item.fieldName}</TableCellLayout>,
  }),
  // ... more columns
];
```

For numeric columns use numeric comparison:
```jsx
compare: (a, b) => (a.amount || 0) - (b.amount || 0),
```

## DataGrid Pattern

```jsx
<DataGrid
  items={items}
  columns={columns}
  sortable
  getRowId={(item) => item._id}
  selectionMode="multiselect"          // if delete is supported
  selectedItems={selected}             // if delete is supported
  onSelectionChange={(e, data) => setSelected(data.selectedItems)}
  style={{ width: '100%' }}
>
  <DataGridHeader>
    <DataGridRow>
      {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
    </DataGridRow>
  </DataGridHeader>
  <DataGridBody>
    {({ item, rowId }) => (
      <DataGridRow
        key={rowId}
        className={styles.row}
        onClick={() => navigate(`/entities/${item._id}`)}
      >
        {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
      </DataGridRow>
    )}
  </DataGridBody>
</DataGrid>
```

Row click always navigates to the form. The `row` style adds cursor pointer and hover.

Note: `items` comes directly from `useODataList` — it's already the current page of results (server-side paginated).

---

## OData URL-Driven Data Flow (`useODataList`)

`useODataList` is the standard hook for all list data flow. It replaces `useListState` + `usePagination` + manual fetch logic. Filter/sort/pagination state lives in the URL as OData params (`$filter`, `$orderby`, `$top`, `$skip`), making filtered views bookmarkable and shareable.

### Setup

```jsx
const {
  getFilterValue, setFilterValues,
  items, totalCount, loading, refresh,
  page, pageSize, totalPages, setPage, setPageSize,
  orderBy, setOrderBy, summary,
} = useODataList({
  key: 'entities',                      // localStorage namespace
  apiFn: entityApi.getAll,              // API function — must pass params as query string
  filters: [
    { id: 'startDate', field: 'date',      operator: 'ge', defaultValue: getWeekRange().startDate, type: 'date' },
    { id: 'endDate',   field: 'date',      operator: 'le', defaultValue: getWeekRange().endDate,   type: 'date' },
    { id: 'clientId',  field: 'clientId',   operator: 'eq', defaultValue: '', type: 'string' },
    { id: 'projectId', field: 'projectId',  operator: 'eq', defaultValue: '', type: 'string' },
  ],
  defaultOrderBy: 'date desc',          // silent fallback — not added to URL
  defaultPageSize: 50,
  summaryFields: ['hours', 'days', 'amount'],  // server-side sums via $summary
});
```

### Filter Definition Shape

```js
{ id, field, operator, defaultValue, type }
```

- **`id`** — key used with `getFilterValue(id)` / `setFilterValues({ id: value })`
- **`field`** — database field name for OData clause
- **`operator`** — OData operator: `eq`, `ne`, `gt`, `ge`, `lt`, `le`
- **`defaultValue`** — initial value when no URL or localStorage state exists
- **`type`** — `'string'` | `'date'` | `'number'` | `'boolean'` (controls quoting in `$filter`)

Each filter produces an independent `field op 'value'` clause joined with ` and `.

### What the Hook Returns

| Return | Description |
|--------|-------------|
| `getFilterValue(id)` | Current value for a filter by its `id` |
| `setFilterValues({ id: val, ... })` | Update one or more filters. Always resets page to 1. Single URL update, single fetch. |
| `items` | Current page of results (already server-paginated) |
| `totalCount` | Total matching records across all pages |
| `loading` | Boolean |
| `refresh()` | Re-fetch with current params (call after mutations) |
| `page`, `pageSize`, `totalPages` | Pagination state |
| `setPage(n)`, `setPageSize(n)` | Pagination setters (pageSize change resets page to 1) |
| `orderBy`, `setOrderBy(str)` | Sort state (only in URL when explicitly set) |
| `summary` | Server-side sums object from `$summary` (e.g. `{ hours: 120, days: 15, amount: 10500 }`) |

### Fallback Precedence

For each OData param: **URL → localStorage → default**. Params from defaults or localStorage are passed to the API but NOT added to the URL — they only appear in the URL when explicitly set by user interaction.

### URL Golden Rules

1. **Non-OData query params are NEVER modified.** If the URL has `?embedded=true&$filter=...`, `embedded=true` is preserved exactly.
2. **Query param order is preserved.** Existing params keep their original position. OData params updated in-place or appended at the end.

### Backend Requirements

For `useODataList` to work with a given entity, the backend service's `getAll()` must:

1. **Support OData params via `buildQuery()`** — `$filter`, `$orderby`, `$top`, `$skip`, `$count` (already standard for all services)
2. **Support `$summary`** — When `query.$summary` is present, compute field sums across all matching records (ignoring `$top`/`$skip`) and include as `@odata.summary` in the response envelope. Add `summaryData` to `buildQuery()` return and pass to `formatResponse()`.
3. **Filter fields must exist on the document** — If a filter references a field not stored on the record (e.g. `clientId` on timesheets was only enriched, not stored), it must be persisted first. Write a backfill migration script in `scripts/` if existing data needs updating.

### Reference Implementation

See `src/pages/timesheets/TimesheetList.jsx` and `src/hooks/useODataList.js`.

---

## Period Filter Pattern (with OData)

Period toggles derive their active state from filter values — there is no separate `range` state:

```jsx
function deriveRange(startDate, endDate) {
  const week = getWeekRange();
  const month = getMonthRange();
  if (!startDate && !endDate) return 'all';
  if (startDate === week.startDate && endDate === week.endDate) return 'week';
  if (startDate === month.startDate && endDate === month.endDate) return 'month';
  return 'custom';
}

// Inside component:
const startDate = getFilterValue('startDate') || '';
const endDate = getFilterValue('endDate') || '';
const range = deriveRange(startDate, endDate);
```

Toggle buttons call `setFilterValues`:

```jsx
<ToggleButton checked={range === 'week'} onClick={() => {
  const w = getWeekRange();
  setFilterValues({ startDate: w.startDate, endDate: w.endDate });
}}>This Week</ToggleButton>

<ToggleButton checked={range === 'all'} onClick={() => {
  setFilterValues({ startDate: '', endDate: '' });
}}>All Time</ToggleButton>

<ToggleButton checked={range === 'custom'} onClick={() => {
  if (range !== 'custom') {
    setFilterValues({ startDate: startDate || getWeekRange().startDate, endDate: endDate || getWeekRange().endDate });
  }
}}>Custom</ToggleButton>

{range === 'custom' && (
  <>
    <input type="date" value={startDate} onChange={(e) => setFilterValues({ startDate: e.target.value })} />
    <Text size={200}>to</Text>
    <input type="date" value={endDate} onChange={(e) => setFilterValues({ endDate: e.target.value })} />
  </>
)}
```

## Dropdown Filter Pattern (with OData)

```jsx
<Select value={clientId} onChange={(e, data) => setFilterValues({ clientId: data.value, projectId: '' })}>
  <option value="">All Clients</option>
  {clients.map((c) => <option key={c._id} value={c._id}>{c.companyName}</option>)}
</Select>
```

Note: clearing dependent filters (e.g. `projectId: ''` when client changes) is done in the same `setFilterValues` call.

## Lookup Data for Dropdowns

Clients, projects, and other lookup data for filter dropdowns are loaded separately from the main data flow:

```jsx
const [clients, setClients] = useState([]);
const [allProjects, setAllProjects] = useState([]);

useEffect(() => {
  Promise.all([clientsApi.getAll(), projectsApi.getAll()])
    .then(([c, p]) => { setClients(c); setAllProjects(p); });
}, []);

// Filter projects by selected client for the project dropdown
const filteredProjects = useMemo(
  () => clientId ? allProjects.filter((p) => p.clientId === clientId) : allProjects,
  [allProjects, clientId],
);
```

## Pagination

Server-side pagination via `useODataList`. Pass props directly to `PaginationControls`:

```jsx
<PaginationControls
  page={page} pageSize={pageSize} totalItems={totalCount}
  totalPages={totalPages} onPageChange={setPage} onPageSizeChange={setPageSize}
/>
```

## Summary Footer

Uses server-side `$summary` values (totals across ALL matching records, not just the current page):

```jsx
{totalCount > 0 && (
  <div className={styles.summary}>
    <div className={styles.summaryItem}>
      <Text className={styles.summaryLabel}>Total Hours</Text>
      <Text className={styles.summaryValue}>{summary.hours ?? 0}</Text>
    </div>
    <div className={styles.summaryItem}>
      <Text className={styles.summaryLabel}>Entries</Text>
      <Text className={styles.summaryValue}>{totalCount}</Text>
    </div>
  </div>
)}
```

## Delete Pattern

After delete, call `refresh()` instead of mutating local state:

```jsx
const [selected, setSelected] = useState(new Set());
const [deleteTarget, setDeleteTarget] = useState(null);
const selectedId = selected.size === 1 ? [...selected][0] : null;

// In CommandBar:
onDelete={selectedId ? () => setDeleteTarget(selectedId) : undefined}
deleteDisabled={!selectedId}

// Handler:
const handleDelete = async () => {
  await entityApi.delete(deleteTarget);
  setDeleteTarget(null);
  setSelected(new Set());
  refresh();
};
```

## View Mode (Display Preference)

`viewMode` is NOT part of OData — it's a display preference managed separately:

```jsx
const [viewMode, setViewMode] = useState(() => {
  try { return JSON.parse(localStorage.getItem('entities.viewMode')) || 'grid'; } catch { return 'grid'; }
});
const handleViewModeChange = useCallback((v) => {
  setViewMode(v);
  try { localStorage.setItem('entities.viewMode', JSON.stringify(v)); } catch {}
}, []);
```

## Search Pattern

Client-side search across relevant text fields (applied to `items` from `useODataList`):

```jsx
const [search, setSearch] = useState('');

const filtered = useMemo(() => {
  if (!search) return items;
  const q = search.toLowerCase();
  return items.filter((e) =>
    (e.field1 || '').toLowerCase().includes(q) ||
    (e.field2 || '').toLowerCase().includes(q)
  );
}, [items, search]);

// In CommandBar:
searchValue={search}
onSearchChange={setSearch}
```

Note: search filters the current page only. Pass `filtered` (not `items`) to the DataGrid when search is active.

## Currency Formatting

```jsx
const fmtGBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
```

## Status Badges

```jsx
const statusColors = { active: 'success', draft: 'warning', archived: 'subtle' };

<Badge appearance="filled" color={statusColors[item.status] || 'informative'} size="small">
  {item.status}
</Badge>
```

## Quick View (Optional)

**IMPORTANT:** Quick View is NOT part of the default list view. Only implement it when the developer explicitly asks for a Quick View on a specific entity list. Never add it automatically.

Quick View lets users view and act on a record from an `OverlayDrawer` without leaving the list page. Row click still navigates to the full form.

### Trigger: Button Column

Add a narrow button column as the **first** column. The button calls `e.stopPropagation()` to prevent row click navigation. Because it references component state (`setSelectedId`), the columns array must be built inside the component via `useMemo`:

```jsx
import { Button, Tooltip } from '@fluentui/react-components';
import { OpenRegular } from '@fluentui/react-icons';

// Inside component:
const [selectedId, setSelectedId] = useState(null);

const columns = useMemo(() => [
  createTableColumn({
    columnId: 'actions',
    renderHeaderCell: () => '',
    renderCell: (item) => (
      <TableCellLayout>
        <Tooltip content="Quick view" relationship="label" withArrow>
          <Button
            appearance="subtle"
            icon={<OpenRegular />}
            size="small"
            onClick={(e) => { e.stopPropagation(); setSelectedId(item._id); }}
            style={{ minWidth: 'auto' }}
          />
        </Tooltip>
      </TableCellLayout>
    ),
  }),
  ...baseColumns,   // the original columns array, renamed to baseColumns
], []);
```

Constrain the actions column width via `columnSizingOptions` on the DataGrid:

```jsx
<DataGrid
  items={items}
  columns={columns}
  sortable
  resizableColumns
  columnSizingOptions={{ actions: { idealWidth: 40, minWidth: 40 } }}
  getRowId={(item) => item._id}
  style={{ width: '100%' }}
>
```

### Drawer Component

Create a separate `{EntityName}Drawer.jsx` file in the same directory. Structure:

```
OverlayDrawer (position="end", size="{see sizing}")
  └── DrawerHeader
  │     └── DrawerHeaderTitle — record title + status badge
  │           action: "Open full form" button + dismiss button
  └── DrawerBody
        └── Action toolbar (same actions as the full form's command bar)
        └── Message bars (success/error/warning)
        └── Read-only field sections (label/value pairs, balance, etc.)
        └── Collapsible source/detail sections
```

**Drawer sizes:**

| Size | Width | Use when |
|------|-------|----------|
| `small` | 320px | Simple read-only preview with few fields |
| `medium` | 592px | Standard Quick View — field summary, links, notes |
| `large` | 940px | Complex drawers with action toolbars, grids, pickers, or multi-section layouts |

**Props:** `entityId` (string|null — null = closed), `onClose`, `onMutate` (refresh list after changes)

**Key patterns:**
- `useEffect` keyed on `entityId` with a `cancelled` flag to prevent stale data on rapid clicks
- After any mutation (link, unlink, ignore, restore): refresh drawer data + call `onMutate()`
- Navigation actions (e.g. "Create Expense") call `onClose()` then `navigate()`
- Sub-dialogs (pickers, confirm dialogs) render inside the drawer component — Fluent UI `Dialog` portals above the drawer automatically
- This is a **read-only view with actions**, not an inline edit form — no dirty tracking or save pattern

### List Integration

Pass `refresh` from `useODataList` as the drawer's `onMutate`:

```jsx
<EntityDrawer
  entityId={selectedId}
  onClose={() => setSelectedId(null)}
  onMutate={refresh}
/>
```

### Reference Implementation

See `src/pages/transactions/TransactionDrawer.jsx` and `src/pages/transactions/TransactionList.jsx` for a complete working example.

## Alternative View Modes (Optional)

**IMPORTANT:** List and Card views are NOT part of the default list view pattern. Only add them when the developer explicitly requests alternative view modes. The default is always a DataGrid.

### ViewToggle

Three-button toggle (grid/list/card) placed at the right edge of the filters bar. Uses the View Mode pattern above.

```jsx
import ViewToggle from '../../components/ViewToggle.jsx';

// In filters bar, at the right edge:
<div style={{ marginLeft: 'auto' }}>
  <ViewToggle value={viewMode} onChange={handleViewModeChange} />
</div>
```

### ListView

Generic two-line row layout using render props:

| Prop | Type | Description |
|------|------|-------------|
| `items` | `Array` | Items from `useODataList` (already paginated) |
| `getRowId` | `(item) => string` | Unique key |
| `onItemClick` | `(item) => void` | Row click handler |
| `renderTopLine` | `(item) => ReactNode` | First line content |
| `renderBottomLine` | `(item) => ReactNode\|null` | Optional second line (shown only if truthy) |
| `renderActions` | `(item) => ReactNode` | Optional right-aligned actions |

```jsx
import ListView from '../../components/ListView.jsx';

<ListView
  items={items}
  getRowId={(item) => item._id}
  onItemClick={(item) => navigate(`/entities/${item._id}`)}
  renderTopLine={(item) => (
    <>
      <Text className={styles.dateBold}>{item.date}</Text>
      <Text className={styles.nameText}>{item.name}</Text>
    </>
  )}
  renderActions={(item) => (
    <>
      <Text className={styles.valueText}>{item.value}</Text>
      <QuickViewButton item={item} />
    </>
  )}
  renderBottomLine={(item) => item.notes ? (
    <Text className={styles.notesText}>{item.notes}</Text>
  ) : null}
/>
```

### CardView + CardMetaItem

Generic card layout with header/meta/footer sections:

**CardView props:**

| Prop | Type | Description |
|------|------|-------------|
| `items` | `Array` | Items from `useODataList` (already paginated) |
| `getRowId` | `(item) => string` | Unique key |
| `onItemClick` | `(item) => void` | Card click handler |
| `renderHeader` | `(item) => ReactNode` | Card header line |
| `renderMeta` | `(item) => ReactNode` | Optional metrics section (use CardMetaItem) |
| `renderFooter` | `(item) => ReactNode\|null` | Optional footer (gets top border separator) |
| `renderActions` | `(item) => ReactNode` | Optional right-aligned header actions |

**CardMetaItem props:** `label` (string), `value` (ReactNode) — uppercase label + bold value pair.

```jsx
import CardView, { CardMetaItem } from '../../components/CardView.jsx';

<CardView
  items={items}
  getRowId={(item) => item._id}
  onItemClick={(item) => navigate(`/entities/${item._id}`)}
  renderHeader={(item) => (
    <>
      <Text className={styles.dateBold}>{item.date}</Text>
      <Text className={styles.nameText}>{item.name}</Text>
    </>
  )}
  renderActions={(item) => <QuickViewButton item={item} />}
  renderMeta={(item) => (
    <>
      <CardMetaItem label="Hours" value={item.hours} />
      <CardMetaItem label="Amount" value={fmt.format(item.amount)} />
    </>
  )}
  renderFooter={(item) => item.notes ? (
    <Text className={styles.notesText}>{item.notes}</Text>
  ) : null}
/>
```

### Conditional Rendering Pattern

```jsx
{loading ? (
  <Spinner />
) : items.length === 0 ? (
  <EmptyMessage />
) : viewMode === 'grid' ? (
  <DataGrid ... />
) : viewMode === 'list' ? (
  <ListView ... />
) : (
  <CardView ... />
)}
```

### Reference Implementation

See `src/pages/timesheets/TimesheetList.jsx` for a complete working example with all three view modes.
