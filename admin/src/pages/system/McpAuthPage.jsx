import { useState, useEffect, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Field,
  Spinner,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { mcpAuthApi } from '../../api/index.js';
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
  hint: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginTop: '4px',
  },
});

const INITIAL_STATE = {
  issuer: '',
  authorizationEndpoint: '',
  tokenEndpoint: '',
  scopes: '',
};

export default function McpAuthPage() {
  const styles = useStyles();
  const { registerGuard } = useUnsavedChanges();
  const { navigateUnguarded, goBack } = useAppNavigate();
  const { form, setForm, setBase, isDirty, changedFields } = useFormTracker(INITIAL_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    mcpAuthApi.getConfig()
      .then((data) => {
        if (data) {
          setBase({
            issuer: data.issuer || '',
            authorizationEndpoint: data.authorizationEndpoint || '',
            tokenEndpoint: data.tokenEndpoint || '',
            scopes: data.scopes || '',
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [setBase]);

  const handleChange = (field) => (e, data) => {
    const value = data?.value ?? e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const showMessage = (intent, text) => {
    setMessage({ intent, text });
    if (intent === 'success') setTimeout(() => setMessage(null), 4000);
  };

  const saveForm = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await mcpAuthApi.updateConfig(form);
      if (saved) {
        setBase({
          issuer: saved.issuer || '',
          authorizationEndpoint: saved.authorizationEndpoint || '',
          tokenEndpoint: saved.tokenEndpoint || '',
          scopes: saved.scopes || '',
        });
      }
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
    if (ok) navigateUnguarded('/system/mcp-auth');
  };

  useEffect(() => {
    return registerGuard({ isDirty, onSave: saveForm });
  }, [isDirty, saveForm, registerGuard]);

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  return (
    <div className={styles.page}>
      <FormCommandBar
        onBack={() => goBack('/system/mcp-auth')}
        onSave={handleSave}
        onSaveAndClose={handleSaveAndClose}
        saving={saving}
      />
      <div className={styles.pageBody}>
        <div className={styles.header}>
          <Text className={styles.title}>M2M API Authentication</Text>
        </div>

        {message && (
          <MessageBar intent={message.intent} style={{ marginBottom: 16 }}>
            <MessageBarBody>{message.text}</MessageBarBody>
          </MessageBar>
        )}

        <FormSection title="OAuth Provider">
          <FormField>
            <Field label="Issuer" hint="OIDC issuer URL (e.g. https://team.cloudflareaccess.com)">
              <Input value={form.issuer} onChange={handleChange('issuer')} placeholder="https://team.cloudflareaccess.com" />
            </Field>
          </FormField>
          <FormField>
            <Field label="Authorization Endpoint">
              <Input value={form.authorizationEndpoint} onChange={handleChange('authorizationEndpoint')} placeholder="https://team.cloudflareaccess.com/.../authorization" />
            </Field>
          </FormField>
          <FormField>
            <Field label="Token Endpoint">
              <Input value={form.tokenEndpoint} onChange={handleChange('tokenEndpoint')} placeholder="https://team.cloudflareaccess.com/.../token" />
            </Field>
          </FormField>
          <FormField>
            <Field label="Scopes" hint="Comma-separated (e.g. openid,profile)">
              <Input value={form.scopes} onChange={handleChange('scopes')} placeholder="openid,profile" />
            </Field>
          </FormField>
          <FormField fullWidth>
            <div className={styles.hint}>
              Configures the /.well-known/oauth-authorization-server and /.well-known/openid-configuration endpoints for OAuth discovery. Enables machine-to-machine authentication for MCP clients, API integrations, and other external services. See the <a href="/help/mcp-auth" target="_blank" rel="noopener noreferrer">M2M API Authentication</a> guide for setup instructions.
            </div>
          </FormField>
        </FormSection>
      </div>
    </div>
  );
}
