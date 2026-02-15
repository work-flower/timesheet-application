import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
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
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import PaginationControls from '../../components/PaginationControls.jsx';
import { usePagination } from '../../hooks/usePagination.js';
import { importJobsApi } from '../../api/index.js';

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

const statusColors = {
  processing: 'brand',
  ready_for_review: 'warning',
  abandoned: 'subtle',
  failed: 'danger',
};

const statusLabels = {
  processing: 'Processing',
  ready_for_review: 'Ready for Review',
  abandoned: 'Abandoned',
  failed: 'Failed',
};

const columns = [
  createTableColumn({
    columnId: 'filename',
    compare: (a, b) => (a.filename || '').localeCompare(b.filename || ''),
    renderHeaderCell: () => 'Filename',
    renderCell: (item) => (
      <TableCellLayout>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {item.filename}
        </span>
      </TableCellLayout>
    ),
  }),
  createTableColumn({
    columnId: 'status',
    compare: (a, b) => (a.status || '').localeCompare(b.status || ''),
    renderHeaderCell: () => 'Status',
    renderCell: (item) => (
      <TableCellLayout>
        <Badge appearance="filled" color={statusColors[item.status] || 'informative'} size="small">
          {statusLabels[item.status] || item.status}
        </Badge>
      </TableCellLayout>
    ),
  }),
  createTableColumn({
    columnId: 'createdAt',
    compare: (a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''),
    renderHeaderCell: () => 'Created',
    renderCell: (item) => (
      <TableCellLayout>
        {item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB') : '—'}
      </TableCellLayout>
    ),
  }),
];

const terminalStatuses = new Set(['abandoned', 'failed']);

export default function ImportJobList() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(() => localStorage.getItem('importJobs.status') || '');
  const [selected, setSelected] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => { localStorage.setItem('importJobs.status', statusFilter); }, [statusFilter]);

  // Fetch filtered jobs
  useEffect(() => {
    setLoading(true);
    const params = {};
    if (statusFilter) params.status = statusFilter;
    importJobsApi.getAll(params)
      .then(setJobs)
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await importJobsApi.delete(deleteTarget);
      setJobs((prev) => prev.filter((j) => j._id !== deleteTarget));
    } catch (err) {
      alert(err.message);
    }
    setDeleteTarget(null);
    setSelected(new Set());
  };

  const { pageItems, page, pageSize, setPage, setPageSize, totalPages, totalItems } = usePagination(jobs);

  const selectedId = selected.size === 1 ? [...selected][0] : null;
  const selectedJob = selectedId ? jobs.find(j => j._id === selectedId) : null;
  const canDelete = selectedJob && terminalStatuses.has(selectedJob.status);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text className={styles.title}>Import Transactions</Text>
      </div>
      <CommandBar
        onNew={() => navigate('/import-jobs/new')}
        newLabel="New Import Job"
        onDelete={canDelete ? () => setDeleteTarget(selectedId) : undefined}
        deleteDisabled={!canDelete}
      />
      <div className={styles.filters}>
        <Text size={200} weight="semibold">Status:</Text>
        <Select
          size="small"
          value={statusFilter}
          onChange={(e, data) => setStatusFilter(data.value)}
          style={{ minWidth: 160 }}
        >
          <option value="">All</option>
          <option value="processing">Processing</option>
          <option value="ready_for_review">Ready for Review</option>
          <option value="abandoned">Abandoned</option>
          <option value="failed">Failed</option>
        </Select>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div className={styles.loading}>
            <Spinner label="Loading..." />
          </div>
        ) : !jobs || jobs.length === 0 ? (
          <div className={styles.empty}>
            <Text>No import jobs found.</Text>
          </div>
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
                {({ renderHeaderCell }) => (
                  <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                )}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody>
              {({ item, rowId }) => (
                <DataGridRow
                  key={rowId}
                  className={styles.row}
                  onClick={() => navigate(`/import-jobs/${item._id}`)}
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
      {jobs.length > 0 && (
        <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Jobs</Text>
            <Text className={styles.summaryValue}>{jobs.length}</Text>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Import Job"
        message="Are you sure you want to delete this import job?"
      />
    </div>
  );
}
