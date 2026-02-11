import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  ToggleButton,
  Select,
} from '@fluentui/react-components';
import CommandBar from '../../components/CommandBar.jsx';
import EntityGrid from '../../components/EntityGrid.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { timesheetsApi, clientsApi, projectsApi } from '../../api/index.js';

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

const columns = [
  { key: 'date', label: 'Date', compare: (a, b) => a.date.localeCompare(b.date) },
  { key: 'clientName', label: 'Client' },
  { key: 'projectName', label: 'Project' },
  { key: 'hours', label: 'Hours' },
  {
    key: 'days',
    label: 'Days',
    render: (item) => (item.days != null ? item.days.toFixed(2) : '—'),
  },
  {
    key: 'amount',
    label: 'Amount',
    render: (item) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(item.amount || 0),
  },
  { key: 'notes', label: 'Notes' },
];

export default function TimesheetList() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('week');
  const [selected, setSelected] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [clients, setClients] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');

  const filteredProjects = useMemo(
    () => clientId ? allProjects.filter((p) => p.clientId === clientId) : allProjects,
    [allProjects, clientId],
  );

  useEffect(() => {
    Promise.all([clientsApi.getAll(), projectsApi.getAll()])
      .then(([c, p]) => { setClients(c); setAllProjects(p); });
  }, []);

  const dateRange = useMemo(() => {
    if (range === 'week') return getWeekRange();
    if (range === 'month') return getMonthRange();
    return {};
  }, [range]);

  useEffect(() => {
    setLoading(true);
    const params = { ...dateRange };
    if (clientId) params.clientId = clientId;
    if (projectId) params.projectId = projectId;
    timesheetsApi.getAll(params)
      .then(setEntries)
      .finally(() => setLoading(false));
  }, [dateRange, clientId, projectId]);

  const totals = useMemo(() => {
    const totalHours = entries.reduce((sum, e) => sum + (e.hours || 0), 0);
    const totalDays = entries.reduce((sum, e) => sum + (e.days || 0), 0);
    const totalAmount = entries.reduce((sum, e) => sum + (e.amount || 0), 0);
    return { totalHours, totalDays, totalAmount };
  }, [entries]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await timesheetsApi.delete(deleteTarget);
    setEntries((prev) => prev.filter((e) => e._id !== deleteTarget));
    setDeleteTarget(null);
    setSelected(new Set());
  };

  const selectedId = selected.size === 1 ? [...selected][0] : null;
  const fmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text className={styles.title}>Timesheets</Text>
      </div>
      <CommandBar
        onNew={() => navigate('/timesheets/new')}
        newLabel="New Entry"
        onDelete={selectedId ? () => setDeleteTarget(selectedId) : undefined}
        deleteDisabled={!selectedId}
      />
      <div className={styles.filters}>
        <Text size={200} weight="semibold">Period:</Text>
        <ToggleButton size="small" checked={range === 'week'} onClick={() => setRange('week')}>This Week</ToggleButton>
        <ToggleButton size="small" checked={range === 'month'} onClick={() => setRange('month')}>This Month</ToggleButton>
        <ToggleButton size="small" checked={range === 'all'} onClick={() => setRange('all')}>All Time</ToggleButton>
        <Text size={200} weight="semibold" style={{ marginLeft: 12 }}>Client:</Text>
        <Select
          size="small"
          value={clientId}
          onChange={(e, data) => { setClientId(data.value); setProjectId(''); }}
          style={{ minWidth: 160 }}
        >
          <option value="">All Clients</option>
          {clients.map((c) => (
            <option key={c._id} value={c._id}>{c.companyName}</option>
          ))}
        </Select>
        <Text size={200} weight="semibold">Project:</Text>
        <Select
          size="small"
          value={projectId}
          onChange={(e, data) => setProjectId(data.value)}
          style={{ minWidth: 160 }}
        >
          <option value="">All Projects</option>
          {filteredProjects.map((p) => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </Select>
      </div>
      <EntityGrid
        columns={columns}
        items={entries}
        loading={loading}
        emptyMessage="No timesheet entries found for this period."
        onRowClick={(item) => navigate(`/timesheets/${item._id}`)}
        selectedIds={selected}
        onSelectionChange={setSelected}
      />
      {entries.length > 0 && (
        <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Total Hours</Text>
            <Text className={styles.summaryValue}>{totals.totalHours}</Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Total Days</Text>
            <Text className={styles.summaryValue}>{totals.totalDays.toFixed(2)}</Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Total Amount</Text>
            <Text className={styles.summaryValue}>{fmt.format(totals.totalAmount)}</Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Entries</Text>
            <Text className={styles.summaryValue}>{entries.length}</Text>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Timesheet Entry"
        message="Are you sure you want to delete this timesheet entry?"
      />
    </div>
  );
}
