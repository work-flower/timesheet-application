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
  getCompanyYear,
  getTaxYear,
  getCalendarYear,
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

function getYearOptions() {
  const currentYear = new Date().getFullYear();
  const options = [];
  for (let y = currentYear - 3; y <= currentYear + 1; y++) options.push(y);
  return options;
}

export default function IncomeExpenseReport() {
  const styles = useStyles();
  const [settings, setSettings] = useState(null);
  const [perspective, setPerspective] = useState('company');
  const [year, setYear] = useState(new Date().getFullYear());
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [pdfUrl, setPdfUrl] = useState(null);
  const [generating, setGenerating] = useState(false);

  const yearOptions = useMemo(() => getYearOptions(), []);

  useEffect(() => {
    settingsApi.get().then(setSettings).catch(console.error);
  }, []);

  const period = useMemo(() => {
    if (perspective === 'custom') {
      return customStart && customEnd ? { start: customStart, end: customEnd } : null;
    }
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
  }, [perspective, year, customStart, customEnd, settings]);

  const handleGenerate = async () => {
    if (!period) return;
    setGenerating(true);
    try {
      const blob = await reportsApi.getIncomeExpensePdfBlob(period.start, period.end);
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
      const blob = await reportsApi.getIncomeExpensePdfBlob(period.start, period.end);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `income-expense-${period.start}-to-${period.end}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownloadCsv = async () => {
    if (!period) return;
    try {
      const blob = await reportsApi.getIncomeExpenseCsvBlob(period.start, period.end);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `income-expense-${period.start}-to-${period.end}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.sidebar}>
        <Text className={styles.sidebarTitle}>Income & Expense Report</Text>

        <div className={styles.field}>
          <Text className={styles.fieldLabel}>Period Type</Text>
          <Select value={perspective} onChange={(e, d) => setPerspective(d.value)}>
            <option value="company">Company Year</option>
            <option value="tax">Tax Year</option>
            <option value="calendar">Calendar Year</option>
            <option value="custom">Custom</option>
          </Select>
        </div>

        {perspective !== 'custom' && (
          <div className={styles.field}>
            <Text className={styles.fieldLabel}>Year</Text>
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
        )}

        {perspective === 'custom' && (
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
            <BreadcrumbItem><BreadcrumbButton>Income & Expense</BreadcrumbButton></BreadcrumbItem>
          </Breadcrumb>
          <Text className={styles.title}>Income & Expense Report</Text>
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
