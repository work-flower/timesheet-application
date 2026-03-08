import { useState, useEffect, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Field,
  Button,
  Spinner,
  MessageBar,
  MessageBarBody,
  Select,
  Checkbox,
  Badge,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableCellLayout,
  createTableColumn,
} from '@fluentui/react-components';
import {
  PlugConnectedRegular,
  CloudArrowUpRegular,
  CloudArrowDownRegular,
  ArrowSyncRegular,
  DeleteRegular,
} from '@fluentui/react-icons';
import { logApi } from '../../api/index.js';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import { useFormTracker } from '../../hooks/useFormTracker.js';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx';
import useAppNavigate from '../../hooks/useAppNavigate.js';

const useStyles = makeStyles({
  page: {
    maxWidth: '900px',
  },
  pageBody: {
    padding: '16px 24px',
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
  actions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginTop: '8px',
  },
  historyHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '48px',
  },
  empty: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '48px',
    color: tokens.colorNeutralForeground3,
  },
  actionButtons: {
    display: 'flex',
    gap: '4px',
  },
});

function formatSize(bytes) {
  if (!bytes) return '\u2014';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr) {
  if (!dateStr) return '\u2014';
  return new Date(dateStr).toLocaleString();
}

const INITIAL_STATE = {
  logLevel: 'error',
  maxFileSize: 52428800,
  messageFilter: '',
  logPayloads: false,
  r2AccountId: '',
  r2AccessKeyId: '',
  r2SecretAccessKey: '',
  r2BucketName: '',
  r2LogPath: 'logs',
  r2Endpoint: '',
  uploadEnabled: false,
  uploadIntervalMinutes: 60,
};

function mapConfig(data) {
  return {
    logLevel: data.logLevel || 'error',
    maxFileSize: data.maxFileSize || 52428800,
    messageFilter: data.messageFilter || '',
    logPayloads: data.logPayloads || false,
    r2AccountId: data.r2AccountId || '',
    r2AccessKeyId: data.r2AccessKeyId || '',
    r2SecretAccessKey: data.r2SecretAccessKey || '',
    r2BucketName: data.r2BucketName || '',
    r2LogPath: data.r2LogPath || 'logs',
    r2Endpoint: data.r2Endpoint || '',
    uploadEnabled: data.uploadEnabled || false,
    uploadIntervalMinutes: data.uploadIntervalMinutes || 60,
  };
}

export default function LoggingPage() {
  const styles = useStyles();
  const { registerGuard } = useUnsavedChanges();
  const { navigateUnguarded, goBack } = useAppNavigate();
  const { form, setForm, setBase, isDirty, changedFields } = useFormTracker(INITIAL_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState(null);

  const [localFiles, setLocalFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [deletingLocal, setDeletingLocal] = useState(null);

  const [r2Files, setR2Files] = useState([]);
  const [loadingR2, setLoadingR2] = useState(false);
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    logApi.getConfig()
      .then((data) => {
        if (data) setBase(mapConfig(data));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [setBase]);

  const handleChange = (field) => (e, data) => {
    const value = data?.value ?? data?.selectedOptions?.[0] ?? e.target.value;
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'r2AccountId' && value) {
        next.r2Endpoint = `https://${value}.r2.cloudflarestorage.com`;
      }
      if (field === 'logLevel' && value !== 'debug') {
        next.logPayloads = false;
      }
      return next;
    });
  };

  const showMessage = (intent, text) => {
    setMessage({ intent, text });
    if (intent === 'success') setTimeout(() => setMessage(null), 4000);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setMessage(null);
    try {
      await logApi.testConnection(form);
      showMessage('success', 'Connection successful.');
    } catch (err) {
      showMessage('error', `Connection failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const saveForm = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await logApi.updateConfig(form);
      if (saved) setBase(mapConfig(saved));
      return { ok: true };
    } catch (err) {
      showMessage('error', `Save failed: ${err.message}`);
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }, [form, setBase]);

  const handleSave = async () => {
    const { ok } = await saveForm();
    if (ok) showMessage('success', 'Configuration saved.');
  };

  const handleSaveAndClose = async () => {
    const { ok } = await saveForm();
    if (ok) navigateUnguarded('/infra/logging');
  };

  useEffect(() => {
    return registerGuard({ isDirty, onSave: saveForm });
  }, [isDirty, saveForm, registerGuard]);

  const loadLocalFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const files = await logApi.listFiles();
      setLocalFiles(files);
    } catch (err) {
      showMessage('error', `Failed to load files: ${err.message}`);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    if (!loading) loadLocalFiles();
  }, [loading, loadLocalFiles]);

  const handleUploadFile = async (filename) => {
    setUploading(filename);
    try {
      const result = await logApi.uploadToR2(filename);
      if (result.skipped) {
        showMessage('success', `${filename} already in R2 — local copy removed.`);
      } else {
        showMessage('success', `Uploaded ${filename} and removed local copy.`);
      }
      loadLocalFiles();
      loadR2Files();
    } catch (err) {
      showMessage('error', `Upload failed: ${err.message}`);
    } finally {
      setUploading(null);
    }
  };

  const handleDeleteLocal = async (filename) => {
    setDeletingLocal(filename);
    try {
      await logApi.deleteLocal(filename);
      showMessage('success', `Deleted ${filename}.`);
      loadLocalFiles();
    } catch (err) {
      showMessage('error', err.message);
    } finally {
      setDeletingLocal(null);
    }
  };

  const loadR2Files = useCallback(async () => {
    setLoadingR2(true);
    try {
      const files = await logApi.listR2();
      setR2Files(files);
    } catch {
      setR2Files([]);
    } finally {
      setLoadingR2(false);
    }
  }, []);

  useEffect(() => {
    if (!loading) loadR2Files();
  }, [loading, loadR2Files]);

  const handleDownloadFromR2 = async (filename) => {
    setDownloading(filename);
    try {
      const result = await logApi.downloadFromR2(filename);
      if (result.alreadyLocal) {
        showMessage('success', `${filename} is already available locally.`);
      } else {
        showMessage('success', `Downloaded ${filename} to local logs.`);
      }
      loadLocalFiles();
    } catch (err) {
      showMessage('error', `Download failed: ${err.message}`);
    } finally {
      setDownloading(null);
    }
  };

  const r2FileNames = new Set(r2Files.map((f) => f.key.replace(/^.*\//, '')));

  const localColumns = [
    createTableColumn({
      columnId: 'filename',
      compare: (a, b) => a.filename.localeCompare(b.filename),
      renderHeaderCell: () => 'Filename',
      renderCell: (item) => (
        <TableCellLayout>
          {item.filename}
          {r2FileNames.has(item.filename) && (
            <Badge appearance="outline" color="brand" size="small" style={{ marginLeft: 8 }}>In R2</Badge>
          )}
        </TableCellLayout>
      ),
    }),
    createTableColumn({
      columnId: 'size',
      compare: (a, b) => (a.size || 0) - (b.size || 0),
      renderHeaderCell: () => 'Size',
      renderCell: (item) => <TableCellLayout>{formatSize(item.size)}</TableCellLayout>,
    }),
    createTableColumn({
      columnId: 'lastModified',
      compare: (a, b) => new Date(a.lastModified) - new Date(b.lastModified),
      renderHeaderCell: () => 'Last Modified',
      renderCell: (item) => <TableCellLayout>{formatDate(item.lastModified)}</TableCellLayout>,
    }),
    createTableColumn({
      columnId: 'actions',
      renderHeaderCell: () => 'Actions',
      renderCell: (item) => (
        <TableCellLayout>
          <div className={styles.actionButtons}>
            <Button size="small" appearance="subtle" icon={<CloudArrowUpRegular />} onClick={(e) => { e.stopPropagation(); handleUploadFile(item.filename); }} disabled={uploading === item.filename || !form.r2BucketName || r2FileNames.has(item.filename)}>
              {uploading === item.filename ? 'Uploading...' : r2FileNames.has(item.filename) ? 'Uploaded' : 'Upload'}
            </Button>
            <Button size="small" appearance="subtle" icon={<DeleteRegular />} onClick={(e) => { e.stopPropagation(); handleDeleteLocal(item.filename); }} disabled={deletingLocal === item.filename}>
              {deletingLocal === item.filename ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </TableCellLayout>
      ),
    }),
  ];

  const r2Columns = [
    createTableColumn({
      columnId: 'name',
      compare: (a, b) => a.key.localeCompare(b.key),
      renderHeaderCell: () => 'Name',
      renderCell: (item) => <TableCellLayout>{item.key.replace(/^.*\//, '')}</TableCellLayout>,
    }),
    createTableColumn({
      columnId: 'size',
      compare: (a, b) => (a.size || 0) - (b.size || 0),
      renderHeaderCell: () => 'Size',
      renderCell: (item) => <TableCellLayout>{formatSize(item.size)}</TableCellLayout>,
    }),
    createTableColumn({
      columnId: 'lastModified',
      compare: (a, b) => new Date(a.lastModified) - new Date(b.lastModified),
      renderHeaderCell: () => 'Date',
      renderCell: (item) => <TableCellLayout>{formatDate(item.lastModified)}</TableCellLayout>,
    }),
    createTableColumn({
      columnId: 'actions',
      renderHeaderCell: () => 'Actions',
      renderCell: (item) => {
        const filename = item.key.replace(/^.*\//, '');
        return (
          <TableCellLayout>
            <Button size="small" appearance="subtle" icon={<CloudArrowDownRegular />} onClick={(e) => { e.stopPropagation(); handleDownloadFromR2(filename); }} disabled={downloading === filename}>
              {downloading === filename ? 'Downloading...' : 'Download'}
            </Button>
          </TableCellLayout>
        );
      },
    }),
  ];

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  return (
    <div className={styles.page}>
      <FormCommandBar
        onBack={() => goBack('/infra/logging')}
        onSave={handleSave}
        onSaveAndClose={handleSaveAndClose}
        saving={saving}
      />
      <div className={styles.pageBody}>
        <div className={styles.header}>
          <Text className={styles.title}>Logging</Text>
        </div>

        {message && (
          <MessageBar intent={message.intent} style={{ marginBottom: 16 }}>
            <MessageBarBody>{message.text}</MessageBarBody>
          </MessageBar>
        )}

        <FormSection title="Log Configuration">
          <FormField changed={changedFields.has('logLevel')}>
            <Field label="Log Level" hint="Minimum level to write to log files">
              <Select value={form.logLevel} onChange={handleChange('logLevel')}>
                <option value="error">Error</option>
                <option value="warn">Warn</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
              </Select>
            </Field>
          </FormField>
          <FormField changed={changedFields.has('maxFileSize')}>
            <Field label="Max File Size (MB)" hint="Log file rotates when exceeding this size">
              <Input
                type="number"
                value={String(Math.round((form.maxFileSize || 52428800) / (1024 * 1024)))}
                onChange={(e) => {
                  const mb = parseInt(e.target.value, 10);
                  if (!isNaN(mb) && mb > 0) {
                    setForm((prev) => ({ ...prev, maxFileSize: mb * 1024 * 1024 }));
                  }
                }}
                min="1"
              />
            </Field>
          </FormField>
          <FormField fullWidth changed={changedFields.has('messageFilter')}>
            <Field label="Message Filter" hint="Regex pattern tested against full JSON entry. Leave empty to log everything.">
              <Input value={form.messageFilter} onChange={handleChange('messageFilter')} placeholder="Regex pattern (empty = log everything)" />
            </Field>
          </FormField>
          <FormField fullWidth changed={changedFields.has('logPayloads')}>
            <Field label="Log Request Payloads">
              <Checkbox
                checked={form.logPayloads}
                onChange={(e, data) => setForm((prev) => ({ ...prev, logPayloads: data.checked }))}
                label="Log POST/PUT/PATCH request bodies (debug level only)"
                disabled={form.logLevel !== 'debug'}
              />
            </Field>
            {form.logPayloads && form.logLevel === 'debug' && (
              <MessageBar intent="warning" style={{ marginTop: 4 }}>
                <MessageBarBody>Payload logging will generate a significant amount of log data. Only enable for active debugging sessions and disable when finished.</MessageBarBody>
              </MessageBar>
            )}
          </FormField>
        </FormSection>

        <FormSection title="R2 Cloud Upload">
          <FormField changed={changedFields.has('r2AccountId')}>
            <Field label="Account ID"><Input value={form.r2AccountId} onChange={handleChange('r2AccountId')} /></Field>
          </FormField>
          <FormField changed={changedFields.has('r2AccessKeyId')}>
            <Field label="Access Key ID"><Input value={form.r2AccessKeyId} onChange={handleChange('r2AccessKeyId')} /></Field>
          </FormField>
          <FormField changed={changedFields.has('r2SecretAccessKey')}>
            <Field label="Secret Access Key"><Input type="password" value={form.r2SecretAccessKey} onChange={handleChange('r2SecretAccessKey')} /></Field>
          </FormField>
          <FormField changed={changedFields.has('r2BucketName')}>
            <Field label="Bucket Name"><Input value={form.r2BucketName} onChange={handleChange('r2BucketName')} /></Field>
          </FormField>
          <FormField changed={changedFields.has('r2LogPath')}>
            <Field label="Log Path" hint="R2 key prefix"><Input value={form.r2LogPath} onChange={handleChange('r2LogPath')} placeholder="logs" /></Field>
          </FormField>
          <FormField fullWidth changed={changedFields.has('r2Endpoint')}>
            <Field label="Endpoint URL"><Input value={form.r2Endpoint} onChange={handleChange('r2Endpoint')} /></Field>
          </FormField>
          <FormField changed={changedFields.has('uploadEnabled')}>
            <Field label="Upload Enabled">
              <Checkbox checked={form.uploadEnabled} onChange={(e, data) => setForm((prev) => ({ ...prev, uploadEnabled: data.checked }))} label="Periodically upload completed log files to R2" />
            </Field>
          </FormField>
          <FormField changed={changedFields.has('uploadIntervalMinutes')}>
            <Field label="Upload Interval (minutes)">
              <Input type="number" value={String(form.uploadIntervalMinutes)} onChange={(e) => { const val = parseInt(e.target.value, 10); if (!isNaN(val) && val > 0) setForm((prev) => ({ ...prev, uploadIntervalMinutes: val })); }} min="1" disabled={!form.uploadEnabled} />
            </Field>
          </FormField>
          <FormField fullWidth>
            <div className={styles.actions}>
              <Button appearance="outline" icon={<PlugConnectedRegular />} onClick={handleTestConnection} disabled={testing || !form.r2Endpoint || !form.r2AccessKeyId || !form.r2BucketName} size="small">
                {testing ? 'Testing...' : 'Test Connection'}
              </Button>
            </div>
          </FormField>
        </FormSection>

        <FormSection title="Local Log Files">
          <FormField fullWidth>
            <div className={styles.historyHeader}>
              <Button appearance="subtle" icon={<ArrowSyncRegular />} onClick={loadLocalFiles} disabled={loadingFiles} size="small">Refresh</Button>
            </div>
            {loadingFiles ? (
              <div className={styles.loading}><Spinner label="Loading..." /></div>
            ) : localFiles.length === 0 ? (
              <div className={styles.empty}><Text>No log files found</Text></div>
            ) : (
              <DataGrid items={localFiles} columns={localColumns} getRowId={(item) => item.filename} style={{ width: '100%' }}>
                <DataGridHeader><DataGridRow>{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow></DataGridHeader>
                <DataGridBody>{({ item, rowId }) => (<DataGridRow key={rowId}>{({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}</DataGridRow>)}</DataGridBody>
              </DataGrid>
            )}
          </FormField>
        </FormSection>

        <FormSection title="R2 Log Files">
          <FormField fullWidth>
            <div className={styles.historyHeader}>
              <Button appearance="subtle" icon={<ArrowSyncRegular />} onClick={loadR2Files} disabled={loadingR2} size="small">Refresh</Button>
            </div>
            {loadingR2 ? (
              <div className={styles.loading}><Spinner label="Loading..." /></div>
            ) : r2Files.length === 0 ? (
              <div className={styles.empty}><Text>No R2 log files found</Text></div>
            ) : (
              <DataGrid items={r2Files} columns={r2Columns} getRowId={(item) => item.key} style={{ width: '100%' }}>
                <DataGridHeader><DataGridRow>{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow></DataGridHeader>
                <DataGridBody>{({ item, rowId }) => (<DataGridRow key={rowId}>{({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}</DataGridRow>)}</DataGridBody>
              </DataGrid>
            )}
          </FormField>
        </FormSection>
      </div>
    </div>
  );
}
