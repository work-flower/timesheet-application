import { useState, useEffect, useMemo } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Select,
  Button,
  Spinner,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbButton,
  Input,
} from '@fluentui/react-components';
import {
  DocumentPdfRegular,
  TableSimpleRegular,
  ArrowDownloadRegular,
} from '@fluentui/react-icons';
import { reportsApi, settingsApi } from '../../api/index.js';
import {
  getVatQuarter,
  getVatQuarters,
  formatPeriodLabel,
} from '../../utils/periods.js';

const useStyles = makeStyles({
  page: {
    display: 'flex',
    height: '100%',
  },
  sidebar: {
    width: '280px',
    flexShrink: 0,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  sidebarTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    display: 'block',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  fieldLabel: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '8px',
  },
  preview: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '16px 24px',
    minWidth: 0,
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
  pdfFrame: {
    flex: 1,
    border: 'none',
    borderRadius: '4px',
    backgroundColor: tokens.colorNeutralBackground3,
  },
  emptyPreview: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase300,
  },
});

const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4'];

function getYearOptions() {
  const currentYear = new Date().getFullYear();
  const options = [];
  for (let y = currentYear - 3; y <= currentYear + 1; y++) options.push(y);
  return options;
}

export default function VatReport() {
  const styles = useStyles();
  const [settings, setSettings] = useState(null);
  const [mode, setMode] = useState('quarter');
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(0);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [pdfUrl, setPdfUrl] = useState(null);
  const [generating, setGenerating] = useState(false);

  const yearOptions = useMemo(() => getYearOptions(), []);

  useEffect(() => {
    settingsApi.get().then((s) => {
      setSettings(s);
      // Auto-select current quarter
      if (s?.vatStaggerGroup) {
        const q = getVatQuarter(new Date(), Number(s.vatStaggerGroup));
        const quarters = getVatQuarters(new Date().getFullYear(), Number(s.vatStaggerGroup));
        const idx = quarters.findIndex(qr => qr.start === q.start);
        if (idx >= 0) setQuarter(idx);
      }
    }).catch(console.error);
  }, []);

  const staggerGroup = settings?.vatStaggerGroup ? Number(settings.vatStaggerGroup) : 1;

  const quarters = useMemo(() => {
    return getVatQuarters(year, staggerGroup);
  }, [year, staggerGroup]);

  const period = useMemo(() => {
    if (mode === 'custom') {
      return customStart && customEnd ? { start: customStart, end: customEnd } : null;
    }
    return quarters[quarter] || null;
  }, [mode, quarters, quarter, customStart, customEnd]);

  const handleGenerate = async () => {
    if (!period) return;
    setGenerating(true);
    try {
      const blob = await reportsApi.getVatPdfBlob(period.start, period.end);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!period) return;
    try {
      const blob = await reportsApi.getVatPdfBlob(period.start, period.end);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vat-report-${period.start}-to-${period.end}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownloadCsv = async () => {
    if (!period) return;
    try {
      const blob = await reportsApi.getVatCsvBlob(period.start, period.end);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vat-report-${period.start}-to-${period.end}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.sidebar}>
        <Text className={styles.sidebarTitle}>VAT Report</Text>

        {!settings?.vatStaggerGroup && (
          <Text style={{ fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteYellowForeground1 }}>
            VAT stagger group not set in Settings. Using Group 1 as default.
          </Text>
        )}

        <div className={styles.field}>
          <Text className={styles.fieldLabel}>Period Type</Text>
          <Select value={mode} onChange={(e, d) => setMode(d.value)}>
            <option value="quarter">VAT Quarter</option>
            <option value="custom">Custom Range</option>
          </Select>
        </div>

        {mode === 'quarter' && (
          <>
            <div className={styles.field}>
              <Text className={styles.fieldLabel}>Year</Text>
              <Select value={String(year)} onChange={(e, d) => setYear(Number(d.value))}>
                {yearOptions.map(y => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </Select>
            </div>
            <div className={styles.field}>
              <Text className={styles.fieldLabel}>Quarter</Text>
              <Select value={String(quarter)} onChange={(e, d) => setQuarter(Number(d.value))}>
                {quarters.map((q, i) => (
                  <option key={i} value={String(i)}>
                    {QUARTER_LABELS[i]} ({formatPeriodLabel(q.start, q.end)})
                  </option>
                ))}
              </Select>
            </div>
          </>
        )}

        {mode === 'custom' && (
          <>
            <div className={styles.field}>
              <Text className={styles.fieldLabel}>Start Date</Text>
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            </div>
            <div className={styles.field}>
              <Text className={styles.fieldLabel}>End Date</Text>
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
          </>
        )}

        {period && (
          <Text style={{ fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 }}>
            {formatPeriodLabel(period.start, period.end)}
          </Text>
        )}

        <div className={styles.actions}>
          <Button
            appearance="primary"
            icon={<DocumentPdfRegular />}
            onClick={handleGenerate}
            disabled={!period || generating}
            size="small"
          >
            {generating ? 'Generating...' : 'Generate Preview'}
          </Button>
          <Button
            icon={<ArrowDownloadRegular />}
            onClick={handleDownloadPdf}
            disabled={!period}
            size="small"
          >
            Download PDF
          </Button>
          <Button
            icon={<TableSimpleRegular />}
            onClick={handleDownloadCsv}
            disabled={!period}
            size="small"
          >
            Download CSV
          </Button>
        </div>
      </div>

      <div className={styles.preview}>
        <div className={styles.header}>
          <Breadcrumb>
            <BreadcrumbItem><BreadcrumbButton>Reports</BreadcrumbButton></BreadcrumbItem>
            <BreadcrumbItem><BreadcrumbButton>VAT</BreadcrumbButton></BreadcrumbItem>
          </Breadcrumb>
          <Text className={styles.title}>VAT Report</Text>
        </div>

        {generating ? (
          <div className={styles.emptyPreview}><Spinner label="Generating report..." /></div>
        ) : pdfUrl ? (
          <object data={pdfUrl} type="application/pdf" className={styles.pdfFrame} style={{ width: '100%' }}>
            <p>PDF preview not available. <a href={pdfUrl} target="_blank" rel="noreferrer">Open PDF</a></p>
          </object>
        ) : (
          <div className={styles.emptyPreview}>
            Select a period and click Generate to preview the report.
          </div>
        )}
      </div>
    </div>
  );
}
