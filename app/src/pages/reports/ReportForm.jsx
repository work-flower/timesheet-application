import { useState, useEffect, useMemo } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Select,
  Button,
  Field,
  Spinner,
  MessageBar,
  MessageBarBody,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbButton,
} from '@fluentui/react-components';
import {
  ArrowDownloadRegular,
  SaveRegular,
  DocumentSearchRegular,
} from '@fluentui/react-icons';
import { clientsApi, projectsApi, timesheetsApi, reportsApi, documentsApi } from '../../api/index.js';

const useStyles = makeStyles({
  page: {
    padding: '16px 24px',
    height: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    marginBottom: '16px',
    flexShrink: 0,
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase500,
    display: 'block',
    marginBottom: '4px',
  },
  message: {
    marginBottom: '16px',
    flexShrink: 0,
  },
  body: {
    display: 'flex',
    gap: '24px',
    flex: 1,
    minHeight: 0,
  },
  sidebar: {
    width: '280px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    overflowY: 'auto',
  },
  sidebarTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    marginBottom: '4px',
  },
  previewArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  previewContainer: {
    flex: 1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  previewHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    flexShrink: 0,
  },
  previewTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
  },
  previewActions: {
    display: 'flex',
    gap: '8px',
  },
  pdfObject: {
    width: '100%',
    flex: 1,
    border: 'none',
  },
  emptyPreview: {
    flex: 1,
    border: `1px dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase300,
  },
});

function computePeriods(timesheetDates, granularity) {
  if (!timesheetDates.length) return [];

  if (granularity === 'monthly') {
    const monthSet = new Set();
    for (const date of timesheetDates) {
      monthSet.add(date.substring(0, 7));
    }
    return [...monthSet]
      .sort((a, b) => b.localeCompare(a))
      .map((ym) => {
        const [year, month] = ym.split('-').map(Number);
        const startDate = `${ym}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${ym}-${String(lastDay).padStart(2, '0')}`;
        const label = new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        return { label, value: `${startDate}|${endDate}` };
      });
  }

  // Weekly
  const weekSet = new Set();
  for (const date of timesheetDates) {
    const d = new Date(date + 'T00:00:00');
    const dayOfWeek = d.getDay() || 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - dayOfWeek + 1);
    weekSet.add(monday.toISOString().split('T')[0]);
  }
  return [...weekSet]
    .sort((a, b) => b.localeCompare(a))
    .map((mondayStr) => {
      const monday = new Date(mondayStr + 'T00:00:00');
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const endDate = sunday.toISOString().split('T')[0];
      const label = `W/C ${monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
      return { label, value: `${mondayStr}|${endDate}` };
    });
}

export default function ReportForm() {
  const styles = useStyles();

  // Data
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [timesheetDates, setTimesheetDates] = useState([]);

  // Selections (restore from localStorage)
  const [selectedClientId, setSelectedClientId] = useState(() => localStorage.getItem('report.clientId') || '');
  const [selectedProjectId, setSelectedProjectId] = useState(() => localStorage.getItem('report.projectId') || '');
  const [granularity, setGranularity] = useState(() => localStorage.getItem('report.granularity') || 'monthly');
  const [selectedPeriod, setSelectedPeriod] = useState('');

  // Preview
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [pdfBlob, setPdfBlob] = useState(null);

  // UI state
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingDates, setLoadingDates] = useState(false);

  // Persist selections to localStorage
  useEffect(() => { localStorage.setItem('report.clientId', selectedClientId); }, [selectedClientId]);
  useEffect(() => { localStorage.setItem('report.projectId', selectedProjectId); }, [selectedProjectId]);
  useEffect(() => { localStorage.setItem('report.granularity', granularity); }, [granularity]);

  // Load clients on mount
  useEffect(() => {
    clientsApi.getAll().then((c) => {
      setClients(c);
      const clientIds = new Set(c.map((cl) => cl._id));
      setSelectedClientId((prev) => clientIds.has(prev) ? prev : '');
    }).catch((err) => setError(err.message));
  }, []);

  // Track whether this is initial mount to avoid resetting cached selections
  const isInitialMount = useMemo(() => ({ client: true, project: true, granularity: true }), []);

  // Load projects when client changes
  useEffect(() => {
    if (!selectedClientId) {
      setProjects([]);
      return;
    }
    setLoadingProjects(true);
    if (!isInitialMount.client) {
      setSelectedProjectId('');
      setTimesheetDates([]);
      setSelectedPeriod('');
      clearPreview();
    }
    isInitialMount.client = false;

    projectsApi.getAll()
      .then((all) => setProjects(all.filter((p) => p.clientId === selectedClientId && p.status === 'active')))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingProjects(false));
  }, [selectedClientId]);

  // Load timesheet dates when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setTimesheetDates([]);
      return;
    }
    setLoadingDates(true);
    if (!isInitialMount.project) {
      setSelectedPeriod('');
      clearPreview();
    }
    isInitialMount.project = false;

    timesheetsApi.getAll({ projectId: selectedProjectId })
      .then((entries) => setTimesheetDates(entries.map((e) => e.date).filter(Boolean).sort()))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingDates(false));
  }, [selectedProjectId]);

  // Reset period when granularity changes
  useEffect(() => {
    if (!isInitialMount.granularity) {
      setSelectedPeriod('');
      clearPreview();
    }
    isInitialMount.granularity = false;
  }, [granularity]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  const periods = useMemo(
    () => computePeriods(timesheetDates, granularity),
    [timesheetDates, granularity],
  );

  function clearPreview() {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    setPdfBlobUrl(null);
    setPdfBlob(null);
    setSuccess(null);
  }

  const handleGenerate = async () => {
    if (!selectedPeriod) return;
    setGenerating(true);
    setError(null);
    setSuccess(null);
    clearPreview();
    try {
      const [startDate, endDate] = selectedPeriod.split('|');
      const blob = await reportsApi.getTimesheetPdfBlob(selectedClientId, selectedProjectId, startDate, endDate);
      const url = URL.createObjectURL(blob);
      setPdfBlob(blob);
      setPdfBlobUrl(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!pdfBlobUrl) return;
    const [startDate, endDate] = selectedPeriod.split('|');
    const a = document.createElement('a');
    a.href = pdfBlobUrl;
    a.download = `timesheet-${startDate}-to-${endDate}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleSave = async () => {
    if (!selectedPeriod) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const [startDate, endDate] = selectedPeriod.split('|');
      await documentsApi.save({
        clientId: selectedClientId,
        projectId: selectedProjectId,
        startDate,
        endDate,
        granularity,
      });
      setSuccess('Document saved successfully.');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const canGenerate = selectedClientId && selectedProjectId && selectedPeriod && !generating;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Breadcrumb>
          <BreadcrumbItem>
            <BreadcrumbButton>Reports</BreadcrumbButton>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <BreadcrumbButton current>Timesheet</BreadcrumbButton>
          </BreadcrumbItem>
        </Breadcrumb>
        <Text className={styles.title}>Timesheet Report</Text>
      </div>

      {error && <MessageBar intent="error" className={styles.message}><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {success && <MessageBar intent="success" className={styles.message}><MessageBarBody>{success}</MessageBarBody></MessageBar>}

      <div className={styles.body}>
        {/* Left sidebar — parameters */}
        <div className={styles.sidebar}>
          <Text className={styles.sidebarTitle}>Parameters</Text>

          <Field label="Client" required>
            <Select
              value={selectedClientId}
              onChange={(e, data) => setSelectedClientId(data.value)}
            >
              <option value="">Select client...</option>
              {clients.map((c) => (
                <option key={c._id} value={c._id}>{c.companyName}</option>
              ))}
            </Select>
          </Field>

          <Field label="Project" required>
            <Select
              value={selectedProjectId}
              onChange={(e, data) => setSelectedProjectId(data.value)}
              disabled={!selectedClientId || loadingProjects}
            >
              <option value="">
                {loadingProjects ? 'Loading...' : !selectedClientId ? 'Select a client first' : 'Select project...'}
              </option>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Granularity">
            <Select
              value={granularity}
              onChange={(e, data) => setGranularity(data.value)}
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
            </Select>
          </Field>

          <Field label="Period" required>
            <Select
              value={selectedPeriod}
              onChange={(e, data) => setSelectedPeriod(data.value)}
              disabled={!selectedProjectId || loadingDates || periods.length === 0}
            >
              <option value="">
                {loadingDates
                  ? 'Loading...'
                  : !selectedProjectId
                    ? 'Select a project first'
                    : periods.length === 0
                      ? 'No timesheet data'
                      : 'Select period...'}
              </option>
              {periods.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </Select>
          </Field>

          <Button
            appearance="primary"
            icon={generating ? <Spinner size="tiny" /> : <DocumentSearchRegular />}
            onClick={handleGenerate}
            disabled={!canGenerate}
            style={{ marginTop: '8px' }}
          >
            {generating ? 'Generating...' : 'Generate'}
          </Button>
        </div>

        {/* Right area — PDF preview */}
        <div className={styles.previewArea}>
          {pdfBlobUrl ? (
            <div className={styles.previewContainer}>
              <div className={styles.previewHeader}>
                <Text className={styles.previewTitle}>Preview</Text>
                <div className={styles.previewActions}>
                  <Button
                    appearance="subtle"
                    icon={<ArrowDownloadRegular />}
                    onClick={handleDownload}
                    size="small"
                  >
                    Download
                  </Button>
                  <Button
                    appearance="primary"
                    icon={saving ? <Spinner size="tiny" /> : <SaveRegular />}
                    onClick={handleSave}
                    disabled={saving}
                    size="small"
                  >
                    {saving ? 'Saving...' : 'Save Document'}
                  </Button>
                </div>
              </div>
              <object
                data={pdfBlobUrl}
                type="application/pdf"
                className={styles.pdfObject}
              >
                <p style={{ padding: 24, textAlign: 'center' }}>
                  PDF preview is not supported in this browser.{' '}
                  <a href={pdfBlobUrl} download>Download the PDF</a> instead.
                </p>
              </object>
            </div>
          ) : (
            <div className={styles.emptyPreview}>
              Select parameters and click Generate to preview a report.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
