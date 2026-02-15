import { useState, useEffect, useMemo } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  ToggleButton,
  Select,
  Badge,
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
import { transactionsApi } from '../../api/index.js';

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

const fmtGBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

const statusColors = {
  matched: 'success',
  unmatched: 'warning',
  ignored: 'subtle',
};

const columns = [
  createTableColumn({
    columnId: 'date',
    compare: (a, b) => a.date.localeCompare(b.date),
    renderHeaderCell: () => 'Date',
    renderCell: (item) => <TableCellLayout>{item.date}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'accountName',
    renderHeaderCell: () => 'Account',
    renderCell: (item) => <TableCellLayout>{item.accountName}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'accountNumber',
    renderHeaderCell: () => 'Account No.',
    renderCell: (item) => <TableCellLayout>{item.accountNumber || '\u2014'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'description',
    renderHeaderCell: () => 'Description',
    renderCell: (item) => <TableCellLayout>{item.description}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'amount',
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
    columnId: 'balance',
    renderHeaderCell: () => 'Balance',
    renderCell: (item) => <TableCellLayout>{item.balance != null ? fmtGBP.format(item.balance) : '\u2014'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'reference',
    renderHeaderCell: () => 'Reference',
    renderCell: (item) => <TableCellLayout>{item.reference || '\u2014'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'status',
    renderHeaderCell: () => 'Status',
    renderCell: (item) => (
      <TableCellLayout>
        <Badge appearance="filled" color={statusColors[item.status] || 'informative'} size="small">
          {item.status}
        </Badge>
      </TableCellLayout>
    ),
  }),
  createTableColumn({
    columnId: 'clientName',
    renderHeaderCell: () => 'Client',
    renderCell: (item) => <TableCellLayout>{item.clientName || '\u2014'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'projectName',
    renderHeaderCell: () => 'Project',
    renderCell: (item) => <TableCellLayout>{item.projectName || '\u2014'}</TableCellLayout>,
  }),
];

export default function TransactionList() {
  const styles = useStyles();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => localStorage.getItem('transactions.status') || 'all');
  const [range, setRange] = useState(() => localStorage.getItem('transactions.range') || 'all');
  const [accountFilter, setAccountFilter] = useState(() => localStorage.getItem('transactions.account') || '');
  const [customStart, setCustomStart] = useState(() => localStorage.getItem('transactions.customStart') || getWeekRange().startDate);
  const [customEnd, setCustomEnd] = useState(() => localStorage.getItem('transactions.customEnd') || getWeekRange().endDate);

  // Persist filter selections
  useEffect(() => { localStorage.setItem('transactions.status', statusFilter); }, [statusFilter]);
  useEffect(() => { localStorage.setItem('transactions.range', range); }, [range]);
  useEffect(() => { localStorage.setItem('transactions.account', accountFilter); }, [accountFilter]);
  useEffect(() => { localStorage.setItem('transactions.customStart', customStart); }, [customStart]);
  useEffect(() => { localStorage.setItem('transactions.customEnd', customEnd); }, [customEnd]);

  const dateRange = useMemo(() => {
    if (range === 'week') return getWeekRange();
    if (range === 'month') return getMonthRange();
    if (range === 'custom') return { startDate: customStart, endDate: customEnd };
    return {};
  }, [range, customStart, customEnd]);

  useEffect(() => {
    setLoading(true);
    const params = { ...dateRange };
    if (statusFilter !== 'all') params.status = statusFilter;
    if (accountFilter) params.accountName = accountFilter;
    transactionsApi.getAll(params)
      .then(setEntries)
      .finally(() => setLoading(false));
  }, [dateRange, statusFilter, accountFilter]);

  const accounts = useMemo(() => {
    const names = [...new Set(entries.map((e) => e.accountName).filter(Boolean))];
    names.sort();
    return names;
  }, [entries]);

  const filtered = useMemo(() => {
    if (!search) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) =>
      (e.description || '').toLowerCase().includes(q) ||
      (e.accountName || '').toLowerCase().includes(q) ||
      (e.accountNumber || '').toLowerCase().includes(q) ||
      (e.reference || '').toLowerCase().includes(q) ||
      (e.clientName || '').toLowerCase().includes(q) ||
      (e.projectName || '').toLowerCase().includes(q)
    );
  }, [entries, search]);

  const totals = useMemo(() => {
    const credits = filtered.filter((e) => e.amount > 0).reduce((sum, e) => sum + e.amount, 0);
    const debits = filtered.filter((e) => e.amount < 0).reduce((sum, e) => sum + e.amount, 0);
    const unmatched = filtered.filter((e) => e.status === 'unmatched').length;
    return { credits, debits, net: credits + debits, unmatched, count: filtered.length };
  }, [filtered]);

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
        <ToggleButton size="small" checked={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All</ToggleButton>
        <ToggleButton size="small" checked={statusFilter === 'unmatched'} onClick={() => setStatusFilter('unmatched')}>Unmatched</ToggleButton>
        <ToggleButton size="small" checked={statusFilter === 'matched'} onClick={() => setStatusFilter('matched')}>Matched</ToggleButton>
        <ToggleButton size="small" checked={statusFilter === 'ignored'} onClick={() => setStatusFilter('ignored')}>Ignored</ToggleButton>

        <Text size={200} weight="semibold" style={{ marginLeft: 12 }}>Period:</Text>
        <ToggleButton size="small" checked={range === 'all'} onClick={() => setRange('all')}>All Time</ToggleButton>
        <ToggleButton size="small" checked={range === 'month'} onClick={() => setRange('month')}>This Month</ToggleButton>
        <ToggleButton size="small" checked={range === 'week'} onClick={() => setRange('week')}>This Week</ToggleButton>
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

        {accounts.length > 0 && (
          <>
            <Text size={200} weight="semibold" style={{ marginLeft: 12 }}>Account:</Text>
            <Select
              size="small"
              value={accountFilter}
              onChange={(e, data) => setAccountFilter(data.value)}
              style={{ minWidth: 160 }}
            >
              <option value="">All Accounts</option>
              {accounts.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </Select>
          </>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div className={styles.loading}><Spinner label="Loading..." /></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}><Text>No transactions found.</Text></div>
        ) : (
          <DataGrid items={filtered} columns={columns} sortable getRowId={(item) => item._id} style={{ width: '100%' }}>
            <DataGridHeader>
              <DataGridRow>
                {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody>
              {({ item, rowId }) => (
                <DataGridRow key={rowId}>
                  {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        )}
      </div>
      {filtered.length > 0 && (
        <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Credits</Text>
            <Text className={styles.summaryValue} style={{ color: '#107C10' }}>
              {fmtGBP.format(totals.credits)}
            </Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Debits</Text>
            <Text className={styles.summaryValue} style={{ color: '#D13438' }}>
              {fmtGBP.format(totals.debits)}
            </Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Net</Text>
            <Text className={styles.summaryValue}>{fmtGBP.format(totals.net)}</Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Unmatched</Text>
            <Text className={styles.summaryValue}>{totals.unmatched}</Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Transactions</Text>
            <Text className={styles.summaryValue}>{totals.count}</Text>
          </div>
        </div>
      )}
    </div>
  );
}
