import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  ToggleButton,
  Select,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableCellLayout,
  createTableColumn,
  Spinner,
} from '@fluentui/react-components';
import CommandBar from '../../components/CommandBar.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import PaginationControls from '../../components/PaginationControls.jsx';
import { usePagination } from '../../hooks/usePagination.js';
import { expensesApi, clientsApi, projectsApi } from '../../api/index.js';

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: {
    padding: '16px 16px 0 16px',
  },
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
  summaryItem: {
    display: 'flex',
    flexDirection: 'column',
  },
  summaryLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  summaryValue: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
  },
  dateInput: {
    height: '24px',
    fontSize: tokens.fontSizeBase200,
    fontFamily: tokens.fontFamilyBase,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '0 8px',
    outline: 'none',
    ':focus': {
      borderColor: tokens.colorBrandStroke1,
    },
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '48px',
  },
  empty: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '48px',
    color: tokens.colorNeutralForeground3,
  },
  row: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
});

function getWeekRange() {
  const now = new Date();
  const day = now.getDay() || 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() - day + 1);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return {
    startDate: mon.toISOString().split('T')[0],
    endDate: sun.toISOString().split('T')[0],
  };
}

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

const fmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

const gridColumns = [
  createTableColumn({
    columnId: 'date',
    compare: (a, b) => a.date.localeCompare(b.date),
    renderHeaderCell: () => 'Date',
    renderCell: (item) => <TableCellLayout>{item.date}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'clientName',
    compare: (a, b) => (a.clientName || '').localeCompare(b.clientName || ''),
    renderHeaderCell: () => 'Client',
    renderCell: (item) => <TableCellLayout>{item.clientName}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'projectName',
    compare: (a, b) => (a.projectName || '').localeCompare(b.projectName || ''),
    renderHeaderCell: () => 'Project',
    renderCell: (item) => <TableCellLayout>{item.projectName}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'expenseType',
    compare: (a, b) => (a.expenseType || '').localeCompare(b.expenseType || ''),
    renderHeaderCell: () => 'Type',
    renderCell: (item) => <TableCellLayout>{item.expenseType}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'description',
    compare: (a, b) => (a.description || '').localeCompare(b.description || ''),
    renderHeaderCell: () => 'Description',
    renderCell: (item) => <TableCellLayout>{item.description}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'amount',
    compare: (a, b) => (a.amount || 0) - (b.amount || 0),
    renderHeaderCell: () => 'Amount',
    renderCell: (item) => <TableCellLayout>{fmt.format(item.amount || 0)}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'vatAmount',
    compare: (a, b) => (a.vatAmount || 0) - (b.vatAmount || 0),
    renderHeaderCell: () => 'VAT',
    renderCell: (item) => <TableCellLayout>{item.vatAmount ? fmt.format(item.vatAmount) : '—'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'billable',
    compare: (a, b) => Number(b.billable) - Number(a.billable),
    renderHeaderCell: () => 'Billable',
    renderCell: (item) => <TableCellLayout>{item.billable ? 'Yes' : 'No'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'attachments',
    compare: (a, b) => (a.attachments?.length || 0) - (b.attachments?.length || 0),
    renderHeaderCell: () => 'Attachments',
    renderCell: (item) => <TableCellLayout>{(item.attachments?.length || 0).toString()}</TableCellLayout>,
  }),
];

export default function ExpenseList() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(() => localStorage.getItem('expenses.range') || 'month');
  const [selected, setSelected] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [clients, setClients] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [expenseTypes, setExpenseTypes] = useState([]);
  const [clientId, setClientId] = useState(() => localStorage.getItem('expenses.clientId') || '');
  const [projectId, setProjectId] = useState(() => localStorage.getItem('expenses.projectId') || '');
  const [expenseType, setExpenseType] = useState(() => localStorage.getItem('expenses.expenseType') || '');
  const [customStart, setCustomStart] = useState(() => localStorage.getItem('expenses.customStart') || getWeekRange().startDate);
  const [customEnd, setCustomEnd] = useState(() => localStorage.getItem('expenses.customEnd') || getWeekRange().endDate);

  // Persist filter selections
  useEffect(() => { localStorage.setItem('expenses.range', range); }, [range]);
  useEffect(() => { localStorage.setItem('expenses.clientId', clientId); }, [clientId]);
  useEffect(() => { localStorage.setItem('expenses.projectId', projectId); }, [projectId]);
  useEffect(() => { localStorage.setItem('expenses.expenseType', expenseType); }, [expenseType]);
  useEffect(() => { localStorage.setItem('expenses.customStart', customStart); }, [customStart]);
  useEffect(() => { localStorage.setItem('expenses.customEnd', customEnd); }, [customEnd]);

  const filteredProjects = useMemo(
    () => clientId ? allProjects.filter((p) => p.clientId === clientId) : allProjects,
    [allProjects, clientId],
  );

  useEffect(() => {
    Promise.all([clientsApi.getAll(), projectsApi.getAll(), expensesApi.getTypes()])
      .then(([c, p, t]) => { setClients(c); setAllProjects(p); setExpenseTypes(t); });
  }, []);

  const dateRange = useMemo(() => {
    if (range === 'week') return getWeekRange();
    if (range === 'month') return getMonthRange();
    if (range === 'custom') return { startDate: customStart, endDate: customEnd };
    return {};
  }, [range, customStart, customEnd]);

  useEffect(() => {
    setLoading(true);
    const params = { ...dateRange };
    if (clientId) params.clientId = clientId;
    if (projectId) params.projectId = projectId;
    if (expenseType) params.expenseType = expenseType;
    expensesApi.getAll(params)
      .then(setEntries)
      .finally(() => setLoading(false));
  }, [dateRange, clientId, projectId, expenseType]);

  const totals = useMemo(() => {
    const billableTotal = entries.filter((e) => e.billable).reduce((sum, e) => sum + (e.amount || 0), 0);
    const nonBillableTotal = entries.filter((e) => !e.billable).reduce((sum, e) => sum + (e.amount || 0), 0);
    return { billableTotal, nonBillableTotal, count: entries.length };
  }, [entries]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await expensesApi.delete(deleteTarget);
    setEntries((prev) => prev.filter((e) => e._id !== deleteTarget));
    setDeleteTarget(null);
    setSelected(new Set());
  };

  const { pageItems, page, pageSize, setPage, setPageSize, totalPages, totalItems } = usePagination(entries);

  const selectedId = selected.size === 1 ? [...selected][0] : null;

  const renderGrid = () => {
    if (loading) {
      return (
        <div className={styles.loading}>
          <Spinner label="Loading..." />
        </div>
      );
    }
    if (!entries || entries.length === 0) {
      return (
        <div className={styles.empty}>
          <Text>No expenses found for this period.</Text>
        </div>
      );
    }
    return (
      <DataGrid
        items={pageItems}
        columns={gridColumns}
        sortable
        getRowId={(item) => item._id}
        selectionMode="multiselect"
        selectedItems={selected}
        onSelectionChange={(e, data) => setSelected(data.selectedItems)}
        style={{ width: '100%' }}
      >
        <DataGridHeader>
          <DataGridRow>
            {({ renderHeaderCell }) => (
              <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
            )}
          </DataGridRow>
        </DataGridHeader>
        <DataGridBody>
          {({ item, rowId }) => (
            <DataGridRow
              key={rowId}
              className={styles.row}
              onClick={() => navigate(`/expenses/${item._id}`)}
            >
              {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
            </DataGridRow>
          )}
        </DataGridBody>
      </DataGrid>
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text className={styles.title}>Expenses</Text>
      </div>
      <CommandBar
        onNew={() => navigate('/expenses/new')}
        newLabel="New Expense"
        onDelete={selectedId ? () => setDeleteTarget(selectedId) : undefined}
        deleteDisabled={!selectedId}
      />
      <div className={styles.filters}>
        <Text size={200} weight="semibold">Period:</Text>
        <ToggleButton size="small" checked={range === 'week'} onClick={() => setRange('week')}>This Week</ToggleButton>
        <ToggleButton size="small" checked={range === 'month'} onClick={() => setRange('month')}>This Month</ToggleButton>
        <ToggleButton size="small" checked={range === 'all'} onClick={() => setRange('all')}>All Time</ToggleButton>
        <ToggleButton size="small" checked={range === 'custom'} onClick={() => setRange('custom')}>Custom</ToggleButton>
        {range === 'custom' && (
          <>
            <input
              type="date"
              className={styles.dateInput}
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
            <Text size={200}>to</Text>
            <input
              type="date"
              className={styles.dateInput}
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </>
        )}
        <Text size={200} weight="semibold" style={{ marginLeft: 12 }}>Client:</Text>
        <Select
          size="small"
          value={clientId}
          onChange={(e, data) => { setClientId(data.value); setProjectId(''); }}
          style={{ minWidth: 160 }}
        >
          <option value="">All Clients</option>
          {clients.map((c) => (
            <option key={c._id} value={c._id}>{c.companyName}</option>
          ))}
        </Select>
        <Text size={200} weight="semibold">Project:</Text>
        <Select
          size="small"
          value={projectId}
          onChange={(e, data) => setProjectId(data.value)}
          style={{ minWidth: 160 }}
        >
          <option value="">All Projects</option>
          {filteredProjects.map((p) => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </Select>
        <Text size={200} weight="semibold">Type:</Text>
        <Select
          size="small"
          value={expenseType}
          onChange={(e, data) => setExpenseType(data.value)}
          style={{ minWidth: 120 }}
        >
          <option value="">All Types</option>
          {expenseTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {renderGrid()}
      </div>
      <PaginationControls
        page={page} pageSize={pageSize} totalItems={totalItems}
        totalPages={totalPages} onPageChange={setPage} onPageSizeChange={setPageSize}
      />
      {entries.length > 0 && (
        <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Billable Total</Text>
            <Text className={styles.summaryValue}>{fmt.format(totals.billableTotal)}</Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Non-Billable Total</Text>
            <Text className={styles.summaryValue}>{fmt.format(totals.nonBillableTotal)}</Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Entries</Text>
            <Text className={styles.summaryValue}>{totals.count}</Text>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Expense"
        message="Are you sure you want to delete this expense? This action cannot be undone."
      />
    </div>
  );
}
