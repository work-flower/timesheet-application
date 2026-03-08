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
  ArrowSyncRegular,
  ArrowDownloadRegular,
  DeleteRegular,
  CloudArrowUpRegular,
  PlugConnectedRegular,
} from '@fluentui/react-icons';
import { backupApi } from '../../api/index.js';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import { useFormTracker } from '../../hooks/useFormTracker.js';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx';
import useAppNavigate from '../../hooks/useAppNavigate.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

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
  statusText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  historyHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  reloadBanner: {
    marginTop: '16px',
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
  accountId: '',
  accessKeyId: '',
  secretAccessKey: '',
  bucketName: '',
  backupPath: '',
  endpoint: '',
  schedule: 'off',
};

function mapConfig(data) {
  return {
    accountId: data.accountId || '',
    accessKeyId: data.accessKeyId || '',
    secretAccessKey: data.secretAccessKey || '',
    bucketName: data.bucketName || '',
    backupPath: data.backupPath || '',
    endpoint: data.endpoint || '',
    schedule: data.schedule || 'off',
  };
}

export default function BackupPage() {
  const styles = useStyles();
  const { registerGuard } = useUnsavedChanges();
  const { navigateUnguarded, goBack } = useAppNavigate();
  const { form, setForm, setBase, isDirty, changedFields } = useFormTracker(INITIAL_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [backing, setBacking] = useState(false);
  const [message, setMessage] = useState(null);

  const [backups, setBackups] = useState([]);
  const [loadingBackups, setLoadingBackups] = useState(false);

  const [restoreTarget, setRestoreTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showReload, setShowReload] = useState(false);

  useEffect(() => {
    backupApi.getConfig()
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
      if (field === 'accountId' && value) {
        next.endpoint = `https://${value}.r2.cloudflarestorage.com`;
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
      await backupApi.testConnection(form);
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
      const saved = await backupApi.updateConfig(form);
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
    if (ok) navigateUnguarded('/infra/backup');
  };

  useEffect(() => {
    return registerGuard({ isDirty, onSave: saveForm });
  }, [isDirty, saveForm, registerGuard]);

  const handleBackupNow = async () => {
    setBacking(true);
    setMessage(null);
    try {
      await backupApi.create();
      showMessage('success', 'Backup created successfully.');
      loadBackupList();
    } catch (err) {
      showMessage('error', `Backup failed: ${err.message}`);
    } finally {
      setBacking(false);
    }
  };

  const loadBackupList = useCallback(async () => {
    setLoadingBackups(true);
    try {
      const list = await backupApi.list();
      setBackups(list);
    } catch (err) {
      showMessage('error', `Failed to load backups: ${err.message}`);
    } finally {
      setLoadingBackups(false);
    }
  }, []);

  useEffect(() => {
    if (!loading) loadBackupList();
  }, [loading, loadBackupList]);

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await backupApi.restore(restoreTarget.key);
      setRestoreTarget(null);
      setShowReload(true);
      showMessage('success', 'Data restored successfully. Please reload the page.');
    } catch (err) {
      showMessage('error', `Restore failed: ${err.message}`);
    } finally {
      setRestoring(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await backupApi.delete(deleteTarget.key);
      setDeleteTarget(null);
      showMessage('success', 'Backup deleted.');
      loadBackupList();
    } catch (err) {
      showMessage('error', `Delete failed: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const backupColumns = [
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
      renderCell: (item) => (
        <TableCellLayout>
          <div style={{ display: 'flex', gap: 4 }}>
            <Button size="small" appearance="subtle" icon={<ArrowDownloadRegular />} onClick={(e) => { e.stopPropagation(); setRestoreTarget(item); }}>
              Restore
            </Button>
            <Button size="small" appearance="subtle" icon={<DeleteRegular />} onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }}>
              Delete
            </Button>
          </div>
        </TableCellLayout>
      ),
    }),
  ];

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  return (
    <div className={styles.page}>
      <FormCommandBar
        onBack={() => goBack('/infra/backup')}
        onSave={handleSave}
        onSaveAndClose={handleSaveAndClose}
        saving={saving}
      />
      <div className={styles.pageBody}>
        <div className={styles.header}>
          <Text className={styles.title}>Backup</Text>
        </div>

        {message && (
          <MessageBar intent={message.intent} style={{ marginBottom: 16 }}>
            <MessageBarBody>{message.text}</MessageBarBody>
          </MessageBar>
        )}

        <FormSection title="R2 Connection">
          <FormField changed={changedFields.has('accountId')}>
            <Field label="Account ID"><Input value={form.accountId} onChange={handleChange('accountId')} /></Field>
          </FormField>
          <FormField changed={changedFields.has('accessKeyId')}>
            <Field label="Access Key ID"><Input value={form.accessKeyId} onChange={handleChange('accessKeyId')} /></Field>
          </FormField>
          <FormField changed={changedFields.has('secretAccessKey')}>
            <Field label="Secret Access Key"><Input type="password" value={form.secretAccessKey} onChange={handleChange('secretAccessKey')} /></Field>
          </FormField>
          <FormField changed={changedFields.has('bucketName')}>
            <Field label="Bucket Name"><Input value={form.bucketName} onChange={handleChange('bucketName')} /></Field>
          </FormField>
          <FormField changed={changedFields.has('backupPath')}>
            <Field label="Backup Path" hint="e.g. backups/dev"><Input value={form.backupPath} onChange={handleChange('backupPath')} placeholder="backups" /></Field>
          </FormField>
          <FormField fullWidth changed={changedFields.has('endpoint')}>
            <Field label="Endpoint URL"><Input value={form.endpoint} onChange={handleChange('endpoint')} /></Field>
          </FormField>
          <FormField fullWidth>
            <div className={styles.actions}>
              <Button appearance="outline" icon={<PlugConnectedRegular />} onClick={handleTestConnection} disabled={testing || !form.endpoint || !form.accessKeyId || !form.bucketName} size="small">
                {testing ? 'Testing...' : 'Test Connection'}
              </Button>
            </div>
          </FormField>
        </FormSection>

        <FormSection title="Schedule">
          <FormField changed={changedFields.has('schedule')}>
            <Field label="Frequency">
              <Select value={form.schedule} onChange={handleChange('schedule')}>
                <option value="off">Off</option>
                <option value="daily">Daily at 2:00 AM</option>
                <option value="weekly">Weekly on Monday at 2:00 AM</option>
              </Select>
            </Field>
          </FormField>
          <FormField>
            <div className={styles.actions} style={{ marginTop: 24 }}>
              <Button appearance="primary" icon={backing ? <Spinner size="tiny" /> : <CloudArrowUpRegular />} onClick={handleBackupNow} disabled={backing || !form.endpoint || !form.accessKeyId || !form.bucketName} size="small">
                {backing ? 'Backing up...' : 'Backup Now'}
              </Button>
            </div>
          </FormField>
        </FormSection>

        <FormSection title="Backup History">
          <FormField fullWidth>
            <div className={styles.historyHeader}>
              <Button appearance="subtle" icon={<ArrowSyncRegular />} onClick={loadBackupList} disabled={loadingBackups} size="small">Refresh</Button>
            </div>
            {loadingBackups ? (
              <div className={styles.loading}><Spinner label="Loading..." /></div>
            ) : backups.length === 0 ? (
              <div className={styles.empty}><Text>No backups found</Text></div>
            ) : (
              <DataGrid items={backups} columns={backupColumns} getRowId={(item) => item.key} style={{ width: '100%' }}>
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
            )}
          </FormField>
        </FormSection>

        {showReload && (
          <MessageBar intent="warning" className={styles.reloadBanner}>
            <MessageBarBody>
              Data has been restored. Please reload the page.{' '}
              <Button appearance="primary" size="small" onClick={() => window.location.reload()}>Reload Page</Button>
            </MessageBarBody>
          </MessageBar>
        )}

        <ConfirmDialog
          open={!!restoreTarget}
          onClose={() => setRestoreTarget(null)}
          onConfirm={handleRestore}
          title="Restore Backup"
          message={restoring ? 'Restoring... This may take a moment.' : `This will replace ALL current data with the backup from ${restoreTarget ? formatDate(restoreTarget.lastModified) : ''}. This cannot be undone.`}
        />
        <ConfirmDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          title="Delete Backup"
          message={deleting ? 'Deleting...' : 'Are you sure you want to delete this backup? This cannot be undone.'}
        />
      </div>
    </div>
  );
}
