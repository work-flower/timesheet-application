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
  gridContainer: { flex: 1, overflow: 'hidden', width: '100%' },
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '48px' },
  empty: { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '48px', color: tokens.colorNeutralForeground3 },
  row: { cursor: 'pointer', '&:hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
});

const columns = [
  createTableColumn({
    columnId: 'name',
    compare: (a, b) => a.name.localeCompare(b.name),
    renderHeaderCell: () => 'Project Name',
    renderCell: (item) => <TableCellLayout>{item.name}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'clientName',
    renderHeaderCell: () => 'Client',
    renderCell: (item) => <TableCellLayout>{item.clientName}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'ir35Status',
    renderHeaderCell: () => 'IR35 Status',
    renderCell: (item) => <TableCellLayout>{item.ir35Status?.replace(/_/g, ' ')}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'effectiveRate',
    renderHeaderCell: () => 'Rate',
    renderCell: (item) => <TableCellLayout>{`£${item.effectiveRate}/day`}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'status',
    renderHeaderCell: () => 'Status',
    renderCell: (item) => <TableCellLayout>{item.status === 'active' ? 'Active' : 'Archived'}</TableCellLayout>,
  }),
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
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div className={styles.loading}><Spinner label="Loading..." /></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}><Text>No projects found. Click 'New Project' to create one.</Text></div>
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
                <DataGridRow key={rowId} className={styles.row} onClick={() => navigate(`/projects/${item._id}`)}>
                  {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        )}
      </div>
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
