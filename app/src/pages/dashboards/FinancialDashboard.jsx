import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Card,
  Spinner,
  Select,
  Tab,
  TabList,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbButton,
} from '@fluentui/react-components';
import {
  ArrowTrendingRegular,
  WalletRegular,
  ReceiptRegular,
  DocumentTextRegular,
  ArrowUpRegular,
  ArrowDownRegular,
} from '@fluentui/react-icons';
import { dashboardApi, settingsApi } from '../../api/index.js';
import InfoTooltip from '../../components/InfoTooltip.jsx';
import {
  getCompanyYear,
  getTaxYear,
  getCalendarYear,
} from '../../utils/periods.js';

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
  controls: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-end',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  controlField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  controlLabel: {
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
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
  cardIconGreen: {
    fontSize: '24px',
    color: tokens.colorPaletteGreenForeground1,
  },
  cardIconRed: {
    fontSize: '24px',
    color: tokens.colorPaletteRedForeground1,
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
  tabs: {
    marginBottom: '16px',
  },
  chartContainer: {
    position: 'relative',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '4px',
    padding: '16px 16px 8px 16px',
    backgroundColor: tokens.colorNeutralBackground1,
    minHeight: '280px',
  },
  legend: {
    display: 'flex',
    gap: '20px',
    justifyContent: 'center',
    padding: '8px 0 4px 0',
    fontSize: tokens.fontSizeBase200,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  legendLine: {
    width: '20px',
    height: '3px',
    borderRadius: '2px',
    display: 'inline-block',
  },
  legendBar: {
    width: '12px',
    height: '12px',
    borderRadius: '2px',
    display: 'inline-block',
  },
  tooltip: {
    position: 'absolute',
    pointerEvents: 'none',
    backgroundColor: 'rgba(30, 30, 30, 0.92)',
    color: '#fff',
    borderRadius: '6px',
    padding: '10px 14px',
    fontSize: '12px',
    lineHeight: '1.6',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    zIndex: 10,
    whiteSpace: 'nowrap',
    minWidth: '140px',
  },
  tooltipTitle: {
    fontWeight: 600,
    marginBottom: '4px',
    fontSize: '13px',
    borderBottom: '1px solid rgba(255,255,255,0.2)',
    paddingBottom: '4px',
  },
  tooltipRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '16px',
  },
  tooltipDot: {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    marginRight: '6px',
    verticalAlign: 'middle',
  },
  clientChartContainer: {
    position: 'relative',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '4px',
    padding: '16px',
    backgroundColor: tokens.colorNeutralBackground1,
    minHeight: '280px',
  },
  chartsRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    alignItems: 'start',
    marginBottom: '24px',
  },
  chartColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
});

const fmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

function getYearOptions() {
  const currentYear = new Date().getFullYear();
  const options = [];
  for (let y = currentYear - 3; y <= currentYear + 1; y++) {
    options.push(y);
  }
  return options;
}

// Chart constants
const SVG_W = 800;
const CHART_H = 310;
const PAD_TOP = 10;
const PAD_BOTTOM = 30;
const PAD_LEFT = 60;
const PAD_RIGHT = 20;
const PLOT_W = SVG_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = CHART_H - PAD_TOP - PAD_BOTTOM;

const IN_COLOR = '#1565C0';
const OUT_COLOR = '#E53935';
const NET_COLOR = '#FB8C00';
const CUM_COLOR = '#7B1FA2';
const MARGIN_POS_COLOR = '#81C784';
const MARGIN_NEG_COLOR = '#EF9A9A';

function MonthlyChart({ viewData, view }) {
  const styles = useStyles();
  const svgRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const [mouseX, setMouseX] = useState(0);

  const n = viewData.length;
  const colW = PLOT_W / n;

  // Compute cumulative net values
  const cumulative = useMemo(() => {
    let sum = 0;
    return viewData.map(m => {
      const netV = view === 'accrual' ? (m.netProfit || 0) : (m.netCashFlow || 0);
      sum += netV;
      return sum;
    });
  }, [viewData, view]);

  // Compute scale — all columns positive, net/cumulative lines can go negative
  const { dataMin, range } = useMemo(() => {
    const allVals = viewData.flatMap((m, i) => {
      const inV = view === 'accrual' ? (m.revenue || 0) : (m.cashIn || 0);
      const outV = view === 'accrual' ? (m.expenses || 0) : (m.cashOut || 0);
      const netV = view === 'accrual' ? (m.netProfit || 0) : (m.netCashFlow || 0);
      return [inV, outV, netV, cumulative[i]];
    });
    const max = Math.max(...allVals, 0);
    const min = Math.min(...allVals, 0);
    return { dataMin: min, range: (max - min) || 1 };
  }, [viewData, view, cumulative]);

  const yScale = useCallback((v) => PAD_TOP + PLOT_H - ((v - dataMin) / range) * PLOT_H, [dataMin, range]);
  const zeroY = yScale(0);

  const gridLines = useMemo(() => {
    const count = 5;
    const step = range / count;
    const lines = [];
    for (let i = 0; i <= count; i++) lines.push(dataMin + step * i);
    return lines;
  }, [dataMin, range]);

  const getCx = (i) => PAD_LEFT + colW * (i + 0.5);

  const handleMouseMove = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * SVG_W;
    const idx = Math.floor((svgX - PAD_LEFT) / colW);
    if (idx >= 0 && idx < n) {
      setHoverIdx(idx);
      setMouseX(e.clientX - rect.left);
    } else {
      setHoverIdx(-1);
    }
  }, [n, colW]);

  const handleMouseLeave = useCallback(() => setHoverIdx(-1), []);

  const hovered = hoverIdx >= 0 ? viewData[hoverIdx] : null;
  const hoveredCum = hoverIdx >= 0 ? cumulative[hoverIdx] : 0;
  const inLabel = view === 'accrual' ? 'Revenue' : 'Cash In';
  const outLabel = view === 'accrual' ? 'Expenses' : 'Cash Out';
  const netLabel = view === 'accrual' ? 'Net Profit' : 'Net Cash Flow';
  const cumLabel = view === 'accrual' ? 'Cumulative Profit' : 'Cumulative Cash Flow';

  const barW = Math.max(colW * 0.3, 8);

  return (
    <div className={styles.chartContainer}>
      <div style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          width="100%"
          viewBox={`0 0 ${SVG_W} ${CHART_H}`}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ display: 'block' }}
        >
          {/* Grid lines + Y labels */}
          {gridLines.map((val, i) => {
            const y = yScale(val);
            return (
              <g key={i}>
                <line x1={PAD_LEFT} y1={y} x2={SVG_W - PAD_RIGHT} y2={y}
                  stroke="#E0E0E0" strokeWidth="1" strokeDasharray={val === 0 ? 'none' : '4,3'} />
                <text x={PAD_LEFT - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#999">
                  {Math.abs(val) >= 1000 ? `${Math.round(val / 1000)}k` : Math.round(val)}
                </text>
              </g>
            );
          })}
          {/* Zero line */}
          <line x1={PAD_LEFT} y1={zeroY} x2={SVG_W - PAD_RIGHT} y2={zeroY}
            stroke="#999" strokeWidth="1" />

          {/* Revenue/CashIn columns (left) + Expenses/CashOut columns (right), both positive */}
          {viewData.map((m, i) => {
            const inV = view === 'accrual' ? (m.revenue || 0) : (m.cashIn || 0);
            const outV = view === 'accrual' ? (m.expenses || 0) : (m.cashOut || 0);
            const cx = getCx(i);

            // Revenue bar (left of center, goes up from zero)
            const inBarX = cx - barW - 1;
            const inBarY = yScale(inV);
            const inBarH = Math.max(zeroY - inBarY, 1);

            // Expenses bar (right of center, goes up from zero)
            const outBarX = cx + 1;
            const outBarY = yScale(outV);
            const outBarH = Math.max(zeroY - outBarY, 1);

            return (
              <g key={i}>
                <rect x={inBarX} y={inBarY} width={barW} height={inBarH}
                  fill={IN_COLOR} opacity={hoverIdx === i ? 1 : 0.8} rx="1" />
                <rect x={outBarX} y={outBarY} width={barW} height={outBarH}
                  fill={OUT_COLOR} opacity={hoverIdx === i ? 1 : 0.8} rx="1" />
              </g>
            );
          })}

          {/* Net Profit / Net Cash Flow line */}
          {(() => {
            const points = viewData.map((m, i) => {
              const v = view === 'accrual' ? (m.netProfit || 0) : (m.netCashFlow || 0);
              return `${getCx(i)},${yScale(v)}`;
            });
            return (
              <>
                <polyline points={points.join(' ')} fill="none" stroke={NET_COLOR}
                  strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                {viewData.map((m, i) => {
                  const v = view === 'accrual' ? (m.netProfit || 0) : (m.netCashFlow || 0);
                  return <circle key={i} cx={getCx(i)} cy={yScale(v)} r="3.5" fill={NET_COLOR} stroke="white" strokeWidth="1.5" />;
                })}
              </>
            );
          })()}

          {/* Cumulative Net line (dashed) */}
          {(() => {
            const points = cumulative.map((v, i) => `${getCx(i)},${yScale(v)}`);
            return (
              <>
                <polyline points={points.join(' ')} fill="none" stroke={CUM_COLOR}
                  strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="6,3" />
                {cumulative.map((v, i) => (
                  <circle key={i} cx={getCx(i)} cy={yScale(v)} r="3" fill={CUM_COLOR} stroke="white" strokeWidth="1.5" />
                ))}
              </>
            );
          })()}

          {/* X axis labels */}
          {viewData.map((m, i) => (
            <text key={i} x={getCx(i)} y={CHART_H - 6} textAnchor="middle" fontSize="11" fill="#666">
              {m.label.split(' ')[0]}
            </text>
          ))}

          {/* Crosshair vertical line */}
          {hoverIdx >= 0 && (
            <line
              x1={getCx(hoverIdx)} y1={PAD_TOP}
              x2={getCx(hoverIdx)} y2={CHART_H - PAD_BOTTOM}
              stroke={tokens.colorNeutralForeground3}
              strokeWidth="1"
              strokeDasharray="4,3"
              pointerEvents="none"
            />
          )}
        </svg>

        {/* Tooltip popup */}
        {hovered && (() => {
          const inV = view === 'accrual' ? (hovered.revenue || 0) : (hovered.cashIn || 0);
          const outV = view === 'accrual' ? (hovered.expenses || 0) : (hovered.cashOut || 0);
          const netV = view === 'accrual' ? (hovered.netProfit || 0) : (hovered.netCashFlow || 0);
          const svgEl = svgRef.current;
          const svgW = svgEl ? svgEl.getBoundingClientRect().width : 800;
          const flipRight = mouseX > svgW * 0.65;
          return (
            <div
              className={styles.tooltip}
              style={{
                top: 8,
                ...(flipRight ? { right: svgW - mouseX + 12 } : { left: mouseX + 12 }),
              }}
            >
              <div className={styles.tooltipTitle}>{hovered.label}</div>
              <div className={styles.tooltipRow}>
                <span><span className={styles.tooltipDot} style={{ backgroundColor: IN_COLOR }} />{inLabel}</span>
                <span>{fmt.format(inV)}</span>
              </div>
              <div className={styles.tooltipRow}>
                <span><span className={styles.tooltipDot} style={{ backgroundColor: OUT_COLOR }} />{outLabel}</span>
                <span>{fmt.format(outV)}</span>
              </div>
              <div className={styles.tooltipRow}>
                <span><span className={styles.tooltipDot} style={{ backgroundColor: NET_COLOR }} />{netLabel}</span>
                <span style={{ fontWeight: 600 }}>{fmt.format(netV)}</span>
              </div>
              <div className={styles.tooltipRow}>
                <span><span className={styles.tooltipDot} style={{ backgroundColor: CUM_COLOR }} />{cumLabel}</span>
                <span style={{ fontWeight: 600 }}>{fmt.format(hoveredCum)}</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Legend below chart */}
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={styles.legendBar} style={{ backgroundColor: IN_COLOR }} />
          {inLabel}
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendBar} style={{ backgroundColor: OUT_COLOR }} />
          {outLabel}
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendLine} style={{ backgroundColor: NET_COLOR }} />
          {netLabel}
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendLine} style={{ backgroundColor: CUM_COLOR, borderStyle: 'dashed' }} />
          {cumLabel}
        </div>
      </div>
    </div>
  );
}

// Client bar chart constants
const CLIENT_BAR_H_BASE = 52; // height per client row
const CLIENT_PAD_TOP = 14;
const CLIENT_PAD_BOTTOM = 50;
const CLIENT_PAD_LEFT = 140;
const CLIENT_PAD_RIGHT = 20;
const CLIENT_PLOT_W = SVG_W - CLIENT_PAD_LEFT - CLIENT_PAD_RIGHT;

function ClientChart({ clients }) {
  const styles = useStyles();
  const [hoverClient, setHoverClient] = useState(-1);

  const maxVal = useMemo(() => {
    const vals = clients.flatMap(c => [c.revenue, c.expenses, Math.abs(c.margin)]);
    return Math.max(...vals, 1);
  }, [clients]);

  const n = clients.length;
  const chartH = Math.max(CLIENT_PAD_TOP + n * CLIENT_BAR_H_BASE + CLIENT_PAD_BOTTOM, CHART_H);
  const barGroupH = CLIENT_BAR_H_BASE * 0.8;
  const barH = barGroupH / 3;
  const barScale = (v) => (v / maxVal) * CLIENT_PLOT_W;

  // Generate grid lines
  const gridLines = useMemo(() => {
    const count = 5;
    const step = maxVal / count;
    const lines = [];
    for (let i = 0; i <= count; i++) lines.push(Math.round(step * i));
    return lines;
  }, [maxVal]);

  return (
    <div className={styles.clientChartContainer}>
      <svg
        width="100%"
        viewBox={`0 0 ${SVG_W} ${chartH}`}
        style={{ display: 'block' }}
      >
        {/* Grid lines */}
        {gridLines.map((val, i) => {
          const x = CLIENT_PAD_LEFT + barScale(val);
          return (
            <g key={i}>
              <line x1={x} y1={CLIENT_PAD_TOP} x2={x} y2={chartH - CLIENT_PAD_BOTTOM}
                stroke="#E0E0E0" strokeWidth="1" strokeDasharray="4,3" />
              <text x={x} y={chartH - CLIENT_PAD_BOTTOM + 16} textAnchor="middle" fontSize="10" fill="#999">
                {val >= 1000 ? `${Math.round(val / 1000)}k` : val}
              </text>
            </g>
          );
        })}

        {clients.map((c, i) => {
          const groupY = CLIENT_PAD_TOP + i * CLIENT_BAR_H_BASE + (CLIENT_BAR_H_BASE - barGroupH) / 2;
          const isHovered = hoverClient === i;

          return (
            <g
              key={c.clientId}
              onMouseEnter={() => setHoverClient(i)}
              onMouseLeave={() => setHoverClient(-1)}
              style={{ cursor: 'default' }}
            >
              {/* Hover background */}
              {isHovered && (
                <rect
                  x={0} y={CLIENT_PAD_TOP + i * CLIENT_BAR_H_BASE}
                  width={SVG_W} height={CLIENT_BAR_H_BASE}
                  fill="#f5f5f5" rx="2"
                />
              )}

              {/* Client name */}
              <text
                x={CLIENT_PAD_LEFT - 8}
                y={CLIENT_PAD_TOP + i * CLIENT_BAR_H_BASE + CLIENT_BAR_H_BASE / 2 + 4}
                textAnchor="end" fontSize="12" fill="#333" fontWeight={isHovered ? '600' : '400'}
              >
                {(() => { const name = c.clientName || 'Unknown'; return name.length > 18 ? name.slice(0, 18) + '...' : name; })()}
              </text>

              {/* Revenue bar */}
              <rect x={CLIENT_PAD_LEFT} y={groupY} width={Math.max(barScale(c.revenue), 1)} height={barH}
                fill={IN_COLOR} rx="2" opacity={isHovered ? 1 : 0.85} />
              {c.revenue > 0 && barScale(c.revenue) > 50 && (
                <text x={CLIENT_PAD_LEFT + barScale(c.revenue) - 4} y={groupY + barH / 2 + 4}
                  textAnchor="end" fontSize="10" fill="white" fontWeight="600">
                  {fmt.format(c.revenue)}
                </text>
              )}

              {/* Expenses bar */}
              <rect x={CLIENT_PAD_LEFT} y={groupY + barH} width={Math.max(barScale(c.expenses), 1)} height={barH}
                fill={OUT_COLOR} rx="2" opacity={isHovered ? 1 : 0.85} />
              {c.expenses > 0 && barScale(c.expenses) > 50 && (
                <text x={CLIENT_PAD_LEFT + barScale(c.expenses) - 4} y={groupY + barH + barH / 2 + 4}
                  textAnchor="end" fontSize="10" fill="white" fontWeight="600">
                  {fmt.format(c.expenses)}
                </text>
              )}

              {/* Margin bar */}
              <rect x={CLIENT_PAD_LEFT} y={groupY + barH * 2} width={Math.max(barScale(Math.abs(c.margin)), 1)} height={barH}
                fill={c.margin >= 0 ? MARGIN_POS_COLOR : MARGIN_NEG_COLOR} rx="2" opacity={isHovered ? 0.9 : 0.7} />
              {Math.abs(c.margin) > 0 && barScale(Math.abs(c.margin)) > 50 && (
                <text x={CLIENT_PAD_LEFT + barScale(Math.abs(c.margin)) - 4} y={groupY + barH * 2 + barH / 2 + 4}
                  textAnchor="end" fontSize="10" fill="white" fontWeight="600">
                  {fmt.format(c.margin)}
                </text>
              )}

              {/* Value labels outside bars when bars are too short */}
              {c.revenue > 0 && barScale(c.revenue) <= 50 && (
                <text x={CLIENT_PAD_LEFT + barScale(c.revenue) + 4} y={groupY + barH / 2 + 4}
                  textAnchor="start" fontSize="10" fill={IN_COLOR}>
                  {fmt.format(c.revenue)}
                </text>
              )}
              {c.expenses > 0 && barScale(c.expenses) <= 50 && (
                <text x={CLIENT_PAD_LEFT + barScale(c.expenses) + 4} y={groupY + barH + barH / 2 + 4}
                  textAnchor="start" fontSize="10" fill={OUT_COLOR}>
                  {fmt.format(c.expenses)}
                </text>
              )}
              {Math.abs(c.margin) > 0 && barScale(Math.abs(c.margin)) <= 50 && (
                <text x={CLIENT_PAD_LEFT + barScale(Math.abs(c.margin)) + 4} y={groupY + barH * 2 + barH / 2 + 4}
                  textAnchor="start" fontSize="10" fill={c.margin >= 0 ? '#388E3C' : '#C62828'}>
                  {fmt.format(c.margin)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={styles.legendBar} style={{ backgroundColor: IN_COLOR }} />
          Revenue
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendBar} style={{ backgroundColor: OUT_COLOR }} />
          Expenses
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendBar} style={{ backgroundColor: MARGIN_POS_COLOR, opacity: 0.7 }} />
          Margin
        </div>
      </div>
    </div>
  );
}

export default function FinancialDashboard() {
  const styles = useStyles();
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [perspective, setPerspective] = useState('company');
  const [year, setYear] = useState(new Date().getFullYear());
  const [view, setView] = useState('accrual');

  const yearOptions = useMemo(() => getYearOptions(), []);

  const period = useMemo(() => {
    const refDate = `${year}-06-15`;
    switch (perspective) {
      case 'company':
        return getCompanyYear(refDate, settings?.accountingReferenceDate);
      case 'tax':
        return getTaxYear(`${year}-04-06`);
      case 'calendar':
      default:
        return getCalendarYear(refDate);
    }
  }, [perspective, year, settings]);

  useEffect(() => {
    settingsApi.get().then(setSettings).catch(console.error);
  }, []);

  useEffect(() => {
    if (!period) return;
    setLoading(true);
    dashboardApi.getFinancial(period.start, period.end)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [period]);

  const viewData = useMemo(() => {
    if (!data) return [];
    return view === 'accrual' ? data.accrual : data.cash;
  }, [data, view]);

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;
  if (!data) return null;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Breadcrumb>
          <BreadcrumbItem><BreadcrumbButton>Dashboards</BreadcrumbButton></BreadcrumbItem>
          <BreadcrumbItem><BreadcrumbButton>Financial</BreadcrumbButton></BreadcrumbItem>
        </Breadcrumb>
        <Text className={styles.title}>Financial Overview</Text>
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <div className={styles.controlField}>
          <Text className={styles.controlLabel}>Perspective</Text>
          <Select value={perspective} onChange={(e, d) => setPerspective(d.value)}>
            <option value="company">Company Year</option>
            <option value="tax">Tax Year</option>
            <option value="calendar">Calendar Year</option>
          </Select>
        </div>
        <div className={styles.controlField}>
          <Text className={styles.controlLabel}>Year</Text>
          <Select value={String(year)} onChange={(e, d) => setYear(Number(d.value))}>
            {yearOptions.map(y => (
              <option key={y} value={String(y)}>{
                perspective === 'tax' ? `${y}/${String(y + 1).slice(2)}` :
                perspective === 'company' && settings?.accountingReferenceDate ?
                  `${y}/${String(y + 1).slice(2)}` : String(y)
              }</option>
            ))}
          </Select>
        </div>
      </div>

      {/* Key Metrics */}
      <div className={styles.cards}>
        <Card className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIconGreen}><ArrowUpRegular /></div>
            <InfoTooltip
              calculation="Sum of subtotal (net, before VAT) on all confirmed/posted invoices whose invoiceDate falls within the selected period."
              purpose="Accrual-based revenue — what you've billed, regardless of whether you've been paid yet."
              attention="If this doesn't match your expectation, check the Invoice Coverage on the Operations dashboard for missing months. Zero means no confirmed invoices in this period."
              crossCheck="YTD Revenue minus YTD Expenses = YTD Net Profit. Compare with Cash Position to see the gap between billed and received."
            />
          </div>
          <Text className={styles.cardValue}>{fmt.format(data.totals.ytdRevenue)}</Text>
          <Text className={styles.cardLabel}>YTD Revenue</Text>
        </Card>
        <Card className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIconRed}><ArrowDownRegular /></div>
            <InfoTooltip
              calculation="Sum of gross amount on all expenses whose date falls within the selected period (includes VAT, both billable and non-billable)."
              purpose="Total cost of doing business in this period. Includes client-rechargeable expenses and business overhead."
              attention="Rapid growth relative to revenue signals margin pressure. Compare month-on-month in the chart to spot trends."
              crossCheck="Subtracted from YTD Revenue to give YTD Net Profit. The Expenses This Month card on the Operations dashboard shows the current month's slice."
            />
          </div>
          <Text className={styles.cardValue}>{fmt.format(data.totals.ytdExpenses)}</Text>
          <Text className={styles.cardLabel}>YTD Expenses</Text>
        </Card>
        <Card className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}><ArrowTrendingRegular /></div>
            <InfoTooltip
              calculation="YTD Revenue minus YTD Expenses. Accrual-based — reflects invoiced revenue and recorded expenses, not actual cash movement."
              purpose="Bottom-line profitability indicator for the period. This is what matters for Corporation Tax planning."
              attention="If negative, you're spending more than you're billing. Compare with Cash Position — a positive profit but negative cash position means clients owe you money."
              crossCheck="Should roughly equal the running total in the chart. For tax purposes, use the Income & Expense report (under Reports) for a formal breakdown."
            />
          </div>
          <Text className={styles.cardValue} style={{ color: data.totals.ytdNetProfit >= 0 ? '#1B7D3A' : '#D32F2F' }}>
            {fmt.format(data.totals.ytdNetProfit)}
          </Text>
          <Text className={styles.cardLabel}>YTD Net Profit</Text>
        </Card>
        <Card className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}><WalletRegular /></div>
            <InfoTooltip
              calculation="Sum of credit transactions minus sum of debit transactions (absolute values) in the selected period. Based on imported bank data."
              purpose="Actual cash movement — how much more (or less) money came into your bank than went out. Switch to Cash View below for monthly detail."
              attention="If this diverges significantly from YTD Net Profit, the gap is timing: unpaid invoices, prepaid expenses, or VAT payments. A negative value means more cash out than in."
              crossCheck="The gap between this and YTD Net Profit is explained by Outstanding (unpaid invoices) and timing differences. See the Cash View tab for monthly breakdown."
            />
          </div>
          <Text className={styles.cardValue}>{fmt.format(data.totals.cashPosition)}</Text>
          <Text className={styles.cardLabel}>Cash Position</Text>
        </Card>
        <Card className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}><DocumentTextRegular /></div>
            <InfoTooltip
              calculation="Sum of total on all posted invoices where paymentStatus is not 'paid' (unpaid or overdue). Not period-filtered — shows all time."
              purpose="Money owed to you by clients. This is the bridge between accrual revenue and actual cash received."
              attention="A growing balance means clients are slow to pay. Cross-reference with the Unpaid Invoices card on the Operations dashboard for the same figure."
              crossCheck="Outstanding explains the gap between YTD Revenue (accrual) and Cash Position (cash). When a payment arrives, it reduces this and increases Cash Position."
            />
          </div>
          <Text className={styles.cardValue}>{fmt.format(data.totals.outstanding)}</Text>
          <Text className={styles.cardLabel}>Outstanding</Text>
        </Card>
        <Card className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}><ReceiptRegular /></div>
            <InfoTooltip
              calculation="Output VAT = sum of totalVat from invoices in the period. Input VAT = sum of vatAmount from expenses. Position = Output minus Input."
              purpose="Estimates your VAT liability (owed to HMRC) or refund (reclaimable). For accurate figures, use the VAT Report under Reports."
              attention="If owing, ensure you have cash reserved for the next VAT return. If reclaimable, submit your return promptly. This is an estimate — the VAT Report is the formal calculation."
              crossCheck="For a formal breakdown by VAT rate, use Reports > VAT. The Income & Expense report also shows a VAT summary."
            />
          </div>
          <Text className={styles.cardValue} style={{ color: data.totals.vatPosition >= 0 ? '#D32F2F' : '#1B7D3A' }}>
            {fmt.format(Math.abs(data.totals.vatPosition))}
          </Text>
          <Text className={styles.cardLabel}>
            VAT {data.totals.vatPosition >= 0 ? 'Owed' : 'Reclaimable'}
          </Text>
          <Text className={styles.cardHint}>
            Output: {fmt.format(data.totals.outputVat)} | Input: {fmt.format(data.totals.inputVat)}
          </Text>
        </Card>
      </div>

      {/* View Toggle */}
      <TabList
        className={styles.tabs}
        selectedValue={view}
        onTabSelect={(e, d) => setView(d.value)}
      >
        <Tab value="accrual">Accrual View</Tab>
        <Tab value="cash">Cash View</Tab>
      </TabList>

      {/* Charts side by side */}
      <div className={styles.chartsRow}>
        {viewData.length > 0 && (
          <div className={styles.chartColumn}>
            <Text className={styles.sectionTitle} style={{ marginTop: 0 }}>Monthly Breakdown</Text>
            <MonthlyChart viewData={viewData} view={view} />
          </div>
        )}
        {data.clientBreakdown.length > 0 && (
          <div className={styles.chartColumn}>
            <Text className={styles.sectionTitle} style={{ marginTop: 0 }}>Per-Client Breakdown</Text>
            <ClientChart clients={data.clientBreakdown} />
          </div>
        )}
      </div>
    </div>
  );
}
