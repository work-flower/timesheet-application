import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  ToggleButton,
  Select,
  Badge,
} from '@fluentui/react-components';
import CommandBar from '../../components/CommandBar.jsx';
import EntityGrid from '../../components/EntityGrid.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { invoicesApi, clientsApi } from '../../api/index.js';

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
  draft: 'informative',
  confirmed: 'warning',
  posted: 'success',
};

const paymentColors = {
  unpaid: 'warning',
  paid: 'success',
  overdue: 'danger',
};

const columns = [
  {
    key: 'invoiceNumber',
    label: 'Invoice #',
    compare: (a, b) => (a.invoiceNumber || '').localeCompare(b.invoiceNumber || ''),
    render: (item) => item.invoiceNumber || 'Draft',
  },
  { key: 'invoiceDate', label: 'Date', compare: (a, b) => (a.invoiceDate || '').localeCompare(b.invoiceDate || '') },
  { key: 'clientName', label: 'Client' },
  {
    key: 'period',
    label: 'Period',
    render: (item) => item.servicePeriodStart && item.servicePeriodEnd
      ? `${item.servicePeriodStart} – ${item.servicePeriodEnd}`
      : '—',
  },
  {
    key: 'status',
    label: 'Status',
    render: (item) => (
      <Badge appearance="filled" color={statusColors[item.status] || 'informative'} size="small">
        {item.status?.charAt(0).toUpperCase() + item.status?.slice(1)}
      </Badge>
    ),
  },
  {
    key: 'total',
    label: 'Amount',
    compare: (a, b) => (a.total || 0) - (b.total || 0),
    render: (item) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(item.total || 0),
  },
  {
    key: 'paymentStatus',
    label: 'Payment',
    render: (item) => item.status === 'posted' ? (
      <Badge appearance="filled" color={paymentColors[item.paymentStatus] || 'informative'} size="small">
        {item.paymentStatus?.charAt(0).toUpperCase() + item.paymentStatus?.slice(1)}
      </Badge>
    ) : '—',
  },
];

export default function InvoiceList() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [statusFilter, setStatusFilter] = useState(() => localStorage.getItem('invoices.status') || '');
  const [clientId, setClientId] = useState(() => localStorage.getItem('invoices.clientId') || '');
  const [paymentFilter, setPaymentFilter] = useState(() => localStorage.getItem('invoices.payment') || '');
  const [selected, setSelected] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => { localStorage.setItem('invoices.status', statusFilter); }, [statusFilter]);
  useEffect(() => { localStorage.setItem('invoices.clientId', clientId); }, [clientId]);
  useEffect(() => { localStorage.setItem('invoices.payment', paymentFilter); }, [paymentFilter]);

  useEffect(() => {
    clientsApi.getAll().then(setClients);
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (statusFilter) params.status = statusFilter;
    if (clientId) params.clientId = clientId;
    invoicesApi.getAll(params)
      .then(setInvoices)
      .finally(() => setLoading(false));
  }, [statusFilter, clientId]);

  const filteredInvoices = useMemo(() => {
    if (!paymentFilter) return invoices;
    return invoices.filter(inv => inv.paymentStatus === paymentFilter);
  }, [invoices, paymentFilter]);

  const totals = useMemo(() => {
    const totalAmount = filteredInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const unpaidAmount = filteredInvoices
      .filter(inv => inv.status === 'posted' && inv.paymentStatus !== 'paid')
      .reduce((sum, inv) => sum + (inv.total || 0), 0);
    const paidAmount = filteredInvoices
      .filter(inv => inv.paymentStatus === 'paid')
      .reduce((sum, inv) => sum + (inv.total || 0), 0);
    return { totalAmount, unpaidAmount, paidAmount };
  }, [filteredInvoices]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await invoicesApi.delete(deleteTarget);
      setInvoices((prev) => prev.filter((inv) => inv._id !== deleteTarget));
    } catch (err) {
      alert(err.message);
    }
    setDeleteTarget(null);
    setSelected(new Set());
  };

  const selectedId = selected.size === 1 ? [...selected][0] : null;
  const selectedInvoice = selectedId ? invoices.find(i => i._id === selectedId) : null;
  const canDelete = selectedInvoice?.status === 'draft';
  const fmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text className={styles.title}>Invoices</Text>
      </div>
      <CommandBar
        onNew={() => navigate('/invoices/new')}
        newLabel="New Invoice"
        onDelete={canDelete ? () => setDeleteTarget(selectedId) : undefined}
        deleteDisabled={!canDelete}
      />
      <div className={styles.filters}>
        <Text size={200} weight="semibold">Status:</Text>
        <ToggleButton size="small" checked={statusFilter === ''} onClick={() => setStatusFilter('')}>All</ToggleButton>
        <ToggleButton size="small" checked={statusFilter === 'draft'} onClick={() => setStatusFilter('draft')}>Draft</ToggleButton>
        <ToggleButton size="small" checked={statusFilter === 'confirmed'} onClick={() => setStatusFilter('confirmed')}>Confirmed</ToggleButton>
        <ToggleButton size="small" checked={statusFilter === 'posted'} onClick={() => setStatusFilter('posted')}>Posted</ToggleButton>

        <Text size={200} weight="semibold" style={{ marginLeft: 12 }}>Client:</Text>
        <Select
          size="small"
          value={clientId}
          onChange={(e, data) => setClientId(data.value)}
          style={{ minWidth: 160 }}
        >
          <option value="">All Clients</option>
          {clients.map((c) => (
            <option key={c._id} value={c._id}>{c.companyName}</option>
          ))}
        </Select>

        <Text size={200} weight="semibold" style={{ marginLeft: 12 }}>Payment:</Text>
        <Select
          size="small"
          value={paymentFilter}
          onChange={(e, data) => setPaymentFilter(data.value)}
          style={{ minWidth: 120 }}
        >
          <option value="">All</option>
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </Select>
      </div>
      <EntityGrid
        columns={columns}
        items={filteredInvoices}
        loading={loading}
        emptyMessage="No invoices found."
        onRowClick={(item) => navigate(`/invoices/${item._id}`)}
        selectedIds={selected}
        onSelectionChange={setSelected}
      />
      {filteredInvoices.length > 0 && (
        <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Total Amount</Text>
            <Text className={styles.summaryValue}>{fmt.format(totals.totalAmount)}</Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Unpaid</Text>
            <Text className={styles.summaryValue}>{fmt.format(totals.unpaidAmount)}</Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Paid</Text>
            <Text className={styles.summaryValue}>{fmt.format(totals.paidAmount)}</Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Invoices</Text>
            <Text className={styles.summaryValue}>{filteredInvoices.length}</Text>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Invoice"
        message="Are you sure you want to delete this draft invoice?"
      />
    </div>
  );
}
