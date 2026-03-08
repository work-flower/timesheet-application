import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  Card,
  Spinner,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableCellLayout,
  createTableColumn,
  Badge,
  Tooltip,
  mergeClasses,
} from '@fluentui/react-components';
import {
  ClockRegular,
  CalendarMonthRegular,
  FolderRegular,
  MoneyRegular,
  ReceiptRegular,
  DocumentTextRegular,
  ArrowSwapRegular,
  CalendarClockRegular,
  WarningRegular,
} from '@fluentui/react-icons';
import { timesheetsApi, projectsApi, expensesApi, invoicesApi, dashboardApi, settingsApi } from '../api/index.js';
import InfoTooltip from '../components/InfoTooltip.jsx';
import {
  getCompanyYear,
  getTaxYear,
  getCalendarYear,
  getMonthsInRange,
  formatPeriodLabel,
} from '../utils/periods.js';

const useStyles = makeStyles({
  page: {
    padding: '24px',
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase600,
    display: 'block',
    marginBottom: '24px',
  },
  rowTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground3,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    display: 'block',
    marginBottom: '8px',
    marginTop: '8px',
  },
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  card: {
    padding: '20px',
    cursor: 'default',
  },
  cardClickable: {
    padding: '20px',
    cursor: 'pointer',
    '&:hover': {
      boxShadow: tokens.shadow8,
    },
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  cardIcon: {
    fontSize: '24px',
    color: tokens.colorBrandForeground1,
  },
  cardIconWarning: {
    fontSize: '24px',
    color: tokens.colorPaletteYellowForeground1,
  },
  cardValue: {
    fontWeight: tokens.fontWeightBold,
    fontSize: tokens.fontSizeBase600,
    display: 'block',
  },
  cardLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  cardHint: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  sectionTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    display: 'block',
    marginBottom: '12px',
  },
  empty: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '48px',
    color: tokens.colorNeutralForeground3,
  },
  row: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  // Invoice Coverage Lifeline
  lifelineCard: {
    padding: '20px',
    marginBottom: '24px',
  },
  lifelineTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    display: 'block',
    marginBottom: '16px',
  },
  lifelineRow: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '12px',
    gap: '12px',
  },
  lifelineLabel: {
    width: '120px',
    flexShrink: 0,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
  },
  lifelineCells: {
    display: 'flex',
    gap: '4px',
    flex: 1,
  },
  lifelineCell: {
    flex: 1,
    minWidth: '60px',
    padding: '6px 4px',
    textAlign: 'center',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: tokens.fontSizeBase100,
    border: '2px solid transparent',
    '&:hover': {
      opacity: 0.85,
    },
  },
  lifelineCellGreen: {
    backgroundColor: '#E6F4EA',
    color: '#1B7D3A',
  },
  lifelineCellAmber: {
    backgroundColor: '#FFF8E1',
    color: '#E65100',
  },
  lifelineCellGrey: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground3,
  },
  lifelineCellCurrent: {
    borderColor: tokens.colorBrandForeground1,
  },
  lifelineCellCount: {
    fontWeight: tokens.fontWeightBold,
    fontSize: tokens.fontSizeBase200,
    display: 'block',
  },
  lifelineCellAmount: {
    fontSize: '9px',
    display: 'block',
    opacity: 0.8,
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

const fmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const fmtCompact = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', notation: 'compact' });

const recentColumns = [
  createTableColumn({
    columnId: 'date',
    renderHeaderCell: () => 'Date',
    renderCell: (item) => <TableCellLayout>{item.date}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'clientName',
    renderHeaderCell: () => 'Client',
    renderCell: (item) => <TableCellLayout>{item.clientName}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'projectName',
    renderHeaderCell: () => 'Project',
    renderCell: (item) => <TableCellLayout>{item.projectName}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'hours',
    renderHeaderCell: () => 'Hours',
    renderCell: (item) => <TableCellLayout>{item.hours}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'amount',
    renderHeaderCell: () => 'Amount',
    renderCell: (item) => <TableCellLayout>{fmt.format(item.amount || 0)}</TableCellLayout>,
  }),
];

export default function Dashboard() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [weekEntries, setWeekEntries] = useState([]);
  const [monthEntries, setMonthEntries] = useState([]);
  const [activeProjects, setActiveProjects] = useState(0);
  const [recentEntries, setRecentEntries] = useState([]);
  const [monthExpenses, setMonthExpenses] = useState([]);
  const [unpaidInvoices, setUnpaidInvoices] = useState([]);
  const [opsSummary, setOpsSummary] = useState(null);
  const [coverageData, setCoverageData] = useState({});
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const [week, month, projects, recent, monthExp, allInvoices, ops, settingsData] = await Promise.all([
          timesheetsApi.getAll(getWeekRange()),
          timesheetsApi.getAll(getMonthRange()),
          projectsApi.getAll(),
          timesheetsApi.getAll({}),
          expensesApi.getAll(getMonthRange()),
          invoicesApi.getAll({ status: 'posted' }),
          dashboardApi.getOperations(),
          settingsApi.get(),
        ]);
        setWeekEntries(week);
        setMonthEntries(month);
        setActiveProjects(projects.filter((p) => p.status === 'active').length);
        setRecentEntries(recent.slice(0, 10));
        setMonthExpenses(monthExp);
        setUnpaidInvoices(allInvoices.filter(inv => inv.paymentStatus !== 'paid'));
        setOpsSummary(ops);
        setSettings(settingsData);

        // Load invoice coverage for all three perspectives
        const now = new Date();
        const nowStr = now.toISOString().slice(0, 10);
        const companyYear = getCompanyYear(nowStr, settingsData?.accountingReferenceDate);
        const taxYear = getTaxYear(nowStr);
        const calYear = getCalendarYear(nowStr);

        const [companyCov, taxCov, calCov] = await Promise.all([
          dashboardApi.getInvoiceCoverage(companyYear.start, companyYear.end),
          dashboardApi.getInvoiceCoverage(taxYear.start, taxYear.end),
          dashboardApi.getInvoiceCoverage(calYear.start, calYear.end),
        ]);
        setCoverageData({ company: companyCov, tax: taxCov, calendar: calCov });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const weekHours = weekEntries.reduce((s, e) => s + (e.hours || 0), 0);
  const monthHours = monthEntries.reduce((s, e) => s + (e.hours || 0), 0);
  const monthEarnings = monthEntries.reduce((s, e) => s + (e.amount || 0), 0);
  const billableExpenses = monthExpenses.filter((e) => e.billable).reduce((s, e) => s + (e.amount || 0), 0);
  const totalExpenses = monthExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const unpaidTotal = unpaidInvoices.reduce((s, inv) => s + (inv.total || 0), 0);

  const nowStr = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading dashboard..." /></div>;

  function renderLifelineRow(label, data, periodLabel) {
    if (!data || data.length === 0) return null;
    const now = new Date();

    return (
      <div className={styles.lifelineRow}>
        <div className={styles.lifelineLabel}>
          {label}
          <br />
          <span style={{ fontWeight: 'normal', fontSize: '10px' }}>{periodLabel}</span>
        </div>
        <div className={styles.lifelineCells}>
          {data.map((m, i) => {
            const mDate = new Date(m.start);
            const mKey = `${mDate.getFullYear()}-${String(mDate.getMonth() + 1).padStart(2, '0')}`;
            const isCurrent = mKey === nowStr;
            const isFuture = mDate > now;
            const isPast = !isFuture && !isCurrent;

            let cellClass = styles.lifelineCellGrey;
            if (!isFuture) {
              cellClass = m.count > 0 ? styles.lifelineCellGreen : (isPast ? styles.lifelineCellAmber : styles.lifelineCellGrey);
            }

            const tooltipContent = m.invoices && m.invoices.length > 0
              ? m.invoices.map(inv =>
                `${inv.invoiceNumber || 'Draft'}: ${fmt.format(inv.total)} (${inv.paymentStatus || inv.status})`
              ).join('\n')
              : 'No invoices';

            return (
              <Tooltip
                key={i}
                content={<span style={{ whiteSpace: 'pre-line' }}>{`${m.label}\n${tooltipContent}`}</span>}
                relationship="description"
                positioning="above"
              >
                <div
                  className={mergeClasses(
                    styles.lifelineCell,
                    cellClass,
                    isCurrent && styles.lifelineCellCurrent,
                  )}
                  onClick={() => {
                    navigate(`/invoices?startDate=${m.start}&endDate=${m.end}`);
                  }}
                >
                  <span className={styles.lifelineCellCount}>{m.count}</span>
                  {m.total > 0 && (
                    <span className={styles.lifelineCellAmount}>{fmtCompact.format(m.total)}</span>
                  )}
                </div>
              </Tooltip>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Text className={styles.title}>Dashboard</Text>

      {/* Row 1 — Activity */}
      <Text className={styles.rowTitle}>Activity</Text>
      <div className={styles.cards}>
        <Card className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}><ClockRegular /></div>
            <InfoTooltip
              calculation="Sum of all timesheet hours from Monday to Sunday of the current week."
              purpose="Track weekly utilisation against your contracted hours or capacity target."
              attention="If significantly below your expected weekly hours mid-week, you may have unlogged days. If consistently over, watch for burnout."
              crossCheck="Hours This Month should be roughly 4x this value at month-end. Earnings This Month uses these same timesheets for its amount calculation."
            />
          </div>
          <Text className={styles.cardValue}>{weekHours}</Text>
          <Text className={styles.cardLabel}>Hours This Week</Text>
        </Card>
        <Card className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}><CalendarMonthRegular /></div>
            <InfoTooltip
              calculation="Sum of all timesheet hours from the 1st to the last day of the current calendar month."
              purpose="Monitor monthly output for invoicing preparation and capacity planning."
              attention="Compare against working days in the month. If the month is nearly over and hours are low, check for missing entries before invoicing."
              crossCheck="Earnings This Month is derived from the same timesheets (hours x rate). The Uninvoiced Timesheets card will show how much of this hasn't been billed yet."
            />
          </div>
          <Text className={styles.cardValue}>{monthHours}</Text>
          <Text className={styles.cardLabel}>Hours This Month</Text>
        </Card>
        <Card className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}><FolderRegular /></div>
            <InfoTooltip
              calculation="Count of projects with status 'active' (excludes archived projects)."
              purpose="Quick indicator of current workload breadth and client diversification."
              attention="If this drops to zero, you have no active engagements. If it increases unexpectedly, check for accidentally created projects."
            />
          </div>
          <Text className={styles.cardValue}>{activeProjects}</Text>
          <Text className={styles.cardLabel}>Active Projects</Text>
        </Card>
      </div>

      {/* Row 2 — Money */}
      <Text className={styles.rowTitle}>Money</Text>
      <div className={styles.cards}>
        <Card className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}><MoneyRegular /></div>
            <InfoTooltip
              calculation="Sum of 'amount' on all timesheets this month. Each amount = days x effective daily rate, computed and saved when the timesheet entry was created."
              purpose="Shows expected gross revenue for the current month before invoicing."
              attention="If this is zero but Hours This Month is not, check that your projects have rates configured. A large discrepancy with Unpaid Invoices may indicate unbilled work."
              crossCheck="Should roughly equal Hours This Month / working hours per day x daily rate. Compare with YTD Revenue on the Financial dashboard for the bigger picture."
            />
          </div>
          <Text className={styles.cardValue}>{fmt.format(monthEarnings)}</Text>
          <Text className={styles.cardLabel}>Earnings This Month</Text>
        </Card>
        <Card className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}><ReceiptRegular /></div>
            <InfoTooltip
              calculation="Main value = sum of billable expense amounts this month. 'Total' hint includes both billable and non-billable expenses."
              purpose="Track client-rechargeable costs (billable) separately from business overhead (non-billable)."
              attention="If billable expenses are high but not yet on an invoice, check the Invoices This Month card. Non-billable expenses eat into your net profit."
              crossCheck="Billable expenses should appear on invoices. Compare with the Financial dashboard's YTD Expenses for the full-year picture."
            />
          </div>
          <Text className={styles.cardValue}>{fmt.format(billableExpenses)}</Text>
          <Text className={styles.cardLabel}>Expenses This Month</Text>
          {totalExpenses > 0 && (
            <Text className={styles.cardHint}>Total: {fmt.format(totalExpenses)}</Text>
          )}
        </Card>
        <Card className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}><DocumentTextRegular /></div>
            <InfoTooltip
              calculation="Sum of 'total' on all posted invoices where paymentStatus is not 'paid' (includes 'unpaid' and 'overdue')."
              purpose="Shows outstanding receivables — money your clients owe you."
              attention="If this is growing month-on-month, chase payments. Overdue invoices need immediate follow-up. A sudden drop means a payment was received (check Reconciliation dashboard)."
              crossCheck="Should match the Outstanding card on the Financial dashboard. When a payment arrives, it should appear as a matched transaction on the Reconciliation dashboard."
            />
          </div>
          <Text className={styles.cardValue}>{fmt.format(unpaidTotal)}</Text>
          <Text className={styles.cardLabel}>Unpaid Invoices</Text>
          {unpaidInvoices.length > 0 && (
            <Text className={styles.cardHint}>
              {unpaidInvoices.length} invoice{unpaidInvoices.length !== 1 ? 's' : ''}
            </Text>
          )}
        </Card>
      </div>

      {/* Row 3 — Action Needed */}
      {opsSummary && (
        <>
          <Text className={styles.rowTitle}>Action Needed</Text>
          <div className={styles.cards}>
            <Card className={styles.cardClickable} onClick={() => navigate('/transactions?status=unmatched')}>
              <div className={styles.cardHeader}>
                <div className={opsSummary.unmatched.lastImportStale ? styles.cardIconWarning : styles.cardIcon}>
                  <ArrowSwapRegular />
                </div>
                <InfoTooltip
                  calculation="Count and absolute total of transactions with status 'unmatched'. Last import date from the most recent completed import job."
                  purpose="Bank transactions not yet linked to an invoice or expense. These need manual review to complete your bookkeeping."
                  attention="Ideally zero. Stale warning (>30 days since last import) means you haven't imported recent bank statements. Credits may be client payments; debits may be unrecorded expenses."
                  crossCheck="Credits here should eventually match Unpaid Invoices (payments received). Debits may need new expense records. See the Reconciliation dashboard for a detailed breakdown."
                />
              </div>
              <Text className={styles.cardValue}>{opsSummary.unmatched.count}</Text>
              <Text className={styles.cardLabel}>Unmatched Transactions</Text>
              <Text className={styles.cardHint}>
                {fmt.format(opsSummary.unmatched.total)}
              </Text>
              {opsSummary.unmatched.lastImportDate && (
                <Text className={styles.cardHint}>
                  Last import: {new Date(opsSummary.unmatched.lastImportDate).toLocaleDateString('en-GB')}
                </Text>
              )}
              {opsSummary.unmatched.lastImportStale && (
                <Badge appearance="filled" color="warning" size="small" style={{ marginTop: 4 }}>
                  Stale ({'>'}30 days)
                </Badge>
              )}
            </Card>
            <Card className={styles.cardClickable} onClick={() => navigate('/timesheets')}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIcon}><CalendarClockRegular /></div>
                <InfoTooltip
                  calculation="Sum of 'amount' and count of all timesheets where invoiceId is not set (never added to any invoice, regardless of date)."
                  purpose="Shows billable work that hasn't been invoiced yet. This is revenue you've earned but not yet billed."
                  attention="This should drop to near zero after you create and confirm invoices each month. If this keeps growing, you're falling behind on invoicing."
                  crossCheck="After invoicing, this amount should shift into Unpaid Invoices. The Invoice Coverage lifeline below will show which months have gaps."
                />
              </div>
              <Text className={styles.cardValue}>{fmt.format(opsSummary.uninvoiced.total)}</Text>
              <Text className={styles.cardLabel}>Uninvoiced Timesheets</Text>
              <Text className={styles.cardHint}>
                {opsSummary.uninvoiced.count} entr{opsSummary.uninvoiced.count !== 1 ? 'ies' : 'y'}
              </Text>
            </Card>
            <Card className={styles.cardClickable} onClick={() => navigate('/invoices')}>
              <div className={styles.cardHeader}>
                <div className={opsSummary.monthlyInvoices.warning ? styles.cardIconWarning : styles.cardIcon}>
                  {opsSummary.monthlyInvoices.warning ? <WarningRegular /> : <DocumentTextRegular />}
                </div>
                <InfoTooltip
                  calculation="Count of invoices with an invoiceDate in the current calendar month (any status: draft, confirmed, or posted)."
                  purpose="Reminder to issue invoices regularly. Most contractors invoice monthly."
                  attention="Warning appears after the 20th of the month if zero invoices have been created. This is a nudge, not an error — you may have a different billing cycle."
                  crossCheck="Check Uninvoiced Timesheets — if that's non-zero and this card shows zero, you likely need to create an invoice. The Invoice Coverage lifeline shows historical gaps."
                />
              </div>
              <Text className={styles.cardValue}>{opsSummary.monthlyInvoices.count}</Text>
              <Text className={styles.cardLabel}>Invoices This Month</Text>
              {opsSummary.monthlyInvoices.warning && (
                <Badge appearance="filled" color="warning" size="small" style={{ marginTop: 4 }}>
                  No invoices issued this month
                </Badge>
              )}
            </Card>
          </div>
        </>
      )}

      {/* Row 4 — Invoice Coverage Lifeline */}
      {(coverageData.company || coverageData.tax || coverageData.calendar) && (
        <Card className={styles.lifelineCard}>
          <div className={styles.cardHeader}>
            <Text className={styles.lifelineTitle}>Invoice Coverage</Text>
            <InfoTooltip
              calculation="Each cell shows the count and total value of invoices (any status) whose invoiceDate falls in that month. Three rows show Company Year, Tax Year, and Calendar Year perspectives."
              purpose="Visual at-a-glance check for invoicing gaps. Green = invoiced, amber = past month with no invoice, grey = future. Hover any cell for invoice details."
              attention="Amber cells indicate months where you worked but may not have invoiced. Click any cell to see the filtered invoice list for that month."
              crossCheck="Amber months here should correlate with a high Uninvoiced Timesheets value. If a cell is green but Unpaid Invoices is high, the invoices may be sent but unpaid."
            />
          </div>
          {coverageData.company && coverageData.company.length > 0 && renderLifelineRow(
            'Company Year',
            coverageData.company,
            settings?.accountingReferenceDate
              ? formatPeriodLabel(coverageData.company[0]?.start, coverageData.company[coverageData.company.length - 1]?.end)
              : 'Calendar Year (ARD not set)',
          )}
          {coverageData.tax && coverageData.tax.length > 0 && renderLifelineRow(
            'Tax Year',
            coverageData.tax,
            formatPeriodLabel(coverageData.tax[0]?.start, coverageData.tax[coverageData.tax.length - 1]?.end),
          )}
          {coverageData.calendar && coverageData.calendar.length > 0 && renderLifelineRow(
            'Calendar Year',
            coverageData.calendar,
            formatPeriodLabel(coverageData.calendar[0]?.start, coverageData.calendar[coverageData.calendar.length - 1]?.end),
          )}
        </Card>
      )}

      {/* Recent Timesheet Entries */}
      <Text className={styles.sectionTitle}>Recent Timesheet Entries</Text>
      {recentEntries.length === 0 ? (
        <div className={styles.empty}><Text>No timesheet entries yet. Start logging your work!</Text></div>
      ) : (
        <DataGrid
          items={recentEntries}
          columns={recentColumns}
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
              <DataGridRow key={rowId} className={styles.row} onClick={() => navigate(`/timesheets/${item._id}`)}>
                {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
              </DataGridRow>
            )}
          </DataGridBody>
        </DataGrid>
      )}
    </div>
  );
}
