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
  Tab,
  TabList,
} from '@fluentui/react-components';
import { PlugConnectedRegular } from '@fluentui/react-icons';
import { aiConfigApi } from '../../api/index.js';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import { useFormTracker } from '../../hooks/useFormTracker.js';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx';
import useAppNavigate from '../../hooks/useAppNavigate.js';
import { useNotifyParent } from '../../hooks/useNotifyParent.js';
import MarkdownEditor from '../../components/MarkdownEditor.jsx';

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
  hint: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginTop: '4px',
  },
});

function mapConfig(data) {
  return {
    apiKey: data.apiKey || '',
    model: data.model || 'claude-sonnet-4-5-20250929',
    maxTokens: data.maxTokens != null ? String(data.maxTokens) : '',
    timeoutMinutes: data.timeoutMinutes != null ? String(data.timeoutMinutes) : '',
    systemPrompt: data.systemPrompt || '',
    expenseSystemPrompt: data.expenseSystemPrompt || '',
    dailyPlanSystemPrompt: data.dailyPlanSystemPrompt || '',
    briefingSystemPrompt: data.briefingSystemPrompt || '',
  };
}

export default function AiConfigPage() {
  const styles = useStyles();
  const { registerGuard } = useUnsavedChanges();
  const { navigateUnguarded, goBack } = useAppNavigate();
  const { form, setForm, setBase, resetBase, formRef, isDirty, changedFields, base, baseReady } = useFormTracker();
  const notifyParent = useNotifyParent();
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState(null);
  const [promptTab, setPromptTab] = useState('transactionImport');
  const [defaults, setDefaults] = useState({});

  useEffect(() => {
    Promise.all([
      aiConfigApi.getConfig(),
      aiConfigApi.getDefaults(),
    ])
      .then(([data, defs]) => {
        setDefaults(defs || {});
        resetBase(mapConfig(data || {}));
      })
      .catch(() => {})
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

  const handleTestConnection = async () => {
    setTesting(true);
    setMessage(null);
    try {
      await aiConfigApi.testConnection(form);
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
      const saved = await aiConfigApi.updateConfig(form);
      if (saved) resetBase(mapConfig(saved));
      return { ok: true };
    } catch (err) {
      showMessage('error', `Save failed: ${err.message}`);
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }, [form, resetBase]);

  const handleSave = async () => {
    const { ok } = await saveForm();
    if (ok) {
      notifyParent(handleSave.name, base, form);
      showMessage('success', 'Configuration saved.');
    }
  };

  const handleSaveAndClose = async () => {
    const { ok } = await saveForm();
    if (ok) {
      notifyParent(handleSaveAndClose.name, base, form);
      navigateUnguarded('/system/ai');
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
          onSaveAndClose={handleSaveAndClose}
          saving={saving}
        />
        <div className={styles.pageBody}>
          <div className={styles.header}>
            <Text className={styles.title}>AI Configuration</Text>
          </div>

          {message && (
            <MessageBar intent={message.intent} style={{ marginBottom: 16 }}>
              <MessageBarBody>{message.text}</MessageBarBody>
            </MessageBar>
          )}

          <FormSection title="API Connection">
            <FormField changed={changedFields.has('apiKey')}>
              <Field label="API Key">
                <Input name="apiKey" type="password" value={form.apiKey ?? ''} onChange={handleChange('apiKey')} />
              </Field>
            </FormField>
            <FormField changed={changedFields.has('model')}>
              <Field label="Model">
                <Input name="model" value={form.model ?? ''} onChange={handleChange('model')} placeholder="claude-sonnet-4-5-20250929" />
              </Field>
            </FormField>
            <FormField changed={changedFields.has('maxTokens')}>
              <Field label="Max Tokens" hint="Maximum tokens in AI response. Default: 64000. Max: 64000.">
                <Input name="maxTokens" value={form.maxTokens ?? ''} onChange={handleChange('maxTokens')} placeholder="64000" type="number" max={64000} />
              </Field>
            </FormField>
            <FormField changed={changedFields.has('timeoutMinutes')}>
              <Field label="Timeout (minutes)" hint="How long to wait for the AI response before giving up. Default: 30 minutes.">
                <Input name="timeoutMinutes" value={form.timeoutMinutes ?? ''} onChange={handleChange('timeoutMinutes')} placeholder="30" type="number" />
              </Field>
            </FormField>
            <FormField fullWidth>
              <div className={styles.actions}>
                <Button appearance="outline" icon={<PlugConnectedRegular />} onClick={handleTestConnection} disabled={testing || !form.apiKey} size="small">
                  {testing ? 'Testing...' : 'Test Connection'}
                </Button>
              </div>
            </FormField>
          </FormSection>

          <FormSection title="System Prompts">
            <FormField fullWidth>
              <TabList selectedValue={promptTab} onTabSelect={(_, data) => setPromptTab(data.value)} size="small" style={{ marginBottom: '12px' }}>
                <Tab value="transactionImport">Transaction Import</Tab>
                <Tab value="expenseReceipt">Expense Receipt</Tab>
                <Tab value="dailyPlanRecap">Daily Plan Recap</Tab>
                <Tab value="briefing">Briefing</Tab>
              </TabList>

              {promptTab === 'transactionImport' && (
                <>
                  <MarkdownEditor
                    name="systemPrompt"
                    value={form.systemPrompt || defaults.systemPrompt || ''}
                    onChange={(val) => setForm((prev) => ({ ...prev, systemPrompt: val }))}
                    height={300}
                  />
                  <div className={styles.hint}>
                    General parsing instructions shared across all imports. Each import job can also have a job-specific user prompt.
                  </div>
                </>
              )}

              {promptTab === 'expenseReceipt' && (
                <>
                  <MarkdownEditor
                    name="expenseSystemPrompt"
                    value={form.expenseSystemPrompt || defaults.expenseSystemPrompt || ''}
                    onChange={(val) => setForm((prev) => ({ ...prev, expenseSystemPrompt: val }))}
                    height={300}
                  />
                  <div className={styles.hint}>
                    Instructions sent to the AI when scanning expense receipts. The AI should return a JSON object with date, amount, vatAmount, expenseType, and description.
                  </div>
                </>
              )}

              {promptTab === 'dailyPlanRecap' && (
                <>
                  <MarkdownEditor
                    name="dailyPlanSystemPrompt"
                    value={form.dailyPlanSystemPrompt || defaults.dailyPlanSystemPrompt || ''}
                    onChange={(val) => setForm((prev) => ({ ...prev, dailyPlanSystemPrompt: val }))}
                    height={300}
                  />
                  <div className={styles.hint}>
                    Instructions sent to the AI when generating daily plan recaps.
                  </div>
                </>
              )}

              {promptTab === 'briefing' && (
                <>
                  <MarkdownEditor
                    name="briefingSystemPrompt"
                    value={form.briefingSystemPrompt || defaults.briefingSystemPrompt || ''}
                    onChange={(val) => setForm((prev) => ({ ...prev, briefingSystemPrompt: val }))}
                    height={300}
                  />
                  <div className={styles.hint}>
                    Instructions sent to the AI when generating morning briefings from previous days' recaps.
                  </div>
                </>
              )}


            </FormField>
          </FormSection>
        </div>
      </div>
    </>
  );
}
