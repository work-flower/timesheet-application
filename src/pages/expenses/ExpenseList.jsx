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
import { Badge, Button } from '@fluentui/react-components';
import { ScanDashRegular } from '@fluentui/react-icons';
import CommandBar from '../../components/CommandBar.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import ReceiptUploadDialog from './ReceiptUploadDialog.jsx';
import PaginationControls from '../../components/PaginationControls.jsx';
import ViewToggle from '../../components/ViewToggle.jsx';
import ListView from '../../components/ListView.jsx';
import CardView, { CardMetaItem } from '../../components/CardView.jsx';
import { usePagination } from '../../hooks/usePagination.js';
import { useListState } from '../../hooks/useListState.js';
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
  dateBold: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    minWidth: '70px',
    color: tokens.colorNeutralForeground1,
  },
  descText: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  secondaryText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  dot: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  amountText: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    minWidth: '80px',
    textAlign: 'right',
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
    columnId: 'externalReference',
    compare: (a, b) => (a.externalReference || '').localeCompare(b.externalReference || ''),
    renderHeaderCell: () => 'External Ref',
    renderCell: (item) => <TableCellLayout>{item.externalReference || '—'}</TableCellLayout>,
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
    columnId: 'netAmount',
    compare: (a, b) => (a.netAmount || 0) - (b.netAmount || 0),
    renderHeaderCell: () => 'Net Amount',
    renderCell: (item) => <TableCellLayout>{fmt.format(item.netAmount ?? ((item.amount || 0) - (item.vatAmount || 0)))}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'billable',
    compare: (a, b) => Number(b.billable) - Number(a.billable),
    renderHeaderCell: () => 'Billable',
    renderCell: (item) => <TableCellLayout>{item.billable ? 'Yes' : 'No'}</TableCellLayout>,
  }),
];

export default function ExpenseList() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useListState('expenses', {
    range: 'month', clientId: '', projectId: '', expenseType: '',
    customStart: getWeekRange().startDate, customEnd: getWeekRange().endDate,
    viewMode: 'grid', page: 1, pageSize: 25,
  });
  const { range, clientId, projectId, expenseType, customStart, customEnd, viewMode } = filters;
  const [selected, setSelected] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [clients, setClients] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [expenseTypes, setExpenseTypes] = useState([]);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);

  const filteredProjects = useMemo(
    () => clientId ? allProjects.filter((p) => p.clientId === clientId) : allProjects,
    [allProjects, clientId],
  );

  useEffect(() => {
    Promise.all([clientsApi.getAll(), projectsApi.getAll(), expensesApi.getTypes()])
      .then(([c, p, t]) => {
        setClients(c);
        setAllProjects(p);
        setExpenseTypes(t);
        // Clear stale localStorage IDs that no longer exist
        const clientIds = new Set(c.map((cl) => cl._id));
        const projectIds = new Set(p.map((pr) => pr._id));
        const updates = {};
        if (!clientIds.has(filters.clientId)) updates.clientId = '';
        if (!projectIds.has(filters.projectId)) updates.projectId = '';
        if (!t.includes(filters.expenseType)) updates.expenseType = '';
        if (Object.keys(updates).length > 0) setFilters(updates);
      });
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

  const { pageItems, page, pageSize, setPage, setPageSize, totalPages, totalItems } = usePagination(entries, {
    page: filters.page, pageSize: filters.pageSize,
    onPageChange: (p) => setFilters({ page: p }),
    onPageSizeChange: (ps) => setFilters({ pageSize: ps, page: 1 }),
  });

  const selectedId = selected.size === 1 ? [...selected][0] : null;

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
      >
        <Button
          appearance="subtle"
          icon={<ScanDashRegular />}
          size="small"
          onClick={() => setReceiptDialogOpen(true)}
        >
          Scan Receipt
        </Button>
      </CommandBar>
      <div className={styles.filters}>
        <Text size={200} weight="semibold">Period:</Text>
        <ToggleButton size="small" checked={range === 'week'} onClick={() => setFilters({ range: 'week', page: 1 })}>This Week</ToggleButton>
        <ToggleButton size="small" checked={range === 'month'} onClick={() => setFilters({ range: 'month', page: 1 })}>This Month</ToggleButton>
        <ToggleButton size="small" checked={range === 'all'} onClick={() => setFilters({ range: 'all', page: 1 })}>All Time</ToggleButton>
        <ToggleButton size="small" checked={range === 'custom'} onClick={() => setFilters({ range: 'custom', page: 1 })}>Custom</ToggleButton>
        {range === 'custom' && (
          <>
            <input
              type="date"
              className={styles.dateInput}
              value={customStart}
              onChange={(e) => setFilters({ customStart: e.target.value, page: 1 })}
            />
            <Text size={200}>to</Text>
            <input
              type="date"
              className={styles.dateInput}
              value={customEnd}
              onChange={(e) => setFilters({ customEnd: e.target.value, page: 1 })}
            />
          </>
        )}
        <Text size={200} weight="semibold" style={{ marginLeft: 12 }}>Client:</Text>
        <Select
          size="small"
          value={clientId}
          onChange={(e, data) => setFilters({ clientId: data.value, projectId: '', page: 1 })}
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
          onChange={(e, data) => setFilters({ projectId: data.value, page: 1 })}
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
          onChange={(e, data) => setFilters({ expenseType: data.value, page: 1 })}
          style={{ minWidth: 120 }}
        >
          <option value="">All Types</option>
          {expenseTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
        <div style={{ marginLeft: 'auto' }}>
          <ViewToggle value={viewMode} onChange={(v) => setFilters({ viewMode: v })} />
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div className={styles.loading}><Spinner label="Loading..." /></div>
        ) : entries.length === 0 ? (
          <div className={styles.empty}><Text>No expenses found for this period.</Text></div>
        ) : viewMode === 'grid' ? (
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
        ) : viewMode === 'list' ? (
          <ListView
            items={pageItems}
            getRowId={(item) => item._id}
            onItemClick={(item) => navigate(`/expenses/${item._id}`)}
            renderTopLine={(item) => (
              <>
                <Text className={styles.dateBold}>{item.date}</Text>
                <Text className={styles.descText}>{item.description || item.expenseType}</Text>
                <Text className={styles.dot}>·</Text>
                <Text className={styles.secondaryText}>{item.projectName}</Text>
              </>
            )}
            renderActions={(item) => (
              <>
                {item.transactions?.length > 0 && (
                  <Badge size="small" appearance="filled" color="brand">{item.transactions.length} linked</Badge>
                )}
                {!item.billable && (
                  <Badge size="small" appearance="filled" color="warning">Non-billable</Badge>
                )}
                <Text className={styles.amountText}>{fmt.format(item.amount || 0)}</Text>
              </>
            )}
            renderBottomLine={(item) => (
              <Text className={styles.secondaryText}>
                {[item.expenseType, item.clientName].filter(Boolean).join(' · ')}
              </Text>
            )}
          />
        ) : (
          <CardView
            items={pageItems}
            getRowId={(item) => item._id}
            onItemClick={(item) => navigate(`/expenses/${item._id}`)}
            renderHeader={(item) => (
              <>
                <Text className={styles.dateBold}>{item.date}</Text>
                <Text className={styles.descText}>{item.description || item.expenseType}</Text>
                {item.transactions?.length > 0 && (
                  <Badge size="small" appearance="filled" color="brand">{item.transactions.length} linked</Badge>
                )}
                {!item.billable && (
                  <Badge size="small" appearance="filled" color="warning">Non-billable</Badge>
                )}
              </>
            )}
            renderMeta={(item) => (
              <>
                <CardMetaItem label="Amount" value={fmt.format(item.amount || 0)} />
                <CardMetaItem label="VAT" value={item.vatAmount ? fmt.format(item.vatAmount) : '—'} />
                <CardMetaItem label="Net" value={fmt.format(item.netAmount ?? ((item.amount || 0) - (item.vatAmount || 0)))} />
                <CardMetaItem label="Type" value={item.expenseType || '—'} />
              </>
            )}
            renderFooter={(item) => (
              <Text className={styles.secondaryText}>
                {[item.clientName, item.projectName].filter(Boolean).join(' · ')}
              </Text>
            )}
          />
        )}
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
      <ReceiptUploadDialog
        open={receiptDialogOpen}
        onClose={() => setReceiptDialogOpen(false)}
        onCreated={(ids) => { setReceiptDialogOpen(false); navigate(ids.length === 1 ? `/expenses/${ids[0]}` : '/expenses'); }}
        projects={allProjects}
      />
    </div>
  );
}
