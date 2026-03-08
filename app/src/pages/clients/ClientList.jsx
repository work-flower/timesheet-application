import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
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
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import PaginationControls from '../../components/PaginationControls.jsx';
import ViewToggle from '../../components/ViewToggle.jsx';
import ListView from '../../components/ListView.jsx';
import CardView, { CardMetaItem } from '../../components/CardView.jsx';
import { usePagination } from '../../hooks/usePagination.js';
import { useListState } from '../../hooks/useListState.js';
import { clientsApi } from '../../api/index.js';

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
  companyName: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
  },
  contactText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  dot: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  rateText: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    minWidth: '80px',
    textAlign: 'right',
  },
});

const columns = [
  createTableColumn({
    columnId: 'companyName',
    compare: (a, b) => a.companyName.localeCompare(b.companyName),
    renderHeaderCell: () => 'Company Name',
    renderCell: (item) => <TableCellLayout>{item.companyName}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'primaryContactName',
    compare: (a, b) => (a.primaryContactName || '').localeCompare(b.primaryContactName || ''),
    renderHeaderCell: () => 'Primary Contact',
    renderCell: (item) => <TableCellLayout>{item.primaryContactName}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'primaryContactEmail',
    compare: (a, b) => (a.primaryContactEmail || '').localeCompare(b.primaryContactEmail || ''),
    renderHeaderCell: () => 'Email',
    renderCell: (item) => <TableCellLayout>{item.primaryContactEmail}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'defaultRate',
    compare: (a, b) => (a.defaultRate || 0) - (b.defaultRate || 0),
    renderHeaderCell: () => 'Default Rate',
    renderCell: (item) => <TableCellLayout>{item.defaultRate ? `£${item.defaultRate}/day` : '—'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'currency',
    compare: (a, b) => (a.currency || '').localeCompare(b.currency || ''),
    renderHeaderCell: () => 'Currency',
    renderCell: (item) => <TableCellLayout>{item.currency}</TableCellLayout>,
  }),
];

export default function ClientList() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useListState('clients', { viewMode: 'grid', page: 1, pageSize: 25 });
  const { viewMode } = filters;
  const [selected, setSelected] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    clientsApi.getAll()
      .then(setClients)
      .finally(() => setLoading(false));
  }, []);

  const filtered = clients.filter((c) =>
    !search || c.companyName.toLowerCase().includes(search.toLowerCase()) ||
    c.primaryContactName?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await clientsApi.delete(deleteTarget);
    setClients((prev) => prev.filter((c) => c._id !== deleteTarget));
    setDeleteTarget(null);
    setSelected(new Set());
  };

  const { pageItems, page, pageSize, setPage, setPageSize, totalPages, totalItems } = usePagination(filtered, {
    page: filters.page, pageSize: filters.pageSize,
    onPageChange: (p) => setFilters({ page: p }),
    onPageSizeChange: (ps) => setFilters({ pageSize: ps, page: 1 }),
  });

  const selectedId = selected.size === 1 ? [...selected][0] : null;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text className={styles.title}>Clients</Text>
      </div>
      <CommandBar
        onNew={() => navigate('/clients/new')}
        newLabel="New Client"
        onDelete={selectedId ? () => setDeleteTarget(selectedId) : undefined}
        deleteDisabled={!selectedId}
        searchValue={search}
        onSearchChange={setSearch}
      />
      <div className={styles.filters}>
        <div style={{ marginLeft: 'auto' }}>
          <ViewToggle value={viewMode} onChange={(v) => setFilters({ viewMode: v })} />
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div className={styles.loading}><Spinner label="Loading..." /></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}><Text>No clients found. Click 'New Client' to create one.</Text></div>
        ) : viewMode === 'grid' ? (
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
                <DataGridRow
                  key={rowId}
                  className={styles.row}
                  onClick={() => navigate(`/clients/${item._id}`)}
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
            onItemClick={(item) => navigate(`/clients/${item._id}`)}
            renderTopLine={(item) => (
              <>
                <Text className={styles.companyName}>{item.companyName}</Text>
                {item.isLocked && (
                  <Badge size="small" appearance="filled" color="informative">{item.isLockedReason}</Badge>
                )}
                {item.primaryContactName && (
                  <>
                    <Text className={styles.dot}>·</Text>
                    <Text className={styles.contactText}>{item.primaryContactName}</Text>
                  </>
                )}
              </>
            )}
            renderActions={(item) => (
              <Text className={styles.rateText}>
                {item.defaultRate ? `£${item.defaultRate}/day` : '—'}
              </Text>
            )}
            renderBottomLine={(item) => item.primaryContactEmail ? (
              <Text className={styles.contactText}>{item.primaryContactEmail}</Text>
            ) : null}
          />
        ) : (
          <CardView
            items={pageItems}
            getRowId={(item) => item._id}
            onItemClick={(item) => navigate(`/clients/${item._id}`)}
            renderHeader={(item) => (
              <>
                <Text className={styles.companyName}>{item.companyName}</Text>
                {item.isLocked && (
                  <Badge size="small" appearance="filled" color="informative">{item.isLockedReason}</Badge>
                )}
              </>
            )}
            renderMeta={(item) => (
              <>
                <CardMetaItem label="Contact" value={item.primaryContactName || '—'} />
                <CardMetaItem label="Rate" value={item.defaultRate ? `£${item.defaultRate}/day` : '—'} />
                <CardMetaItem label="Currency" value={item.currency || '—'} />
              </>
            )}
            renderFooter={(item) => item.primaryContactEmail ? (
              <Text className={styles.contactText}>{item.primaryContactEmail}</Text>
            ) : null}
          />
        )}
      </div>
      <PaginationControls
        page={page} pageSize={pageSize} totalItems={totalItems}
        totalPages={totalPages} onPageChange={setPage} onPageSizeChange={setPageSize}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Client"
        message="Are you sure you want to delete this client? All associated projects and timesheet entries will also be deleted."
      />
    </div>
  );
}
