import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Badge,
  Link,
  Tooltip,
  Spinner,
  MessageBar,
  MessageBarBody,
  OverlayDrawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Field,
  Textarea,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableCellLayout,
  createTableColumn,
  SearchBox,
  Checkbox,
  Divider,
} from '@fluentui/react-components';
import {
  DismissRegular,
  AddRegular,
  LinkRegular,
  LinkMultipleRegular,
  LinkDismissRegular,
  EyeOffRegular,
  ArrowUndoRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  OpenRegular,
} from '@fluentui/react-icons';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import PaginationControls from '../../components/PaginationControls.jsx';
import { usePagination } from '../../hooks/usePagination.js';
import { transactionsApi, invoicesApi, expensesApi } from '../../api/index.js';

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    padding: '12px 0',
  },
  message: {
    marginBottom: '12px',
  },
  section: {
    marginBottom: '16px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    padding: '8px 0',
    userSelect: 'none',
  },
  sectionTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
  },
  fieldRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
  },
  fieldLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    minWidth: '120px',
  },
  fieldValue: {
    fontSize: tokens.fontSizeBase300,
    textAlign: 'right',
    wordBreak: 'break-word',
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
  sourceSection: {
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
  loading: {
    display: 'flex',
    justifyContent: 'center',
    padding: '48px',
  },
});

const fmtGBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

const statusColors = {
  matched: 'success',
  unmatched: 'warning',
  ignored: 'subtle',
};

const invoiceStatusColors = {
  draft: 'warning',
  confirmed: 'informative',
  posted: 'success',
};

const baseInvoiceColumns = [
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

const baseExpenseColumns = [
  createTableColumn({
    columnId: 'date',
    compare: (a, b) => (a.date || '').localeCompare(b.date || ''),
    renderHeaderCell: () => 'Date',
    renderCell: (item) => <TableCellLayout>{item.date || '\u2014'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'clientName',
    compare: (a, b) => (a.clientName || '').localeCompare(b.clientName || ''),
    renderHeaderCell: () => 'Client',
    renderCell: (item) => <TableCellLayout>{item.clientName || '\u2014'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'expenseType',
    compare: (a, b) => (a.expenseType || '').localeCompare(b.expenseType || ''),
    renderHeaderCell: () => 'Type',
    renderCell: (item) => <TableCellLayout>{item.expenseType || '\u2014'}</TableCellLayout>,
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
    renderCell: (item) => <TableCellLayout>{fmtGBP.format(item.amount || 0)}</TableCellLayout>,
  }),
];

export default function TransactionDrawer({ transactionId, onClose, onMutate }) {
  const styles = useStyles();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [sourceExpanded, setSourceExpanded] = useState(false);

  // Invoice picker state
  const [invoicePickerOpen, setInvoicePickerOpen] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [showLinkedInvoices, setShowLinkedInvoices] = useState(false);

  // Expense picker state
  const [expensePickerOpen, setExpensePickerOpen] = useState(false);
  const [expensesList, setExpensesList] = useState([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expenseSearch, setExpenseSearch] = useState('');
  const [selectedExpenseId, setSelectedExpenseId] = useState(null);
  const [showLinkedExpenses, setShowLinkedExpenses] = useState(false);

  // Unlink confirmation state
  const [unlinkTarget, setUnlinkTarget] = useState(null);

  // Ignore dialog state
  const [ignoreDialogOpen, setIgnoreDialogOpen] = useState(false);
  const [ignoreReason, setIgnoreReason] = useState('');

  // Load transaction data
  useEffect(() => {
    if (!transactionId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSuccess(null);
    setSourceExpanded(false);
    transactionsApi.getById(transactionId)
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [transactionId]);

  const refreshTransaction = useCallback(async () => {
    if (!transactionId) return;
    try {
      const result = await transactionsApi.getById(transactionId);
      setData(result);
    } catch (err) {
      setError(err.message);
    }
  }, [transactionId]);

  const isDebit = data?.amount < 0;
  const isIgnored = data?.status === 'ignored';
  const isUnmatched = data?.status === 'unmatched';

  // -- Actions --

  const handleCreateExpense = () => {
    if (!data) return;
    const params = new URLSearchParams();
    params.set('date', data.date);
    params.set('amount', String(Math.abs(data.amount)));
    params.set('description', data.description || '');
    if (data.reference) params.set('externalReference', data.reference);
    params.set('transactionId', transactionId);
    navigate(`/expenses/new?${params.toString()}`);
  };

  const handleIgnoreConfirm = useCallback(async () => {
    setError(null);
    setSuccess(null);
    try {
      await transactionsApi.updateMapping(transactionId, { status: 'ignored', ignoreReason });
      await refreshTransaction();
      onMutate?.();
      setSuccess('Transaction ignored.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setIgnoreDialogOpen(false);
      setIgnoreReason('');
    }
  }, [transactionId, ignoreReason, refreshTransaction, onMutate]);

  const handleRestore = useCallback(async () => {
    setError(null);
    setSuccess(null);
    try {
      await transactionsApi.updateMapping(transactionId, { status: 'unmatched' });
      await refreshTransaction();
      onMutate?.();
      setSuccess('Transaction restored to unmatched.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    }
  }, [transactionId, refreshTransaction, onMutate]);

  const handleUnlinkConfirm = useCallback(async () => {
    if (!unlinkTarget) return;
    setError(null);
    setSuccess(null);
    try {
      if (unlinkTarget.type === 'invoice') {
        await invoicesApi.unlinkTransaction(unlinkTarget.id, transactionId);
      } else {
        await expensesApi.unlinkTransaction(unlinkTarget.id, transactionId);
      }
      await refreshTransaction();
      onMutate?.();
      setSuccess(`${unlinkTarget.type === 'invoice' ? 'Invoice' : 'Expense'} unlinked successfully.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setUnlinkTarget(null);
    }
  }, [unlinkTarget, transactionId, refreshTransaction, onMutate]);

  // -- Invoice Picker --

  const handleOpenInvoicePicker = useCallback(async () => {
    setInvoicePickerOpen(true);
    setInvoiceSearch('');
    setSelectedInvoiceId(null);
    setShowLinkedInvoices(false);
    setInvoicesLoading(true);
    try {
      const result = await invoicesApi.getAll();
      setInvoices(result.filter((inv) => inv.status !== 'draft'));
    } catch (err) {
      setError(err.message);
    } finally {
      setInvoicesLoading(false);
    }
  }, []);

  const invoiceColumns = useMemo(() => [
    createTableColumn({
      columnId: 'linked',
      compare: (a, b) => {
        const aLinked = (a.transactions || []).includes(transactionId) ? 1 : 0;
        const bLinked = (b.transactions || []).includes(transactionId) ? 1 : 0;
        return aLinked - bLinked;
      },
      renderHeaderCell: () => '',
      renderCell: (item) => {
        const isLinked = (item.transactions || []).includes(transactionId);
        if (!isLinked) return null;
        return (
          <TableCellLayout>
            <Tooltip content="Already linked to this transaction" relationship="label" withArrow>
              <LinkMultipleRegular style={{ color: tokens.colorBrandForeground1, fontSize: '16px' }} />
            </Tooltip>
          </TableCellLayout>
        );
      },
    }),
    ...baseInvoiceColumns,
  ], [transactionId]);

  const filteredInvoices = useMemo(() => {
    let list = invoices;
    if (!showLinkedInvoices) {
      list = list.filter((inv) => !(inv.transactions?.length > 0));
    }
    if (invoiceSearch) {
      const q = invoiceSearch.toLowerCase();
      list = list.filter((inv) =>
        (inv.invoiceNumber || '').toLowerCase().includes(q) ||
        (inv.clientName || '').toLowerCase().includes(q) ||
        (inv.status || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [invoices, invoiceSearch, showLinkedInvoices]);

  const invoicePagination = usePagination(filteredInvoices, { defaultPageSize: 10 });

  const handleInvoiceConfirm = async () => {
    if (!selectedInvoiceId) return;
    setError(null);
    setSuccess(null);
    try {
      await invoicesApi.linkTransaction(selectedInvoiceId, transactionId);
      await transactionsApi.updateMapping(transactionId, { status: 'matched' });
      await refreshTransaction();
      onMutate?.();
      setSuccess('Transaction linked to invoice successfully.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setInvoicePickerOpen(false);
    }
  };

  // -- Expense Picker --

  const handleOpenExpensePicker = useCallback(async () => {
    setExpensePickerOpen(true);
    setExpenseSearch('');
    setSelectedExpenseId(null);
    setShowLinkedExpenses(false);
    setExpensesLoading(true);
    try {
      const result = await expensesApi.getAll();
      setExpensesList(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setExpensesLoading(false);
    }
  }, []);

  const expenseColumns = useMemo(() => [
    createTableColumn({
      columnId: 'linked',
      compare: (a, b) => {
        const aLinked = (a.transactions || []).includes(transactionId) ? 1 : 0;
        const bLinked = (b.transactions || []).includes(transactionId) ? 1 : 0;
        return aLinked - bLinked;
      },
      renderHeaderCell: () => '',
      renderCell: (item) => {
        const isLinked = (item.transactions || []).includes(transactionId);
        if (!isLinked) return null;
        return (
          <TableCellLayout>
            <Tooltip content="Already linked to this transaction" relationship="label" withArrow>
              <LinkMultipleRegular style={{ color: tokens.colorBrandForeground1, fontSize: '16px' }} />
            </Tooltip>
          </TableCellLayout>
        );
      },
    }),
    ...baseExpenseColumns,
  ], [transactionId]);

  const filteredExpenses = useMemo(() => {
    let list = expensesList;
    if (!showLinkedExpenses) {
      list = list.filter((exp) => !(exp.transactions?.length > 0));
    }
    if (expenseSearch) {
      const q = expenseSearch.toLowerCase();
      list = list.filter((exp) =>
        (exp.description || '').toLowerCase().includes(q) ||
        (exp.clientName || '').toLowerCase().includes(q) ||
        (exp.expenseType || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [expensesList, expenseSearch, showLinkedExpenses]);

  const expensePagination = usePagination(filteredExpenses, { defaultPageSize: 10 });

  const handleExpenseConfirm = async () => {
    if (!selectedExpenseId) return;
    setError(null);
    setSuccess(null);
    try {
      await expensesApi.linkTransaction(selectedExpenseId, transactionId);
      await transactionsApi.updateMapping(transactionId, { status: 'matched' });
      await refreshTransaction();
      onMutate?.();
      setSuccess('Transaction linked to expense successfully.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setExpensePickerOpen(false);
    }
  };

  return (
    <>
      <OverlayDrawer
        position="end"
        size="large"
        open={!!transactionId}
        onOpenChange={(_, d) => { if (!d.open) onClose(); }}
      >
        <DrawerHeader>
          <DrawerHeaderTitle
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tooltip content="Open full form" relationship="label" withArrow>
                  <Button
                    appearance="subtle"
                    icon={<OpenRegular />}
                    onClick={() => { onClose(); navigate(`/transactions/${transactionId}`); }}
                    size="small"
                  />
                </Tooltip>
                <Button
                  appearance="subtle"
                  icon={<DismissRegular />}
                  onClick={onClose}
                />
              </div>
            }
          >
            {data && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold }}>
                  {data.description || 'Transaction'}
                </span>
                <Badge appearance="filled" color={statusColors[data.status] || 'informative'} size="small">
                  {data.status}
                </Badge>
              </div>
            )}
          </DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody>
          {loading && (
            <div className={styles.loading}><Spinner label="Loading..." /></div>
          )}
          {!loading && !data && transactionId && (
            <MessageBar intent="error"><MessageBarBody>Transaction not found.</MessageBarBody></MessageBar>
          )}
          {!loading && data && (
            <>
              {/* Action Toolbar */}
              <div className={styles.toolbar}>
                <Tooltip content="Only debit transactions can be converted to expenses" relationship="description" withArrow>
                  <Button appearance="outline" icon={<AddRegular />} onClick={handleCreateExpense} disabled={!isDebit || isIgnored} size="small">
                    Create Expense
                  </Button>
                </Tooltip>
                <Tooltip content="Only credit transactions can be linked to invoices" relationship="description" withArrow>
                  <Button appearance="outline" icon={<LinkRegular />} onClick={handleOpenInvoicePicker} disabled={isDebit || isIgnored} size="small">
                    Link to Invoice
                  </Button>
                </Tooltip>
                <Tooltip content="Only debit transactions can be linked to expenses" relationship="description" withArrow>
                  <Button appearance="outline" icon={<LinkRegular />} onClick={handleOpenExpensePicker} disabled={!isDebit || isIgnored} size="small">
                    Link to Expense
                  </Button>
                </Tooltip>
                <Button appearance="outline" icon={<EyeOffRegular />} onClick={() => { setIgnoreReason(''); setIgnoreDialogOpen(true); }} disabled={!isUnmatched} size="small">
                  Ignore
                </Button>
                {isIgnored && (
                  <Button appearance="outline" icon={<ArrowUndoRegular />} onClick={handleRestore} size="small">
                    Restore
                  </Button>
                )}
              </div>

              {/* Messages */}
              {error && <MessageBar intent="error" className={styles.message}><MessageBarBody>{error}</MessageBarBody></MessageBar>}
              {success && <MessageBar intent="success" className={styles.message}><MessageBarBody>{success}</MessageBarBody></MessageBar>}
              {isIgnored && data.ignoreReason && (
                <MessageBar intent="warning" className={styles.message}><MessageBarBody>Ignored: {data.ignoreReason}</MessageBarBody></MessageBar>
              )}

              {/* Transaction Summary */}
              <div className={styles.section}>
                <Text className={styles.sectionTitle} style={{ display: 'block', marginBottom: '8px' }}>Summary</Text>
                <div className={styles.fieldRow}>
                  <Text className={styles.fieldLabel}>Date</Text>
                  <Text className={styles.fieldValue}>{data.date}</Text>
                </div>
                <div className={styles.fieldRow}>
                  <Text className={styles.fieldLabel}>Amount</Text>
                  <Text className={styles.fieldValue} style={{ color: data.amount >= 0 ? '#107C10' : '#D13438' }}>
                    {fmtGBP.format(data.amount)}
                  </Text>
                </div>
                <div className={styles.fieldRow}>
                  <Text className={styles.fieldLabel}>Status</Text>
                  <Badge appearance="filled" color={statusColors[data.status] || 'informative'} size="small">
                    {data.status}
                  </Badge>
                </div>
              </div>

              <Divider />

              {/* Balance Section */}
              <div className={styles.section} style={{ marginTop: '16px' }}>
                <Text className={styles.sectionTitle} style={{ display: 'block', marginBottom: '8px' }}>Balance</Text>
                <div className={styles.balanceSection}>
                  <div className={styles.balanceRow}>
                    <span>Transaction Amount</span>
                    <span>{fmtGBP.format(Math.abs(data.amount))}</span>
                  </div>

                  {!isDebit && data.linkedInvoices?.length > 0 && (
                    <>
                      <div className={styles.balanceGroupLabel}>
                        <span>Linked Invoices</span>
                        <span>{fmtGBP.format(-data.invoicesTotal)}</span>
                      </div>
                      {data.linkedInvoices.map((inv) => (
                        <div key={inv._id} className={styles.balanceSubRow}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Tooltip content="Unlink this invoice" relationship="label" withArrow>
                              <Button
                                appearance="subtle"
                                size="small"
                                icon={<LinkDismissRegular style={{ fontSize: '14px' }} />}
                                onClick={() => setUnlinkTarget({ type: 'invoice', id: inv._id, label: inv.invoiceNumber || 'Draft' })}
                                style={{ minWidth: 'auto', padding: '0 2px', height: '20px' }}
                              />
                            </Tooltip>
                            <Link onClick={() => { onClose(); navigate(`/invoices/${inv._id}`); }}>
                              {inv.invoiceNumber || 'Draft'} {inv.invoiceDate ? `(${inv.invoiceDate})` : ''}
                            </Link>
                          </span>
                          <span>{fmtGBP.format(-inv.total)}</span>
                        </div>
                      ))}
                    </>
                  )}

                  {isDebit && data.linkedExpenses?.length > 0 && (
                    <>
                      <div className={styles.balanceGroupLabel}>
                        <span>Linked Expenses</span>
                        <span>{fmtGBP.format(-data.expensesTotal)}</span>
                      </div>
                      {data.linkedExpenses.map((exp) => (
                        <div key={exp._id} className={styles.balanceSubRow}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Tooltip content="Unlink this expense" relationship="label" withArrow>
                              <Button
                                appearance="subtle"
                                size="small"
                                icon={<LinkDismissRegular style={{ fontSize: '14px' }} />}
                                onClick={() => setUnlinkTarget({ type: 'expense', id: exp._id, label: exp.expenseType || exp.description || 'Expense' })}
                                style={{ minWidth: 'auto', padding: '0 2px', height: '20px' }}
                              />
                            </Tooltip>
                            <Link onClick={() => { onClose(); navigate(`/expenses/${exp._id}`); }}>
                              {exp.expenseType || exp.description || 'Expense'} {exp.date ? `(${exp.date})` : ''}
                            </Link>
                          </span>
                          <span>{fmtGBP.format(-exp.amount)}</span>
                        </div>
                      ))}
                    </>
                  )}

                  <div className={styles.balanceDivider} />
                  {(() => {
                    const remaining = data.remainingBalance ?? Math.abs(data.amount);
                    const balanceColor = remaining === 0
                      ? tokens.colorPaletteGreenForeground1
                      : remaining < 0
                        ? tokens.colorPaletteRedForeground1
                        : tokens.colorStatusWarningForeground3;
                    return (
                      <div className={styles.balanceTotal}>
                        <span>Remaining Balance</span>
                        <span style={{ color: balanceColor }}>{fmtGBP.format(remaining)}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <Divider />

              {/* Details Section */}
              <div className={styles.section} style={{ marginTop: '16px' }}>
                <Text className={styles.sectionTitle} style={{ display: 'block', marginBottom: '8px' }}>Details</Text>
                <div className={styles.fieldRow}>
                  <Text className={styles.fieldLabel}>Description</Text>
                  <Text className={styles.fieldValue}>{data.description || '\u2014'}</Text>
                </div>
                <div className={styles.fieldRow}>
                  <Text className={styles.fieldLabel}>Reference</Text>
                  <Text className={styles.fieldValue}>{data.reference || '\u2014'}</Text>
                </div>
                <div className={styles.fieldRow}>
                  <Text className={styles.fieldLabel}>Account Name</Text>
                  <Text className={styles.fieldValue}>{data.accountName || '\u2014'}</Text>
                </div>
                <div className={styles.fieldRow}>
                  <Text className={styles.fieldLabel}>Account Number</Text>
                  <Text className={styles.fieldValue}>{data.accountNumber || '\u2014'}</Text>
                </div>
                <div className={styles.fieldRow}>
                  <Text className={styles.fieldLabel}>Import Job</Text>
                  <Text className={styles.fieldValue}>
                    {data.importJobId ? (
                      <Link onClick={() => { onClose(); navigate(`/import-jobs/${data.importJobId}`); }}>
                        {data.importJobId}
                      </Link>
                    ) : '\u2014'}
                  </Text>
                </div>
              </div>

              {/* Source Section (collapsible) */}
              {data.source && (
                <>
                  <Divider />
                  <div className={styles.section} style={{ marginTop: '16px' }}>
                    <div className={styles.sectionHeader} onClick={() => setSourceExpanded(!sourceExpanded)}>
                      {sourceExpanded ? <ChevronDownRegular /> : <ChevronRightRegular />}
                      <Text className={styles.sectionTitle}>Source Data</Text>
                    </div>
                    {sourceExpanded && (
                      <div className={styles.sourceSection}>
                        {JSON.stringify(data.source, null, 2)}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </DrawerBody>
      </OverlayDrawer>

      {/* Invoice Picker Dialog */}
      <Dialog open={invoicePickerOpen} onOpenChange={(e, d) => { if (!d.open) setInvoicePickerOpen(false); }}>
        <DialogSurface style={{ maxWidth: '800px', width: '90vw', maxHeight: '85vh' }}>
          <DialogBody>
            <DialogTitle>Link to Invoice</DialogTitle>
            <DialogContent>
              <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <SearchBox
                  placeholder="Search by invoice number, client, or status..."
                  value={invoiceSearch}
                  onChange={(e, d) => setInvoiceSearch(d.value)}
                  size="small"
                  style={{ flex: 1 }}
                />
                <Checkbox
                  checked={showLinkedInvoices}
                  onChange={(e, d) => setShowLinkedInvoices(d.checked)}
                  label="Show linked"
                  size="medium"
                  style={{ whiteSpace: 'nowrap' }}
                />
              </div>
              <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                {invoicesLoading ? (
                  <div style={{ padding: '24px', textAlign: 'center' }}><Spinner size="small" label="Loading invoices..." /></div>
                ) : filteredInvoices.length === 0 ? (
                  <Text style={{ padding: '16px', color: tokens.colorNeutralForeground3 }}>No invoices found.</Text>
                ) : (
                  <DataGrid items={invoicePagination.pageItems} columns={invoiceColumns} sortable getRowId={(item) => item._id} style={{ width: '100%' }}>
                    <DataGridHeader>
                      <DataGridRow>
                        {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
                      </DataGridRow>
                    </DataGridHeader>
                    <DataGridBody>
                      {({ item, rowId }) => (
                        <DataGridRow
                          key={rowId}
                          style={{ cursor: 'pointer', backgroundColor: selectedInvoiceId === item._id ? tokens.colorBrandBackground2 : undefined }}
                          onClick={() => setSelectedInvoiceId(item._id)}
                        >
                          {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                        </DataGridRow>
                      )}
                    </DataGridBody>
                  </DataGrid>
                )}
              </div>
              <PaginationControls
                page={invoicePagination.page} pageSize={invoicePagination.pageSize}
                totalItems={invoicePagination.totalItems} totalPages={invoicePagination.totalPages}
                onPageChange={invoicePagination.setPage} onPageSizeChange={invoicePagination.setPageSize}
              />
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

      {/* Expense Picker Dialog */}
      <Dialog open={expensePickerOpen} onOpenChange={(e, d) => { if (!d.open) setExpensePickerOpen(false); }}>
        <DialogSurface style={{ maxWidth: '800px', width: '90vw', maxHeight: '85vh' }}>
          <DialogBody>
            <DialogTitle>Link to Expense</DialogTitle>
            <DialogContent>
              <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <SearchBox
                  placeholder="Search by description, client, or type..."
                  value={expenseSearch}
                  onChange={(e, d) => setExpenseSearch(d.value)}
                  size="small"
                  style={{ flex: 1 }}
                />
                <Checkbox
                  checked={showLinkedExpenses}
                  onChange={(e, d) => setShowLinkedExpenses(d.checked)}
                  label="Show linked"
                  size="medium"
                  style={{ whiteSpace: 'nowrap' }}
                />
              </div>
              <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                {expensesLoading ? (
                  <div style={{ padding: '24px', textAlign: 'center' }}><Spinner size="small" label="Loading expenses..." /></div>
                ) : filteredExpenses.length === 0 ? (
                  <Text style={{ padding: '16px', color: tokens.colorNeutralForeground3 }}>No expenses found.</Text>
                ) : (
                  <DataGrid items={expensePagination.pageItems} columns={expenseColumns} sortable getRowId={(item) => item._id} style={{ width: '100%' }}>
                    <DataGridHeader>
                      <DataGridRow>
                        {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
                      </DataGridRow>
                    </DataGridHeader>
                    <DataGridBody>
                      {({ item, rowId }) => (
                        <DataGridRow
                          key={rowId}
                          style={{ cursor: 'pointer', backgroundColor: selectedExpenseId === item._id ? tokens.colorBrandBackground2 : undefined }}
                          onClick={() => setSelectedExpenseId(item._id)}
                        >
                          {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                        </DataGridRow>
                      )}
                    </DataGridBody>
                  </DataGrid>
                )}
              </div>
              <PaginationControls
                page={expensePagination.page} pageSize={expensePagination.pageSize}
                totalItems={expensePagination.totalItems} totalPages={expensePagination.totalPages}
                onPageChange={expensePagination.setPage} onPageSizeChange={expensePagination.setPageSize}
              />
              {selectedExpenseId && (
                <Text style={{ marginTop: '8px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 }}>
                  Selected: {expensesList.find((e) => e._id === selectedExpenseId)?.description || selectedExpenseId}
                </Text>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setExpensePickerOpen(false)}>Cancel</Button>
              <Button appearance="primary" onClick={handleExpenseConfirm} disabled={!selectedExpenseId}>Confirm</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Unlink Confirmation */}
      <ConfirmDialog
        open={!!unlinkTarget}
        onClose={() => setUnlinkTarget(null)}
        onConfirm={handleUnlinkConfirm}
        title={`Unlink ${unlinkTarget?.type === 'invoice' ? 'Invoice' : 'Expense'}`}
        message={`Are you sure you want to unlink "${unlinkTarget?.label}" from this transaction?`}
      />

      {/* Ignore Confirmation Dialog */}
      <Dialog open={ignoreDialogOpen} onOpenChange={(e, d) => { if (!d.open) setIgnoreDialogOpen(false); }}>
        <DialogSurface style={{ maxWidth: '480px' }}>
          <DialogBody>
            <DialogTitle>Ignore Transaction</DialogTitle>
            <DialogContent>
              <Text style={{ display: 'block', marginBottom: '12px' }}>
                This transaction will be marked as ignored. Please provide a reason.
              </Text>
              <Field label="Reason" required>
                <Textarea
                  value={ignoreReason}
                  onChange={(e, d) => setIgnoreReason(d.value)}
                  placeholder="Why is this transaction being ignored?"
                  resize="vertical"
                  rows={3}
                />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setIgnoreDialogOpen(false)}>Cancel</Button>
              <Button appearance="primary" onClick={handleIgnoreConfirm} disabled={!ignoreReason.trim()}>Confirm</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
