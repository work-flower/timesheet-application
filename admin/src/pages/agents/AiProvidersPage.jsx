import { useState, useEffect, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Textarea,
  Field,
  Button,
  Spinner,
  Badge,
  Checkbox,
  Dropdown,
  Option,
  MessageBar,
  MessageBarBody,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Tooltip,
} from '@fluentui/react-components';
import {
  AddRegular,
  DeleteRegular,
  EditRegular,
  PlugConnectedRegular,
  BrainCircuitRegular,
} from '@fluentui/react-icons';
import { aiProvidersApi } from '../../api/index.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

const WIRE_FORMATS = ['anthropic-sse', 'openai-sse', 'gemini-sse', 'json'];

// Working scaffolding per dialect. Selecting a preset fills the form with a
// functional endpoint + headers (incl. the API-key injection) + payload
// template, so a from-scratch provider is never left non-functional. Local
// models (Ollama, LM Studio, vLLM…) that speak the OpenAI schema use the
// "openai" preset with the endpoint URL pointed at the local server.
const PRESETS = {
  anthropic: {
    dialect: 'anthropic',
    endpointUrl: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': '{{$.apiKey}}',
    },
    model: 'claude-opus-4-8',
    wireFormat: 'anthropic-sse',
    responseTextPath: 'content.0.text',
    payloadTemplate: {
      model: '{{$.model}}',
      max_tokens: 4096,
      stream: true,
      system: '{{$.system}}',
      messages: {
        $forEachMessage: {
          user: { role: 'user', content: '{{$m.content}}' },
          assistant: { role: 'assistant', content: '{{$m.content}}' },
        },
      },
    },
  },
  openai: {
    dialect: 'openai',
    endpointUrl: 'https://api.openai.com/v1/chat/completions',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: 'Bearer {{$.apiKey}}',
    },
    model: 'gpt-4o',
    wireFormat: 'openai-sse',
    responseTextPath: 'choices.0.message.content',
    payloadTemplate: {
      model: '{{$.model}}',
      stream: true,
      messages: [
        { role: 'system', content: '{{$.system}}' },
        {
          $forEachMessage: {
            user: { role: 'user', content: '{{$m.content}}' },
            assistant: { role: 'assistant', content: '{{$m.content}}' },
          },
        },
      ],
    },
  },
  gemini: {
    dialect: 'gemini',
    // Gemini puts the model in the URL — edit {model} to match the Model field.
    endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': '{{$.apiKey}}',
    },
    model: 'gemini-2.5-flash',
    wireFormat: 'gemini-sse',
    responseTextPath: 'candidates.0.content.parts.0.text',
    payloadTemplate: {
      systemInstruction: { parts: [{ text: '{{$.system}}' }] },
      contents: {
        $forEachMessage: {
          user: { role: 'user', parts: [{ text: '{{$m.content}}' }] },
          assistant: { role: 'model', parts: [{ text: '{{$m.content}}' }] },
        },
      },
    },
  },
};

function presetToForm(key) {
  const p = PRESETS[key];
  return {
    name: '',
    dialect: p.dialect,
    endpointUrl: p.endpointUrl,
    method: p.method,
    headersText: JSON.stringify(p.headers, null, 2),
    model: p.model,
    wireFormat: p.wireFormat,
    payloadTemplateText: JSON.stringify(p.payloadTemplate, null, 2),
    responseTextPath: p.responseTextPath,
    apiKey: '',
    enabled: true,
  };
}

const useStyles = makeStyles({
  page: { maxWidth: '1000px' },
  pageBody: { padding: '16px 24px' },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  title: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase500 },
  actions: { display: 'flex', gap: '8px' },
  cardList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  card: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '12px 16px',
    backgroundColor: tokens.colorNeutralBackground1,
    '&:hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '8px' },
  cardName: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  cardHeaderActions: { marginLeft: 'auto', display: 'flex', gap: '4px' },
  cardMeta: {
    display: 'flex',
    gap: '16px',
    marginTop: '6px',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    fontFamily: 'monospace',
  },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  fullWidth: { gridColumn: 'span 2' },
  mono: { fontFamily: 'monospace', fontSize: tokens.fontSizeBase200 },
  hint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, marginTop: '4px' },
});

const EMPTY_FORM = {
  name: '',
  dialect: 'custom',
  endpointUrl: '',
  method: 'POST',
  headersText: '{\n  "content-type": "application/json"\n}',
  model: '',
  wireFormat: 'json',
  payloadTemplateText: '{}',
  responseTextPath: '',
  apiKey: '',
  enabled: true,
};

export default function AiProvidersPage() {
  const styles = useStyles();
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    try {
      setProviders(await aiProvidersApi.getAll());
    } catch (err) {
      showMessage('error', `Failed to load: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const showMessage = (intent, text) => {
    setMessage({ intent, text });
    if (intent === 'success') setTimeout(() => setMessage(null), 4000);
  };

  const openAdd = () => {
    setEditing(null);
    // Default to a working Anthropic preset so a new provider is functional
    // out of the box (the blank EMPTY_FORM lacks the api-key header + template).
    setForm(presetToForm('anthropic'));
    setDialogOpen(true);
  };

  const applyPreset = (key) => {
    setForm((f) => ({ ...presetToForm(key), name: f.name, apiKey: f.apiKey }));
  };

  const openEdit = (provider) => {
    setEditing(provider);
    setForm({
      name: provider.name || '',
      dialect: provider.dialect || 'custom',
      endpointUrl: provider.endpointUrl || '',
      method: provider.method || 'POST',
      headersText: JSON.stringify(provider.headers || {}, null, 2),
      model: provider.model || '',
      wireFormat: provider.wireFormat || 'json',
      payloadTemplateText: JSON.stringify(provider.payloadTemplate || {}, null, 2),
      responseTextPath: provider.responseTextPath || '',
      apiKey: provider.apiKey || '',
      enabled: provider.enabled !== false,
    });
    setDialogOpen(true);
  };

  const buildPayload = () => {
    let headers;
    try {
      headers = JSON.parse(form.headersText || '{}');
    } catch {
      throw new Error('Headers must be valid JSON.');
    }
    let payloadTemplate;
    try {
      payloadTemplate = JSON.parse(form.payloadTemplateText || '{}');
    } catch {
      throw new Error('Payload template must be valid JSON.');
    }
    return {
      name: form.name,
      dialect: form.dialect,
      endpointUrl: form.endpointUrl,
      method: form.method,
      headers,
      model: form.model,
      wireFormat: form.wireFormat,
      payloadTemplate,
      responseTextPath: form.responseTextPath,
      apiKey: form.apiKey,
      enabled: form.enabled,
    };
  };

  const handleSave = async () => {
    if (!form.name || !form.endpointUrl) {
      showMessage('error', 'Name and endpoint URL are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (editing) {
        await aiProvidersApi.update(editing._id, payload);
        showMessage('success', 'Provider updated.');
      } else {
        await aiProvidersApi.create(payload);
        showMessage('success', 'Provider added.');
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      showMessage('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (provider) => {
    setTestingId(provider._id);
    try {
      await aiProvidersApi.testConnection(provider._id);
      showMessage('success', `"${provider.name}" connection succeeded.`);
    } catch (err) {
      showMessage('error', `Test failed: ${err.message}`);
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await aiProvidersApi.delete(deleteTarget._id);
      showMessage('success', `"${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      showMessage('error', `Delete failed: ${err.message}`);
      setDeleteTarget(null);
    }
  };

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.pageBody}>
        <div className={styles.header}>
          <Text className={styles.title}>AI Providers</Text>
          <div className={styles.actions}>
            <Button appearance="primary" icon={<AddRegular />} onClick={openAdd} size="small">
              Add Provider
            </Button>
          </div>
        </div>

        {message && (
          <MessageBar intent={message.intent} style={{ marginBottom: 16 }}>
            <MessageBarBody>{message.text}</MessageBarBody>
          </MessageBar>
        )}

        {providers.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: tokens.colorNeutralForeground3 }}>
            <BrainCircuitRegular style={{ fontSize: '48px', display: 'block', margin: '0 auto 12px' }} />
            <Text>No AI providers configured. Add one to enable the assistant.</Text>
          </div>
        ) : (
          <div className={styles.cardList}>
            {providers.map((p) => (
              <div key={p._id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <Text className={styles.cardName}>{p.name}</Text>
                  <Badge appearance="tint" size="small">{p.wireFormat}</Badge>
                  <Badge appearance="filled" color={p.enabled ? 'success' : 'warning'} size="small">
                    {p.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                  <div className={styles.cardHeaderActions}>
                    <Tooltip content="Test connection" relationship="label">
                      <Button
                        appearance="subtle"
                        icon={<PlugConnectedRegular />}
                        size="small"
                        disabled={testingId === p._id}
                        onClick={() => handleTest(p)}
                      />
                    </Tooltip>
                    <Tooltip content="Edit" relationship="label">
                      <Button appearance="subtle" icon={<EditRegular />} size="small" onClick={() => openEdit(p)} />
                    </Tooltip>
                    <Tooltip content="Delete" relationship="label">
                      <Button appearance="subtle" icon={<DeleteRegular />} size="small" onClick={() => setDeleteTarget(p)} />
                    </Tooltip>
                  </div>
                </div>
                <div className={styles.cardMeta}>
                  <span>{p.method || 'POST'} {p.endpointUrl}</span>
                  {p.model && <span>model: {p.model}</span>}
                  <span>key: {p.apiKey ? p.apiKey : '(none)'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(e, data) => { if (!data.open) setDialogOpen(false); }}>
        <DialogSurface style={{ maxWidth: '760px' }}>
          <DialogBody>
            <DialogTitle>{editing ? 'Edit AI Provider' : 'Add AI Provider'}</DialogTitle>
            <DialogContent>
              <div className={styles.formGrid}>
                <div className={styles.fullWidth}>
                  <Field label="Load preset" hint="Fills the endpoint, headers, template and wireFormat for a known API. Local models (Ollama, LM Studio, vLLM…) use the OpenAI preset and point the endpoint at the local server.">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button size="small" appearance="outline" onClick={() => applyPreset('anthropic')}>Anthropic</Button>
                      <Button size="small" appearance="outline" onClick={() => applyPreset('openai')}>OpenAI-compatible</Button>
                      <Button size="small" appearance="outline" onClick={() => applyPreset('gemini')}>Gemini</Button>
                    </div>
                  </Field>
                </div>
                <Field label="Name" required>
                  <Input value={form.name} onChange={(e, d) => setForm((f) => ({ ...f, name: d.value }))} placeholder="e.g. Anthropic (Claude)" />
                </Field>
                <Field label="Dialect">
                  <Input value={form.dialect} onChange={(e, d) => setForm((f) => ({ ...f, dialect: d.value }))} placeholder="anthropic | openai | gemini | custom" />
                </Field>
                <div className={styles.fullWidth}>
                  <Field label="Endpoint URL" required>
                    <Input value={form.endpointUrl} onChange={(e, d) => setForm((f) => ({ ...f, endpointUrl: d.value }))} placeholder="https://api.anthropic.com/v1/messages" type="url" />
                  </Field>
                </div>
                <Field label="HTTP Method">
                  <Input value={form.method} onChange={(e, d) => setForm((f) => ({ ...f, method: d.value }))} />
                </Field>
                <Field label="Wire Format">
                  <Dropdown
                    value={form.wireFormat}
                    selectedOptions={[form.wireFormat]}
                    onOptionSelect={(e, d) => setForm((f) => ({ ...f, wireFormat: d.optionValue }))}
                  >
                    {WIRE_FORMATS.map((w) => <Option key={w} value={w}>{w}</Option>)}
                  </Dropdown>
                </Field>
                <Field label="Model">
                  <Input value={form.model} onChange={(e, d) => setForm((f) => ({ ...f, model: d.value }))} placeholder="claude-opus-4-8" />
                </Field>
                <Field label="API Key">
                  <Input type="password" value={form.apiKey} onChange={(e, d) => setForm((f) => ({ ...f, apiKey: d.value }))} placeholder="Leave masked value to keep existing" />
                </Field>
                <div className={styles.fullWidth}>
                  <Field label="Headers (JSON)">
                    <Textarea className={styles.mono} value={form.headersText} onChange={(e, d) => setForm((f) => ({ ...f, headersText: d.value }))} rows={4} />
                  </Field>
                  <div className={styles.hint}>Use {'{{$.apiKey}}'} in a header value to inject the API key.</div>
                </div>
                <div className={styles.fullWidth}>
                  <Field label="Payload Template (JSON)">
                    <Textarea className={styles.mono} value={form.payloadTemplateText} onChange={(e, d) => setForm((f) => ({ ...f, payloadTemplateText: d.value }))} rows={10} />
                  </Field>
                  <div className={styles.hint}>
                    Placeholders: {'{{$.model}}'}, {'{{$.system}}'}, {'{{$m.content}}'}. Use a {'{ "$forEachMessage": { "user": {...}, "assistant": {...} } }'} node to map the message array.
                  </div>
                </div>
                <Field label="Response Text Path (json format only)">
                  <Input value={form.responseTextPath} onChange={(e, d) => setForm((f) => ({ ...f, responseTextPath: d.value }))} placeholder="content.0.text" />
                </Field>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <Checkbox label="Enabled" checked={form.enabled} onChange={(e, d) => setForm((f) => ({ ...f, enabled: d.checked }))} />
                </div>
              </div>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">Cancel</Button>
              </DialogTrigger>
              <Button appearance="primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : (editing ? 'Update' : 'Add')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete AI Provider"
        message={`Delete "${deleteTarget?.name}"? Agents referencing it will need reassigning.`}
      />
    </div>
  );
}
