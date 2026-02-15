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
  SearchBox,
  Checkbox,
  TabList,
  Tab,
} from '@fluentui/react-components';
import { AddRegular, LinkRegular, LinkMultipleRegular, LinkDismissRegular, WarningFilled } from '@fluentui/react-icons';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { transactionsApi, invoicesApi, expensesApi } from '../../api/index.js';
import { usePagination } from '../../hooks/usePagination.js';
import PaginationControls from '../../components/PaginationControls.jsx';

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
  tabContent: {
    paddingTop: '16px',
  },
  overviewRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
    alignItems: 'start',
    '@media (max-width: 768px)': {
      gridTemplateColumns: '1fr',
    },
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
    columnId: 'projectName',
    compare: (a, b) => (a.projectName || '').localeCompare(b.projectName || ''),
    renderHeaderCell: () => 'Project',
    renderCell: (item) => <TableCellLayout>{item.projectName || '\u2014'}</TableCellLayout>,
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

const statusColors = {
  matched: 'success',
  unmatched: 'warning',
  ignored: 'subtle',
};

export default function TransactionForm() {
  const styles = useStyles();
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedTab, setSelectedTab] = useState('overview');

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

  // Unlink confirmation state: { type: 'invoice'|'expense', id, label }
  const [unlinkTarget, setUnlinkTarget] = useState(null);

  const refreshTransaction = useCallback(async () => {
    try {
      const result = await transactionsApi.getById(id);
      setData(result);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  const handleUnlinkConfirm = useCallback(async () => {
    if (!unlinkTarget) return;
    setError(null);
    setSuccess(null);
    try {
      if (unlinkTarget.type === 'invoice') {
        await invoicesApi.unlinkTransaction(unlinkTarget.id, id);
      } else {
        await expensesApi.unlinkTransaction(unlinkTarget.id, id);
      }
      await refreshTransaction();
      setSuccess(`${unlinkTarget.type === 'invoice' ? 'Invoice' : 'Expense'} unlinked successfully.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setUnlinkTarget(null);
    }
  }, [unlinkTarget, id, refreshTransaction]);

  useEffect(() => {
    if (!id) {
      navigate('/transactions');
      return;
    }
    setLoading(true);
    transactionsApi.getById(id)
      .then((result) => setData(result))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleCreateExpense = () => {
    if (!data) return;
    const params = new URLSearchParams();
    params.set('date', data.date);
    params.set('amount', String(Math.abs(data.amount)));
    params.set('description', data.description || '');
    navigate(`/expenses/new?${params.toString()}`);
  };

  // Invoice picker
  const handleOpenInvoicePicker = useCallback(async () => {
    setInvoicePickerOpen(true);
    setInvoiceSearch('');
    setSelectedInvoiceId(null);
    setShowLinkedInvoices(false);
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

  const invoiceColumns = useMemo(() => [
    createTableColumn({
      columnId: 'linked',
      compare: (a, b) => {
        const aLinked = (a.transactions || []).includes(id) ? 1 : 0;
        const bLinked = (b.transactions || []).includes(id) ? 1 : 0;
        return aLinked - bLinked;
      },
      renderHeaderCell: () => '',
      renderCell: (item) => {
        const isLinked = (item.transactions || []).includes(id);
        if (!isLinked) return null;
        return (
          <TableCellLayout>
            <Tooltip content="This invoice is already linked to this transaction" relationship="label" withArrow>
              <LinkMultipleRegular style={{ color: tokens.colorBrandForeground1, fontSize: '16px' }} />
            </Tooltip>
          </TableCellLayout>
        );
      },
    }),
    ...baseInvoiceColumns,
  ], [id]);

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
      await invoicesApi.linkTransaction(selectedInvoiceId, id);
      await transactionsApi.updateMapping(id, { status: 'matched' });
      await refreshTransaction();
      setSuccess('Transaction linked to invoice successfully.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setInvoicePickerOpen(false);
    }
  };

  // Expense picker
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
        const aLinked = (a.transactions || []).includes(id) ? 1 : 0;
        const bLinked = (b.transactions || []).includes(id) ? 1 : 0;
        return aLinked - bLinked;
      },
      renderHeaderCell: () => '',
      renderCell: (item) => {
        const isLinked = (item.transactions || []).includes(id);
        if (!isLinked) return null;
        return (
          <TableCellLayout>
            <Tooltip content="This expense is already linked to this transaction" relationship="label" withArrow>
              <LinkMultipleRegular style={{ color: tokens.colorBrandForeground1, fontSize: '16px' }} />
            </Tooltip>
          </TableCellLayout>
        );
      },
    }),
    ...baseExpenseColumns,
  ], [id]);

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
      await expensesApi.linkTransaction(selectedExpenseId, id);
      await transactionsApi.updateMapping(id, { status: 'matched' });
      await refreshTransaction();
      setSuccess('Transaction linked to expense successfully.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setExpensePickerOpen(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <FormCommandBar onBack={() => navigate('/transactions')} />
        <div className={styles.loading}><Spinner label="Loading..." /></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.page}>
        <FormCommandBar onBack={() => navigate('/transactions')} />
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
        onBack={() => navigate('/transactions')}
        locked
      >
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
        <Tooltip
          content="Only debit transactions (negative amounts) can be linked to expenses"
          relationship="description"
          withArrow
        >
          <Button
            appearance="outline"
            icon={<LinkRegular />}
            onClick={handleOpenExpensePicker}
            disabled={!isDebit}
            size="small"
          >
            Link to Expense
          </Button>
        </Tooltip>
      </FormCommandBar>

      <div className={styles.pageBody}>
        <div className={styles.header}>
          <Breadcrumb>
            <BreadcrumbItem>
              <BreadcrumbButton onClick={() => navigate('/transactions')}>Transactions</BreadcrumbButton>
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

        <TabList selectedValue={selectedTab} onTabSelect={(e, d) => setSelectedTab(d.value)}>
          <Tab value="overview">Overview</Tab>
          <Tab value="details">Details</Tab>
        </TabList>

        <div className={styles.tabContent}>
          {selectedTab === 'overview' && (
            <div className={styles.overviewRow}>
              <fieldset disabled style={{ border: 'none', padding: 0, margin: 0, pointerEvents: 'none', opacity: 0.6 }}>
                <FormSection title="Transaction Details">
                  <FormField fullWidth>
                    <Field label="Date">
                      <Input value={data.date || ''} readOnly />
                    </Field>
                  </FormField>
                  <FormField fullWidth>
                    <Field label="Amount">
                      <Input
                        value={fmtGBP.format(data.amount)}
                        readOnly
                        style={{ color: data.amount >= 0 ? '#107C10' : '#D13438' }}
                      />
                    </Field>
                  </FormField>
                  <FormField fullWidth>
                    <Field label="Current Status">
                      <Badge appearance="filled" color={statusColors[data.status] || 'informative'} size="medium">
                        {data.status}
                      </Badge>
                    </Field>
                  </FormField>
                </FormSection>
              </fieldset>

              <FormSection title="Balance">
                <FormField fullWidth>
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
                              <Link onClick={() => navigate(`/invoices/${inv._id}`)}>
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
                              <Link onClick={() => navigate(`/expenses/${exp._id}`)}>
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
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            Remaining Balance
                            {remaining > 0 && (
                              <Tooltip content="Transaction not fully covered by linked items" relationship="label" withArrow>
                                <WarningFilled style={{ color: tokens.colorStatusWarningForeground3, fontSize: '20px' }} />
                              </Tooltip>
                            )}
                            {remaining < 0 && (
                              <Tooltip content="Linked amounts exceed the transaction amount" relationship="label" withArrow>
                                <WarningFilled style={{ color: tokens.colorPaletteRedForeground1, fontSize: '20px' }} />
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
            </div>
          )}

          {selectedTab === 'details' && (
            <fieldset disabled style={{ border: 'none', padding: 0, margin: 0, pointerEvents: 'none', opacity: 0.6 }}>
              <FormSection title="Transaction Details">
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
                      <Link onClick={() => navigate(`/import-jobs/${data.importJobId}`)}>
                        {data.importJobId}
                      </Link>
                    ) : (
                      <Text>{'\u2014'}</Text>
                    )}
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
          )}
        </div>
      </div>

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
                  <div style={{ padding: '24px', textAlign: 'center' }}>
                    <Spinner size="small" label="Loading invoices..." />
                  </div>
                ) : filteredInvoices.length === 0 ? (
                  <Text style={{ padding: '16px', color: tokens.colorNeutralForeground3 }}>
                    No invoices found.
                  </Text>
                ) : (
                  <DataGrid
                    items={invoicePagination.pageItems}
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
              <PaginationControls
                page={invoicePagination.page}
                pageSize={invoicePagination.pageSize}
                totalItems={invoicePagination.totalItems}
                totalPages={invoicePagination.totalPages}
                onPageChange={invoicePagination.setPage}
                onPageSizeChange={invoicePagination.setPageSize}
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
                  <div style={{ padding: '24px', textAlign: 'center' }}>
                    <Spinner size="small" label="Loading expenses..." />
                  </div>
                ) : filteredExpenses.length === 0 ? (
                  <Text style={{ padding: '16px', color: tokens.colorNeutralForeground3 }}>
                    No expenses found.
                  </Text>
                ) : (
                  <DataGrid
                    items={expensePagination.pageItems}
                    columns={expenseColumns}
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
                            backgroundColor: selectedExpenseId === item._id ? tokens.colorBrandBackground2 : undefined,
                          }}
                          onClick={() => setSelectedExpenseId(item._id)}
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
              <PaginationControls
                page={expensePagination.page}
                pageSize={expensePagination.pageSize}
                totalItems={expensePagination.totalItems}
                totalPages={expensePagination.totalPages}
                onPageChange={expensePagination.setPage}
                onPageSizeChange={expensePagination.setPageSize}
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
    </div>
  );
}
