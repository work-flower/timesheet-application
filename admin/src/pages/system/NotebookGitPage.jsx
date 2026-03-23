import { useState, useEffect, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Select,
  Field,
  Button,
  Spinner,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { PlugConnectedRegular, ArrowSyncRegular } from '@fluentui/react-icons';
import { notebookGitApi } from '../../api/index.js';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import { useFormTracker } from '../../hooks/useFormTracker.js';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx';
import useAppNavigate from '../../hooks/useAppNavigate.js';
import { useNotifyParent } from '../../hooks/useNotifyParent.js';

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
  subtitle: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    display: 'block',
    marginBottom: '8px',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginTop: '8px',
  },
  hint: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginTop: '4px',
  },
  message: { marginBottom: '16px' },
});

function mapConfig(data) {
  return {
    remoteUrl: data.remoteUrl || '',
    token: data.token || '',
    branch: data.branch || 'main',
    userName: data.userName || '',
    userEmail: data.userEmail || '',
  };
}

export default function NotebookGitPage() {
  const styles = useStyles();
  const { registerGuard } = useUnsavedChanges();
  const { goBack } = useAppNavigate();
  const { form, setForm, resetBase, formRef, isDirty, changedFields, base, baseReady } = useFormTracker();
  const notifyParent = useNotifyParent();
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState(null);
  const [remoteBranches, setRemoteBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  useEffect(() => {
    notebookGitApi.getConfig()
      .then((data) => resetBase(mapConfig(data || {})))
      .catch(() => resetBase(mapConfig({})))
      .finally(() => setInitialized(true));
  }, [resetBase]);

  const handleChange = (field) => (e, data) => {
    const value = data?.value ?? e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const showMessage = (intent, text) => {
    setMessage({ intent, text });
    if (intent === 'success') setTimeout(() => setMessage(null), 4000);
  };

  const fetchBranches = useCallback(async () => {
    setLoadingBranches(true);
    try {
      const data = await notebookGitApi.listBranches();
      setRemoteBranches(data.branches || []);
    } catch {
      setRemoteBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  }, []);

  const handleTestConnection = async () => {
    setTesting(true);
    setMessage(null);
    try {
      // Save first if dirty
      if (isDirty) {
        await notebookGitApi.updateConfig(form);
        const fresh = await notebookGitApi.getConfig();
        resetBase(mapConfig(fresh));
      }
      const result = await notebookGitApi.testConnection();
      if (result.ok) {
        showMessage('success', 'Connection to remote successful.');
      } else {
        showMessage('error', `Connection failed: ${result.error}`);
      }
    } catch (err) {
      showMessage('error', `Connection test failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const saveForm = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await notebookGitApi.updateConfig(form);
      resetBase(mapConfig(result));
      return { ok: true };
    } catch (err) {
      showMessage('error', err.message);
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }, [form, resetBase]);

  const handleSave = async () => {
    const result = await saveForm();
    if (result.ok) {
      notifyParent('save', base, form);
      showMessage('success', 'Git configuration saved.');
    }
  };

  useEffect(() => {
    return registerGuard({ isDirty, onSave: saveForm });
  }, [isDirty, saveForm, registerGuard]);

  return (
    <>
      {!initialized && <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>}
      <div className={styles.page} ref={formRef} style={{ display: initialized ? undefined : 'none' }}>
        <FormCommandBar
          onBack={() => goBack('/system/ai')}
          onSave={handleSave}
          saving={saving}
        />

        <div className={styles.pageBody}>
          <div className={styles.header}>
            <Text className={styles.title}>Notebook Git</Text>
            <Text className={styles.subtitle}>
              Configure git upstream and author identity for notebook version control.
            </Text>
          </div>

          {message && (
            <MessageBar intent={message.intent} className={styles.message}>
              <MessageBarBody>{message.text}</MessageBarBody>
            </MessageBar>
          )}

          <FormSection title="Remote">
            <FormField changed={changedFields.has('remoteUrl')} fullWidth>
              <Field
                label="Remote URL"
                hint="HTTPS URL, e.g. https://github.com/user/repo.git"
              >
                <Input
                  name="remoteUrl"
                  value={form.remoteUrl ?? ''}
                  onChange={handleChange('remoteUrl')}
                  placeholder="https://github.com/user/notebooks.git"
                />
              </Field>
            </FormField>
            <FormField changed={changedFields.has('token')} fullWidth>
              <Field
                label="Access Token"
                hint="Personal access token (PAT) for push/pull authentication. Stored securely in git config."
              >
                <Input
                  name="token"
                  type="password"
                  value={form.token ?? ''}
                  onChange={handleChange('token')}
                  placeholder="ghp_xxxxxxxxxxxx"
                />
              </Field>
            </FormField>
            <FormField changed={changedFields.has('branch')}>
              <Field label="Branch" hint="Remote branch to track">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Select
                    name="branch"
                    value={form.branch ?? ''}
                    onChange={handleChange('branch')}
                    style={{ flex: 1 }}
                  >
                    {/* Always include current value so it shows even before fetch */}
                    {form.branch && !remoteBranches.includes(form.branch) && (
                      <option value={form.branch}>{form.branch}</option>
                    )}
                    {remoteBranches.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </Select>
                  <Button
                    appearance="subtle"
                    icon={<ArrowSyncRegular />}
                    size="small"
                    disabled={loadingBranches || !form.remoteUrl}
                    onClick={fetchBranches}
                    title="Fetch remote branches"
                  />
                </div>
              </Field>
            </FormField>
          </FormSection>

          <div className={styles.actions}>
            <Button
              appearance="secondary"
              icon={<PlugConnectedRegular />}
              onClick={handleTestConnection}
              disabled={testing || !form.remoteUrl}
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </Button>
          </div>

          <FormSection title="Author Identity" style={{ marginTop: '24px' }}>
            <FormField changed={changedFields.has('userName')}>
              <Field label="Author Name" hint="Used as git commit author name">
                <Input
                  name="userName"
                  value={form.userName ?? ''}
                  onChange={handleChange('userName')}
                  placeholder="Timesheet App"
                />
              </Field>
            </FormField>
            <FormField changed={changedFields.has('userEmail')}>
              <Field label="Author Email" hint="Used as git commit author email">
                <Input
                  name="userEmail"
                  value={form.userEmail ?? ''}
                  onChange={handleChange('userEmail')}
                  placeholder="app@localhost"
                />
              </Field>
            </FormField>
          </FormSection>
        </div>
      </div>
    </>
  );
}
