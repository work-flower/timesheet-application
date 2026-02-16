import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Textarea,
  Field,
  Spinner,
  Select,
  Tab,
  TabList,
  Badge,
  Button,
  MessageBar,
  MessageBarBody,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbDivider,
  BreadcrumbButton,
  ToolbarDivider,
  Tooltip,
  Switch,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableCellLayout,
  createTableColumn,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  SearchBox,
  Checkbox,
  Link,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  SaveRegular,
  SaveArrowRightRegular,
  DeleteRegular,
  CheckmarkRegular,
  ArrowUploadRegular,
  ArrowUndoRegular,
  CalculatorRegular,
  AddRegular,
  ShieldCheckmarkRegular,
  WarningRegular,
  ErrorCircleRegular,
  LinkRegular,
  LinkMultipleRegular,
  LinkDismissRegular,
  WarningFilled,
} from '@fluentui/react-icons';
import { invoicesApi, clientsApi, timesheetsApi, expensesApi, reportsApi, transactionsApi } from '../../api/index.js';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import ItemPickerDialog from '../../components/ItemPickerDialog.jsx';
import { useFormTracker } from '../../hooks/useFormTracker.js';
import { usePagination } from '../../hooks/usePagination.js';
import PaginationControls from '../../components/PaginationControls.jsx';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx';

const useStyles = makeStyles({
  page: {},
  commandBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    gap: '4px',
    position: 'sticky',
    top: 0,
    zIndex: 10,
    flexWrap: 'wrap',
  },
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
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '4px',
  },
  tabs: {
    marginTop: '16px',
  },
  tabContent: {
    marginTop: '16px',
  },
  message: {
    marginBottom: '16px',
  },
  totalsSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '4px',
    padding: '16px 0',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    marginTop: '16px',
  },
  totalRow: {
    display: 'flex',
    gap: '16px',
    alignItems: 'baseline',
  },
  totalLabel: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground3,
    minWidth: '100px',
    textAlign: 'right',
  },
  totalValue: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    minWidth: '120px',
    textAlign: 'right',
  },
  grandTotal: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightBold,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  pdfPreview: {
    width: '100%',
    height: '700px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  empty: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '48px',
    color: tokens.colorNeutralForeground3,
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

const statusColors = { draft: 'informative', confirmed: 'warning', posted: 'success' };
const paymentColors = { unpaid: 'warning', paid: 'success', overdue: 'danger' };

const timesheetPickerColumns = [
  { key: 'date', label: 'Date' },
  { key: 'projectName', label: 'Project' },
  { key: 'hours', label: 'Hours' },
  { key: 'days', label: 'Days', render: (item) => item.days?.toFixed(2) || '—' },
  {
    key: 'amount', label: 'Amount',
    render: (item) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(item.amount || 0),
  },
];

const expensePickerColumns = [
  { key: 'date', label: 'Date' },
  { key: 'projectName', label: 'Project' },
  { key: 'expenseType', label: 'Type' },
  { key: 'billable', label: 'Billable', render: (item) => item.billable ? 'Yes' : 'No' },
  {
    key: 'amount', label: 'Amount',
    render: (item) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(item.amount || 0),
  },
  {
    key: 'vatAmount', label: 'VAT',
    render: (item) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(item.vatAmount || 0),
  },
];

const fmtGBP = (v) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(v || 0);
const typeLabels = { timesheet: 'Timesheet', expense: 'Expense', 'write-in': 'Write-in' };

const makeUnifiedColumns = (onRemove, onUpdateWriteIn, isReadOnly, errorMap, warningMap) => [
  createTableColumn({
    columnId: 'type',
    compare: (a, b) => (a.type || '').localeCompare(b.type || ''),
    renderHeaderCell: () => 'Type',
    renderCell: (item) => {
      const errMsgs = errorMap?.get(item.id);
      const warnMsgs = warningMap?.get(item.id);
      if (errMsgs?.length) {
        const tip = errMsgs.join('\n') + '\n\nUse Recalculate to realign with source data.';
        return (
          <TableCellLayout>
            <Tooltip content={tip} relationship="description" withArrow>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ErrorCircleRegular style={{ color: '#d13438' }} />
                {typeLabels[item.type] || item.type}
              </span>
            </Tooltip>
          </TableCellLayout>
        );
      }
      if (warnMsgs?.length) {
        const tip = warnMsgs.join('\n');
        return (
          <TableCellLayout>
            <Tooltip content={tip} relationship="description" withArrow>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <WarningRegular style={{ color: '#e8a317' }} />
                {typeLabels[item.type] || item.type}
              </span>
            </Tooltip>
          </TableCellLayout>
        );
      }
      return <TableCellLayout>{typeLabels[item.type] || item.type}</TableCellLayout>;
    },
  }),
  createTableColumn({
    columnId: 'date',
    compare: (a, b) => (a.date || '').localeCompare(b.date || ''),
    renderHeaderCell: () => 'Date',
    renderCell: (item) => <TableCellLayout>{item.date || '—'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'description',
    renderHeaderCell: () => 'Description',
    renderCell: (item) => (
      <TableCellLayout>
        {item.type === 'write-in' && !isReadOnly
          ? <Input value={item.description} onChange={(e) => onUpdateWriteIn(item.id, 'description', e.target.value)} size="small" appearance="underline" placeholder="Description" />
          : item.description}
      </TableCellLayout>
    ),
  }),
  createTableColumn({
    columnId: 'quantity',
    renderHeaderCell: () => 'Qty',
    renderCell: (item) => (
      <TableCellLayout>
        {item.type === 'write-in' && !isReadOnly
          ? <Input type="number" value={String(item.quantity)} onChange={(e) => onUpdateWriteIn(item.id, 'quantity', parseFloat(e.target.value) || 0)} size="small" appearance="underline" />
          : (item.quantity != null ? Number(item.quantity).toFixed(2) : '—')}
      </TableCellLayout>
    ),
  }),
  createTableColumn({
    columnId: 'unit',
    renderHeaderCell: () => 'Unit',
    renderCell: (item) => (
      <TableCellLayout>
        {item.type === 'write-in' && !isReadOnly
          ? <Input value={item.unit} onChange={(e) => onUpdateWriteIn(item.id, 'unit', e.target.value)} size="small" appearance="underline" />
          : item.unit}
      </TableCellLayout>
    ),
  }),
  createTableColumn({
    columnId: 'unitPrice',
    renderHeaderCell: () => 'Unit Price',
    renderCell: (item) => (
      <TableCellLayout>
        {item.type === 'write-in' && !isReadOnly
          ? <Input type="number" value={String(item.unitPrice)} onChange={(e) => onUpdateWriteIn(item.id, 'unitPrice', parseFloat(e.target.value) || 0)} size="small" appearance="underline" />
          : fmtGBP(item.unitPrice)}
      </TableCellLayout>
    ),
  }),
  createTableColumn({
    columnId: 'vatPercent',
    renderHeaderCell: () => 'VAT %',
    renderCell: (item) => (
      <TableCellLayout>
        {item.type === 'write-in' && !isReadOnly
          ? <Input type="number" value={String(item.vatPercent ?? '')} onChange={(e) => { const v = e.target.value; onUpdateWriteIn(item.id, 'vatPercent', v === '' ? null : parseFloat(v)); }} size="small" appearance="underline" />
          : (item.vatPercent != null ? `${item.vatPercent}%` : 'N/A')}
      </TableCellLayout>
    ),
  }),
  createTableColumn({
    columnId: 'vatAmount',
    renderHeaderCell: () => 'VAT',
    renderCell: (item) => <TableCellLayout>{fmtGBP(item.vatAmount)}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'netAmount',
    renderHeaderCell: () => 'Net',
    renderCell: (item) => <TableCellLayout>{fmtGBP(item.netAmount)}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'grossAmount',
    renderHeaderCell: () => 'Gross',
    renderCell: (item) => <TableCellLayout>{fmtGBP(item.grossAmount)}</TableCellLayout>,
  }),
  ...(onRemove ? [createTableColumn({
    columnId: '_remove',
    renderHeaderCell: () => '',
    renderCell: (item) => (
      <TableCellLayout>
        <Button appearance="subtle" icon={<DeleteRegular />} size="small" onClick={(e) => { e.stopPropagation(); onRemove(item.id); }} />
      </TableCellLayout>
    ),
  })] : []),
];

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
    renderCell: (item) => <TableCellLayout>{fmtGBP(item.amount || 0)}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'status',
    compare: (a, b) => (a.status || '').localeCompare(b.status || ''),
    renderHeaderCell: () => 'Status',
    renderCell: (item) => <TableCellLayout>{item.status || '\u2014'}</TableCellLayout>,
  }),
];

function round2(n) {
  return Math.round(n * 100) / 100;
}

export default function InvoiceForm() {
  const styles = useStyles();
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const { registerGuard, guardedNavigate } = useUnsavedChanges();

  const { form, setForm, setBase, isDirty, changedFields } = useFormTracker({
    clientId: '',
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    servicePeriodStart: '',
    servicePeriodEnd: '',
    additionalNotes: '',
    lines: [],
    includeTimesheetReport: false,
    includeExpenseReport: false,
  }, { excludeFields: ['invoiceNumber'] });

  const [invoiceData, setInvoiceData] = useState(null);
  const [allClients, setAllClients] = useState([]);
  const [clientProjects, setClientProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [tab, setTab] = useState('invoice');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  // Source data for consistency checking (all timesheets/expenses for the client)
  const [sourceTimesheets, setSourceTimesheets] = useState([]);
  const [sourceExpenses, setSourceExpenses] = useState([]);

  // Picker dialogs
  const [tsPickerOpen, setTsPickerOpen] = useState(false);
  const [expPickerOpen, setExpPickerOpen] = useState(false);
  const [availableTimesheets, setAvailableTimesheets] = useState([]);
  const [availableExpenses, setAvailableExpenses] = useState([]);

  // Transaction picker
  const [txPickerOpen, setTxPickerOpen] = useState(false);
  const [txList, setTxList] = useState([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txSearch, setTxSearch] = useState('');
  const [selectedTxId, setSelectedTxId] = useState(null);
  const [showLinkedTx, setShowLinkedTx] = useState(false);

  // Unlink confirmation
  const [unlinkTarget, setUnlinkTarget] = useState(null);

  // PDF preview
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const pendingToggleSave = useRef(false);

  const status = invoiceData?.status || 'draft';
  const isPosted = status === 'posted';
  const isLocked = !!invoiceData?.isLocked;
  const lockReason = invoiceData?.isLockedReason;
  const isReadOnly = isPosted || isLocked;

  // Derive line counts and source IDs from form.lines
  const timesheetLines = useMemo(
    () => form.lines.filter(l => l.type === 'timesheet'),
    [form.lines]
  );
  const expenseLines = useMemo(
    () => form.lines.filter(l => l.type === 'expense'),
    [form.lines]
  );
  const writeInLines = useMemo(
    () => form.lines.filter(l => l.type === 'write-in'),
    [form.lines]
  );
  const tsSourceIds = useMemo(
    () => timesheetLines.map(l => l.sourceId),
    [timesheetLines]
  );
  const expSourceIds = useMemo(
    () => expenseLines.map(l => l.sourceId),
    [expenseLines]
  );

  const fetchSourceData = useCallback(async (clientId) => {
    if (!clientId) return;
    try {
      const [ts, exp] = await Promise.all([
        timesheetsApi.getAll({ clientId }),
        expensesApi.getAll({ clientId }),
      ]);
      setSourceTimesheets(ts);
      setSourceExpenses(exp);
    } catch {}
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const clients = await clientsApi.getAll();
        setAllClients(clients);

        if (!isNew) {
          const data = await invoicesApi.getById(id);
          setInvoiceData(data);
          setClientProjects(data.clientProjects || []);
          setBase({
            clientId: data.clientId || '',
            invoiceNumber: data.invoiceNumber || '',
            invoiceDate: data.invoiceDate || '',
            dueDate: data.dueDate || '',
            servicePeriodStart: data.servicePeriodStart || '',
            servicePeriodEnd: data.servicePeriodEnd || '',
            additionalNotes: data.additionalNotes || '',
            lines: data.lines || [],
            includeTimesheetReport: data.includeTimesheetReport || false,
            includeExpenseReport: data.includeExpenseReport || false,
          });

          // Fetch source data for client-side consistency checking
          await fetchSourceData(data.clientId);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id, isNew, setBase, fetchSourceData]);

  const handleChange = (field) => (e, data) => {
    setForm((prev) => ({ ...prev, [field]: data?.value ?? e.target.value }));
  };

  const saveForm = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const payload = {
        clientId: form.clientId,
        invoiceDate: form.invoiceDate,
        dueDate: form.dueDate,
        servicePeriodStart: form.servicePeriodStart,
        servicePeriodEnd: form.servicePeriodEnd,
        additionalNotes: form.additionalNotes,
        lines: form.lines,
        includeTimesheetReport: form.includeTimesheetReport,
        includeExpenseReport: form.includeExpenseReport,
      };

      if (isNew) {
        const created = await invoicesApi.create(payload);
        return { ok: true, id: created._id };
      } else {
        const updated = await invoicesApi.update(id, payload);
        setInvoiceData(updated);
        setClientProjects(updated.clientProjects || []);
        setBase({
          clientId: updated.clientId || '',
          invoiceNumber: updated.invoiceNumber || '',
          invoiceDate: updated.invoiceDate || '',
          dueDate: updated.dueDate || '',
          servicePeriodStart: updated.servicePeriodStart || '',
          servicePeriodEnd: updated.servicePeriodEnd || '',
          additionalNotes: updated.additionalNotes || '',
          lines: updated.lines || [],
          includeTimesheetReport: updated.includeTimesheetReport || false,
          includeExpenseReport: updated.includeExpenseReport || false,
        });
        return { ok: true };
      }
    } catch (err) {
      setError(err.message);
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }, [form, isNew, id, setBase]);

  const handleSave = async () => {
    const result = await saveForm();
    if (result.ok) {
      if (isNew) {
        navigate(`/invoices/${result.id}`, { replace: true });
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    }
  };

  const handleSaveAndClose = async () => {
    const result = await saveForm();
    if (result.ok) navigate('/invoices');
  };

  const handleDelete = async () => {
    try {
      await invoicesApi.delete(id);
      navigate('/invoices');
    } catch (err) {
      setError(err.message);
    }
    setDeleteConfirm(false);
  };

  const handleLifecycleAction = async () => {
    setError(null);
    try {
      let updated;
      if (confirmAction === 'confirm') {
        if (isDirty) {
          const saveResult = await saveForm();
          if (!saveResult.ok) return;
        }
        updated = await invoicesApi.confirm(id);
      } else if (confirmAction === 'post') {
        updated = await invoicesApi.post(id);
      } else if (confirmAction === 'unconfirm') {
        updated = await invoicesApi.unconfirm(id);
      }
      if (updated) {
        setInvoiceData(updated);
        setClientProjects(updated.clientProjects || []);
        setBase({
          clientId: updated.clientId || '',
          invoiceNumber: updated.invoiceNumber || '',
          invoiceDate: updated.invoiceDate || '',
          dueDate: updated.dueDate || '',
          servicePeriodStart: updated.servicePeriodStart || '',
          servicePeriodEnd: updated.servicePeriodEnd || '',
          additionalNotes: updated.additionalNotes || '',
          lines: updated.lines || [],
          includeTimesheetReport: updated.includeTimesheetReport || false,
          includeExpenseReport: updated.includeExpenseReport || false,
        });
        await fetchSourceData(updated.clientId);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (err) {
      setError(err.message);
    }
    setConfirmAction(null);
  };

  const handleRecalculate = async () => {
    setError(null);
    try {
      // Save first if dirty
      if (isDirty) {
        const saveResult = await saveForm();
        if (!saveResult.ok) return;
      }
      const updated = await invoicesApi.recalculate(id);
      setInvoiceData(updated);
      setBase({
        clientId: updated.clientId || '',
        invoiceNumber: updated.invoiceNumber || '',
        invoiceDate: updated.invoiceDate || '',
        dueDate: updated.dueDate || '',
        servicePeriodStart: updated.servicePeriodStart || '',
        servicePeriodEnd: updated.servicePeriodEnd || '',
        additionalNotes: updated.additionalNotes || '',
        lines: updated.lines || [],
        includeTimesheetReport: updated.includeTimesheetReport || false,
        includeExpenseReport: updated.includeExpenseReport || false,
      });
      await fetchSourceData(updated.clientId);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleConsistencyCheck = async () => {
    setError(null);
    try {
      await fetchSourceData(form.clientId);
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePaymentChange = async (field, value) => {
    setError(null);
    try {
      const payload = { [field]: value };
      if (field === 'paymentStatus' && value !== 'paid') {
        payload.paidDate = null;
      }
      const updated = await invoicesApi.updatePayment(id, payload);
      setInvoiceData(updated);
    } catch (err) {
      setError(err.message);
    }
  };

  // --- Refresh invoice data helper ---
  const refreshInvoice = useCallback(async () => {
    try {
      const data = await invoicesApi.getById(id);
      setInvoiceData(data);
      setClientProjects(data.clientProjects || []);
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
      // Credit transactions only (amount > 0) for invoices
      setTxList(result.filter(tx => tx.amount > 0));
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
        const linked = (invoiceData?.transactions || []).includes(item._id);
        if (!linked) return null;
        return (
          <TableCellLayout>
            <Tooltip content="Already linked to this invoice" relationship="label" withArrow>
              <LinkMultipleRegular style={{ color: tokens.colorBrandForeground1, fontSize: '16px' }} />
            </Tooltip>
          </TableCellLayout>
        );
      },
    }),
    ...baseTransactionColumns,
  ], [invoiceData?.transactions]);

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
      await invoicesApi.linkTransaction(id, selectedTxId);
      await transactionsApi.updateMapping(selectedTxId, { status: 'matched' });
      await refreshInvoice();
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
      await invoicesApi.unlinkTransaction(id, unlinkTarget.id);
      await refreshInvoice();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setUnlinkTarget(null);
    }
  }, [unlinkTarget, id, refreshInvoice]);

  // --- Timesheet picker ---
  const openTimesheetPicker = async () => {
    if (!form.clientId) return;
    try {
      const ts = await timesheetsApi.getAll({ clientId: form.clientId });
      // Exclude timesheets already locked to another invoice
      setAvailableTimesheets(ts.filter(t => !t.invoiceId || t.invoiceId === id));
      setTsPickerOpen(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const tsFilterToggle = useMemo(() => {
    const start = form.servicePeriodStart || null;
    const end = form.servicePeriodEnd || null;
    if (!start && !end) return null;
    return {
      label: 'Include entries outside service period',
      filterFn: (item) => {
        if (start && item.date < start) return false;
        if (end && item.date > end) return false;
        return true;
      },
    };
  }, [form.servicePeriodStart, form.servicePeriodEnd]);

  const handleTimesheetPickerConfirm = (selectedIds) => {
    const currentSourceIds = new Set(tsSourceIds);
    const selectedSet = new Set(selectedIds);

    // Newly added IDs
    const newIds = selectedIds.filter(sid => !currentSourceIds.has(sid));
    // Removed IDs
    const removedIds = tsSourceIds.filter(sid => !selectedSet.has(sid));

    // Generate lines for newly added timesheets
    const newLines = newIds.map(tsId => {
      const ts = availableTimesheets.find(t => t._id === tsId);
      if (!ts) return null;
      const project = clientProjects.find(p => p._id === ts.projectId);
      const effectiveRate = project?.effectiveRate || 0;
      const vatPercent = project?.vatPercent ?? null;
      const netAmount = ts.amount || 0;
      const vatAmount = vatPercent != null ? round2(netAmount * (vatPercent / 100)) : 0;

      return {
        id: crypto.randomUUID(),
        type: 'timesheet',
        sourceId: ts._id,
        projectId: ts.projectId,
        description: project?.name || ts.projectName || 'Consulting',
        date: ts.date,
        hours: ts.hours,
        quantity: ts.days || 0,
        unit: 'days',
        unitPrice: effectiveRate,
        vatPercent,
        netAmount,
        vatAmount,
        grossAmount: round2(netAmount + vatAmount),
      };
    }).filter(Boolean);

    setForm(prev => ({
      ...prev,
      lines: [
        ...prev.lines.filter(l => !(l.type === 'timesheet' && removedIds.includes(l.sourceId))),
        ...newLines,
      ],
    }));
  };

  // --- Expense picker ---
  const openExpensePicker = async () => {
    if (!form.clientId) return;
    try {
      const exp = await expensesApi.getAll({ clientId: form.clientId });
      // Exclude expenses already locked to another invoice
      setAvailableExpenses(exp.filter(e => !e.invoiceId || e.invoiceId === id));
      setExpPickerOpen(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const expFilterToggle = useMemo(() => ({
    label: 'Include non-billable expenses',
    filterFn: (item) => item.billable !== false,
  }), []);

  const handleExpensePickerConfirm = (selectedIds) => {
    const currentSourceIds = new Set(expSourceIds);
    const selectedSet = new Set(selectedIds);

    const newIds = selectedIds.filter(sid => !currentSourceIds.has(sid));
    const removedIds = expSourceIds.filter(sid => !selectedSet.has(sid));

    const newLines = newIds.map(expId => {
      const exp = availableExpenses.find(e => e._id === expId);
      if (!exp) return null;
      const netAmount = round2((exp.amount || 0) - (exp.vatAmount || 0));

      return {
        id: crypto.randomUUID(),
        type: 'expense',
        sourceId: exp._id,
        projectId: exp.projectId,
        description: [exp.expenseType, exp.description].filter(Boolean).join(' - '),
        date: exp.date,
        expenseType: exp.expenseType,
        billable: exp.billable !== false,
        quantity: 1,
        unit: 'item',
        unitPrice: netAmount,
        vatPercent: exp.vatPercent || 0,
        netAmount,
        vatAmount: exp.vatAmount || 0,
        grossAmount: exp.amount || 0,
      };
    }).filter(Boolean);

    setForm(prev => ({
      ...prev,
      lines: [
        ...prev.lines.filter(l => !(l.type === 'expense' && removedIds.includes(l.sourceId))),
        ...newLines,
      ],
    }));
  };

  const removeLine = (lineId) => {
    setForm(prev => ({
      ...prev,
      lines: prev.lines.filter(l => l.id !== lineId),
    }));
  };

  // --- Write-in lines ---
  const addWriteInLine = () => {
    setForm(prev => ({
      ...prev,
      lines: [...prev.lines, {
        id: crypto.randomUUID(),
        type: 'write-in',
        sourceId: null,
        projectId: null,
        description: '',
        quantity: 1,
        unit: 'days',
        unitPrice: 0,
        vatPercent: 20,
        netAmount: 0,
        vatAmount: 0,
        grossAmount: 0,
      }],
    }));
  };

  const updateWriteInLine = (lineId, field, value) => {
    setForm(prev => ({
      ...prev,
      lines: prev.lines.map(l => {
        if (l.id !== lineId) return l;
        const updated = { ...l, [field]: value };
        // Recompute amounts
        const net = round2((updated.quantity || 0) * (updated.unitPrice || 0));
        const vat = updated.vatPercent != null ? round2(net * (updated.vatPercent / 100)) : 0;
        updated.netAmount = net;
        updated.vatAmount = vat;
        updated.grossAmount = round2(net + vat);
        return updated;
      }),
    }));
  };

  // PDF preview — uses saved file for confirmed/posted invoices, on-the-fly generation for drafts
  const loadPdfPreview = useCallback(async () => {
    if (!id) return;
    // Revoke previous blob URL
    if (pdfUrl && pdfUrl.startsWith('blob:')) URL.revokeObjectURL(pdfUrl);

    setPdfLoading(true);
    try {
      // Use saved PDF if available (confirmed/posted)
      if (invoiceData?.pdfPath) {
        setPdfUrl(invoicesApi.getFileUrl(id));
      } else {
        // Generate on-the-fly for draft invoices
        const reports = [{ type: 'invoice', params: { id } }];

        if (form.includeTimesheetReport) {
          const tsIds = form.lines.filter(l => l.type === 'timesheet' && l.sourceId).map(l => l.sourceId);
          if (tsIds.length > 0) {
            reports.push({ type: 'timesheet', params: { clientId: form.clientId, ids: tsIds, startDate: form.servicePeriodStart, endDate: form.servicePeriodEnd } });
          }
        }

        if (form.includeExpenseReport) {
          const expIds = form.lines.filter(l => l.type === 'expense' && l.sourceId).map(l => l.sourceId);
          if (expIds.length > 0) {
            reports.push({ type: 'expense', params: { clientId: form.clientId, ids: expIds, startDate: form.servicePeriodStart, endDate: form.servicePeriodEnd } });
          }
        }

        const blob = await reportsApi.getCombinedPdfBlob(reports);
        setPdfUrl(URL.createObjectURL(blob));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setPdfLoading(false);
    }
  }, [id, invoiceData?.pdfPath, form.includeTimesheetReport, form.includeExpenseReport, form.lines, form.clientId, form.servicePeriodStart, form.servicePeriodEnd]);

  useEffect(() => {
    if (tab === 'pdf' && id) loadPdfPreview();
  }, [tab, id, loadPdfPreview]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => { if (pdfUrl && pdfUrl.startsWith('blob:')) URL.revokeObjectURL(pdfUrl); };
  }, [pdfUrl]);

  useEffect(() => {
    return registerGuard({ isDirty, onSave: saveForm });
  }, [isDirty, saveForm, registerGuard]);

  // Auto-save when PDF toggles change (fires after re-render so saveForm has updated form)
  useEffect(() => {
    if (!pendingToggleSave.current || isNew || !id) return;
    pendingToggleSave.current = false;
    saveForm();
  }, [form.includeTimesheetReport, form.includeExpenseReport, saveForm, isNew, id]);

  const fmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

  // Client-side consistency check — errors (block confirm) and warnings (informational, draft only)
  const { errors, warnings } = useMemo(() => {
    const errors = [];
    const warnings = [];
    if (!form.lines.length) return { errors, warnings };

    const tsMap = new Map(sourceTimesheets.map(t => [t._id, t]));
    const expMap = new Map(sourceExpenses.map(e => [e._id, e]));
    const projMap = new Map(clientProjects.map(p => [p._id, p]));
    const periodStart = form.servicePeriodStart || null;
    const periodEnd = form.servicePeriodEnd || null;

    for (const line of form.lines) {
      if (line.type === 'timesheet' && line.sourceId) {
        const ts = tsMap.get(line.sourceId);
        if (!ts) {
          errors.push({ lineId: line.id, message: `Timesheet (${line.date || 'unknown date'}) has been deleted or belongs to a different client` });
          continue;
        }
        const project = projMap.get(ts.projectId);
        if (!project) {
          errors.push({ lineId: line.id, message: `Timesheet ${ts.date} belongs to a different client` });
          continue;
        }
        if (ts.invoiceId && ts.invoiceId !== id) {
          errors.push({ lineId: line.id, message: `Timesheet ${ts.date} is locked to another invoice` });
        }
        const effectiveRate = project.effectiveRate || 0;
        const currentVatPct = project.vatPercent ?? null;
        if (Math.abs((line.netAmount || 0) - (ts.amount || 0)) > 0.01) {
          errors.push({ lineId: line.id, message: `Timesheet ${ts.date}: amount changed from £${(line.netAmount || 0).toFixed(2)} to £${(ts.amount || 0).toFixed(2)}` });
        }
        if (line.vatPercent !== currentVatPct) {
          errors.push({ lineId: line.id, message: `Timesheet ${ts.date}: VAT rate changed from ${line.vatPercent ?? 'N/A'}% to ${currentVatPct ?? 'N/A'}%` });
        }
        if (Math.abs((line.unitPrice || 0) - effectiveRate) > 0.01) {
          errors.push({ lineId: line.id, message: `Timesheet ${ts.date}: rate changed from £${(line.unitPrice || 0).toFixed(2)} to £${effectiveRate.toFixed(2)}` });
        }
        // Warning: date outside service period
        if (line.date && periodStart && line.date < periodStart) {
          warnings.push({ lineId: line.id, message: `Timesheet ${line.date} is before service period start (${periodStart})` });
        }
        if (line.date && periodEnd && line.date > periodEnd) {
          warnings.push({ lineId: line.id, message: `Timesheet ${line.date} is after service period end (${periodEnd})` });
        }
      } else if (line.type === 'expense' && line.sourceId) {
        const exp = expMap.get(line.sourceId);
        if (!exp) {
          errors.push({ lineId: line.id, message: `Expense (${line.date || 'unknown date'}) has been deleted or belongs to a different client` });
          continue;
        }
        if (!projMap.has(exp.projectId)) {
          errors.push({ lineId: line.id, message: `Expense ${exp.date} belongs to a different client` });
          continue;
        }
        if (exp.invoiceId && exp.invoiceId !== id) {
          errors.push({ lineId: line.id, message: `Expense ${exp.date} is locked to another invoice` });
        }
        if (Math.abs((line.grossAmount || 0) - (exp.amount || 0)) > 0.01) {
          errors.push({ lineId: line.id, message: `Expense ${exp.date}: amount changed from £${(line.grossAmount || 0).toFixed(2)} to £${(exp.amount || 0).toFixed(2)}` });
        }
        if (Math.abs((line.vatAmount || 0) - (exp.vatAmount || 0)) > 0.01) {
          errors.push({ lineId: line.id, message: `Expense ${exp.date}: VAT changed from £${(line.vatAmount || 0).toFixed(2)} to £${(exp.vatAmount || 0).toFixed(2)}` });
        }
        // Warning: date outside service period
        if (line.date && periodStart && line.date < periodStart) {
          warnings.push({ lineId: line.id, message: `Expense ${line.date} is before service period start (${periodStart})` });
        }
        if (line.date && periodEnd && line.date > periodEnd) {
          warnings.push({ lineId: line.id, message: `Expense ${line.date} is after service period end (${periodEnd})` });
        }
        // Warning: non-billable expense
        if (exp.billable === false || line.billable === false) {
          warnings.push({ lineId: line.id, message: `Expense ${line.date || 'unknown date'}: this expense is marked as non-billable` });
        }
      }
    }
    return { errors, warnings };
  }, [form.lines, sourceTimesheets, sourceExpenses, clientProjects, id, form.servicePeriodStart, form.servicePeriodEnd]);

  // Error map — always shown
  const errorMap = useMemo(() => {
    const map = new Map();
    for (const e of errors) {
      if (!e.lineId) continue;
      if (!map.has(e.lineId)) map.set(e.lineId, []);
      map.get(e.lineId).push(e.message);
    }
    return map;
  }, [errors]);

  // Warning map — only on draft
  const warningMap = useMemo(() => {
    if (status !== 'draft') return new Map();
    const map = new Map();
    for (const w of warnings) {
      if (!w.lineId) continue;
      if (!map.has(w.lineId)) map.set(w.lineId, []);
      map.get(w.lineId).push(w.message);
    }
    return map;
  }, [warnings, status]);

  // Group lines by type: timesheets first, expenses second, write-in last
  const typeOrder = { timesheet: 0, expense: 1, 'write-in': 2 };
  const sortedLines = useMemo(
    () => [...form.lines].sort((a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9)),
    [form.lines]
  );

  // Compute live totals from form.lines (for display before save)
  const liveTotals = useMemo(() => {
    let subtotal = 0, totalVat = 0;
    for (const l of form.lines) {
      subtotal += l.netAmount || 0;
      totalVat += l.vatAmount || 0;
    }
    return {
      subtotal: round2(subtotal),
      totalVat: round2(totalVat),
      total: round2(subtotal + totalVat),
    };
  }, [form.lines]);

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  const actionLabels = {
    confirm: { title: 'Confirm Invoice', message: 'This will assign an invoice number and lock the selected timesheets and expenses. Continue?' },
    post: { title: 'Post Invoice', message: 'This will seal the invoice. Only payment tracking can be changed after posting. Continue?' },
    unconfirm: { title: 'Revert to Draft', message: 'This will remove the invoice number and unlock all items. Continue?' },
  };

  return (
    <div className={styles.page}>
      {/* Custom command bar with lifecycle actions */}
      <div className={styles.commandBar}>
        <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={() => guardedNavigate('/invoices')} size="small">
          Back
        </Button>
        <ToolbarDivider />
        {!isReadOnly && (
          <>
            <Button appearance="primary" icon={<SaveRegular />} onClick={handleSave} disabled={saving} size="small">
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button appearance="outline" icon={<SaveArrowRightRegular />} onClick={handleSaveAndClose} disabled={saving} size="small">
              Save & Close
            </Button>
          </>
        )}
        {!isNew && (
          <>
            {!isReadOnly && (
              <>
                <ToolbarDivider />
                <Button appearance="subtle" icon={<ShieldCheckmarkRegular />} onClick={handleConsistencyCheck} size="small">
                  Consistency Check
                </Button>
                <Button appearance="subtle" icon={<CalculatorRegular />} onClick={handleRecalculate} size="small">
                  Recalculate
                </Button>
              </>
            )}
            {status === 'draft' && (
              <>
                <ToolbarDivider />
                <Button appearance="outline" icon={<CheckmarkRegular />} onClick={() => setConfirmAction('confirm')} size="small">
                  Confirm
                </Button>
                <Button appearance="subtle" icon={<DeleteRegular />} onClick={() => setDeleteConfirm(true)} size="small">
                  Delete
                </Button>
              </>
            )}
            {status === 'confirmed' && (
              <>
                <ToolbarDivider />
                <Button appearance="outline" icon={<ArrowUploadRegular />} onClick={() => setConfirmAction('post')} size="small">
                  Post
                </Button>
                <Button appearance="subtle" icon={<ArrowUndoRegular />} onClick={() => setConfirmAction('unconfirm')} size="small">
                  Unconfirm
                </Button>
              </>
            )}
            <ToolbarDivider />
            <Button appearance="outline" icon={<LinkRegular />} onClick={openTxPicker} size="small" disabled={!invoiceData?.total}>
              Link Transaction
            </Button>
          </>
        )}
      </div>

      <div className={styles.pageBody}>
        <div className={styles.header}>
          <Breadcrumb>
            <BreadcrumbItem>
              <BreadcrumbButton onClick={() => guardedNavigate('/invoices')}>Invoices</BreadcrumbButton>
            </BreadcrumbItem>
            <BreadcrumbDivider />
            <BreadcrumbItem>
              <BreadcrumbButton current>
                {isNew ? 'New Invoice' : (invoiceData?.invoiceNumber || 'Draft Invoice')}
              </BreadcrumbButton>
            </BreadcrumbItem>
          </Breadcrumb>
          <div className={styles.titleRow}>
            <Text className={styles.title}>
              {isNew ? 'New Invoice' : (invoiceData?.invoiceNumber || 'Draft Invoice')}
            </Text>
            {!isNew && (
              <Badge appearance="filled" color={statusColors[status]} size="medium">
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Badge>
            )}
            {isPosted && invoiceData?.paymentStatus && (
              <Badge appearance="filled" color={paymentColors[invoiceData.paymentStatus]} size="medium">
                {invoiceData.paymentStatus.charAt(0).toUpperCase() + invoiceData.paymentStatus.slice(1)}
              </Badge>
            )}
          </div>
        </div>

        {error && <MessageBar intent="error" className={styles.message}><MessageBarBody>{error}</MessageBarBody></MessageBar>}
        {success && <MessageBar intent="success" className={styles.message}><MessageBarBody>Invoice saved successfully.</MessageBarBody></MessageBar>}
        {isLocked && <MessageBar intent="warning" className={styles.message}><MessageBarBody>{lockReason || 'This record is locked.'}</MessageBarBody></MessageBar>}
        {errors.length > 0 && (
          <MessageBar intent="error" className={styles.message}>
            <MessageBarBody>
              <strong>Consistency check found {errors.length} error(s):</strong>
              <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px' }}>
                {errors.map((e, i) => (
                  <li key={i}>{e.message}</li>
                ))}
              </ul>
              Use <strong>Recalculate</strong> to realign invoice lines to current source data.
            </MessageBarBody>
          </MessageBar>
        )}

        {!isNew && (
          <TabList selectedValue={tab} onTabSelect={(e, data) => setTab(data.value)} className={styles.tabs}>
            <Tab value="invoice">Invoice</Tab>
            <Tab value="pdf">PDF Preview</Tab>
          </TabList>
        )}

        <div className={styles.tabContent}>
          {/* Invoice tab (or new form) — all lines managed here */}
          {(isNew || tab === 'invoice') && (
            <>
              <fieldset disabled={!!isReadOnly} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0, ...(isReadOnly ? { pointerEvents: 'none', opacity: 0.6 } : {}) }}>
                <FormSection title="Invoice Details">
                  <FormField changed={changedFields.has('clientId')}>
                    <Field label="Client" required>
                      <Select
                        value={form.clientId}
                        onChange={handleChange('clientId')}
                        disabled={!isNew}
                      >
                        <option value="">Select client...</option>
                        {allClients.map((c) => (
                          <option key={c._id} value={c._id}>{c.companyName}</option>
                        ))}
                      </Select>
                    </Field>
                  </FormField>
                  <FormField>
                    <Field label="Invoice Number">
                      <Input value={form.invoiceNumber || '—'} disabled />
                    </Field>
                  </FormField>
                  <FormField changed={changedFields.has('invoiceDate')}>
                    <Field label="Invoice Date">
                      <Input type="date" value={form.invoiceDate} onChange={handleChange('invoiceDate')} />
                    </Field>
                  </FormField>
                  <FormField changed={changedFields.has('servicePeriodStart')}>
                    <Field label="Service Period Start">
                      <Input type="date" value={form.servicePeriodStart} onChange={handleChange('servicePeriodStart')} />
                    </Field>
                  </FormField>
                  <FormField changed={changedFields.has('dueDate')}>
                    <Field label="Due Date">
                      <Input type="date" value={form.dueDate} onChange={handleChange('dueDate')} />
                    </Field>
                  </FormField>
                  <FormField changed={changedFields.has('servicePeriodEnd')}>
                    <Field label="Service Period End">
                      <Input type="date" value={form.servicePeriodEnd} onChange={handleChange('servicePeriodEnd')} />
                    </Field>
                  </FormField>
                </FormSection>

                <FormField fullWidth changed={changedFields.has('additionalNotes')}>
                  <Field label="Additional Notes" style={{ marginTop: '8px' }}>
                    <Textarea
                      value={form.additionalNotes}
                      onChange={handleChange('additionalNotes')}
                      resize="vertical"
                      rows={2}
                    />
                  </Field>
                </FormField>

                {/* Invoice Lines — unified view */}
                <div style={{ marginTop: '24px' }}>
                  <div className={styles.sectionHeader}>
                    <Text style={{ fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400 }}>
                      Line Sources ({form.lines.length})
                    </Text>
                    {!isReadOnly && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button appearance="outline" icon={<AddRegular />} size="small" onClick={openTimesheetPicker} disabled={!form.clientId}>
                          Add Timesheets
                        </Button>
                        <Button appearance="outline" icon={<AddRegular />} size="small" onClick={openExpensePicker} disabled={!form.clientId}>
                          Add Expenses
                        </Button>
                        <Button appearance="outline" icon={<AddRegular />} size="small" onClick={addWriteInLine}>
                          Add Line
                        </Button>
                      </div>
                    )}
                  </div>
                  {sortedLines.length === 0 ? (
                    <div className={styles.empty}><Text>No lines added to this invoice.</Text></div>
                  ) : (
                    <DataGrid
                      items={sortedLines}
                      columns={makeUnifiedColumns(!isReadOnly ? removeLine : null, updateWriteInLine, isReadOnly, errorMap, warningMap)}
                      sortable
                      getRowId={(item) => item.id}
                      style={{ width: '100%' }}
                    >
                      <DataGridHeader>
                        <DataGridRow>
                          {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
                        </DataGridRow>
                      </DataGridHeader>
                      <DataGridBody>
                        {({ item, rowId }) => (
                          <DataGridRow key={rowId}>
                            {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                          </DataGridRow>
                        )}
                      </DataGridBody>
                    </DataGrid>
                  )}
                </div>

                {/* Totals — computed live from form.lines */}
                <div className={styles.totalsSection}>
                  <div className={styles.totalRow}>
                    <Text className={styles.totalLabel}>Sub Total:</Text>
                    <Text className={styles.totalValue}>{fmt.format(liveTotals.subtotal)}</Text>
                  </div>
                  <div className={styles.totalRow}>
                    <Text className={styles.totalLabel}>Total VAT:</Text>
                    <Text className={styles.totalValue}>{fmt.format(liveTotals.totalVat)}</Text>
                  </div>
                  <div className={styles.totalRow}>
                    <Text className={`${styles.totalLabel} ${styles.grandTotal}`}>Total Due:</Text>
                    <Text className={`${styles.totalValue} ${styles.grandTotal}`}>{fmt.format(liveTotals.total)}</Text>
                  </div>
                </div>
              </fieldset>

              {isPosted && (
                <FormSection title="Payment">
                  <FormField>
                    <Field label="Payment Status">
                      <Select
                        value={invoiceData?.paymentStatus || 'unpaid'}
                        onChange={(e, data) => handlePaymentChange('paymentStatus', data.value)}
                      >
                        <option value="unpaid">Unpaid</option>
                        <option value="paid">Paid</option>
                        <option value="overdue">Overdue</option>
                      </Select>
                    </Field>
                  </FormField>
                  {invoiceData?.paymentStatus === 'paid' && (
                    <FormField>
                      <Field label="Paid Date">
                        <Input
                          type="date"
                          value={invoiceData?.paidDate || ''}
                          onChange={(e) => handlePaymentChange('paidDate', e.target.value)}
                        />
                      </Field>
                    </FormField>
                  )}
                </FormSection>
              )}

              {/* Balance Card — linked transactions */}
              {!isNew && (
                <FormSection title="Linked Transactions">
                  <FormField fullWidth>
                    <div className={styles.balanceSection}>
                      <div className={styles.balanceRow}>
                        <span>Invoice Total</span>
                        <span>{fmt.format(invoiceData?.total || 0)}</span>
                      </div>

                      {invoiceData?.linkedTransactions?.length > 0 && (
                        <>
                          <div className={styles.balanceGroupLabel}>
                            <span>Linked Transactions</span>
                            <span>{fmt.format(-(invoiceData.transactionsTotal || 0))}</span>
                          </div>
                          {invoiceData.linkedTransactions.map((tx) => (
                            <div key={tx._id} className={styles.balanceSubRow}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Tooltip content="Unlink this transaction" relationship="label" withArrow>
                                  <Button
                                    appearance="subtle"
                                    size="small"
                                    icon={<LinkDismissRegular style={{ fontSize: '14px' }} />}
                                    onClick={() => setUnlinkTarget({ id: tx._id, label: tx.description || tx.date })}
                                    style={{ minWidth: 'auto', padding: '0 2px', height: '20px' }}
                                  />
                                </Tooltip>
                                <Link onClick={() => guardedNavigate(`/transactions/${tx._id}`)}>
                                  {tx.description || 'Transaction'} {tx.date ? `(${tx.date})` : ''}
                                </Link>
                              </span>
                              <span>{fmt.format(-Math.abs(tx.amount))}</span>
                            </div>
                          ))}
                        </>
                      )}

                      <div className={styles.balanceDivider} />
                      {(() => {
                        const remaining = invoiceData?.remainingBalance ?? (invoiceData?.total || 0);
                        const balanceColor = remaining === 0
                          ? tokens.colorPaletteGreenForeground1
                          : remaining < 0
                            ? tokens.colorPaletteRedForeground1
                            : tokens.colorStatusWarningForeground3;
                        return (
                          <div className={styles.balanceTotal}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              Remaining Balance
                              {remaining > 0 && (
                                <Tooltip content="Invoice not fully covered by linked transactions" relationship="label" withArrow>
                                  <WarningFilled style={{ color: tokens.colorStatusWarningForeground3, fontSize: '20px' }} />
                                </Tooltip>
                              )}
                              {remaining < 0 && (
                                <Tooltip content="Linked amounts exceed the invoice total" relationship="label" withArrow>
                                  <WarningFilled style={{ color: tokens.colorPaletteRedForeground1, fontSize: '20px' }} />
                                </Tooltip>
                              )}
                            </span>
                            <span style={{ color: balanceColor }}>
                              {fmt.format(remaining)}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </FormField>
                </FormSection>
              )}
            </>
          )}

          {/* PDF Preview tab */}
          {tab === 'pdf' && (
            <>
              <fieldset disabled={!!isReadOnly} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0, ...(isReadOnly ? { pointerEvents: 'none', opacity: 0.6 } : {}) }}>
                <div style={{ display: 'flex', gap: '24px', marginBottom: '12px' }}>
                  <Switch
                    checked={form.includeTimesheetReport}
                    onChange={(e, data) => { pendingToggleSave.current = true; setForm(prev => ({ ...prev, includeTimesheetReport: data.checked })); }}
                    label="Include Timesheet Report"
                  />
                  <Switch
                    checked={form.includeExpenseReport}
                    onChange={(e, data) => { pendingToggleSave.current = true; setForm(prev => ({ ...prev, includeExpenseReport: data.checked })); }}
                    label="Include Expense Report"
                  />
                </div>
              </fieldset>
              {pdfLoading ? (
                <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Generating PDF..." /></div>
              ) : pdfUrl ? (
                <object
                  data={pdfUrl}
                  type="application/pdf"
                  className={styles.pdfPreview}
                >
                  <Text>PDF preview not available. <a href={pdfUrl} target="_blank" rel="noopener noreferrer">Open in new tab</a></Text>
                </object>
              ) : (
                <Text style={{ color: tokens.colorNeutralForeground3 }}>
                  Save the invoice first to preview the PDF.
                </Text>
              )}
            </>
          )}
        </div>
      </div>

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Invoice"
        message="Are you sure you want to delete this draft invoice? This will not affect timesheets or expenses."
      />

      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleLifecycleAction}
        title={actionLabels[confirmAction]?.title || 'Confirm'}
        message={actionLabels[confirmAction]?.message || 'Are you sure?'}
      />

      {/* Timesheet picker */}
      <ItemPickerDialog
        open={tsPickerOpen}
        onClose={() => setTsPickerOpen(false)}
        onConfirm={handleTimesheetPickerConfirm}
        items={availableTimesheets}
        columns={timesheetPickerColumns}
        title="Select Timesheets"
        alreadySelectedIds={tsSourceIds}
        invoiceId={id}
        filterToggle={tsFilterToggle}
      />

      {/* Expense picker */}
      <ItemPickerDialog
        open={expPickerOpen}
        onClose={() => setExpPickerOpen(false)}
        onConfirm={handleExpensePickerConfirm}
        items={availableExpenses}
        columns={expensePickerColumns}
        filterToggle={expFilterToggle}
        title="Select Expenses"
        alreadySelectedIds={expSourceIds}
        invoiceId={id}
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
                    No credit transactions found.
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
        message={`Are you sure you want to unlink "${unlinkTarget?.label}" from this invoice?`}
      />
    </div>
  );
}
