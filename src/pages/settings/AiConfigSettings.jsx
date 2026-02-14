import { useState, useEffect } from 'react';
import {
  makeStyles,
  tokens,
  Input,
  Field,
  Button,
  Spinner,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import {
  PlugConnectedRegular,
  SaveRegular,
} from '@fluentui/react-icons';
import { aiConfigApi } from '../../api/index.js';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import MarkdownEditor from '../../components/MarkdownEditor.jsx';

const useStyles = makeStyles({
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

export default function AiConfigSettings() {
  const styles = useStyles();

  const [config, setConfig] = useState({
    apiKey: '',
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: '',
    timeoutMinutes: '',
    systemPrompt: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    aiConfigApi.getConfig()
      .then((data) => {
        if (data) {
          setConfig({
            apiKey: data.apiKey || '',
            model: data.model || 'claude-sonnet-4-5-20250929',
            maxTokens: data.maxTokens != null ? String(data.maxTokens) : '',
            timeoutMinutes: data.timeoutMinutes != null ? String(data.timeoutMinutes) : '',
            systemPrompt: data.systemPrompt || '',
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (field) => (e, data) => {
    const value = data?.value ?? e.target.value;
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const showMessage = (intent, text) => {
    setMessage({ intent, text });
    if (intent === 'success') setTimeout(() => setMessage(null), 4000);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setMessage(null);
    try {
      await aiConfigApi.testConnection(config);
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
      const saved = await aiConfigApi.updateConfig(config);
      if (saved) {
        setConfig({
          apiKey: saved.apiKey || '',
          model: saved.model || 'claude-sonnet-4-5-20250929',
          maxTokens: saved.maxTokens != null ? String(saved.maxTokens) : '',
          timeoutMinutes: saved.timeoutMinutes != null ? String(saved.timeoutMinutes) : '',
          systemPrompt: saved.systemPrompt || '',
        });
      }
      showMessage('success', 'Configuration saved.');
    } catch (err) {
      showMessage('error', `Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  return (
    <div>
      {message && (
        <MessageBar intent={message.intent} style={{ marginBottom: 16 }}>
          <MessageBarBody>{message.text}</MessageBarBody>
        </MessageBar>
      )}

      <FormSection title="API Connection">
        <FormField>
          <Field label="API Key">
            <Input
              type="password"
              value={config.apiKey}
              onChange={handleChange('apiKey')}
            />
          </Field>
        </FormField>
        <FormField>
          <Field label="Model">
            <Input
              value={config.model}
              onChange={handleChange('model')}
              placeholder="claude-sonnet-4-5-20250929"
            />
          </Field>
        </FormField>
        <FormField>
          <Field label="Max Tokens" hint="Maximum tokens in AI response. Default: 64000. Max: 64000.">
            <Input
              value={config.maxTokens}
              onChange={handleChange('maxTokens')}
              placeholder="64000"
              type="number"
              max={64000}
            />
          </Field>
        </FormField>
        <FormField>
          <Field label="Timeout (minutes)" hint="How long to wait for the AI response before giving up. Default: 30 minutes.">
            <Input
              value={config.timeoutMinutes}
              onChange={handleChange('timeoutMinutes')}
              placeholder="30"
              type="number"
            />
          </Field>
        </FormField>
        <FormField fullWidth>
          <div className={styles.actions}>
            <Button
              appearance="outline"
              icon={<PlugConnectedRegular />}
              onClick={handleTestConnection}
              disabled={testing || !config.apiKey}
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

      <FormSection title="System Prompt">
        <FormField fullWidth>
          <MarkdownEditor
            value={config.systemPrompt}
            onChange={(val) => setConfig((prev) => ({ ...prev, systemPrompt: val }))}
            height={300}
            placeholder="General parsing instructions shared across all imports..."
          />
          <div className={styles.hint}>
            General parsing instructions shared across all imports. Each import job can also have a job-specific user prompt.
          </div>
        </FormField>
      </FormSection>
    </div>
  );
}
