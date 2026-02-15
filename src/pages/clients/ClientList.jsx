import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
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
  gridContainer: {
    flex: 1,
    overflow: 'hidden',
    width: '100%',
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

const columns = [
  createTableColumn({
    columnId: 'companyName',
    compare: (a, b) => a.companyName.localeCompare(b.companyName),
    renderHeaderCell: () => 'Company Name',
    renderCell: (item) => <TableCellLayout>{item.companyName}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'primaryContactName',
    renderHeaderCell: () => 'Primary Contact',
    renderCell: (item) => <TableCellLayout>{item.primaryContactName}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'primaryContactEmail',
    renderHeaderCell: () => 'Email',
    renderCell: (item) => <TableCellLayout>{item.primaryContactEmail}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'defaultRate',
    renderHeaderCell: () => 'Default Rate',
    renderCell: (item) => <TableCellLayout>{item.defaultRate ? `£${item.defaultRate}/day` : '—'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'currency',
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
      {loading ? (
        <div className={styles.loading}><Spinner label="Loading..." /></div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}><Text>No clients found. Click 'New Client' to create one.</Text></div>
      ) : (
        <DataGrid
          items={filtered}
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
      )}
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
