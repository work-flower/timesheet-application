import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  Select,
  Badge,
} from '@fluentui/react-components';
import CommandBar from '../../components/CommandBar.jsx';
import EntityGrid from '../../components/EntityGrid.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
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
});

const statusColors = {
  processing: 'brand',
  ready_for_review: 'warning',
  committed: 'success',
  abandoned: 'subtle',
  failed: 'danger',
};

const statusLabels = {
  processing: 'Processing',
  ready_for_review: 'Ready for Review',
  committed: 'Committed',
  abandoned: 'Abandoned',
  failed: 'Failed',
};

const columns = [
  { key: 'filename', label: 'Filename' },
  { key: 'accountName', label: 'Account Name' },
  {
    key: 'status',
    label: 'Status',
    render: (item) => (
      <Badge appearance="filled" color={statusColors[item.status] || 'informative'} size="small">
        {statusLabels[item.status] || item.status}
      </Badge>
    ),
  },
  {
    key: 'stagedCount',
    label: 'Staged',
    compare: (a, b) => (a.stagedCount || 0) - (b.stagedCount || 0),
    render: (item) => item.stagedCount ?? '—',
  },
  {
    key: 'committedCount',
    label: 'Committed',
    compare: (a, b) => (a.committedCount || 0) - (b.committedCount || 0),
    render: (item) => item.committedCount ?? '—',
  },
  {
    key: 'createdAt',
    label: 'Created',
    compare: (a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''),
    render: (item) => item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB') : '—',
  },
];

const terminalStatuses = new Set(['committed', 'abandoned', 'failed']);

export default function ImportJobList() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [allJobs, setAllJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(() => localStorage.getItem('importJobs.status') || '');
  const [accountFilter, setAccountFilter] = useState(() => localStorage.getItem('importJobs.accountName') || '');
  const [selected, setSelected] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => { localStorage.setItem('importJobs.status', statusFilter); }, [statusFilter]);
  useEffect(() => { localStorage.setItem('importJobs.accountName', accountFilter); }, [accountFilter]);

  // Fetch all jobs once for account name dropdown
  useEffect(() => {
    importJobsApi.getAll().then(setAllJobs);
  }, []);

  // Fetch filtered jobs
  useEffect(() => {
    setLoading(true);
    const params = {};
    if (statusFilter) params.status = statusFilter;
    if (accountFilter) params.accountName = accountFilter;
    importJobsApi.getAll(params)
      .then(setJobs)
      .finally(() => setLoading(false));
  }, [statusFilter, accountFilter]);

  const accountNames = useMemo(() => {
    const names = new Set(allJobs.map(j => j.accountName).filter(Boolean));
    return [...names].sort();
  }, [allJobs]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await importJobsApi.delete(deleteTarget);
      setJobs((prev) => prev.filter((j) => j._id !== deleteTarget));
      setAllJobs((prev) => prev.filter((j) => j._id !== deleteTarget));
    } catch (err) {
      alert(err.message);
    }
    setDeleteTarget(null);
    setSelected(new Set());
  };

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
          <option value="committed">Committed</option>
          <option value="abandoned">Abandoned</option>
          <option value="failed">Failed</option>
        </Select>

        <Text size={200} weight="semibold" style={{ marginLeft: 12 }}>Account:</Text>
        <Select
          size="small"
          value={accountFilter}
          onChange={(e, data) => setAccountFilter(data.value)}
          style={{ minWidth: 160 }}
        >
          <option value="">All Accounts</option>
          {accountNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </Select>
      </div>
      <EntityGrid
        columns={columns}
        items={jobs}
        loading={loading}
        emptyMessage="No import jobs found."
        onRowClick={(item) => navigate(`/import-jobs/${item._id}`)}
        selectedIds={selected}
        onSelectionChange={setSelected}
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
