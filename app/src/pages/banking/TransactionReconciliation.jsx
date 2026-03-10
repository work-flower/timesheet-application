import { useState, useEffect, useCallback, useMemo, useReducer } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Spinner,
  SearchBox,
  Checkbox,
  Badge,
  Tooltip,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbButton,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { OpenRegular, AddRegular, LinkMultipleRegular } from '@fluentui/react-icons';
import { transactionsApi, expensesApi, invoicesApi } from '../../api/index.js';
import CardView, { CardMetaItem } from '../../components/CardView.jsx';
import { computeLikelihood } from './likelihoodScore.js';
import EntityPopupDialog from './EntityPopupDialog.jsx';
import ConfirmReconciliationDialog from './ConfirmReconciliationDialog.jsx';

const fmtGBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    flex: 1,
    overflow: 'hidden',
    minHeight: 0,
  },
  leftPanel: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  rightColumn: {
    display: 'grid',
    gridTemplateRows: '1fr 1fr',
    overflow: 'hidden',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3,
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  panelTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    marginRight: 'auto',
  },
  panelBody: {
    flex: 1,
    overflow: 'auto',
  },
  rightPanelBorder: {
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  linkedTag: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    padding: '2px 6px',
    backgroundColor: tokens.colorNeutralBackground4,
    borderRadius: tokens.borderRadiusSmall,
    display: 'inline-block',
    marginTop: '4px',
  },
  empty: {
    padding: '24px',
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
});

// --- Reducer ---
const initialState = {
  transactions: [],
  expenses: [],
  invoices: [],
  selectedTxIds: new Set(),
  checkedExpenseIds: new Set(),
  checkedInvoiceIds: new Set(),
  showLinkedTx: false,
  showLinkedExpenses: false,
  showLinkedInvoices: false,
  txSearch: '',
  expenseSearch: '',
  invoiceSearch: '',
  loading: false,
  confirming: false,
  popupUrl: null,
  confirmDialogOpen: false,
  error: null,
  success: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.value };
    case 'SET_DATA':
      return { ...state, transactions: action.transactions, expenses: action.expenses, invoices: action.invoices, loading: false };
    case 'TOGGLE_TX': {
      const next = new Set(state.selectedTxIds);
      if (action.checked) next.add(action.id);
      else next.delete(action.id);
      // When selection changes, recompute pre-checked expense/invoice IDs
      const preExp = new Set();
      const preInv = new Set();
      for (const txId of next) {
        for (const exp of state.expenses) {
          if ((exp.transactions || []).includes(txId)) preExp.add(exp._id);
        }
        for (const inv of state.invoices) {
          if ((inv.transactions || []).includes(txId)) preInv.add(inv._id);
        }
      }
      return { ...state, selectedTxIds: next, checkedExpenseIds: preExp, checkedInvoiceIds: preInv };
    }
    case 'TOGGLE_EXPENSE': {
      const next = new Set(state.checkedExpenseIds);
      if (action.checked) next.add(action.id);
      else next.delete(action.id);
      return { ...state, checkedExpenseIds: next };
    }
    case 'TOGGLE_INVOICE': {
      const next = new Set(state.checkedInvoiceIds);
      if (action.checked) next.add(action.id);
      else next.delete(action.id);
      return { ...state, checkedInvoiceIds: next };
    }
    case 'SET_SHOW_LINKED_TX':
      return { ...state, showLinkedTx: action.value };
    case 'SET_SHOW_LINKED_EXPENSES':
      return { ...state, showLinkedExpenses: action.value };
    case 'SET_SHOW_LINKED_INVOICES':
      return { ...state, showLinkedInvoices: action.value };
    case 'SET_TX_SEARCH':
      return { ...state, txSearch: action.value };
    case 'SET_EXPENSE_SEARCH':
      return { ...state, expenseSearch: action.value };
    case 'SET_INVOICE_SEARCH':
      return { ...state, invoiceSearch: action.value };
    case 'SET_POPUP_URL':
      return { ...state, popupUrl: action.url };
    case 'SET_CONFIRM_DIALOG':
      return { ...state, confirmDialogOpen: action.value };
    case 'SET_CONFIRMING':
      return { ...state, confirming: action.value };
    case 'RESET_SELECTIONS':
      return { ...state, selectedTxIds: new Set(), checkedExpenseIds: new Set(), checkedInvoiceIds: new Set(), confirmDialogOpen: false, confirming: false };
    case 'SET_ERROR':
      return { ...state, error: action.value };
    case 'SET_SUCCESS':
      return { ...state, success: action.value };
    default:
      return state;
  }
}

// --- Helpers ---

/** Find expense/invoice IDs currently linked to a given transaction */
function findLinkedExpenseIds(expenses, txId) {
  return expenses.filter((e) => (e.transactions || []).includes(txId)).map((e) => e._id);
}
function findLinkedInvoiceIds(invoices, txId) {
  return invoices.filter((i) => (i.transactions || []).includes(txId)).map((i) => i._id);
}

/** Check if an expense is linked to ANY transaction (not just selected ones) */
function isLinkedToAny(entity) {
  return (entity.transactions || []).length > 0;
}

/** Find which transaction an entity is linked to (for display tag) */
function findLinkedTransaction(entity, transactions) {
  const txIds = entity.transactions || [];
  if (txIds.length === 0) return null;
  return transactions.find((t) => txIds.includes(t._id));
}

export default function TransactionReconciliation() {
  const styles = useStyles();
  const [state, dispatch] = useReducer(reducer, initialState);

  // --- Data loading ---
  const loadData = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', value: true });
    try {
      const [txs, exps, invs] = await Promise.all([
        transactionsApi.getAll(),
        expensesApi.getAll(),
        invoicesApi.getAll(),
      ]);
      dispatch({ type: 'SET_DATA', transactions: txs, expenses: exps, invoices: invs });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', value: err.message });
      dispatch({ type: 'SET_LOADING', value: false });
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // --- Selected transaction objects ---
  const selectedTransactions = useMemo(
    () => state.transactions.filter((t) => state.selectedTxIds.has(t._id)),
    [state.transactions, state.selectedTxIds],
  );

  // --- Filtered transactions ---
  const filteredTransactions = useMemo(() => {
    let list = state.transactions;
    if (!state.showLinkedTx) {
      list = list.filter((t) => t.status === 'unmatched');
    }
    if (state.txSearch) {
      const q = state.txSearch.toLowerCase();
      list = list.filter((t) =>
        (t.description || '').toLowerCase().includes(q) ||
        (t.date || '').includes(q) ||
        (t.reference || '').toLowerCase().includes(q) ||
        (t.accountName || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [state.transactions, state.showLinkedTx, state.txSearch]);

  // --- Filtered & scored expenses ---
  const processedExpenses = useMemo(() => {
    const hasSelection = state.selectedTxIds.size > 0;

    // Pre-linked: linked to ANY selected transaction
    const preLinkedIds = new Set();
    if (hasSelection) {
      for (const txId of state.selectedTxIds) {
        for (const exp of state.expenses) {
          if ((exp.transactions || []).includes(txId)) preLinkedIds.add(exp._id);
        }
      }
    }

    let items = state.expenses.map((exp) => {
      const isPreLinked = preLinkedIds.has(exp._id);
      const isLinkedOther = !isPreLinked && isLinkedToAny(exp);
      const likelihood = hasSelection && !isPreLinked ? computeLikelihood(selectedTransactions, exp, 'expense') : null;
      return { ...exp, _isPreLinked: isPreLinked, _isLinkedOther: isLinkedOther, _likelihood: likelihood };
    });

    // Filter
    if (hasSelection) {
      items = items.filter((e) => {
        if (e._isPreLinked) return true; // always show
        if (e._isLinkedOther && !state.showLinkedExpenses) return false;
        return true;
      });
    } else {
      if (!state.showLinkedExpenses) {
        items = items.filter((e) => !isLinkedToAny(e));
      }
    }

    // Search
    if (state.expenseSearch) {
      const q = state.expenseSearch.toLowerCase();
      items = items.filter((e) =>
        e._isPreLinked || // pre-linked always visible
        (e.description || '').toLowerCase().includes(q) ||
        (e.expenseType || '').toLowerCase().includes(q) ||
        (e.clientName || '').toLowerCase().includes(q) ||
        (e.date || '').includes(q),
      );
    }

    // Sort: pre-linked first, then by likelihood score desc, then date desc
    items.sort((a, b) => {
      if (a._isPreLinked && !b._isPreLinked) return -1;
      if (!a._isPreLinked && b._isPreLinked) return 1;
      const sa = a._likelihood?.score || 0;
      const sb = b._likelihood?.score || 0;
      if (sa !== sb) return sb - sa;
      return (b.date || '').localeCompare(a.date || '');
    });

    return items;
  }, [state.expenses, state.selectedTxIds, selectedTransactions, state.showLinkedExpenses, state.expenseSearch]);

  // --- Filtered & scored invoices ---
  const processedInvoices = useMemo(() => {
    const hasSelection = state.selectedTxIds.size > 0;

    const preLinkedIds = new Set();
    if (hasSelection) {
      for (const txId of state.selectedTxIds) {
        for (const inv of state.invoices) {
          if ((inv.transactions || []).includes(txId)) preLinkedIds.add(inv._id);
        }
      }
    }

    let items = state.invoices.map((inv) => {
      const isPreLinked = preLinkedIds.has(inv._id);
      const isLinkedOther = !isPreLinked && isLinkedToAny(inv);
      const likelihood = hasSelection && !isPreLinked ? computeLikelihood(selectedTransactions, inv, 'invoice') : null;
      return { ...inv, _isPreLinked: isPreLinked, _isLinkedOther: isLinkedOther, _likelihood: likelihood };
    });

    if (hasSelection) {
      items = items.filter((i) => {
        if (i._isPreLinked) return true;
        if (i._isLinkedOther && !state.showLinkedInvoices) return false;
        return true;
      });
    } else {
      if (!state.showLinkedInvoices) {
        items = items.filter((i) => !isLinkedToAny(i));
      }
    }

    if (state.invoiceSearch) {
      const q = state.invoiceSearch.toLowerCase();
      items = items.filter((i) =>
        i._isPreLinked ||
        (i.invoiceNumber || '').toLowerCase().includes(q) ||
        (i.clientName || '').toLowerCase().includes(q) ||
        (i.invoiceDate || '').includes(q),
      );
    }

    items.sort((a, b) => {
      if (a._isPreLinked && !b._isPreLinked) return -1;
      if (!a._isPreLinked && b._isPreLinked) return 1;
      const sa = a._likelihood?.score || 0;
      const sb = b._likelihood?.score || 0;
      if (sa !== sb) return sb - sa;
      return (b.invoiceDate || '').localeCompare(a.invoiceDate || '');
    });

    return items;
  }, [state.invoices, state.selectedTxIds, selectedTransactions, state.showLinkedInvoices, state.invoiceSearch]);

  // --- Staged changes ---
  const stagedChanges = useMemo(() => {
    const changes = [];
    for (const txId of state.selectedTxIds) {
      const tx = state.transactions.find((t) => t._id === txId);
      if (!tx) continue;

      const existingExpIds = findLinkedExpenseIds(state.expenses, txId);
      const existingInvIds = findLinkedInvoiceIds(state.invoices, txId);

      const additions = [];
      const removals = [];

      // Expense additions: checked but not currently linked to this tx
      for (const expId of state.checkedExpenseIds) {
        if (!existingExpIds.includes(expId)) {
          const exp = state.expenses.find((e) => e._id === expId);
          if (exp) additions.push({ type: 'expense', entity: exp });
        }
      }
      // Expense removals: currently linked to this tx but unchecked
      for (const expId of existingExpIds) {
        if (!state.checkedExpenseIds.has(expId)) {
          const exp = state.expenses.find((e) => e._id === expId);
          if (exp) removals.push({ type: 'expense', entity: exp });
        }
      }
      // Invoice additions
      for (const invId of state.checkedInvoiceIds) {
        if (!existingInvIds.includes(invId)) {
          const inv = state.invoices.find((i) => i._id === invId);
          if (inv) additions.push({ type: 'invoice', entity: inv });
        }
      }
      // Invoice removals
      for (const invId of existingInvIds) {
        if (!state.checkedInvoiceIds.has(invId)) {
          const inv = state.invoices.find((i) => i._id === invId);
          if (inv) removals.push({ type: 'invoice', entity: inv });
        }
      }

      if (additions.length > 0 || removals.length > 0) {
        changes.push({ transaction: tx, additions, removals });
      }
    }
    return changes;
  }, [state.selectedTxIds, state.checkedExpenseIds, state.checkedInvoiceIds, state.transactions, state.expenses, state.invoices]);

  const totalChangeCount = stagedChanges.reduce((s, c) => s + c.additions.length + c.removals.length, 0);

  // --- Confirm handler ---
  const handleConfirm = useCallback(async () => {
    dispatch({ type: 'SET_CONFIRMING', value: true });
    dispatch({ type: 'SET_ERROR', value: null });
    try {
      for (const change of stagedChanges) {
        // Additions
        for (const a of change.additions) {
          if (a.type === 'expense') {
            await expensesApi.linkTransaction(a.entity._id, change.transaction._id);
          } else {
            await invoicesApi.linkTransaction(a.entity._id, change.transaction._id);
          }
          await transactionsApi.updateMapping(change.transaction._id, { status: 'matched' });
        }
        // Removals
        for (const r of change.removals) {
          if (r.type === 'expense') {
            await expensesApi.unlinkTransaction(r.entity._id, change.transaction._id);
          } else {
            await invoicesApi.unlinkTransaction(r.entity._id, change.transaction._id);
          }
        }
      }

      // Check if any transactions with only removals need status reset
      for (const change of stagedChanges) {
        if (change.additions.length === 0 && change.removals.length > 0) {
          // Re-fetch data to check if transaction still has links
          // For simplicity, set to unmatched; the reload will correct if needed
          await transactionsApi.updateMapping(change.transaction._id, { status: 'unmatched' });
        }
      }

      dispatch({ type: 'RESET_SELECTIONS' });
      dispatch({ type: 'SET_SUCCESS', value: 'Reconciliation changes applied successfully.' });
      setTimeout(() => dispatch({ type: 'SET_SUCCESS', value: null }), 3000);
      await loadData();
    } catch (err) {
      dispatch({ type: 'SET_ERROR', value: err.message });
      dispatch({ type: 'SET_CONFIRMING', value: false });
    }
  }, [stagedChanges, loadData]);

  // --- Entity popup ---
  const handleEntitySaved = useCallback(async () => {
    dispatch({ type: 'SET_POPUP_URL', url: null });
    await loadData();
  }, [loadData]);

  // --- Create expense ---
  const handleCreateExpense = useCallback(() => {
    if (selectedTransactions.length === 0) return;
    const first = selectedTransactions[0];
    const params = new URLSearchParams();
    params.set('embedded', 'true');
    if (first.date) params.set('date', first.date);
    if (first.amount != null) params.set('amount', String(Math.abs(first.amount)));
    if (first.description) params.set('description', first.description);
    if (first.reference) params.set('externalReference', first.reference);
    params.set('transactionId', selectedTransactions.map((t) => t._id).join(','));
    dispatch({ type: 'SET_POPUP_URL', url: `/expenses/new?${params.toString()}` });
  }, [selectedTransactions]);

  // --- Card style (visual states) ---
  const getExpenseCardStyle = useCallback((item) => {
    const isChecked = state.checkedExpenseIds.has(item._id);
    if (item._isPreLinked && !isChecked) {
      return { borderLeft: '3px solid #d13438', opacity: 0.7 };
    }
    if (!item._isPreLinked && isChecked) {
      return { borderLeft: '3px solid #107c10' };
    }
    return undefined;
  }, [state.checkedExpenseIds]);

  const getInvoiceCardStyle = useCallback((item) => {
    const isChecked = state.checkedInvoiceIds.has(item._id);
    if (item._isPreLinked && !isChecked) {
      return { borderLeft: '3px solid #d13438', opacity: 0.7 };
    }
    if (!item._isPreLinked && isChecked) {
      return { borderLeft: '3px solid #107c10' };
    }
    return undefined;
  }, [state.checkedInvoiceIds]);

  // --- Render ---
  if (state.loading) {
    return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;
  }

  return (
    <div className={styles.page}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <Breadcrumb>
          <BreadcrumbItem>
            <BreadcrumbButton current>Transaction Reconciliation</BreadcrumbButton>
          </BreadcrumbItem>
        </Breadcrumb>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          {state.selectedTxIds.size > 0 && (
            <Button
              appearance="outline"
              icon={<AddRegular />}
              onClick={handleCreateExpense}
              size="small"
            >
              Create Expense
            </Button>
          )}
          <Button
            appearance="primary"
            icon={<LinkMultipleRegular />}
            onClick={() => dispatch({ type: 'SET_CONFIRM_DIALOG', value: true })}
            disabled={totalChangeCount === 0}
            size="small"
          >
            Confirm Changes{totalChangeCount > 0 ? ` (${totalChangeCount})` : ''}
          </Button>
        </div>
      </div>

      {state.error && (
        <MessageBar intent="error" style={{ flexShrink: 0 }}>
          <MessageBarBody>{state.error}</MessageBarBody>
        </MessageBar>
      )}
      {state.success && (
        <MessageBar intent="success" style={{ flexShrink: 0 }}>
          <MessageBarBody>{state.success}</MessageBarBody>
        </MessageBar>
      )}

      {/* Three-panel grid */}
      <div className={styles.grid}>
        {/* Left panel: Transactions */}
        <div className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <Text className={styles.panelTitle}>Transactions</Text>
            <SearchBox
              placeholder="Search..."
              value={state.txSearch}
              onChange={(e, d) => dispatch({ type: 'SET_TX_SEARCH', value: d.value })}
              size="small"
              style={{ width: '160px' }}
            />
            <Checkbox
              checked={state.showLinkedTx}
              onChange={(e, d) => dispatch({ type: 'SET_SHOW_LINKED_TX', value: d.checked })}
              label="Show linked"
              size="medium"
              style={{ whiteSpace: 'nowrap' }}
            />
          </div>
          <div className={styles.panelBody}>
            {filteredTransactions.length === 0 ? (
              <div className={styles.empty}>No transactions found.</div>
            ) : (
              <CardView
                items={filteredTransactions}
                getRowId={(item) => item._id}
                selectable
                selectedIds={state.selectedTxIds}
                onSelectionChange={(id, checked) => dispatch({ type: 'TOGGLE_TX', id, checked })}
                renderHeader={(item) => (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                    <Text weight="semibold" truncate wrap={false}>{item.description || '—'}</Text>
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>{item.date}</Text>
                  </div>
                )}
                renderMeta={(item) => (
                  <>
                    <CardMetaItem label="Amount" value={fmtGBP.format(Math.abs(item.amount || 0))} />
                    <CardMetaItem label="Type" value={item.amount < 0 ? 'Debit' : 'Credit'} />
                    <Badge
                      appearance="filled"
                      color={item.status === 'matched' ? 'success' : item.status === 'ignored' ? 'warning' : 'informative'}
                    >
                      {item.status || 'unmatched'}
                    </Badge>
                  </>
                )}
                renderActions={(item) => (
                  <Tooltip content="Open transaction" relationship="label">
                    <Button
                      appearance="subtle"
                      icon={<OpenRegular />}
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch({ type: 'SET_POPUP_URL', url: `/transactions/${item._id}?embedded=true` });
                      }}
                    />
                  </Tooltip>
                )}
              />
            )}
          </div>
        </div>

        {/* Right column: Expenses + Invoices */}
        <div className={styles.rightColumn}>
          {/* Expenses panel */}
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <Text className={styles.panelTitle}>Expenses</Text>
              <SearchBox
                placeholder="Search..."
                value={state.expenseSearch}
                onChange={(e, d) => dispatch({ type: 'SET_EXPENSE_SEARCH', value: d.value })}
                size="small"
                style={{ width: '160px' }}
              />
              <Checkbox
                checked={state.showLinkedExpenses}
                onChange={(e, d) => dispatch({ type: 'SET_SHOW_LINKED_EXPENSES', value: d.checked })}
                label="Show linked"
                size="medium"
                style={{ whiteSpace: 'nowrap' }}
              />
            </div>
            <div className={styles.panelBody}>
              {processedExpenses.length === 0 ? (
                <div className={styles.empty}>No expenses found.</div>
              ) : (
                <CardView
                  items={processedExpenses}
                  getRowId={(item) => item._id}
                  selectable={state.selectedTxIds.size > 0}
                  selectedIds={state.checkedExpenseIds}
                  onSelectionChange={(id, checked) => dispatch({ type: 'TOGGLE_EXPENSE', id, checked })}
                  getCardStyle={state.selectedTxIds.size > 0 ? getExpenseCardStyle : undefined}
                  renderHeader={(item) => (
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Text weight="semibold" truncate wrap={false}>{item.description || item.expenseType || '—'}</Text>
                        {item._likelihood?.level && (
                          <Tooltip content={item._likelihood.reasons.join(', ')} relationship="label">
                            <Badge
                              appearance="filled"
                              color={item._likelihood.level === 'High' ? 'success' : item._likelihood.level === 'Medium' ? 'warning' : 'informative'}
                            >
                              {item._likelihood.level}
                            </Badge>
                          </Tooltip>
                        )}
                      </div>
                      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                        {item.date} {item.expenseType ? `— ${item.expenseType}` : ''}
                      </Text>
                      {item._isPreLinked && (() => {
                        const linkedTx = findLinkedTransaction(item, state.transactions);
                        return linkedTx ? (
                          <span className={styles.linkedTag}>
                            Linked to: {linkedTx.description || '—'} ({fmtGBP.format(Math.abs(linkedTx.amount || 0))})
                          </span>
                        ) : null;
                      })()}
                    </div>
                  )}
                  renderMeta={(item) => (
                    <>
                      <CardMetaItem label="Amount" value={fmtGBP.format(Math.abs(item.amount || 0))} />
                      <CardMetaItem label="Project" value={item.projectName || item.projectId || '—'} />
                    </>
                  )}
                  renderActions={(item) => (
                    <Tooltip content="Open expense" relationship="label">
                      <Button
                        appearance="subtle"
                        icon={<OpenRegular />}
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          dispatch({ type: 'SET_POPUP_URL', url: `/expenses/${item._id}?embedded=true` });
                        }}
                      />
                    </Tooltip>
                  )}
                />
              )}
            </div>
          </div>

          {/* Invoices panel */}
          <div className={`${styles.panel} ${styles.rightPanelBorder}`}>
            <div className={styles.panelHeader}>
              <Text className={styles.panelTitle}>Invoices</Text>
              <SearchBox
                placeholder="Search..."
                value={state.invoiceSearch}
                onChange={(e, d) => dispatch({ type: 'SET_INVOICE_SEARCH', value: d.value })}
                size="small"
                style={{ width: '160px' }}
              />
              <Checkbox
                checked={state.showLinkedInvoices}
                onChange={(e, d) => dispatch({ type: 'SET_SHOW_LINKED_INVOICES', value: d.checked })}
                label="Show linked"
                size="medium"
                style={{ whiteSpace: 'nowrap' }}
              />
            </div>
            <div className={styles.panelBody}>
              {processedInvoices.length === 0 ? (
                <div className={styles.empty}>No invoices found.</div>
              ) : (
                <CardView
                  items={processedInvoices}
                  getRowId={(item) => item._id}
                  selectable={state.selectedTxIds.size > 0}
                  selectedIds={state.checkedInvoiceIds}
                  onSelectionChange={(id, checked) => dispatch({ type: 'TOGGLE_INVOICE', id, checked })}
                  getCardStyle={state.selectedTxIds.size > 0 ? getInvoiceCardStyle : undefined}
                  renderHeader={(item) => (
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Text weight="semibold" truncate wrap={false}>{item.invoiceNumber || 'Draft'}</Text>
                        <Badge
                          appearance="filled"
                          color={item.status === 'posted' ? 'success' : item.status === 'confirmed' ? 'warning' : 'informative'}
                        >
                          {item.status}
                        </Badge>
                        {item._likelihood?.level && (
                          <Tooltip content={item._likelihood.reasons.join(', ')} relationship="label">
                            <Badge
                              appearance="filled"
                              color={item._likelihood.level === 'High' ? 'success' : item._likelihood.level === 'Medium' ? 'warning' : 'informative'}
                            >
                              {item._likelihood.level}
                            </Badge>
                          </Tooltip>
                        )}
                      </div>
                      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                        {item.invoiceDate} — {item.clientName || '—'}
                      </Text>
                      {item._isPreLinked && (() => {
                        const linkedTx = findLinkedTransaction(item, state.transactions);
                        return linkedTx ? (
                          <span className={styles.linkedTag}>
                            Linked to: {linkedTx.description || '—'} ({fmtGBP.format(Math.abs(linkedTx.amount || 0))})
                          </span>
                        ) : null;
                      })()}
                    </div>
                  )}
                  renderMeta={(item) => (
                    <>
                      <CardMetaItem label="Total" value={fmtGBP.format(item.total || 0)} />
                      <CardMetaItem label="Payment" value={item.paymentStatus || '—'} />
                    </>
                  )}
                  renderActions={(item) => (
                    <Tooltip content="Open invoice" relationship="label">
                      <Button
                        appearance="subtle"
                        icon={<OpenRegular />}
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          dispatch({ type: 'SET_POPUP_URL', url: `/invoices/${item._id}?embedded=true` });
                        }}
                      />
                    </Tooltip>
                  )}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Entity popup dialog */}
      <EntityPopupDialog
        open={!!state.popupUrl}
        onClose={() => dispatch({ type: 'SET_POPUP_URL', url: null })}
        onEntitySaved={handleEntitySaved}
        entityUrl={state.popupUrl}
      />

      {/* Confirm reconciliation dialog */}
      <ConfirmReconciliationDialog
        open={state.confirmDialogOpen}
        onClose={() => dispatch({ type: 'SET_CONFIRM_DIALOG', value: false })}
        onConfirm={handleConfirm}
        changes={stagedChanges}
        confirming={state.confirming}
      />
    </div>
  );
}
