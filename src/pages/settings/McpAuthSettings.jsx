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
import { SaveRegular } from '@fluentui/react-icons';
import { Link as RouterLink } from 'react-router-dom';
import { mcpAuthApi } from '../../api/index.js';
import { FormSection, FormField } from '../../components/FormSection.jsx';

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

export default function McpAuthSettings() {
  const styles = useStyles();

  const [config, setConfig] = useState({
    issuer: '',
    authorizationEndpoint: '',
    tokenEndpoint: '',
    scopes: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    mcpAuthApi.getConfig()
      .then((data) => {
        if (data) {
          setConfig({
            issuer: data.issuer || '',
            authorizationEndpoint: data.authorizationEndpoint || '',
            tokenEndpoint: data.tokenEndpoint || '',
            scopes: data.scopes || '',
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

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await mcpAuthApi.updateConfig(config);
      if (saved) {
        setConfig({
          issuer: saved.issuer || '',
          authorizationEndpoint: saved.authorizationEndpoint || '',
          tokenEndpoint: saved.tokenEndpoint || '',
          scopes: saved.scopes || '',
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

      <FormSection title="OAuth Provider">
        <FormField>
          <Field label="Issuer" hint="OIDC issuer URL (e.g. https://team.cloudflareaccess.com)">
            <Input
              value={config.issuer}
              onChange={handleChange('issuer')}
              placeholder="https://team.cloudflareaccess.com"
            />
          </Field>
        </FormField>
        <FormField>
          <Field label="Authorization Endpoint">
            <Input
              value={config.authorizationEndpoint}
              onChange={handleChange('authorizationEndpoint')}
              placeholder="https://team.cloudflareaccess.com/.../authorization"
            />
          </Field>
        </FormField>
        <FormField>
          <Field label="Token Endpoint">
            <Input
              value={config.tokenEndpoint}
              onChange={handleChange('tokenEndpoint')}
              placeholder="https://team.cloudflareaccess.com/.../token"
            />
          </Field>
        </FormField>
        <FormField>
          <Field label="Scopes" hint="Comma-separated (e.g. openid,profile)">
            <Input
              value={config.scopes}
              onChange={handleChange('scopes')}
              placeholder="openid,profile"
            />
          </Field>
        </FormField>
        <FormField fullWidth>
          <div className={styles.actions}>
            <Button
              appearance="primary"
              icon={<SaveRegular />}
              onClick={handleSave}
              disabled={saving}
              size="small"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
          <div className={styles.hint}>
            Configures the /.well-known/oauth-authorization-server and /.well-known/openid-configuration endpoints for OAuth discovery. Enables machine-to-machine authentication for MCP clients, API integrations, and other external services. See the <RouterLink to="/help/mcp-auth" target="_blank">M2M API Authentication</RouterLink> guide for setup instructions.
          </div>
        </FormField>
      </FormSection>
    </div>
  );
}
