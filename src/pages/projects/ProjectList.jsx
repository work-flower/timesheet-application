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
import { projectsApi } from '../../api/index.js';

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
  { key: 'name', label: 'Project Name', compare: (a, b) => a.name.localeCompare(b.name) },
  { key: 'clientName', label: 'Client' },
  { key: 'ir35Status', label: 'IR35 Status', render: (item) => item.ir35Status?.replace(/_/g, ' ') },
  { key: 'effectiveRate', label: 'Rate', render: (item) => `£${item.effectiveRate}/day` },
  { key: 'status', label: 'Status', render: (item) => item.status === 'active' ? 'Active' : 'Archived' },
];

export default function ProjectList() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    projectsApi.getAll()
      .then(setProjects)
      .finally(() => setLoading(false));
  }, []);

  const filtered = projects.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.clientName?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await projectsApi.delete(deleteTarget);
      setProjects((prev) => prev.filter((p) => p._id !== deleteTarget));
      setDeleteTarget(null);
      setSelected(new Set());
      setDeleteError(null);
    } catch (err) {
      setDeleteError(err.message);
    }
  };

  const selectedId = selected.size === 1 ? [...selected][0] : null;
  const selectedProject = selectedId ? projects.find((p) => p._id === selectedId) : null;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text className={styles.title}>Projects</Text>
      </div>
      <CommandBar
        onNew={() => navigate('/projects/new')}
        newLabel="New Project"
        onDelete={selectedId ? () => {
          if (selectedProject?.isDefault) {
            setDeleteError('Cannot delete the default project.');
            return;
          }
          setDeleteTarget(selectedId);
        } : undefined}
        deleteDisabled={!selectedId}
        searchValue={search}
        onSearchChange={setSearch}
      />
      {deleteError && (
        <div style={{ padding: '8px 16px' }}>
          <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{deleteError}</Text>
        </div>
      )}
      <EntityGrid
        columns={columns}
        items={filtered}
        loading={loading}
        emptyMessage="No projects found. Click 'New Project' to create one."
        onRowClick={(item) => navigate(`/projects/${item._id}`)}
        selectedIds={selected}
        onSelectionChange={setSelected}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Project"
        message="Are you sure you want to delete this project? All associated timesheet entries will also be deleted."
      />
    </div>
  );
}
