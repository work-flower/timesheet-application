import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
} from '@fluentui/react-components';
import CommandBar from '../../components/CommandBar.jsx';
import EntityGrid from '../../components/EntityGrid.jsx';
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
});

const columns = [
  { key: 'companyName', label: 'Company Name', compare: (a, b) => a.companyName.localeCompare(b.companyName) },
  { key: 'primaryContactName', label: 'Primary Contact' },
  { key: 'primaryContactEmail', label: 'Email' },
  { key: 'defaultRate', label: 'Default Rate', render: (item) => item.defaultRate ? `£${item.defaultRate}/day` : '—' },
  { key: 'currency', label: 'Currency' },
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
      <EntityGrid
        columns={columns}
        items={filtered}
        loading={loading}
        emptyMessage="No clients found. Click 'New Client' to create one."
        onRowClick={(item) => navigate(`/clients/${item._id}`)}
        selectedIds={selected}
        onSelectionChange={setSelected}
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
