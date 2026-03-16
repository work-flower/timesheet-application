import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  ToggleButton,
  Select,
  Badge,
  Button,
  Tooltip,
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
import PaginationControls from '../../components/PaginationControls.jsx';
import ViewToggle from '../../components/ViewToggle.jsx';
import ListView from '../../components/ListView.jsx';
import CardView, { CardMetaItem } from '../../components/CardView.jsx';
import { useODataList } from '../../hooks/useODataList.js';
import { transactionsApi } from '../../api/index.js';
import TransactionDrawer from './TransactionDrawer.jsx';

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
    ':hover': {
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
  amountText: {
    fontSize: tokens.fontSizeBase300,
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

function deriveRange(startDate, endDate) {
  const week = getWeekRange();
  const month = getMonthRange();
  if (!startDate && !endDate) return 'all';
  if (startDate === week.startDate && endDate === week.endDate) return 'week';
  if (startDate === month.startDate && endDate === month.endDate) return 'month';
  return 'custom';
}

const fmtGBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

const statusColors = {
  matched: 'success',
  unmatched: 'warning',
  ignored: 'subtle',
};

const baseColumns = [
  createTableColumn({
    columnId: 'date',
    compare: (a, b) => a.date.localeCompare(b.date),
    renderHeaderCell: () => 'Date',
    renderCell: (item) => <TableCellLayout>{item.date}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'accountName',
    compare: (a, b) => (a.accountName || '').localeCompare(b.accountName || ''),
    renderHeaderCell: () => 'Account',
    renderCell: (item) => <TableCellLayout>{item.accountName}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'accountNumber',
    compare: (a, b) => (a.accountNumber || '').localeCompare(b.accountNumber || ''),
    renderHeaderCell: () => 'Account No.',
    renderCell: (item) => <TableCellLayout>{item.accountNumber || '\u2014'}</TableCellLayout>,
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
    renderCell: (item) => (
      <TableCellLayout>
        <span style={{ color: item.amount >= 0 ? '#107C10' : '#D13438' }}>
          {fmtGBP.format(item.amount)}
        </span>
      </TableCellLayout>
    ),
  }),
  createTableColumn({
    columnId: 'reference',
    compare: (a, b) => (a.reference || '').localeCompare(b.reference || ''),
    renderHeaderCell: () => 'Reference',
    renderCell: (item) => <TableCellLayout>{item.reference || '\u2014'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'status',
    compare: (a, b) => (a.status || '').localeCompare(b.status || ''),
    renderHeaderCell: () => 'Status',
    renderCell: (item) => (
      <TableCellLayout>
        <Badge appearance="filled" color={statusColors[item.status] || 'informative'} size="small">
          {item.status}
        </Badge>
      </TableCellLayout>
    ),
  }),
];

export default function TransactionList() {
  const styles = useStyles();
  const navigate = useNavigate();

  // --- OData-driven data flow ---
  const {
    getFilterValue, setFilterValues,
    items, totalCount, loading, refresh,
    page, pageSize, totalPages, setPage, setPageSize,
    summary,
  } = useODataList({
    key: 'transactions',
    apiFn: transactionsApi.getAll,
    filters: [
      { id: 'startDate',    field: 'date',        operator: 'ge', defaultValue: '', type: 'date' },
      { id: 'endDate',      field: 'date',        operator: 'le', defaultValue: '', type: 'date' },
      { id: 'status',       field: 'status',      operator: 'eq', defaultValue: '', type: 'string' },
      { id: 'accountName',  field: 'accountName',  operator: 'eq', defaultValue: '', type: 'string' },
    ],
    defaultOrderBy: 'date desc',
    defaultPageSize: 25,
    summaryFields: ['amount'],
  });

  const startDate = getFilterValue('startDate') || '';
  const endDate = getFilterValue('endDate') || '';
  const statusFilter = getFilterValue('status') || '';
  const accountName = getFilterValue('accountName') || '';
  const range = deriveRange(startDate, endDate);

  // --- View mode: display preference, not part of OData ---
  const [viewMode, setViewMode] = useState(() => {
    try { return JSON.parse(localStorage.getItem('transactions.viewMode')) || 'grid'; } catch { return 'grid'; }
  });
  const handleViewModeChange = useCallback((v) => {
    setViewMode(v);
    try { localStorage.setItem('transactions.viewMode', JSON.stringify(v)); } catch { /* ignore */ }
  }, []);

  // --- Reference data for account dropdown ---
  const [accounts, setAccounts] = useState([]);
  const [selectedTransactionId, setSelectedTransactionId] = useState(null);

  useEffect(() => {
    transactionsApi.getAccounts().then(setAccounts);
  }, []);

  // --- Search (client-side, current page only) ---
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((e) =>
      (e.description || '').toLowerCase().includes(q) ||
      (e.accountName || '').toLowerCase().includes(q) ||
      (e.accountNumber || '').toLowerCase().includes(q) ||
      (e.reference || '').toLowerCase().includes(q)
    );
  }, [items, search]);

  // --- Columns (with quick view action) ---
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
              onClick={(e) => { e.stopPropagation(); setSelectedTransactionId(item._id); }}
              style={{ minWidth: 'auto' }}
            />
          </Tooltip>
        </TableCellLayout>
      ),
    }),
    ...baseColumns,
  ], []);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text className={styles.title}>Transactions</Text>
      </div>
      <CommandBar
        searchValue={search}
        onSearchChange={setSearch}
      />
      <div className={styles.filters}>
        <Text size={200} weight="semibold">Status:</Text>
        <ToggleButton size="small" checked={!statusFilter} onClick={() => setFilterValues({ status: '' })}>All</ToggleButton>
        <ToggleButton size="small" checked={statusFilter === 'unmatched'} onClick={() => setFilterValues({ status: 'unmatched' })}>Unmatched</ToggleButton>
        <ToggleButton size="small" checked={statusFilter === 'matched'} onClick={() => setFilterValues({ status: 'matched' })}>Matched</ToggleButton>
        <ToggleButton size="small" checked={statusFilter === 'ignored'} onClick={() => setFilterValues({ status: 'ignored' })}>Ignored</ToggleButton>

        <Text size={200} weight="semibold" style={{ marginLeft: 12 }}>Period:</Text>
        <ToggleButton size="small" checked={range === 'all'} onClick={() => {
          setFilterValues({ startDate: '', endDate: '' });
        }}>All Time</ToggleButton>
        <ToggleButton size="small" checked={range === 'month'} onClick={() => {
          const m = getMonthRange();
          setFilterValues({ startDate: m.startDate, endDate: m.endDate });
        }}>This Month</ToggleButton>
        <ToggleButton size="small" checked={range === 'week'} onClick={() => {
          const w = getWeekRange();
          setFilterValues({ startDate: w.startDate, endDate: w.endDate });
        }}>This Week</ToggleButton>
        <ToggleButton size="small" checked={range === 'custom'} onClick={() => {
          if (range !== 'custom') {
            const today = new Date().toISOString().split('T')[0];
            setFilterValues({ startDate: getMonthRange().startDate, endDate: today });
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

        {accounts.length > 0 && (
          <>
            <Text size={200} weight="semibold" style={{ marginLeft: 12 }}>Account:</Text>
            <Select
              size="small"
              value={accountName}
              onChange={(e, data) => setFilterValues({ accountName: data.value })}
              style={{ minWidth: 160 }}
            >
              <option value="">All Accounts</option>
              {accounts.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </Select>
          </>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <ViewToggle value={viewMode} onChange={handleViewModeChange} />
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div className={styles.loading}><Spinner label="Loading..." /></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}><Text>No transactions found.</Text></div>
        ) : viewMode === 'grid' ? (
          <DataGrid
            items={filtered}
            columns={columns}
            sortable
            resizableColumns
            columnSizingOptions={{ actions: { idealWidth: 40, minWidth: 40 } }}
            getRowId={(item) => item._id}
            style={{ width: '100%' }}
          >
            <DataGridHeader>
              <DataGridRow>
                {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody>
              {({ item, rowId }) => (
                <DataGridRow key={rowId} className={styles.row} onClick={() => navigate(`/transactions/${item._id}`)}>
                  {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        ) : viewMode === 'list' ? (
          <ListView
            items={filtered}
            getRowId={(item) => item._id}
            onItemClick={(item) => navigate(`/transactions/${item._id}`)}
            renderTopLine={(item) => (
              <>
                <Text className={styles.dateBold}>{item.date}</Text>
                <Text className={styles.descText}>{item.description}</Text>
                <Badge appearance="filled" color={statusColors[item.status] || 'informative'} size="small">
                  {item.status}
                </Badge>
              </>
            )}
            renderActions={(item) => (
              <>
                <Text className={styles.amountText} style={{ color: item.amount >= 0 ? '#107C10' : '#D13438' }}>
                  {fmtGBP.format(item.amount)}
                </Text>
                <Tooltip content="Quick view" relationship="label" withArrow>
                  <Button
                    appearance="subtle"
                    icon={<OpenRegular />}
                    size="small"
                    onClick={(e) => { e.stopPropagation(); setSelectedTransactionId(item._id); }}
                    style={{ minWidth: 'auto' }}
                  />
                </Tooltip>
              </>
            )}
            renderBottomLine={(item) => (
              <Text className={styles.secondaryText}>
                {[item.accountName, item.accountNumber, item.reference].filter(Boolean).join(' · ')}
              </Text>
            )}
          />
        ) : (
          <CardView
            items={filtered}
            getRowId={(item) => item._id}
            onItemClick={(item) => navigate(`/transactions/${item._id}`)}
            renderHeader={(item) => (
              <>
                <Text className={styles.dateBold}>{item.date}</Text>
                <Text className={styles.descText}>{item.description}</Text>
                <Badge appearance="filled" color={statusColors[item.status] || 'informative'} size="small">
                  {item.status}
                </Badge>
              </>
            )}
            renderActions={(item) => (
              <Tooltip content="Quick view" relationship="label" withArrow>
                <Button
                  appearance="subtle"
                  icon={<OpenRegular />}
                  size="small"
                  onClick={(e) => { e.stopPropagation(); setSelectedTransactionId(item._id); }}
                  style={{ minWidth: 'auto' }}
                />
              </Tooltip>
            )}
            renderMeta={(item) => (
              <>
                <CardMetaItem label="Amount" value={
                  <span style={{ color: item.amount >= 0 ? '#107C10' : '#D13438' }}>
                    {fmtGBP.format(item.amount)}
                  </span>
                } />
                <CardMetaItem label="Account" value={item.accountName || '—'} />
                {item.reference && <CardMetaItem label="Reference" value={item.reference} />}
              </>
            )}
            renderFooter={(item) => item.accountNumber ? (
              <Text className={styles.secondaryText}>Account No. {item.accountNumber}</Text>
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
            <Text className={styles.summaryLabel}>Credits</Text>
            <Text className={styles.summaryValue} style={{ color: '#107C10' }}>
              {fmtGBP.format(summary.credits ?? 0)}
            </Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Debits</Text>
            <Text className={styles.summaryValue} style={{ color: '#D13438' }}>
              {fmtGBP.format(summary.debits ?? 0)}
            </Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Net</Text>
            <Text className={styles.summaryValue}>{fmtGBP.format(summary.amount ?? 0)}</Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Unmatched</Text>
            <Text className={styles.summaryValue}>{summary.unmatched ?? 0}</Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Transactions</Text>
            <Text className={styles.summaryValue}>{totalCount}</Text>
          </div>
        </div>
      )}
      <TransactionDrawer
        transactionId={selectedTransactionId}
        onClose={() => setSelectedTransactionId(null)}
        onMutate={refresh}
      />
    </div>
  );
}
