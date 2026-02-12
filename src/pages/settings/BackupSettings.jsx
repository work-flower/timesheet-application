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
} from '@fluentui/react-components';
import {
  ArrowSyncRegular,
  ArrowDownloadRegular,
  DeleteRegular,
  CloudArrowUpRegular,
  PlugConnectedRegular,
  SaveRegular,
} from '@fluentui/react-icons';
import { backupApi } from '../../api/index.js';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import EntityGrid from '../../components/EntityGrid.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

const useStyles = makeStyles({
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
});

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString();
}

export default function BackupSettings() {
  const styles = useStyles();

  // Config state
  const [config, setConfig] = useState({
    accountId: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: '',
    backupPath: '',
    endpoint: '',
    schedule: 'off',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [backing, setBacking] = useState(false);
  const [message, setMessage] = useState(null);

  // History state
  const [backups, setBackups] = useState([]);
  const [loadingBackups, setLoadingBackups] = useState(false);

  // Dialogs
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showReload, setShowReload] = useState(false);

  useEffect(() => {
    backupApi.getConfig()
      .then((data) => {
        if (data) {
          setConfig({
            accountId: data.accountId || '',
            accessKeyId: data.accessKeyId || '',
            secretAccessKey: data.secretAccessKey || '',
            bucketName: data.bucketName || '',
            backupPath: data.backupPath || '',
            endpoint: data.endpoint || '',
            schedule: data.schedule || 'off',
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (field) => (e, data) => {
    const value = data?.value ?? data?.selectedOptions?.[0] ?? e.target.value;
    setConfig((prev) => {
      const next = { ...prev, [field]: value };
      // Auto-compute endpoint from account ID
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
      await backupApi.testConnection(config);
      showMessage('success', 'Connection successful.');
    } catch (err) {
      showMessage('error', `Connection failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await backupApi.updateConfig(config);
      if (saved) {
        setConfig({
          accountId: saved.accountId || '',
          accessKeyId: saved.accessKeyId || '',
          secretAccessKey: saved.secretAccessKey || '',
          bucketName: saved.bucketName || '',
          backupPath: saved.backupPath || '',
          endpoint: saved.endpoint || '',
          schedule: saved.schedule || 'off',
        });
      }
      showMessage('success', 'Configuration saved.');
    } catch (err) {
      showMessage('error', `Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

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
    {
      key: 'name',
      label: 'Name',
      compare: (a, b) => a.key.localeCompare(b.key),
      render: (item) => item.key.replace(/^.*\//, ''),
    },
    {
      key: 'size',
      label: 'Size',
      compare: (a, b) => (a.size || 0) - (b.size || 0),
      render: (item) => formatSize(item.size),
    },
    {
      key: 'lastModified',
      label: 'Date',
      compare: (a, b) => new Date(a.lastModified) - new Date(b.lastModified),
      render: (item) => formatDate(item.lastModified),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (item) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Button
            size="small"
            appearance="subtle"
            icon={<ArrowDownloadRegular />}
            onClick={(e) => { e.stopPropagation(); setRestoreTarget(item); }}
          >
            Restore
          </Button>
          <Button
            size="small"
            appearance="subtle"
            icon={<DeleteRegular />}
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  return (
    <div>
      {message && (
        <MessageBar intent={message.intent} style={{ marginBottom: 16 }}>
          <MessageBarBody>{message.text}</MessageBarBody>
        </MessageBar>
      )}

      <FormSection title="R2 Connection">
        <FormField>
          <Field label="Account ID">
            <Input value={config.accountId} onChange={handleChange('accountId')} />
          </Field>
        </FormField>
        <FormField>
          <Field label="Access Key ID">
            <Input value={config.accessKeyId} onChange={handleChange('accessKeyId')} />
          </Field>
        </FormField>
        <FormField>
          <Field label="Secret Access Key">
            <Input
              type="password"
              value={config.secretAccessKey}
              onChange={handleChange('secretAccessKey')}
            />
          </Field>
        </FormField>
        <FormField>
          <Field label="Bucket Name">
            <Input value={config.bucketName} onChange={handleChange('bucketName')} />
          </Field>
        </FormField>
        <FormField>
          <Field label="Backup Path" hint="e.g. backups/dev">
            <Input value={config.backupPath} onChange={handleChange('backupPath')} placeholder="backups" />
          </Field>
        </FormField>
        <FormField fullWidth>
          <Field label="Endpoint URL">
            <Input value={config.endpoint} onChange={handleChange('endpoint')} />
          </Field>
        </FormField>
        <FormField fullWidth>
          <div className={styles.actions}>
            <Button
              appearance="outline"
              icon={<PlugConnectedRegular />}
              onClick={handleTestConnection}
              disabled={testing || !config.endpoint || !config.accessKeyId || !config.bucketName}
              size="small"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </Button>
            <Button
              appearance="primary"
              icon={<SaveRegular />}
              onClick={handleSaveConfig}
              disabled={saving}
              size="small"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </FormField>
      </FormSection>

      <FormSection title="Schedule">
        <FormField>
          <Field label="Frequency">
            <Select value={config.schedule} onChange={handleChange('schedule')}>
              <option value="off">Off</option>
              <option value="daily">Daily at 2:00 AM</option>
              <option value="weekly">Weekly on Monday at 2:00 AM</option>
            </Select>
          </Field>
        </FormField>
        <FormField>
          <div className={styles.actions} style={{ marginTop: 24 }}>
            <Button
              appearance="primary"
              icon={backing ? <Spinner size="tiny" /> : <CloudArrowUpRegular />}
              onClick={handleBackupNow}
              disabled={backing || !config.endpoint || !config.accessKeyId || !config.bucketName}
              size="small"
            >
              {backing ? 'Backing up...' : 'Backup Now'}
            </Button>
          </div>
        </FormField>
      </FormSection>

      <FormSection title="Backup History">
        <FormField fullWidth>
          <div className={styles.historyHeader}>
            <Button
              appearance="subtle"
              icon={<ArrowSyncRegular />}
              onClick={loadBackupList}
              disabled={loadingBackups}
              size="small"
            >
              Refresh
            </Button>
          </div>
          <EntityGrid
            columns={backupColumns}
            items={backups}
            loading={loadingBackups}
            emptyMessage="No backups found"
            getRowId={(item) => item.key}
            sortable={false}
          />
        </FormField>
      </FormSection>

      {showReload && (
        <MessageBar intent="warning" className={styles.reloadBanner}>
          <MessageBarBody>
            Data has been restored. Please reload the page to see the changes.{' '}
            <Button appearance="primary" size="small" onClick={() => window.location.reload()}>
              Reload Page
            </Button>
          </MessageBarBody>
        </MessageBar>
      )}

      <ConfirmDialog
        open={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        onConfirm={handleRestore}
        title="Restore Backup"
        message={
          restoring
            ? 'Restoring... This may take a moment.'
            : `This will replace ALL current data with the backup from ${restoreTarget ? formatDate(restoreTarget.lastModified) : ''}. This cannot be undone.`
        }
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Backup"
        message={
          deleting
            ? 'Deleting...'
            : `Are you sure you want to delete this backup? This cannot be undone.`
        }
      />
    </div>
  );
}
