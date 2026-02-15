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
import { timesheetsApi, clientsApi, projectsApi } from '../../api/index.js';

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

const columns = [
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
    columnId: 'hours',
    compare: (a, b) => (a.hours || 0) - (b.hours || 0),
    renderHeaderCell: () => 'Hours',
    renderCell: (item) => <TableCellLayout>{item.hours}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'days',
    compare: (a, b) => (a.days || 0) - (b.days || 0),
    renderHeaderCell: () => 'Days',
    renderCell: (item) => <TableCellLayout>{item.days != null ? item.days.toFixed(2) : '—'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'amount',
    compare: (a, b) => (a.amount || 0) - (b.amount || 0),
    renderHeaderCell: () => 'Amount',
    renderCell: (item) => <TableCellLayout>{new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(item.amount || 0)}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'notes',
    compare: (a, b) => (a.notes || '').localeCompare(b.notes || ''),
    renderHeaderCell: () => 'Notes',
    renderCell: (item) => <TableCellLayout>{item.notes}</TableCellLayout>,
  }),
];

export default function TimesheetList() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(() => localStorage.getItem('timesheets.range') || 'week');
  const [selected, setSelected] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [clients, setClients] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [clientId, setClientId] = useState(() => localStorage.getItem('timesheets.clientId') || '');
  const [projectId, setProjectId] = useState(() => localStorage.getItem('timesheets.projectId') || '');
  const [customStart, setCustomStart] = useState(() => localStorage.getItem('timesheets.customStart') || getWeekRange().startDate);
  const [customEnd, setCustomEnd] = useState(() => localStorage.getItem('timesheets.customEnd') || getWeekRange().endDate);

  // Persist filter selections to localStorage
  useEffect(() => { localStorage.setItem('timesheets.range', range); }, [range]);
  useEffect(() => { localStorage.setItem('timesheets.clientId', clientId); }, [clientId]);
  useEffect(() => { localStorage.setItem('timesheets.projectId', projectId); }, [projectId]);
  useEffect(() => { localStorage.setItem('timesheets.customStart', customStart); }, [customStart]);
  useEffect(() => { localStorage.setItem('timesheets.customEnd', customEnd); }, [customEnd]);

  const filteredProjects = useMemo(
    () => clientId ? allProjects.filter((p) => p.clientId === clientId) : allProjects,
    [allProjects, clientId],
  );

  useEffect(() => {
    Promise.all([clientsApi.getAll(), projectsApi.getAll()])
      .then(([c, p]) => { setClients(c); setAllProjects(p); });
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
    timesheetsApi.getAll(params)
      .then(setEntries)
      .finally(() => setLoading(false));
  }, [dateRange, clientId, projectId]);

  const totals = useMemo(() => {
    const totalHours = entries.reduce((sum, e) => sum + (e.hours || 0), 0);
    const totalDays = entries.reduce((sum, e) => sum + (e.days || 0), 0);
    const totalAmount = entries.reduce((sum, e) => sum + (e.amount || 0), 0);
    return { totalHours, totalDays, totalAmount };
  }, [entries]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await timesheetsApi.delete(deleteTarget);
    setEntries((prev) => prev.filter((e) => e._id !== deleteTarget));
    setDeleteTarget(null);
    setSelected(new Set());
  };

  const { pageItems, page, pageSize, setPage, setPageSize, totalPages, totalItems } = usePagination(entries);

  const selectedId = selected.size === 1 ? [...selected][0] : null;
  const fmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text className={styles.title}>Timesheets</Text>
      </div>
      <CommandBar
        onNew={() => navigate('/timesheets/new')}
        newLabel="New Entry"
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
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div className={styles.loading}><Spinner label="Loading..." /></div>
        ) : entries.length === 0 ? (
          <div className={styles.empty}><Text>No timesheet entries found for this period.</Text></div>
        ) : (
          <DataGrid
            items={pageItems}
            columns={columns}
            sortable
            getRowId={(item) => item._id}
            selectionMode="multiselect"
            selectedItems={selected}
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
                <DataGridRow key={rowId} className={styles.row} onClick={() => navigate(`/timesheets/${item._id}`)}>
                  {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        )}
      </div>
      <PaginationControls
        page={page} pageSize={pageSize} totalItems={totalItems}
        totalPages={totalPages} onPageChange={setPage} onPageSizeChange={setPageSize}
      />
      {entries.length > 0 && (
        <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Total Hours</Text>
            <Text className={styles.summaryValue}>{totals.totalHours}</Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Total Days</Text>
            <Text className={styles.summaryValue}>{totals.totalDays.toFixed(2)}</Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Total Amount</Text>
            <Text className={styles.summaryValue}>{fmt.format(totals.totalAmount)}</Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Entries</Text>
            <Text className={styles.summaryValue}>{entries.length}</Text>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Timesheet Entry"
        message="Are you sure you want to delete this timesheet entry?"
      />
    </div>
  );
}
