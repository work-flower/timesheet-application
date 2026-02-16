import { transactions, timesheets, invoices, expenses, importJobs, clients, projects } from '../db/index.js';
import { getMonthsInRange } from '../utils/periods.js';

/**
 * Operations dashboard summary data.
 */
export async function getOperationsSummary() {
  const [unmatchedTxns, allTimesheets, allInvoices, latestJob] = await Promise.all([
    transactions.find({ status: 'unmatched' }),
    timesheets.find({}),
    invoices.find({}),
    importJobs.find({}).then(jobs =>
      jobs.filter(j => j.completedAt)
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0] || null
    ),
  ]);

  // Unmatched transactions
  const unmatchedCount = unmatchedTxns.length;
  const unmatchedTotal = unmatchedTxns.reduce((s, t) => s + Math.abs(t.amount || 0), 0);

  // Uninvoiced timesheets (no invoiceId)
  const uninvoiced = allTimesheets.filter(t => !t.invoiceId);
  const uninvoicedCount = uninvoiced.length;
  const uninvoicedTotal = uninvoiced.reduce((s, t) => s + (t.amount || 0), 0);

  // Monthly invoice info
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthEndStr = monthEnd.toISOString().slice(0, 10);
  const dayOfMonth = now.getDate();

  const monthInvoices = allInvoices.filter(inv =>
    inv.invoiceDate >= monthStart && inv.invoiceDate <= monthEndStr
  );

  return {
    unmatched: {
      count: unmatchedCount,
      total: unmatchedTotal,
      lastImportDate: latestJob?.completedAt || null,
      lastImportStale: latestJob?.completedAt
        ? (now - new Date(latestJob.completedAt)) / (1000 * 60 * 60 * 24) > 30
        : false,
    },
    uninvoiced: {
      count: uninvoicedCount,
      total: uninvoicedTotal,
    },
    monthlyInvoices: {
      count: monthInvoices.length,
      warning: dayOfMonth >= 20 && monthInvoices.length === 0,
    },
  };
}

/**
 * Invoice coverage data — monthly invoice counts + totals for a given period.
 * @param {string} start - YYYY-MM-DD
 * @param {string} end - YYYY-MM-DD
 * @returns {Array<{ month: string, start: string, end: string, count: number, total: number, invoices: Array }>}
 */
export async function getInvoiceCoverage(start, end) {
  const months = getMonthsInRange(start, end);
  const allInvoices = await invoices.find({
    invoiceDate: { $gte: start, $lte: end },
  });

  return months.map(m => {
    const monthInvoices = allInvoices.filter(inv =>
      inv.invoiceDate >= m.start && inv.invoiceDate <= m.end
    );
    return {
      label: m.label,
      start: m.start,
      end: m.end,
      count: monthInvoices.length,
      total: monthInvoices.reduce((s, inv) => s + (inv.total || 0), 0),
      invoices: monthInvoices.map(inv => ({
        _id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        total: inv.total,
        paymentStatus: inv.paymentStatus,
        status: inv.status,
      })),
    };
  });
}

/**
 * Reconciliation dashboard data.
 */
export async function getReconciliationSummary(startDate, endDate) {
  let query = {};
  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = startDate;
    if (endDate) query.date.$lte = endDate;
  }

  const allTxns = await transactions.find(query);
  const now = new Date();

  const matched = allTxns.filter(t => t.status === 'matched');
  const unmatched = allTxns.filter(t => t.status === 'unmatched');
  const ignored = allTxns.filter(t => t.status === 'ignored');

  // Aging buckets for unmatched
  const aging = { under7: [], under30: [], under90: [], over90: [] };
  for (const t of unmatched) {
    const txDate = new Date(t.date);
    const daysDiff = Math.floor((now - txDate) / (1000 * 60 * 60 * 24));
    if (daysDiff < 7) aging.under7.push(t);
    else if (daysDiff < 30) aging.under30.push(t);
    else if (daysDiff < 90) aging.under90.push(t);
    else aging.over90.push(t);
  }

  const sumAbs = (arr) => arr.reduce((s, t) => s + Math.abs(t.amount || 0), 0);
  const sumCredits = (arr) => arr.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const sumDebits = (arr) => arr.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  // Monthly reconciliation rate trend
  const trend = [];
  if (allTxns.length > 0) {
    const dates = allTxns.map(t => t.date).sort();
    const trendMonths = getMonthsInRange(dates[0], dates[dates.length - 1]);
    for (const m of trendMonths) {
      const mTxns = allTxns.filter(t => t.date >= m.start && t.date <= m.end);
      const mMatched = mTxns.filter(t => t.status === 'matched');
      trend.push({
        label: m.label,
        total: mTxns.length,
        matched: mMatched.length,
        rate: mTxns.length > 0 ? Math.round((mMatched.length / mTxns.length) * 100) : 0,
      });
    }
  }

  // Period-by-period summary
  const periodSummary = [];
  if (allTxns.length > 0) {
    const dates = allTxns.map(t => t.date).sort();
    const sumMonths = getMonthsInRange(
      startDate || dates[0],
      endDate || dates[dates.length - 1]
    );
    for (const m of sumMonths) {
      const mTxns = allTxns.filter(t => t.date >= m.start && t.date <= m.end);
      const mCredits = mTxns.filter(t => t.amount > 0);
      const mDebits = mTxns.filter(t => t.amount < 0);
      const mMatched = mTxns.filter(t => t.status === 'matched');
      const mIgnored = mTxns.filter(t => t.status === 'ignored');
      const mUnmatched = mTxns.filter(t => t.status === 'unmatched');

      periodSummary.push({
        label: m.label,
        creditsIn: mCredits.reduce((s, t) => s + t.amount, 0),
        creditsCount: mCredits.length,
        debitsOut: mDebits.reduce((s, t) => s + Math.abs(t.amount), 0),
        debitsCount: mDebits.length,
        matchedCount: mMatched.length,
        ignoredCount: mIgnored.length,
        unmatchedCount: mUnmatched.length,
      });
    }
  }

  return {
    total: {
      count: allTxns.length,
      amount: sumAbs(allTxns),
    },
    matched: {
      count: matched.length,
      amount: sumAbs(matched),
      percentage: allTxns.length > 0 ? Math.round((matched.length / allTxns.length) * 100) : 0,
    },
    unmatched: {
      count: unmatched.length,
      amount: sumAbs(unmatched),
      credits: sumCredits(unmatched),
      debits: sumDebits(unmatched),
    },
    ignored: {
      count: ignored.length,
      amount: sumAbs(ignored),
    },
    aging: {
      under7: { count: aging.under7.length, amount: sumAbs(aging.under7) },
      under30: { count: aging.under30.length, amount: sumAbs(aging.under30) },
      under90: { count: aging.under90.length, amount: sumAbs(aging.under90) },
      over90: { count: aging.over90.length, amount: sumAbs(aging.over90) },
    },
    trend,
    periodSummary,
  };
}

/**
 * Financial dashboard data.
 */
export async function getFinancialSummary(startDate, endDate) {
  const [allInvoices, allExpenses, allTxns] = await Promise.all([
    invoices.find({
      invoiceDate: { $gte: startDate, $lte: endDate },
      status: { $in: ['confirmed', 'posted'] },
    }),
    expenses.find({
      date: { $gte: startDate, $lte: endDate },
    }),
    transactions.find({
      date: { $gte: startDate, $lte: endDate },
    }),
  ]);

  const months = getMonthsInRange(startDate, endDate);

  // Accrual view
  const accrual = months.map(m => {
    const mInvoices = allInvoices.filter(inv =>
      inv.invoiceDate >= m.start && inv.invoiceDate <= m.end
    );
    const mExpenses = allExpenses.filter(exp =>
      exp.date >= m.start && exp.date <= m.end
    );
    const revenue = mInvoices.reduce((s, inv) => s + (inv.subtotal || 0), 0);
    const vat = mInvoices.reduce((s, inv) => s + (inv.totalVat || 0), 0);
    const expenseTotal = mExpenses.reduce((s, exp) => s + (exp.amount || 0), 0);
    const expenseVat = mExpenses.reduce((s, exp) => s + (exp.vatAmount || 0), 0);

    return {
      label: m.label,
      start: m.start,
      end: m.end,
      revenue,
      revenueVat: vat,
      expenses: expenseTotal,
      expenseVat,
      netProfit: revenue - expenseTotal,
    };
  });

  // Cash view
  const cash = months.map(m => {
    const mTxns = allTxns.filter(t => t.date >= m.start && t.date <= m.end);
    const cashIn = mTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const cashOut = mTxns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

    return {
      label: m.label,
      start: m.start,
      end: m.end,
      cashIn,
      cashOut,
      netCashFlow: cashIn - cashOut,
    };
  });

  // Totals
  const ytdRevenue = accrual.reduce((s, m) => s + m.revenue, 0);
  const ytdExpenses = accrual.reduce((s, m) => s + m.expenses, 0);
  const ytdNetProfit = ytdRevenue - ytdExpenses;
  const ytdCashIn = cash.reduce((s, m) => s + m.cashIn, 0);
  const ytdCashOut = cash.reduce((s, m) => s + m.cashOut, 0);

  // Unpaid invoices (posted, not paid)
  const postedInvoices = await invoices.find({ status: 'posted', paymentStatus: { $ne: 'paid' } });
  const outstanding = postedInvoices.reduce((s, inv) => s + (inv.total || 0), 0);

  // VAT position
  const outputVat = accrual.reduce((s, m) => s + m.revenueVat, 0);
  const inputVat = accrual.reduce((s, m) => s + m.expenseVat, 0);

  // Per-client breakdown — need to resolve names and expense→client mapping
  const [allClients, allProjects] = await Promise.all([
    clients.find({}),
    projects.find({}),
  ]);
  const clientNameMap = {};
  for (const c of allClients) clientNameMap[c._id] = c.companyName;
  const projectClientMap = {};
  for (const p of allProjects) projectClientMap[p._id] = p.clientId;

  const clientMap = {};
  for (const inv of allInvoices) {
    const cid = inv.clientId;
    if (!cid) continue;
    if (!clientMap[cid]) clientMap[cid] = { clientId: cid, clientName: clientNameMap[cid] || cid, revenue: 0, expenses: 0 };
    clientMap[cid].revenue += inv.subtotal || 0;
  }
  for (const exp of allExpenses) {
    const cid = exp.clientId || projectClientMap[exp.projectId];
    if (!cid) continue;
    if (!clientMap[cid]) clientMap[cid] = { clientId: cid, clientName: clientNameMap[cid] || cid, revenue: 0, expenses: 0 };
    clientMap[cid].expenses += exp.amount || 0;
  }
  const clientBreakdown = Object.values(clientMap).map(c => ({
    ...c,
    margin: c.revenue - c.expenses,
  }));

  return {
    accrual,
    cash,
    totals: {
      ytdRevenue,
      ytdExpenses,
      ytdNetProfit,
      ytdCashIn,
      ytdCashOut,
      cashPosition: ytdCashIn - ytdCashOut,
      outstanding,
      outputVat,
      inputVat,
      vatPosition: outputVat - inputVat,
    },
    clientBreakdown,
  };
}
