---
name: list-views-guide
description: Standards for entity list views. Load this skill when creating, modifying, or fixing any list page — covers DataGrid, columns, filters, pagination, search, summary footers, period toggles, localStorage persistence, and delete pattern.
user-invocable: true
allowed-tools: Read, Grep, Glob
---

# List Views Guide

## File Location

`src/pages/{entity}/{EntityName}List.jsx`

## Required Imports

```jsx
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  makeStyles, tokens, Text, ToggleButton, Select, Badge,
  DataGrid, DataGridHeader, DataGridHeaderCell, DataGridBody,
  DataGridRow, DataGridCell, TableCellLayout, createTableColumn, Spinner,
} from '@fluentui/react-components';
import CommandBar from '../../components/CommandBar.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import PaginationControls from '../../components/PaginationControls.jsx';
import { usePagination } from '../../hooks/usePagination.js';
import { entityApi } from '../../api/index.js';
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
  └── filters (ToggleButtons, Selects, date pickers)
  └── grid wrapper (flex: 1, overflow: auto)
        └── loading spinner OR empty message OR DataGrid
  └── PaginationControls
  └── summary footer (totals)
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
  items={pageItems}
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

## Filter Persistence

All filter selections persist to localStorage with entity-scoped keys:

```jsx
const [clientId, setClientId] = useState(() => localStorage.getItem('entities.clientId') || '');
useEffect(() => { localStorage.setItem('entities.clientId', clientId); }, [clientId]);
```

## Stale Filter Validation

After loading lookup data (clients, projects), validate that persisted IDs still exist:

```jsx
useEffect(() => {
  Promise.all([clientsApi.getAll(), projectsApi.getAll()])
    .then(([c, p]) => {
      setClients(c);
      setAllProjects(p);
      // Clear stale localStorage IDs
      const clientIds = new Set(c.map((cl) => cl._id));
      const projectIds = new Set(p.map((pr) => pr._id));
      setClientId((prev) => clientIds.has(prev) ? prev : '');
      setProjectId((prev) => projectIds.has(prev) ? prev : '');
    });
}, []);
```

This prevents empty results when persisted IDs point to deleted records.

## Period Filter Pattern

Toggle buttons for time range selection:

```jsx
<Text size={200} weight="semibold">Period:</Text>
<ToggleButton size="small" checked={range === 'week'} onClick={() => setRange('week')}>This Week</ToggleButton>
<ToggleButton size="small" checked={range === 'month'} onClick={() => setRange('month')}>This Month</ToggleButton>
<ToggleButton size="small" checked={range === 'all'} onClick={() => setRange('all')}>All Time</ToggleButton>
<ToggleButton size="small" checked={range === 'custom'} onClick={() => setRange('custom')}>Custom</ToggleButton>
{range === 'custom' && (
  <>
    <input type="date" className={styles.dateInput} value={customStart} onChange={...} />
    <Text size={200}>to</Text>
    <input type="date" className={styles.dateInput} value={customEnd} onChange={...} />
  </>
)}
```

Date range computed in a memo:
```jsx
const dateRange = useMemo(() => {
  if (range === 'week') return getWeekRange();
  if (range === 'month') return getMonthRange();
  if (range === 'custom') return { startDate: customStart, endDate: customEnd };
  return {};
}, [range, customStart, customEnd]);
```

## Pagination

Client-side pagination using `usePagination` hook:

```jsx
const { pageItems, page, pageSize, setPage, setPageSize, totalPages, totalItems } = usePagination(filtered);
```

Pass `pageItems` (not `entries`) to the DataGrid. PaginationControls renders below the grid.

## Summary Footer

Only shown when data exists:

```jsx
{entries.length > 0 && (
  <div className={styles.summary}>
    <div className={styles.summaryItem}>
      <Text className={styles.summaryLabel}>Label</Text>
      <Text className={styles.summaryValue}>{value}</Text>
    </div>
  </div>
)}
```

## Delete Pattern

Requires selection + confirmation dialog:

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
  setEntries((prev) => prev.filter((e) => e._id !== deleteTarget));
  setDeleteTarget(null);
  setSelected(new Set());
};
```

## Search Pattern

Client-side search across relevant text fields:

```jsx
const [search, setSearch] = useState('');

const filtered = useMemo(() => {
  if (!search) return entries;
  const q = search.toLowerCase();
  return entries.filter((e) =>
    (e.field1 || '').toLowerCase().includes(q) ||
    (e.field2 || '').toLowerCase().includes(q)
  );
}, [entries, search]);

// In CommandBar:
searchValue={search}
onSearchChange={setSearch}
```

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
  items={pageItems}
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
OverlayDrawer (position="end", size="large")
  └── DrawerHeader
  │     └── DrawerHeaderTitle — record title + status badge
  │           action: "Open full form" button + dismiss button
  └── DrawerBody
        └── Action toolbar (same actions as the full form's command bar)
        └── Message bars (success/error/warning)
        └── Read-only field sections (label/value pairs, balance, etc.)
        └── Collapsible source/detail sections
```

**Props:** `entityId` (string|null — null = closed), `onClose`, `onMutate` (refresh list after changes)

**Key patterns:**
- `useEffect` keyed on `entityId` with a `cancelled` flag to prevent stale data on rapid clicks
- After any mutation (link, unlink, ignore, restore): refresh drawer data + call `onMutate()`
- Navigation actions (e.g. "Create Expense") call `onClose()` then `navigate()`
- Sub-dialogs (pickers, confirm dialogs) render inside the drawer component — Fluent UI `Dialog` portals above the drawer automatically
- This is a **read-only view with actions**, not an inline edit form — no dirty tracking or save pattern

### List Integration

Extract data fetching into a `refreshEntries` callback so it can be shared between the initial `useEffect` and the drawer's `onMutate`:

```jsx
const refreshEntries = useCallback(() => {
  const params = { ...dateRange };
  // apply filters...
  return entityApi.getAll(params).then(setEntries);
}, [dateRange, /* other filter deps */]);

useEffect(() => {
  setLoading(true);
  refreshEntries().finally(() => setLoading(false));
}, [refreshEntries]);
```

Render the drawer at the end of the list component:

```jsx
<EntityDrawer
  entityId={selectedId}
  onClose={() => setSelectedId(null)}
  onMutate={refreshEntries}
/>
```

### Reference Implementation

See `src/pages/transactions/TransactionDrawer.jsx` and `src/pages/transactions/TransactionList.jsx` for a complete working example.
