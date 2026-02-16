import { useState, useEffect, useMemo } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Card,
  Spinner,
  Select,
  Input,
  ProgressBar,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableCellLayout,
  createTableColumn,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbButton,
} from '@fluentui/react-components';
import {
  ArrowSwapRegular,
  CheckmarkCircleRegular,
  DismissCircleRegular,
  EyeOffRegular,
} from '@fluentui/react-icons';
import { dashboardApi } from '../../api/index.js';
import InfoTooltip from '../../components/InfoTooltip.jsx';

const useStyles = makeStyles({
  page: {
    padding: '24px',
  },
  header: {
    marginBottom: '16px',
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase600,
    display: 'block',
    marginBottom: '4px',
  },
  filters: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-end',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  filterField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  filterLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
  },
  sectionTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    display: 'block',
    marginBottom: '12px',
    marginTop: '24px',
  },
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '8px',
  },
  card: {
    padding: '20px',
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
  cardIconSuccess: {
    fontSize: '24px',
    color: tokens.colorPaletteGreenForeground1,
  },
  cardIconWarning: {
    fontSize: '24px',
    color: tokens.colorPaletteRedForeground1,
  },
  cardIconMuted: {
    fontSize: '24px',
    color: tokens.colorNeutralForeground3,
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
  progressRow: {
    marginTop: '8px',
  },
  agingGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px',
    marginBottom: '8px',
  },
  agingCard: {
    padding: '16px',
    textAlign: 'center',
  },
  agingLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    display: 'block',
    marginBottom: '4px',
  },
  agingCount: {
    fontWeight: tokens.fontWeightBold,
    fontSize: tokens.fontSizeBase500,
    display: 'block',
  },
  agingAmount: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  agingGreen: { borderTop: '3px solid #4CAF50' },
  agingYellow: { borderTop: '3px solid #FF9800' },
  agingOrange: { borderTop: '3px solid #F44336' },
  agingRed: { borderTop: '3px solid #B71C1C' },
  trendGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
    gap: '4px',
    marginBottom: '8px',
  },
  trendBar: {
    textAlign: 'center',
    padding: '8px 4px',
    borderRadius: '4px',
    backgroundColor: tokens.colorNeutralBackground3,
  },
  trendLabel: {
    fontSize: '10px',
    color: tokens.colorNeutralForeground3,
    display: 'block',
    marginBottom: '4px',
  },
  trendRate: {
    fontWeight: tokens.fontWeightBold,
    fontSize: tokens.fontSizeBase300,
    display: 'block',
  },
  trendCount: {
    fontSize: '10px',
    color: tokens.colorNeutralForeground3,
  },
});

const fmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

const periodColumns = [
  createTableColumn({
    columnId: 'label',
    renderHeaderCell: () => 'Month',
    renderCell: (item) => <TableCellLayout><Text weight="semibold">{item.label}</Text></TableCellLayout>,
    compare: (a, b) => a.label.localeCompare(b.label),
  }),
  createTableColumn({
    columnId: 'creditsIn',
    renderHeaderCell: () => 'Credits In',
    renderCell: (item) => <TableCellLayout style={{ color: '#1B7D3A' }}>{fmt.format(item.creditsIn)}</TableCellLayout>,
    compare: (a, b) => a.creditsIn - b.creditsIn,
  }),
  createTableColumn({
    columnId: 'debitsOut',
    renderHeaderCell: () => 'Debits Out',
    renderCell: (item) => <TableCellLayout style={{ color: '#D32F2F' }}>{fmt.format(item.debitsOut)}</TableCellLayout>,
    compare: (a, b) => a.debitsOut - b.debitsOut,
  }),
  createTableColumn({
    columnId: 'matchedCount',
    renderHeaderCell: () => 'Matched',
    renderCell: (item) => <TableCellLayout>{item.matchedCount}</TableCellLayout>,
    compare: (a, b) => a.matchedCount - b.matchedCount,
  }),
  createTableColumn({
    columnId: 'ignoredCount',
    renderHeaderCell: () => 'Ignored',
    renderCell: (item) => <TableCellLayout>{item.ignoredCount}</TableCellLayout>,
    compare: (a, b) => a.ignoredCount - b.ignoredCount,
  }),
  createTableColumn({
    columnId: 'unmatchedCount',
    renderHeaderCell: () => 'Unmatched',
    renderCell: (item) => <TableCellLayout>{item.unmatchedCount}</TableCellLayout>,
    compare: (a, b) => a.unmatchedCount - b.unmatchedCount,
  }),
];

export default function ReconciliationDashboard() {
  const styles = useStyles();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (period === 'month') {
      const now = new Date();
      params.startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      params.endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    } else if (period === 'quarter') {
      const now = new Date();
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      params.startDate = new Date(now.getFullYear(), qMonth, 1).toISOString().slice(0, 10);
      params.endDate = new Date(now.getFullYear(), qMonth + 3, 0).toISOString().slice(0, 10);
    } else if (period === 'custom' && startDate && endDate) {
      params.startDate = startDate;
      params.endDate = endDate;
    }

    dashboardApi.getReconciliation(params)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [period, startDate, endDate]);

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;
  if (!data) return null;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Breadcrumb>
          <BreadcrumbItem><BreadcrumbButton>Dashboards</BreadcrumbButton></BreadcrumbItem>
          <BreadcrumbItem><BreadcrumbButton>Reconciliation</BreadcrumbButton></BreadcrumbItem>
        </Breadcrumb>
        <Text className={styles.title}>Reconciliation</Text>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.filterField}>
          <Text className={styles.filterLabel}>Period</Text>
          <Select value={period} onChange={(e, d) => setPeriod(d.value)}>
            <option value="all">All Time</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="custom">Custom</option>
          </Select>
        </div>
        {period === 'custom' && (
          <>
            <div className={styles.filterField}>
              <Text className={styles.filterLabel}>Start Date</Text>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className={styles.filterField}>
              <Text className={styles.filterLabel}>End Date</Text>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </>
        )}
      </div>

      {/* Summary Cards */}
      <div className={styles.cards}>
        <Card className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}><ArrowSwapRegular /></div>
            <InfoTooltip
              calculation="Count of all imported bank transactions in the selected period. Amount is the sum of absolute values (credits + debits)."
              purpose="Baseline number — the denominator for matching percentage. Shows how much bank activity exists to reconcile."
              attention="If this is zero, you haven't imported any bank statements for this period. Import via Data Management > Import Transactions."
              crossCheck="Should equal Matched + Unmatched + Ignored. The absolute amount here is NOT net cash flow — see the Financial dashboard for that."
            />
          </div>
          <Text className={styles.cardValue}>{data.total.count}</Text>
          <Text className={styles.cardLabel}>Total Transactions</Text>
          <Text className={styles.cardHint}>{fmt.format(data.total.amount)}</Text>
        </Card>
        <Card className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIconSuccess}><CheckmarkCircleRegular /></div>
            <InfoTooltip
              calculation="Transactions with status 'matched' — linked to an invoice (credit) or expense (debit). Percentage = matched / total."
              purpose="Shows reconciliation progress. Higher is better — means your books align with your bank."
              attention="Aim for >90%. A low percentage means bank transactions are sitting unlinked. Credits likely correspond to invoice payments; debits to expenses."
              crossCheck="Matched credits should reduce the Unpaid Invoices count on the Operations dashboard. The progress bar shows your overall reconciliation health."
            />
          </div>
          <Text className={styles.cardValue}>{data.matched.count}</Text>
          <Text className={styles.cardLabel}>Matched</Text>
          <Text className={styles.cardHint}>{fmt.format(data.matched.amount)}</Text>
          <div className={styles.progressRow}>
            <ProgressBar value={data.matched.percentage / 100} thickness="large" color="success" />
            <Text className={styles.cardHint}>{data.matched.percentage}%</Text>
          </div>
        </Card>
        <Card className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIconWarning}><DismissCircleRegular /></div>
            <InfoTooltip
              calculation="Transactions with status 'unmatched'. Split into credits (money in) and debits (money out) for diagnosis."
              purpose="These are bank movements you haven't accounted for yet. They need action — either link to existing records or create new ones."
              attention="Unmatched credits are likely client payments — link them to invoices. Unmatched debits may be expenses you haven't recorded. Check the Aging section below for urgency."
              crossCheck="Same count as the Unmatched Transactions card on the Operations dashboard. The Aging section below shows how old these are — older = more urgent."
            />
          </div>
          <Text className={styles.cardValue}>{data.unmatched.count}</Text>
          <Text className={styles.cardLabel}>Unmatched</Text>
          <Text className={styles.cardHint}>
            Credits: {fmt.format(data.unmatched.credits)} | Debits: {fmt.format(data.unmatched.debits)}
          </Text>
        </Card>
        <Card className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIconMuted}><EyeOffRegular /></div>
            <InfoTooltip
              calculation="Transactions manually marked as 'ignored' with a reason (e.g. internal transfers, duplicates, non-business transactions)."
              purpose="Keeps your reconciliation clean by excluding transactions that don't represent real income or expenses."
              attention="Review periodically — an accidentally ignored transaction means missing data. If this number is very high relative to Total, check that real transactions aren't being ignored."
              crossCheck="Ignored + Matched + Unmatched should always equal Total Transactions."
            />
          </div>
          <Text className={styles.cardValue}>{data.ignored.count}</Text>
          <Text className={styles.cardLabel}>Ignored</Text>
          <Text className={styles.cardHint}>{fmt.format(data.ignored.amount)}</Text>
        </Card>
      </div>

      {/* Aging Section */}
      <Text className={styles.sectionTitle}>Unmatched Aging</Text>
      <div className={styles.agingGrid}>
        <Card className={`${styles.agingCard} ${styles.agingGreen}`}>
          <Text className={styles.agingLabel}>{'< 7 days'}</Text>
          <Text className={styles.agingCount}>{data.aging.under7.count}</Text>
          <Text className={styles.agingAmount}>{fmt.format(data.aging.under7.amount)}</Text>
        </Card>
        <Card className={`${styles.agingCard} ${styles.agingYellow}`}>
          <Text className={styles.agingLabel}>7–30 days</Text>
          <Text className={styles.agingCount}>{data.aging.under30.count}</Text>
          <Text className={styles.agingAmount}>{fmt.format(data.aging.under30.amount)}</Text>
        </Card>
        <Card className={`${styles.agingCard} ${styles.agingOrange}`}>
          <Text className={styles.agingLabel}>30–90 days</Text>
          <Text className={styles.agingCount}>{data.aging.under90.count}</Text>
          <Text className={styles.agingAmount}>{fmt.format(data.aging.under90.amount)}</Text>
        </Card>
        <Card className={`${styles.agingCard} ${styles.agingRed}`}>
          <Text className={styles.agingLabel}>90+ days</Text>
          <Text className={styles.agingCount}>{data.aging.over90.count}</Text>
          <Text className={styles.agingAmount}>{fmt.format(data.aging.over90.amount)}</Text>
        </Card>
      </div>

      {/* Reconciliation Rate Trend */}
      {data.trend.length > 0 && (
        <>
          <Text className={styles.sectionTitle}>Reconciliation Rate Trend</Text>
          <div className={styles.trendGrid}>
            {data.trend.map((m, i) => (
              <div
                key={i}
                className={styles.trendBar}
                style={{
                  background: `linear-gradient(to top, ${
                    m.rate >= 80 ? '#E6F4EA' : m.rate >= 50 ? '#FFF8E1' : '#FFEBEE'
                  } ${m.rate}%, ${tokens.colorNeutralBackground3} ${m.rate}%)`,
                }}
              >
                <Text className={styles.trendLabel}>{m.label}</Text>
                <Text className={styles.trendRate}>{m.rate}%</Text>
                <Text className={styles.trendCount}>{m.matched}/{m.total}</Text>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Period-by-Period Summary */}
      {data.periodSummary.length > 0 && (
        <>
          <Text className={styles.sectionTitle}>Period Summary</Text>
          <DataGrid
            items={data.periodSummary}
            columns={periodColumns}
            sortable
            getRowId={(item) => item.label}
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
        </>
      )}
    </div>
  );
}
