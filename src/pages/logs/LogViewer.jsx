import { useState, useEffect, useRef } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Select,
  Badge,
  Button,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableCellLayout,
  createTableColumn,
  Spinner,
  OverlayDrawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
} from '@fluentui/react-components';
import {
  SearchRegular,
  DismissRegular,
  DismissCircleRegular,
  CopyRegular,
} from '@fluentui/react-icons';
import PaginationControls from '../../components/PaginationControls.jsx';
import { usePagination } from '../../hooks/usePagination.js';
import { logApi } from '../../api/index.js';

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
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
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
  traceChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: '12px',
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground2,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    cursor: 'pointer',
  },
  traceLink: {
    cursor: 'pointer',
    color: tokens.colorBrandForeground1,
    '&:hover': {
      textDecoration: 'underline',
    },
  },
  clickableRow: {
    cursor: 'pointer',
  },
  drawerField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    marginBottom: '12px',
  },
  drawerLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
  },
  drawerValue: {
    fontSize: tokens.fontSizeBase300,
    wordBreak: 'break-all',
  },
  pre: {
    backgroundColor: tokens.colorNeutralBackground3,
    padding: '12px',
    borderRadius: '4px',
    fontSize: '12px',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    overflow: 'auto',
    maxHeight: '300px',
    margin: 0,
  },
  section: {
    marginBottom: '16px',
  },
  sectionTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    marginBottom: '8px',
  },
});

const levelColors = {
  error: 'danger',
  warn: 'warning',
  info: 'brand',
  debug: 'subtle',
};

function formatTimestamp(ts) {
  if (!ts) return '\u2014';
  const d = new Date(ts);
  return d.toLocaleString('en-GB', { hour12: false });
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

export default function LogViewer() {
  const styles = useStyles();
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters — persisted to localStorage
  const [startDate, setStartDate] = useState(() => localStorage.getItem('logs.startDate') || getToday());
  const [endDate, setEndDate] = useState(() => localStorage.getItem('logs.endDate') || getToday());
  const [level, setLevel] = useState(() => localStorage.getItem('logs.level') || '');
  const [source, setSource] = useState(() => localStorage.getItem('logs.source') || '');
  const [keyword, setKeyword] = useState(() => localStorage.getItem('logs.keyword') || '');

  // TraceId filter
  const [traceIdFilter, setTraceIdFilter] = useState('');

  // Detail panel
  const [selectedEntry, setSelectedEntry] = useState(null);

  // Sources extracted from data for filter dropdown
  const [sources, setSources] = useState([]);

  // Debounce keyword search
  const debounceRef = useRef(null);
  const [debouncedKeyword, setDebouncedKeyword] = useState(keyword);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedKeyword(keyword), 400);
    return () => clearTimeout(debounceRef.current);
  }, [keyword]);

  // Persist filters
  useEffect(() => { localStorage.setItem('logs.startDate', startDate); }, [startDate]);
  useEffect(() => { localStorage.setItem('logs.endDate', endDate); }, [endDate]);
  useEffect(() => { localStorage.setItem('logs.level', level); }, [level]);
  useEffect(() => { localStorage.setItem('logs.source', source); }, [source]);
  useEffect(() => { localStorage.setItem('logs.keyword', keyword); }, [keyword]);

  // Fetch entries
  useEffect(() => {
    setLoading(true);
    const params = {
      limit: 5000,
    };
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (level) params.level = level;
    if (source) params.source = source;
    if (debouncedKeyword) params.keyword = debouncedKeyword;
    if (traceIdFilter) params.traceId = traceIdFilter;

    logApi.search(params)
      .then((result) => {
        setEntries(result.entries || []);
        setTotal(result.total || 0);
        // Extract unique sources for filter
        const uniqueSources = [...new Set((result.entries || []).map(e => e.source).filter(Boolean))].sort();
        setSources((prev) => {
          // Merge with previous to avoid losing options on filter
          const merged = [...new Set([...prev, ...uniqueSources])].sort();
          return merged;
        });
      })
      .catch(() => {
        setEntries([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [startDate, endDate, level, source, debouncedKeyword, traceIdFilter]);

  const { pageItems, page, pageSize, setPage, setPageSize, totalPages, totalItems } = usePagination(entries);

  const handleTraceClick = (traceId) => {
    setTraceIdFilter(traceId);
    setSelectedEntry(null);
  };

  const columns = [
    createTableColumn({
      columnId: 'timestamp',
      compare: (a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''),
      renderHeaderCell: () => 'Timestamp',
      renderCell: (item) => (
        <TableCellLayout style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
          {formatTimestamp(item.timestamp)}
        </TableCellLayout>
      ),
    }),
    createTableColumn({
      columnId: 'level',
      compare: (a, b) => (a.level || '').localeCompare(b.level || ''),
      renderHeaderCell: () => 'Level',
      renderCell: (item) => (
        <TableCellLayout>
          <Badge appearance="filled" color={levelColors[item.level] || 'informative'} size="small">
            {(item.level || '').toUpperCase()}
          </Badge>
        </TableCellLayout>
      ),
    }),
    createTableColumn({
      columnId: 'source',
      compare: (a, b) => (a.source || '').localeCompare(b.source || ''),
      renderHeaderCell: () => 'Source',
      renderCell: (item) => <TableCellLayout>{item.source || '\u2014'}</TableCellLayout>,
    }),
    createTableColumn({
      columnId: 'method',
      compare: (a, b) => (a.method || '').localeCompare(b.method || ''),
      renderHeaderCell: () => 'Method',
      renderCell: (item) => <TableCellLayout>{item.method || '\u2014'}</TableCellLayout>,
    }),
    createTableColumn({
      columnId: 'path',
      compare: (a, b) => (a.path || '').localeCompare(b.path || ''),
      renderHeaderCell: () => 'Path',
      renderCell: (item) => <TableCellLayout>{item.path || '\u2014'}</TableCellLayout>,
    }),
    createTableColumn({
      columnId: 'traceId',
      compare: (a, b) => (a.traceId || '').localeCompare(b.traceId || ''),
      renderHeaderCell: () => 'Trace ID',
      renderCell: (item) => (
        <TableCellLayout>
          {item.traceId ? (
            <span
              className={styles.traceLink}
              title={item.traceId}
              onClick={(e) => { e.stopPropagation(); handleTraceClick(item.traceId); }}
            >
              {item.traceId.slice(0, 8)}
            </span>
          ) : '\u2014'}
        </TableCellLayout>
      ),
    }),
    createTableColumn({
      columnId: 'message',
      compare: (a, b) => (a.message || '').localeCompare(b.message || ''),
      renderHeaderCell: () => 'Message',
      renderCell: (item) => (
        <TableCellLayout>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: '400px' }}>
            {item.message}
          </span>
        </TableCellLayout>
      ),
    }),
  ];

  const detailFields = [
    { label: 'Timestamp', key: 'timestamp', format: formatTimestamp },
    { label: 'Level', key: 'level' },
    { label: 'Source', key: 'source' },
    { label: 'Method', key: 'method' },
    { label: 'Path', key: 'path' },
    { label: 'Request ID', key: 'requestId' },
    { label: 'Trace ID', key: 'traceId', isTrace: true },
    { label: 'Tool Name', key: 'toolName' },
    { label: 'Import Job ID', key: 'importJobId' },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text className={styles.title}>Application Logs</Text>
      </div>
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <Text size={200} weight="semibold">From:</Text>
          <Input
            type="date"
            size="small"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ width: 140 }}
          />
        </div>
        <div className={styles.filterGroup}>
          <Text size={200} weight="semibold">To:</Text>
          <Input
            type="date"
            size="small"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ width: 140 }}
          />
        </div>
        <div className={styles.filterGroup}>
          <Text size={200} weight="semibold">Level:</Text>
          <Select
            size="small"
            value={level}
            onChange={(e, data) => setLevel(data.value)}
            style={{ minWidth: 100 }}
          >
            <option value="">All</option>
            <option value="error">Error</option>
            <option value="warn">Warn</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </Select>
        </div>
        <div className={styles.filterGroup}>
          <Text size={200} weight="semibold">Source:</Text>
          <Select
            size="small"
            value={source}
            onChange={(e, data) => setSource(data.value)}
            style={{ minWidth: 120 }}
          >
            <option value="">All</option>
            {sources.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </div>
        <div className={styles.filterGroup}>
          <Input
            size="small"
            placeholder="Search messages..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            contentBefore={<SearchRegular />}
            style={{ minWidth: 180 }}
          />
        </div>
        {traceIdFilter && (
          <div
            className={styles.traceChip}
            onClick={() => setTraceIdFilter('')}
            title="Click to clear trace filter"
          >
            Trace: {traceIdFilter.slice(0, 8)}
            <DismissCircleRegular style={{ fontSize: '14px' }} />
          </div>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div className={styles.loading}>
            <Spinner label="Loading..." />
          </div>
        ) : entries.length === 0 ? (
          <div className={styles.empty}>
            <Text>No log entries found.</Text>
          </div>
        ) : (
          <DataGrid
            items={pageItems}
            columns={columns}
            sortable
            getRowId={(item, index) => `${item.timestamp}-${index}`}
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
                  className={styles.clickableRow}
                  onClick={() => setSelectedEntry(item)}
                >
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
      <div className={styles.summary}>
        <div className={styles.summaryItem}>
          <Text className={styles.summaryLabel}>Entries</Text>
          <Text className={styles.summaryValue}>{total.toLocaleString()}</Text>
        </div>
      </div>

      {/* Detail Panel */}
      <OverlayDrawer
        position="end"
        size="medium"
        open={!!selectedEntry}
        onOpenChange={(_, data) => { if (!data.open) setSelectedEntry(null); }}
      >
        <DrawerHeader>
          <DrawerHeaderTitle
            action={
              <Button
                appearance="subtle"
                icon={<DismissRegular />}
                onClick={() => setSelectedEntry(null)}
              />
            }
          >
            {selectedEntry && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{formatTimestamp(selectedEntry.timestamp)}</span>
                <Badge
                  appearance="filled"
                  color={levelColors[selectedEntry.level] || 'informative'}
                  size="small"
                >
                  {(selectedEntry?.level || '').toUpperCase()}
                </Badge>
              </div>
            )}
          </DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody>
          {selectedEntry && (
            <>
              <div className={styles.section}>
                <Text className={styles.sectionTitle}>Fields</Text>
                {detailFields.map(({ label, key, format, isTrace }) => {
                  const value = selectedEntry[key];
                  if (!value) return null;
                  return (
                    <div key={key} className={styles.drawerField}>
                      <Text className={styles.drawerLabel}>{label}</Text>
                      {isTrace ? (
                        <span
                          className={styles.traceLink}
                          onClick={() => handleTraceClick(value)}
                        >
                          {value}
                        </span>
                      ) : (
                        <Text className={styles.drawerValue}>
                          {format ? format(value) : value}
                        </Text>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className={styles.section}>
                <Text className={styles.sectionTitle}>Message</Text>
                <pre className={styles.pre}>{selectedEntry.message}</pre>
              </div>

              <div className={styles.section}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <Text className={styles.sectionTitle} style={{ marginBottom: 0 }}>Raw JSON</Text>
                  <Button
                    size="small"
                    appearance="subtle"
                    icon={<CopyRegular />}
                    onClick={() => navigator.clipboard.writeText(JSON.stringify(selectedEntry, null, 2))}
                  >
                    Copy JSON
                  </Button>
                </div>
                <pre className={styles.pre}>
                  {JSON.stringify(selectedEntry, null, 2)}
                </pre>
              </div>
            </>
          )}
        </DrawerBody>
      </OverlayDrawer>
    </div>
  );
}
