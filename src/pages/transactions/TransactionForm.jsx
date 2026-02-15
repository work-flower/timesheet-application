import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Field,
  Spinner,
  MessageBar,
  MessageBarBody,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbDivider,
  BreadcrumbButton,
  Select,
  Textarea,
  Button,
  Badge,
  Link,
  Tooltip,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableCellLayout,
  createTableColumn,
  Radio,
  SearchBox,
} from '@fluentui/react-components';
import { SaveRegular, AddRegular, LinkRegular } from '@fluentui/react-icons';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import { transactionsApi, invoicesApi } from '../../api/index.js';
import { useFormTracker } from '../../hooks/useFormTracker.js';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx';

const useStyles = makeStyles({
  page: {},
  pageBody: { padding: '16px 24px' },
  header: { marginBottom: '16px' },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase500,
    display: 'block',
    marginBottom: '4px',
  },
  message: { marginBottom: '16px' },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '48px',
  },
  sourceSection: {
    marginTop: '8px',
    padding: '12px',
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    maxHeight: '300px',
    overflow: 'auto',
  },
});

const fmtGBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

const invoiceStatusColors = {
  draft: 'warning',
  confirmed: 'informative',
  posted: 'success',
};

const invoiceColumns = [
  createTableColumn({
    columnId: 'invoiceNumber',
    compare: (a, b) => (a.invoiceNumber || '').localeCompare(b.invoiceNumber || ''),
    renderHeaderCell: () => 'Invoice #',
    renderCell: (item) => <TableCellLayout>{item.invoiceNumber || '\u2014'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'clientName',
    compare: (a, b) => (a.clientName || '').localeCompare(b.clientName || ''),
    renderHeaderCell: () => 'Client',
    renderCell: (item) => <TableCellLayout>{item.clientName || '\u2014'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'invoiceDate',
    compare: (a, b) => (a.invoiceDate || '').localeCompare(b.invoiceDate || ''),
    renderHeaderCell: () => 'Date',
    renderCell: (item) => <TableCellLayout>{item.invoiceDate || '\u2014'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'total',
    compare: (a, b) => (a.total || 0) - (b.total || 0),
    renderHeaderCell: () => 'Total',
    renderCell: (item) => <TableCellLayout>{fmtGBP.format(item.total || 0)}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'status',
    compare: (a, b) => (a.status || '').localeCompare(b.status || ''),
    renderHeaderCell: () => 'Status',
    renderCell: (item) => (
      <TableCellLayout>
        <Badge appearance="filled" color={invoiceStatusColors[item.status] || 'informative'} size="small">
          {item.status}
        </Badge>
      </TableCellLayout>
    ),
  }),
];

const statusColors = {
  matched: 'success',
  unmatched: 'warning',
  ignored: 'subtle',
};

export default function TransactionForm() {
  const styles = useStyles();
  const { id } = useParams();
  const navigate = useNavigate();
  const { registerGuard, guardedNavigate } = useUnsavedChanges();

  const { form, setForm, setBase, isDirty, changedFields } = useFormTracker({
    status: 'unmatched',
    ignoreReason: '',
  });

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [saving, setSaving] = useState(false);

  // Invoice picker state
  const [invoicePickerOpen, setInvoicePickerOpen] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);

  useEffect(() => {
    if (!id) {
      navigate('/transactions');
      return;
    }
    setLoading(true);
    transactionsApi.getById(id)
      .then((result) => {
        setData(result);
        setBase({
          status: result.status || 'unmatched',
          ignoreReason: result.ignoreReason || '',
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, navigate, setBase]);

  const handleChange = (field) => (e, d) => {
    const value = d?.value ?? e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveForm = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = { status: form.status };
      if (form.status === 'ignored') {
        payload.ignoreReason = form.ignoreReason;
      }
      const updated = await transactionsApi.updateMapping(id, payload);
      setData(updated);
      setBase({
        status: updated.status || 'unmatched',
        ignoreReason: updated.ignoreReason || '',
      });
      return { ok: true };
    } catch (err) {
      setError(err.message);
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }, [id, form.status, form.ignoreReason, setBase]);

  const handleSaveStatus = async () => {
    const result = await saveForm();
    if (result.ok) {
      setSuccess('Status updated successfully.');
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handleCreateExpense = () => {
    if (!data) return;
    const params = new URLSearchParams();
    params.set('date', data.date);
    params.set('amount', String(Math.abs(data.amount)));
    params.set('description', data.description || '');
    guardedNavigate(`/expenses/new?${params.toString()}`);
  };

  // Invoice picker
  const handleOpenInvoicePicker = useCallback(async () => {
    setInvoicePickerOpen(true);
    setInvoiceSearch('');
    setSelectedInvoiceId(null);
    setInvoicesLoading(true);
    try {
      const result = await invoicesApi.getAll();
      setInvoices(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setInvoicesLoading(false);
    }
  }, []);

  const filteredInvoices = useMemo(() => {
    if (!invoiceSearch) return invoices;
    const q = invoiceSearch.toLowerCase();
    return invoices.filter((inv) =>
      (inv.invoiceNumber || '').toLowerCase().includes(q) ||
      (inv.clientName || '').toLowerCase().includes(q) ||
      (inv.status || '').toLowerCase().includes(q)
    );
  }, [invoices, invoiceSearch]);

  const handleInvoiceConfirm = async () => {
    if (!selectedInvoiceId) return;
    setError(null);
    setSuccess(null);
    try {
      await invoicesApi.linkTransaction(selectedInvoiceId, id);
      // Update transaction status to matched
      const updated = await transactionsApi.updateMapping(id, { status: 'matched' });
      setData(updated);
      setBase({
        status: updated.status || 'unmatched',
        ignoreReason: updated.ignoreReason || '',
      });
      setSuccess('Transaction linked to invoice successfully.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setInvoicePickerOpen(false);
    }
  };

  // Navigation guard
  useEffect(() => {
    return registerGuard({ isDirty, onSave: saveForm });
  }, [isDirty, saveForm, registerGuard]);

  if (loading) {
    return (
      <div className={styles.page}>
        <FormCommandBar onBack={() => guardedNavigate('/transactions')} />
        <div className={styles.loading}><Spinner label="Loading..." /></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.page}>
        <FormCommandBar onBack={() => guardedNavigate('/transactions')} />
        <div className={styles.pageBody}>
          <MessageBar intent="error" className={styles.message}>
            <MessageBarBody>Transaction not found.</MessageBarBody>
          </MessageBar>
        </div>
      </div>
    );
  }

  const isDebit = data.amount < 0;

  return (
    <div className={styles.page}>
      <FormCommandBar
        onBack={() => guardedNavigate('/transactions')}
        locked
      >
        <Button
          appearance="primary"
          icon={<SaveRegular />}
          onClick={handleSaveStatus}
          disabled={saving || (form.status === 'ignored' && !form.ignoreReason.trim())}
          size="small"
        >
          {saving ? 'Saving...' : 'Save Status'}
        </Button>
        <Tooltip
          content="Only debit transactions (negative amounts) can be converted to expenses"
          relationship="description"
          withArrow
        >
          <Button
            appearance="outline"
            icon={<AddRegular />}
            onClick={handleCreateExpense}
            disabled={!isDebit}
            size="small"
          >
            Create Expense
          </Button>
        </Tooltip>
        <Tooltip
          content="Only credit transactions (positive amounts) can be linked to invoices"
          relationship="description"
          withArrow
        >
          <Button
            appearance="outline"
            icon={<LinkRegular />}
            onClick={handleOpenInvoicePicker}
            disabled={isDebit}
            size="small"
          >
            Link to Invoice
          </Button>
        </Tooltip>
      </FormCommandBar>

      <div className={styles.pageBody}>
        <div className={styles.header}>
          <Breadcrumb>
            <BreadcrumbItem>
              <BreadcrumbButton onClick={() => guardedNavigate('/transactions')}>Transactions</BreadcrumbButton>
            </BreadcrumbItem>
            <BreadcrumbDivider />
            <BreadcrumbItem>
              <BreadcrumbButton current>{data.description || 'Transaction'}</BreadcrumbButton>
            </BreadcrumbItem>
          </Breadcrumb>
          <Text className={styles.title}>Transaction Details</Text>
        </div>

        {error && (
          <MessageBar intent="error" className={styles.message}>
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}
        {success && (
          <MessageBar intent="success" className={styles.message}>
            <MessageBarBody>{success}</MessageBarBody>
          </MessageBar>
        )}

        <MessageBar intent="warning" className={styles.message}>
          <MessageBarBody>Transactions are read-only by default. Only the status can be changed below.</MessageBarBody>
        </MessageBar>

        {/* Section 1: Read-only transaction details */}
        <fieldset disabled style={{ border: 'none', padding: 0, margin: 0, opacity: 0.6 }}>
          <FormSection title="Transaction Details">
            <FormField>
              <Field label="Date">
                <Input value={data.date || ''} readOnly />
              </Field>
            </FormField>
            <FormField>
              <Field label="Amount">
                <Input
                  value={fmtGBP.format(data.amount)}
                  readOnly
                  style={{ color: data.amount >= 0 ? '#107C10' : '#D13438' }}
                />
              </Field>
            </FormField>
            <FormField fullWidth>
              <Field label="Description">
                <Input value={data.description || ''} readOnly />
              </Field>
            </FormField>
            <FormField>
              <Field label="Reference">
                <Input value={data.reference || '\u2014'} readOnly />
              </Field>
            </FormField>
            <FormField>
              <Field label="Account Name">
                <Input value={data.accountName || '\u2014'} readOnly />
              </Field>
            </FormField>
            <FormField>
              <Field label="Account Number">
                <Input value={data.accountNumber || '\u2014'} readOnly />
              </Field>
            </FormField>
            <FormField>
              <Field label="Import Job">
                {data.importJobId ? (
                  <Link onClick={() => guardedNavigate(`/import-jobs/${data.importJobId}`)}>
                    {data.importJobId}
                  </Link>
                ) : (
                  <Text>{'\u2014'}</Text>
                )}
              </Field>
            </FormField>
            <FormField>
              <Field label="Current Status">
                <Badge appearance="filled" color={statusColors[data.status] || 'informative'} size="medium">
                  {data.status}
                </Badge>
              </Field>
            </FormField>
          </FormSection>

          {data.source && (
            <FormSection title="Source Details">
              <FormField fullWidth>
                <div className={styles.sourceSection}>
                  {JSON.stringify(data.source, null, 2)}
                </div>
              </FormField>
            </FormSection>
          )}
        </fieldset>

        {/* Section 2: Editable status mapping */}
        <FormSection title="Status & Mapping">
          <FormField changed={changedFields.has('status')}>
            <Field label="Status">
              <Select value={form.status} onChange={handleChange('status')}>
                <option value="unmatched">Unmatched</option>
                <option value="matched">Matched</option>
                <option value="ignored">Ignored</option>
              </Select>
            </Field>
          </FormField>
          {form.status === 'ignored' && (
            <FormField fullWidth changed={changedFields.has('ignoreReason')}>
              <Field label="Ignore Reason" required>
                <Textarea
                  value={form.ignoreReason}
                  onChange={handleChange('ignoreReason')}
                  placeholder="Why is this transaction being ignored?"
                  resize="vertical"
                  rows={3}
                />
              </Field>
            </FormField>
          )}
        </FormSection>

      </div>

      {/* Invoice Picker Dialog */}
      <Dialog open={invoicePickerOpen} onOpenChange={(e, d) => { if (!d.open) setInvoicePickerOpen(false); }}>
        <DialogSurface style={{ maxWidth: '800px', width: '90vw' }}>
          <DialogBody>
            <DialogTitle>Link to Invoice</DialogTitle>
            <DialogContent>
              <div style={{ marginBottom: '12px' }}>
                <SearchBox
                  placeholder="Search by invoice number, client, or status..."
                  value={invoiceSearch}
                  onChange={(e, d) => setInvoiceSearch(d.value)}
                  size="small"
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ maxHeight: '400px', overflow: 'auto' }}>
                {invoicesLoading ? (
                  <div style={{ padding: '24px', textAlign: 'center' }}>
                    <Spinner size="small" label="Loading invoices..." />
                  </div>
                ) : filteredInvoices.length === 0 ? (
                  <Text style={{ padding: '16px', color: tokens.colorNeutralForeground3 }}>
                    No invoices found.
                  </Text>
                ) : (
                  <DataGrid
                    items={filteredInvoices}
                    columns={invoiceColumns}
                    sortable
                    getRowId={(item) => item._id}
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
                          style={{
                            cursor: 'pointer',
                            backgroundColor: selectedInvoiceId === item._id ? tokens.colorBrandBackground2 : undefined,
                          }}
                          onClick={() => setSelectedInvoiceId(item._id)}
                        >
                          {({ renderCell }) => (
                            <DataGridCell>
                              {renderCell(item)}
                            </DataGridCell>
                          )}
                        </DataGridRow>
                      )}
                    </DataGridBody>
                  </DataGrid>
                )}
              </div>
              {selectedInvoiceId && (
                <Text style={{ marginTop: '8px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 }}>
                  Selected: {invoices.find((i) => i._id === selectedInvoiceId)?.invoiceNumber || selectedInvoiceId}
                </Text>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setInvoicePickerOpen(false)}>Cancel</Button>
              <Button appearance="primary" onClick={handleInvoiceConfirm} disabled={!selectedInvoiceId}>Confirm</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
