import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Field,
  Spinner,
  Select,
  Checkbox,
  Combobox,
  Option,
  Textarea,
  MessageBar,
  MessageBarBody,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbDivider,
  BreadcrumbButton,
  Button,
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
  SearchBox,
} from '@fluentui/react-components';
import { LinkRegular, LinkMultipleRegular, LinkDismissRegular, WarningFilled, ReceiptRegular } from '@fluentui/react-icons';
import { expensesApi, projectsApi, clientsApi, transactionsApi } from '../../api/index.js';
import InvoicePickerDialog from '../../components/InvoicePickerDialog.jsx';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import MarkdownEditor from '../../components/MarkdownEditor.jsx';
import AttachmentGallery from '../../components/AttachmentGallery.jsx';
import { useFormTracker } from '../../hooks/useFormTracker.js';
import { usePagination } from '../../hooks/usePagination.js';
import PaginationControls from '../../components/PaginationControls.jsx';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx';
import useAppNavigate from '../../hooks/useAppNavigate.js';
import { useNotifyParent } from '../../hooks/useNotifyParent.js';
import { deriveVatFromPercent, deriveVatFromAmount } from '../../../../shared/expenseVatCalc.js';
import QueryStringPrefill from '../../components/QueryStringPrefill.jsx';

const useStyles = makeStyles({
  page: {},
  pageBody: {
    padding: '16px 24px',
  },
  header: {
    marginBottom: '16px',
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase500,
    display: 'block',
    marginBottom: '4px',
  },
  message: {
    marginBottom: '16px',
  },
  notes: {
    marginTop: '16px',
  },
  attachments: {
    marginTop: '24px',
  },
  sectionTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    marginBottom: '8px',
  },
  balanceSection: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase300,
    padding: '16px',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  balanceRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
  },
  balanceSubRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '2px 0 2px 24px',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  balanceGroupLabel: {
    fontWeight: tokens.fontWeightSemibold,
    padding: '8px 0 4px 0',
    display: 'flex',
    justifyContent: 'space-between',
  },
  balanceDivider: {
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
    margin: '8px 0',
  },
  balanceTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    fontWeight: tokens.fontWeightBold,
    padding: '4px 0',
    fontSize: tokens.fontSizeBase400,
  },
});

const fmtGBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

const baseTransactionColumns = [
  createTableColumn({
    columnId: 'date',
    compare: (a, b) => (a.date || '').localeCompare(b.date || ''),
    renderHeaderCell: () => 'Date',
    renderCell: (item) => <TableCellLayout>{item.date || '\u2014'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'description',
    compare: (a, b) => (a.description || '').localeCompare(b.description || ''),
    renderHeaderCell: () => 'Description',
    renderCell: (item) => <TableCellLayout>{item.description || '\u2014'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'amount',
    compare: (a, b) => (a.amount || 0) - (b.amount || 0),
    renderHeaderCell: () => 'Amount',
    renderCell: (item) => <TableCellLayout>{fmtGBP.format(Math.abs(item.amount || 0))}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'status',
    compare: (a, b) => (a.status || '').localeCompare(b.status || ''),
    renderHeaderCell: () => 'Status',
    renderCell: (item) => <TableCellLayout>{item.status || '\u2014'}</TableCellLayout>,
  }),
];

export default function ExpenseForm() {
  const styles = useStyles();
  const { id } = useParams();
  const isNew = !id;
  const { registerGuard } = useUnsavedChanges();
  const { navigate, navigateUnguarded, goBack } = useAppNavigate();
  const sourceTransactionIds = useMemo(() => {
    if (!isNew) return [];
    const raw = new URLSearchParams(window.location.search).get('transactionId');
    if (!raw) return [];
    return raw.split(',').filter(Boolean);
  }, [isNew]);

  const today = new Date().toISOString().split('T')[0];

  const { form, setForm, setBase, resetBase, formRef, isDirty, changedFields, base, baseReady } = useFormTracker();
  const notifyParent = useNotifyParent();
  const [initialized, setInitialized] = useState(false);

  const [loadedData, setLoadedData] = useState(null);
  const [allProjects, setAllProjects] = useState([]);
  const [allClients, setAllClients] = useState([]);
  const [expenseTypes, setExpenseTypes] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Transaction picker state
  const [txPickerOpen, setTxPickerOpen] = useState(false);
  const [txList, setTxList] = useState([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txSearch, setTxSearch] = useState('');
  const [selectedTxId, setSelectedTxId] = useState(null);
  const [showLinkedTx, setShowLinkedTx] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState(null);
  const [invoicePickerOpen, setInvoicePickerOpen] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const [projects, clients, types] = await Promise.all([
          projectsApi.getAll(),
          clientsApi.getAll(),
          expensesApi.getTypes(),
        ]);
        const active = projects.filter((p) => p.status === 'active');
        setAllProjects(active);
        setAllClients(clients);
        setExpenseTypes(types);

        const clientLookup = Object.fromEntries(clients.map((c) => [c._id, c]));

        if (!isNew) {
          const data = await expensesApi.getById(id);
          setLoadedData(data);
          setAttachments(data.attachments || []);
          resetBase(data);
        } else if (active.length > 0) {
          const firstProj = active[0];
          const firstClient = clientLookup[firstProj.clientId];
          resetBase({ date: today, billable: true, currency: firstClient?.currency || 'GBP', projectId: firstProj._id });
        } else {
          resetBase({ date: today, billable: true });
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setInitialized(true);
      }
    };
    init();
  }, [id, isNew, resetBase, today]);

  // Group projects by client
  const projectsByClient = useMemo(() => {
    const groups = {};
    for (const p of allProjects) {
      const key = p.clientName || 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    return groups;
  }, [allProjects]);

  const selectedProject = useMemo(
    () => allProjects.find((p) => p._id === form.projectId),
    [form.projectId, allProjects],
  );

  const expenseClientId = selectedProject?.clientId || '';

  // Lookup client currency from project
  const clientMap = useMemo(
    () => Object.fromEntries(allClients.map((c) => [c._id, c])),
    [allClients],
  );

  const handleChange = (field) => (e, data) => {
    const raw = data?.value ?? e.target.value;
    setForm((prev) => {
      const next = { ...prev };
      if (field === 'amount') {
        const val = parseFloat(raw) || 0;
        next.amount = val;
        if ((prev.vatPercent || 0) !== 0) Object.assign(next, deriveVatFromPercent(val, prev.vatPercent));
        else if ((prev.vatAmount || 0) !== 0) Object.assign(next, deriveVatFromAmount(val, prev.vatAmount));
        else next.netAmount = Math.round((val - (prev.vatAmount || 0)) * 100) / 100;
      } else if (field === 'vatPercent') {
        const val = parseFloat(raw) || 0;
        Object.assign(next, deriveVatFromPercent(prev.amount, val));
      } else if (field === 'vatAmount') {
        const val = parseFloat(raw) || 0;
        Object.assign(next, deriveVatFromAmount(prev.amount, val));
      } else {
        next[field] = raw;
        if (field === 'projectId') {
          const proj = allProjects.find((p) => p._id === raw);
          const client = proj ? clientMap[proj.clientId] : null;
          next.currency = client?.currency || 'GBP';
        }
      }
      return next;
    });
  };

  const saveForm = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      if (isNew) {
        const created = await expensesApi.create(form);
        if (sourceTransactionIds.length > 0) {
          for (const txId of sourceTransactionIds) {
            await expensesApi.linkTransaction(created._id, txId);
            await transactionsApi.updateMapping(txId, { status: 'matched' });
          }
        }
        return { ok: true, id: created._id };
      } else {
        const updated = await expensesApi.update(id, form);
        setAttachments(updated.attachments || []);
        resetBase(updated);
        return { ok: true };
      }
    } catch (err) {
      setError(err.message);
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }, [form, isNew, id, resetBase, today, sourceTransactionIds]);

  const handleSave = async () => {
    const result = await saveForm();
    if (result.ok) {
      notifyParent('save', base, form);
      if (isNew) {
        navigateUnguarded(`/expenses/${result.id}`, { replace: true });
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    }
  };

  const handleSaveAndClose = async () => {
    const result = await saveForm();
    if (result.ok) {
      notifyParent('saveAndClose', base, form);
      navigateUnguarded('/expenses');
    }
  };

  const handleDelete = async () => {
    try {
      await expensesApi.delete(id);
      notifyParent('delete', base, form);
      navigate('/expenses');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpload = async (files) => {
    setUploading(true);
    try {
      const updated = await expensesApi.uploadAttachments(id, files);
      setAttachments(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAttachment = async (filename) => {
    try {
      const updated = await expensesApi.deleteAttachment(id, filename);
      setAttachments(updated);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    return registerGuard({ isDirty, onSave: saveForm });
  }, [isDirty, saveForm, registerGuard]);

  // --- Refresh expense data helper ---
  const refreshExpense = useCallback(async () => {
    try {
      const data = await expensesApi.getById(id);
      setLoadedData(data);
      setAttachments(data.attachments || []);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  // --- Transaction picker ---
  const openTxPicker = useCallback(async () => {
    setTxPickerOpen(true);
    setTxSearch('');
    setSelectedTxId(null);
    setShowLinkedTx(false);
    setTxLoading(true);
    try {
      const result = await transactionsApi.getAll();
      setTxList(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setTxLoading(false);
    }
  }, []);

  const txColumns = useMemo(() => [
    createTableColumn({
      columnId: 'linked',
      renderHeaderCell: () => '',
      renderCell: (item) => {
        const linked = (loadedData?.transactions || []).includes(item._id);
        if (!linked) return null;
        return (
          <TableCellLayout>
            <Tooltip content="Already linked to this expense" relationship="label" withArrow>
              <LinkMultipleRegular style={{ color: tokens.colorBrandForeground1, fontSize: '16px' }} />
            </Tooltip>
          </TableCellLayout>
        );
      },
    }),
    ...baseTransactionColumns,
  ], [loadedData?.transactions]);

  const filteredTx = useMemo(() => {
    let list = txList;
    if (!showLinkedTx) {
      list = list.filter(tx => tx.status !== 'matched');
    }
    if (txSearch) {
      const q = txSearch.toLowerCase();
      list = list.filter(tx =>
        (tx.description || '').toLowerCase().includes(q) ||
        (tx.date || '').includes(q)
      );
    }
    return list;
  }, [txList, txSearch, showLinkedTx]);

  const txPagination = usePagination(filteredTx, { defaultPageSize: 10 });

  const handleTxConfirm = async () => {
    if (!selectedTxId) return;
    setError(null);
    try {
      await expensesApi.linkTransaction(id, selectedTxId);
      await transactionsApi.updateMapping(selectedTxId, { status: 'matched' });
      await refreshExpense();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setTxPickerOpen(false);
    }
  };

  const handleUnlinkTx = useCallback(async () => {
    if (!unlinkTarget) return;
    setError(null);
    try {
      await expensesApi.unlinkTransaction(id, unlinkTarget.id);
      await refreshExpense();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setUnlinkTarget(null);
    }
  }, [unlinkTarget, id, refreshExpense]);

  const isLocked = !isNew && loadedData?.isLocked;
  const lockReason = loadedData?.isLockedReason;

  return (
    <>
    {!initialized && <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>}
    <div className={styles.page} ref={formRef} style={{ display: initialized ? undefined : 'none' }}>
      <QueryStringPrefill handleChange={handleChange} ready={baseReady} />
      <FormCommandBar
        onBack={() => goBack('/expenses')}
        onSave={handleSave}
        onSaveAndClose={handleSaveAndClose}
        onDelete={!isNew ? () => setDeleteOpen(true) : undefined}
        saveDisabled={!form.projectId || !form.date}
        saving={saving}
        locked={isLocked}
      >
        {!isNew && !isLocked && (
          <Button
            appearance="outline"
            icon={<ReceiptRegular />}
            onClick={() => setInvoicePickerOpen(true)}
            size="small"
            disabled={!expenseClientId}
          >
            Link to Invoice
          </Button>
        )}
        {!isNew && (
          <Button
            appearance="outline"
            icon={<LinkRegular />}
            onClick={openTxPicker}
            disabled={isLocked}
            size="small"
          >
            Link Transaction
          </Button>
        )}
      </FormCommandBar>
      <div className={styles.pageBody}>
        <div className={styles.header}>
          <Breadcrumb>
            <BreadcrumbItem>
              <BreadcrumbButton onClick={() => goBack('/expenses')}>Expenses</BreadcrumbButton>
            </BreadcrumbItem>
            <BreadcrumbDivider />
            <BreadcrumbItem>
              <BreadcrumbButton current>{isNew ? 'New Expense' : 'Edit Expense'}</BreadcrumbButton>
            </BreadcrumbItem>
          </Breadcrumb>
          <Text className={styles.title}>{isNew ? 'New Expense' : 'Edit Expense'}</Text>
        </div>

        {error && <MessageBar intent="error" className={styles.message}><MessageBarBody>{error}</MessageBarBody></MessageBar>}
        {success && <MessageBar intent="success" className={styles.message}><MessageBarBody>Expense saved successfully.</MessageBarBody></MessageBar>}
        {isLocked && <MessageBar intent="warning" className={styles.message}><MessageBarBody>{lockReason || 'This record is locked.'}</MessageBarBody></MessageBar>}

        <fieldset disabled={!!isLocked} style={{ border: 'none', padding: 0, margin: 0, ...(isLocked ? { pointerEvents: 'none', opacity: 0.6 } : {}) }}>
        <FormSection title="Entry Details">
          <FormField changed={changedFields.has('amount')}>
            <Field label="Amount (gross)" required hint="Total amount paid including VAT">
              <Input type="number" name="amount" value={String(form.amount ?? '')} onChange={handleChange('amount')} step="0.01" />
            </Field>
          </FormField>
          <FormField changed={changedFields.has('date')}>
            <Field label="Date" required>
              <Input type="date" name="date" value={form.date ?? ''} max={today} onChange={handleChange('date')} />
            </Field>
          </FormField>
          <FormField changed={changedFields.has('vatPercent')}>
            <Field label="VAT %">
              <Input type="number" name="vatPercent" value={String(form.vatPercent ?? '')} onChange={handleChange('vatPercent')} min="0" max="100" step="0.01" />
            </Field>
          </FormField>
          <FormField changed={changedFields.has('projectId')}>
            <Field label="Project" required hint={selectedProject ? `Client: ${selectedProject.clientName}` : undefined}>
              <Select name="projectId" value={form.projectId ?? ''} onChange={handleChange('projectId')}>
                <option value="">Select project...</option>
                {Object.entries(projectsByClient).map(([clientName, projs]) => (
                  <optgroup key={clientName} label={clientName}>
                    {projs.map((p) => (
                      <option key={p._id} value={p._id}>{p.name}</option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
          </FormField>
          <FormField changed={changedFields.has('vatAmount')}>
            <Field label="VAT Amount" hint="VAT portion included in the Amount (gross)">
              <Input type="number" name="vatAmount" value={String(form.vatAmount ?? '')} onChange={handleChange('vatAmount')} step="0.01" />
            </Field>
          </FormField>
          <FormField changed={changedFields.has('expenseType')}>
            <Field label="Expense Type" hint="Select from previous types or type a new one">
              <Combobox
                freeform
                input={{ name: 'expenseType' }}
                value={form.expenseType ?? ''}
                onOptionSelect={(e, data) => setForm((prev) => ({ ...prev, expenseType: data.optionText || '' }))}
                onChange={(e) => setForm((prev) => ({ ...prev, expenseType: e.target.value }))}
                placeholder="e.g. Travel, Mileage, Equipment..."
              >
                {expenseTypes.map((t) => (
                  <Option key={t} value={t}>{t}</Option>
                ))}
              </Combobox>
            </Field>
          </FormField>
          <FormField changed={changedFields.has('netAmount')}>
            <Field label="Net Amount" hint="Amount (gross) minus VAT">
              <Input name="netAmount" readOnly value={fmtGBP.format(form.netAmount || 0)} />
            </Field>
          </FormField>
          <FormField changed={changedFields.has('billable')}>
            <Field>
              <Checkbox
                name="billable"
                checked={form.billable ?? false}
                onChange={(e, data) => setForm((prev) => ({ ...prev, billable: data.checked }))}
                label="Billable to client"
              />
            </Field>
          </FormField>
          <FormField changed={changedFields.has('currency')}>
            <Field label="Currency" hint="Inherited from client">
              <Input name="currency" readOnly value={form.currency ?? ''} />
            </Field>
          </FormField>
          <FormField fullWidth changed={changedFields.has('description')}>
            <Field label="Description" hint="Visible to the client on invoices/reports">
              <Textarea
                name="description"
                value={form.description ?? ''}
                onChange={(e, data) => setForm((prev) => ({ ...prev, description: data.value }))}
                placeholder="e.g. Return train London to Manchester for project kickoff"
                resize="vertical"
              />
            </Field>
          </FormField>
          <FormField changed={changedFields.has('externalReference')}>
            <Field label="External Reference" hint="Invoice number, order ID, or other external reference">
              <Input
                name="externalReference"
                value={form.externalReference ?? ''}
                onChange={(e, data) => setForm((prev) => ({ ...prev, externalReference: data.value }))}
                placeholder="e.g. INV-12345"
              />
            </Field>
          </FormField>
        </FormSection>

        <FormField fullWidth changed={changedFields.has('notes')}>
          <div className={styles.notes}>
            <MarkdownEditor
              label="Notes"
              name="notes"
              value={form.notes}
              onChange={(val) => setForm((prev) => ({ ...prev, notes: val }))}
              placeholder="Internal notes (not visible to client)..."
              height={200}
            />
          </div>
        </FormField>

        <div className={styles.attachments}>
          <Text className={styles.sectionTitle} block>Attachments</Text>
          {isNew ? (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              Save the expense first to add attachments.
            </Text>
          ) : (
            <AttachmentGallery
              expenseId={id}
              attachments={attachments}
              onUpload={handleUpload}
              onDelete={handleDeleteAttachment}
              uploading={uploading}
              readOnly={!!isLocked}
            />
          )}
        </div>
        </fieldset>

        {/* Balance Card — linked transactions */}
        {!isNew && (
          <FormSection title="Linked Transactions" style={{ marginTop: '24px' }}>
            <FormField fullWidth>
              <div className={styles.balanceSection}>
                <div className={styles.balanceRow}>
                  <span>Expense Amount</span>
                  <span>{fmtGBP.format(loadedData?.amount || 0)}</span>
                </div>

                {loadedData?.linkedTransactions?.length > 0 && (
                  <>
                    <div className={styles.balanceGroupLabel}>
                      <span>Linked Transactions</span>
                      <span>{fmtGBP.format(loadedData.transactionsTotal || 0)}</span>
                    </div>
                    {loadedData.linkedTransactions.map((tx) => (
                      <div key={tx._id} className={styles.balanceSubRow}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {!isLocked && (
                            <Tooltip content="Unlink this transaction" relationship="label" withArrow>
                              <Button
                                appearance="subtle"
                                size="small"
                                icon={<LinkDismissRegular style={{ fontSize: '14px' }} />}
                                onClick={() => setUnlinkTarget({ id: tx._id, label: tx.description || tx.date })}
                                style={{ minWidth: 'auto', padding: '0 2px', height: '20px' }}
                              />
                            </Tooltip>
                          )}
                          <Link onClick={() => navigate(`/transactions/${tx._id}`)}>
                            {tx.description || 'Transaction'} {tx.date ? `(${tx.date})` : ''}
                          </Link>
                        </span>
                        <span>{fmtGBP.format(tx.amount)}</span>
                      </div>
                    ))}
                  </>
                )}

                <div className={styles.balanceDivider} />
                {(() => {
                  const remaining = loadedData?.remainingBalance ?? (loadedData?.amount || 0);
                  const balanceColor = remaining === 0
                    ? tokens.colorPaletteGreenForeground1
                    : tokens.colorStatusWarningForeground3;
                  return (
                    <div className={styles.balanceTotal}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Remaining Balance
                        {remaining !== 0 && (
                          <Tooltip content="Balance not fully reconciled" relationship="label" withArrow>
                            <WarningFilled style={{ color: tokens.colorStatusWarningForeground3, fontSize: '20px' }} />
                          </Tooltip>
                        )}
                      </span>
                      <span style={{ color: balanceColor }}>
                        {fmtGBP.format(remaining)}
                      </span>
                    </div>
                  );
                })()}
              </div>
            </FormField>
          </FormSection>
        )}
      </div>
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Expense"
        message="Are you sure you want to delete this expense? This action cannot be undone."
      />

      {/* Transaction picker dialog */}
      <Dialog open={txPickerOpen} onOpenChange={(e, d) => { if (!d.open) setTxPickerOpen(false); }}>
        <DialogSurface style={{ maxWidth: '800px', width: '90vw', maxHeight: '85vh' }}>
          <DialogBody>
            <DialogTitle>Link Transaction</DialogTitle>
            <DialogContent>
              <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <SearchBox
                  placeholder="Search by description or date..."
                  value={txSearch}
                  onChange={(e, d) => setTxSearch(d.value)}
                  size="small"
                  style={{ flex: 1 }}
                />
                <Checkbox
                  checked={showLinkedTx}
                  onChange={(e, d) => setShowLinkedTx(d.checked)}
                  label="Show matched"
                  size="medium"
                  style={{ whiteSpace: 'nowrap' }}
                />
              </div>
              <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                {txLoading ? (
                  <div style={{ padding: '24px', textAlign: 'center' }}>
                    <Spinner size="small" label="Loading transactions..." />
                  </div>
                ) : filteredTx.length === 0 ? (
                  <Text style={{ padding: '16px', color: tokens.colorNeutralForeground3 }}>
                    No debit transactions found.
                  </Text>
                ) : (
                  <DataGrid
                    items={txPagination.pageItems}
                    columns={txColumns}
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
                            backgroundColor: selectedTxId === item._id ? tokens.colorBrandBackground2 : undefined,
                          }}
                          onClick={() => setSelectedTxId(item._id)}
                        >
                          {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                        </DataGridRow>
                      )}
                    </DataGridBody>
                  </DataGrid>
                )}
              </div>
              <PaginationControls
                page={txPagination.page}
                pageSize={txPagination.pageSize}
                totalItems={txPagination.totalItems}
                totalPages={txPagination.totalPages}
                onPageChange={txPagination.setPage}
                onPageSizeChange={txPagination.setPageSize}
              />
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setTxPickerOpen(false)}>Cancel</Button>
              <Button appearance="primary" onClick={handleTxConfirm} disabled={!selectedTxId}>Confirm</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Unlink transaction confirmation */}
      <ConfirmDialog
        open={!!unlinkTarget}
        onClose={() => setUnlinkTarget(null)}
        onConfirm={handleUnlinkTx}
        title="Unlink Transaction"
        message={`Are you sure you want to unlink "${unlinkTarget?.label}" from this expense?`}
      />
      <InvoicePickerDialog
        open={invoicePickerOpen}
        onClose={() => setInvoicePickerOpen(false)}
        onLinked={() => {
          setInvoicePickerOpen(false);
          setSuccess(true);
          setTimeout(() => setSuccess(false), 3000);
        }}
        clientId={expenseClientId}
        sourceType="expense"
        sourceId={id}
      />
    </div>
    </>
  );
}
