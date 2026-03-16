import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Tooltip,
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
import { OpenRegular } from '@fluentui/react-icons';
import CommandBar from '../../components/CommandBar.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import PaginationControls from '../../components/PaginationControls.jsx';
import ViewToggle from '../../components/ViewToggle.jsx';
import ListView from '../../components/ListView.jsx';
import CardView, { CardMetaItem } from '../../components/CardView.jsx';
import TimesheetDrawer from './TimesheetDrawer.jsx';
import { useODataList } from '../../hooks/useODataList.js';
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
  dateBold: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    minWidth: '70px',
    color: tokens.colorNeutralForeground1,
  },
  projectText: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  clientText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  dot: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  hoursText: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  amountText: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    minWidth: '80px',
    textAlign: 'right',
  },
  notesText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    lineHeight: tokens.lineHeightBase200,
  },
  cardNotesText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    lineHeight: tokens.lineHeightBase300,
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

const baseColumns = [
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

/**
 * Derive which range toggle is active from the current filter values.
 */
function deriveRange(startDate, endDate) {
  const week = getWeekRange();
  const month = getMonthRange();

  if (!startDate && !endDate) return 'all';
  if (startDate === week.startDate && endDate === week.endDate) return 'week';
  if (startDate === month.startDate && endDate === month.endDate) return 'month';
  return 'custom';
}

export default function TimesheetList() {
  const styles = useStyles();
  const navigate = useNavigate();

  // --- OData-driven data flow ---
  const {
    getFilterValue, setFilterValues,
    items, totalCount, loading, refresh,
    page, pageSize, totalPages, setPage, setPageSize,
    summary,
  } = useODataList({
    key: 'timesheets',
    apiFn: timesheetsApi.getAll,
    filters: [
      { id: 'startDate', field: 'date',      operator: 'ge', defaultValue: getWeekRange().startDate, type: 'date' },
      { id: 'endDate',   field: 'date',      operator: 'le', defaultValue: getWeekRange().endDate,   type: 'date' },
      { id: 'clientId',  field: 'clientId',   operator: 'eq', defaultValue: '', type: 'string' },
      { id: 'projectId', field: 'projectId',  operator: 'eq', defaultValue: '', type: 'string' },
    ],
    defaultOrderBy: 'date desc',
    defaultPageSize: 50,
    summaryFields: ['hours', 'days', 'amount'],
  });

  const startDate = getFilterValue('startDate') || '';
  const endDate = getFilterValue('endDate') || '';
  const clientId = getFilterValue('clientId') || '';
  const projectId = getFilterValue('projectId') || '';
  const range = deriveRange(startDate, endDate);

  // --- View mode: display preference, not part of OData ---
  const [viewMode, setViewMode] = useState(() => {
    try { return JSON.parse(localStorage.getItem('timesheets.viewMode')) || 'grid'; } catch { return 'grid'; }
  });
  const handleViewModeChange = useCallback((v) => {
    setViewMode(v);
    try { localStorage.setItem('timesheets.viewMode', JSON.stringify(v)); } catch { /* ignore */ }
  }, []);

  // --- Reference data for dropdowns ---
  const [selected, setSelected] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [clients, setClients] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [selectedTimesheetId, setSelectedTimesheetId] = useState(null);

  const filteredProjects = useMemo(
    () => clientId ? allProjects.filter((p) => p.clientId === clientId) : allProjects,
    [allProjects, clientId],
  );

  useEffect(() => {
    Promise.all([clientsApi.getAll(), projectsApi.getAll()])
      .then(([c, p]) => {
        setClients(c);
        setAllProjects(p);
      });
  }, []);

  // --- Columns ---
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
              onClick={(e) => { e.stopPropagation(); setSelectedTimesheetId(item._id); }}
              style={{ minWidth: 'auto' }}
            />
          </Tooltip>
        </TableCellLayout>
      ),
    }),
    ...baseColumns,
  ], []);

  // --- Delete handler ---
  const handleDelete = async () => {
    if (!deleteTarget) return;
    await timesheetsApi.delete(deleteTarget);
    setDeleteTarget(null);
    setSelected(new Set());
    refresh();
  };

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
        <ToggleButton size="small" checked={range === 'week'} onClick={() => {
          const w = getWeekRange();
          setFilterValues({ startDate: w.startDate, endDate: w.endDate });
        }}>This Week</ToggleButton>
        <ToggleButton size="small" checked={range === 'month'} onClick={() => {
          const m = getMonthRange();
          setFilterValues({ startDate: m.startDate, endDate: m.endDate });
        }}>This Month</ToggleButton>
        <ToggleButton size="small" checked={range === 'all'} onClick={() => {
          setFilterValues({ startDate: '', endDate: '' });
        }}>All Time</ToggleButton>
        <ToggleButton size="small" checked={range === 'custom'} onClick={() => {
          if (range !== 'custom') {
            // Switch to custom with current dates as starting point
            setFilterValues({ startDate: startDate || getWeekRange().startDate, endDate: endDate || getWeekRange().endDate });
          }
        }}>Custom</ToggleButton>
        {range === 'custom' && (
          <>
            <input
              type="date"
              className={styles.dateInput}
              value={startDate}
              onChange={(e) => setFilterValues({ startDate: e.target.value })}
            />
            <Text size={200}>to</Text>
            <input
              type="date"
              className={styles.dateInput}
              value={endDate}
              onChange={(e) => setFilterValues({ endDate: e.target.value })}
            />
          </>
        )}
        <Text size={200} weight="semibold" style={{ marginLeft: 12 }}>Client:</Text>
        <Select
          size="small"
          value={clientId}
          onChange={(e, data) => setFilterValues({ clientId: data.value, projectId: '' })}
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
          onChange={(e, data) => setFilterValues({ projectId: data.value })}
          style={{ minWidth: 160 }}
        >
          <option value="">All Projects</option>
          {filteredProjects.map((p) => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </Select>
        <div style={{ marginLeft: 'auto' }}>
          <ViewToggle value={viewMode} onChange={handleViewModeChange} />
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div className={styles.loading}><Spinner label="Loading..." /></div>
        ) : items.length === 0 ? (
          <div className={styles.empty}><Text>No timesheet entries found for this period.</Text></div>
        ) : viewMode === 'grid' ? (
          <DataGrid
            items={items}
            columns={columns}
            sortable
            resizableColumns
            columnSizingOptions={{ actions: { idealWidth: 40, minWidth: 40 } }}
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
        ) : viewMode === 'list' ? (
          <ListView
            items={items}
            getRowId={(item) => item._id}
            onItemClick={(item) => navigate(`/timesheets/${item._id}`)}
            renderTopLine={(item) => (
              <>
                <Text className={styles.dateBold}>{item.date}</Text>
                <Text className={styles.projectText}>{item.projectName}</Text>
                <Text className={styles.dot}>·</Text>
                <Text className={styles.clientText}>{item.clientName}</Text>
              </>
            )}
            renderActions={(item) => (
              <>
                <Text className={styles.hoursText}>{item.hours}h</Text>
                <Text className={styles.amountText}>{fmt.format(item.amount || 0)}</Text>
                <Tooltip content="Quick view" relationship="label" withArrow>
                  <Button
                    appearance="subtle"
                    icon={<OpenRegular />}
                    size="small"
                    onClick={(e) => { e.stopPropagation(); setSelectedTimesheetId(item._id); }}
                    style={{ minWidth: 'auto' }}
                  />
                </Tooltip>
              </>
            )}
            renderBottomLine={(item) => item.notes ? (
              <Text className={styles.notesText}>{item.notes}</Text>
            ) : null}
          />
        ) : (
          <CardView
            items={items}
            getRowId={(item) => item._id}
            onItemClick={(item) => navigate(`/timesheets/${item._id}`)}
            renderHeader={(item) => (
              <>
                <Text className={styles.dateBold}>{item.date}</Text>
                <Text className={styles.projectText}>{item.projectName}</Text>
                <Text className={styles.dot}>·</Text>
                <Text className={styles.clientText}>{item.clientName}</Text>
              </>
            )}
            renderActions={(item) => (
              <Tooltip content="Quick view" relationship="label" withArrow>
                <Button
                  appearance="subtle"
                  icon={<OpenRegular />}
                  size="small"
                  onClick={(e) => { e.stopPropagation(); setSelectedTimesheetId(item._id); }}
                  style={{ minWidth: 'auto' }}
                />
              </Tooltip>
            )}
            renderMeta={(item) => (
              <>
                <CardMetaItem label="Hours" value={item.hours} />
                <CardMetaItem label="Days" value={item.days != null ? item.days.toFixed(2) : '—'} />
                <CardMetaItem label="Amount" value={fmt.format(item.amount || 0)} />
              </>
            )}
            renderFooter={(item) => item.notes ? (
              <Text className={styles.cardNotesText}>{item.notes}</Text>
            ) : null}
          />
        )}
      </div>
      <PaginationControls
        page={page} pageSize={pageSize} totalItems={totalCount}
        totalPages={totalPages} onPageChange={setPage} onPageSizeChange={setPageSize}
      />
      {totalCount > 0 && (
        <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Total Hours</Text>
            <Text className={styles.summaryValue}>{summary.hours ?? 0}</Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Total Days</Text>
            <Text className={styles.summaryValue}>{(summary.days ?? 0).toFixed(2)}</Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Total Amount</Text>
            <Text className={styles.summaryValue}>{fmt.format(summary.amount ?? 0)}</Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Entries</Text>
            <Text className={styles.summaryValue}>{totalCount}</Text>
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
      <TimesheetDrawer
        timesheetId={selectedTimesheetId}
        onClose={() => setSelectedTimesheetId(null)}
        onMutate={refresh}
      />
    </div>
  );
}
