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
  Slider,
} from '@fluentui/react-components';
import { PlugConnectedRegular, DeleteRegular, ArrowUploadRegular } from '@fluentui/react-icons';
import { aiConfigApi, geminiConfigApi } from '../../api/index.js';
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

function mapGeminiConfig(data) {
  return {
    geminiApiKey: data.apiKey || '',
    geminiModel: data.model || 'gemini-2.5-flash-preview-tts',
    geminiVoice: data.voice || 'Zephyr',
    geminiSystemPrompt: data.systemPrompt || '',
    geminiPreflightSeconds: data.preflightSeconds ?? 5,
    backgroundMusicFilename: data.backgroundMusicFilename || null,
    backgroundMusicVolume: data.backgroundMusicVolume ?? 10,
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
  const [testingGemini, setTestingGemini] = useState(false);
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [message, setMessage] = useState(null);
  const [pageTab, setPageTab] = useState('claude');
  const [promptTab, setPromptTab] = useState('transactionImport');
  const [defaults, setDefaults] = useState({});
  const [geminiDefaults, setGeminiDefaults] = useState({});

  useEffect(() => {
    Promise.all([
      aiConfigApi.getConfig(),
      aiConfigApi.getDefaults(),
      geminiConfigApi.getConfig(),
      geminiConfigApi.getDefaults(),
    ])
      .then(([data, defs, geminiData, geminiDefs]) => {
        setDefaults(defs || {});
        setGeminiDefaults(geminiDefs || {});
        resetBase({ ...mapConfig(data || {}), ...mapGeminiConfig(geminiData || {}) });
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

  const handleTestGeminiConnection = async () => {
    setTestingGemini(true);
    setMessage(null);
    try {
      await geminiConfigApi.testConnection({
        apiKey: form.geminiApiKey,
        model: form.geminiModel,
        voice: form.geminiVoice,
      });
      showMessage('success', 'Gemini TTS connection successful.');
    } catch (err) {
      showMessage('error', `Gemini connection failed: ${err.message}`);
    } finally {
      setTestingGemini(false);
    }
  };

  const handleMusicUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMusic(true);
    setMessage(null);
    try {
      const updated = await geminiConfigApi.uploadBackgroundMusic(file);
      setForm((prev) => ({ ...prev, backgroundMusicFilename: updated.backgroundMusicFilename }));
      setBase((prev) => ({ ...prev, backgroundMusicFilename: updated.backgroundMusicFilename }));
      showMessage('success', 'Background music uploaded.');
    } catch (err) {
      showMessage('error', `Upload failed: ${err.message}`);
    } finally {
      setUploadingMusic(false);
      e.target.value = '';
    }
  };

  const handleMusicDelete = async () => {
    setMessage(null);
    try {
      await geminiConfigApi.deleteBackgroundMusic();
      setForm((prev) => ({ ...prev, backgroundMusicFilename: null }));
      setBase((prev) => ({ ...prev, backgroundMusicFilename: null }));
      showMessage('success', 'Background music removed.');
    } catch (err) {
      showMessage('error', `Delete failed: ${err.message}`);
    }
  };

  const saveForm = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const { geminiApiKey, geminiModel, geminiVoice, geminiSystemPrompt, geminiPreflightSeconds, backgroundMusicFilename, backgroundMusicVolume, ...aiForm } = form;
      const [saved, geminiSaved] = await Promise.all([
        aiConfigApi.updateConfig(aiForm),
        geminiConfigApi.updateConfig({
          apiKey: geminiApiKey, model: geminiModel, voice: geminiVoice, systemPrompt: geminiSystemPrompt,
          preflightSeconds: geminiPreflightSeconds, backgroundMusicVolume,
        }),
      ]);
      if (saved && geminiSaved) {
        resetBase({ ...mapConfig(saved), ...mapGeminiConfig(geminiSaved) });
      }
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

          <TabList selectedValue={pageTab} onTabSelect={(_, data) => setPageTab(data.value)} style={{ marginBottom: '16px' }}>
            <Tab value="claude">Claude AI</Tab>
            <Tab value="gemini">Gemini Text-to-Speech</Tab>
          </TabList>

          {pageTab === 'claude' && (
            <>
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
            </>
          )}

          {pageTab === 'gemini' && (
            <>
            <FormSection title="API Connection">
              <FormField changed={changedFields.has('geminiApiKey')}>
                <Field label="API Key">
                  <Input name="geminiApiKey" type="password" value={form.geminiApiKey ?? ''} onChange={handleChange('geminiApiKey')} />
                </Field>
              </FormField>
              <FormField changed={changedFields.has('geminiModel')}>
                <Field label="Model">
                  <Input name="geminiModel" value={form.geminiModel ?? ''} onChange={handleChange('geminiModel')} placeholder={geminiDefaults.model || 'gemini-2.5-flash-preview-tts'} />
                </Field>
              </FormField>
              <FormField changed={changedFields.has('geminiVoice')}>
                <Field label="Voice">
                  <Input name="geminiVoice" value={form.geminiVoice ?? ''} onChange={handleChange('geminiVoice')} placeholder={geminiDefaults.voice || 'Zephyr'} />
                </Field>
              </FormField>
              <FormField changed={changedFields.has('geminiPreflightSeconds')}>
                <Field label="Pre-flight Delay (seconds)" hint="Countdown before making the Gemini TTS call. Gives the user time to cancel. Set to 0 to disable.">
                  <Input name="geminiPreflightSeconds" type="number" min={0} max={30} value={String(form.geminiPreflightSeconds ?? 5)} onChange={handleChange('geminiPreflightSeconds')} placeholder="5" />
                </Field>
              </FormField>
              <FormField fullWidth>
                <div className={styles.actions}>
                  <Button appearance="outline" icon={<PlugConnectedRegular />} onClick={handleTestGeminiConnection} disabled={testingGemini || !form.geminiApiKey} size="small">
                    {testingGemini ? 'Testing...' : 'Test Connection'}
                  </Button>
                </div>
              </FormField>
            </FormSection>

            <FormSection title="Background Music">
              <FormField fullWidth>
                <Field label="Audio File">
                  {form.backgroundMusicFilename ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text size={200}>{form.backgroundMusicFilename.replace(/^bg-music-\d+-/, '')}</Text>
                      <Button appearance="subtle" size="small" icon={<DeleteRegular />} onClick={handleMusicDelete}>Remove</Button>
                    </div>
                  ) : (
                    <div>
                      <input type="file" accept="audio/*" onChange={handleMusicUpload} disabled={uploadingMusic} style={{ display: 'none' }} id="bg-music-upload" />
                      <Button
                        as="label"
                        htmlFor="bg-music-upload"
                        appearance="outline"
                        size="small"
                        icon={uploadingMusic ? <Spinner size="tiny" /> : <ArrowUploadRegular />}
                        disabled={uploadingMusic}
                      >
                        {uploadingMusic ? 'Uploading...' : 'Upload Music'}
                      </Button>
                    </div>
                  )}
                </Field>
              </FormField>
              <FormField changed={changedFields.has('backgroundMusicVolume')}>
                <Field label={`Volume: ${form.backgroundMusicVolume ?? 10}%`}>
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={form.backgroundMusicVolume ?? 10}
                    onChange={(_, data) => setForm((prev) => ({ ...prev, backgroundMusicVolume: data.value }))}
                  />
                </Field>
              </FormField>
            </FormSection>

            <FormSection title="System Prompt">
              <FormField fullWidth changed={changedFields.has('geminiSystemPrompt')}>
                <MarkdownEditor
                  name="geminiSystemPrompt"
                  value={form.geminiSystemPrompt || geminiDefaults.systemPrompt || ''}
                  onChange={(val) => setForm((prev) => ({ ...prev, geminiSystemPrompt: val }))}
                  height={300}
                />
                <div className={styles.hint}>
                  Instructions sent to Gemini as a system prompt when generating speech. Guides how the model reads and interprets the document.
                </div>
              </FormField>
            </FormSection>
            </>
          )}
        </div>
      </div>
    </>
  );
}
