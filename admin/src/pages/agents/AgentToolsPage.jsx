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
  WrenchRegular,
} from '@fluentui/react-icons';
import { agentToolsApi } from '../../api/index.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

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
  cardName: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300, fontFamily: 'monospace' },
  cardHeaderActions: { marginLeft: 'auto', display: 'flex', gap: '4px' },
  cardMeta: {
    display: 'flex',
    gap: '16px',
    marginTop: '6px',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  mono: { fontFamily: 'monospace', fontSize: tokens.fontSizeBase200 },
  hint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, marginTop: '4px' },
});

const EMPTY_FORM = {
  name: '',
  description: '',
  inputSchemaText: '{\n  "type": "object",\n  "properties": {}\n}',
  handlerName: '',
  enabled: true,
};

function kindBadge(kind) {
  return (
    <Badge appearance="tint" size="small" color={kind === 'write' ? 'warning' : 'informative'}>
      {kind === 'write' ? 'write — needs confirmation' : 'read'}
    </Badge>
  );
}

export default function AgentToolsPage() {
  const styles = useStyles();
  const [tools, setTools] = useState([]);
  const [handlers, setHandlers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    try {
      const [defs, handlerList] = await Promise.all([
        agentToolsApi.getAll(),
        agentToolsApi.getHandlers(),
      ]);
      setTools(defs);
      setHandlers(handlerList);
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

  const handlerByName = Object.fromEntries(handlers.map((h) => [h.name, h]));

  const handlerLabel = (h) =>
    `${h.name} — ${h.kind}${h.access ? ` (${h.access.table}.${h.access.op})` : ''}`;

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (tool) => {
    setEditing(tool);
    setForm({
      name: tool.name || '',
      description: tool.description || '',
      inputSchemaText: JSON.stringify(tool.inputSchema || {}, null, 2),
      handlerName: tool.handlerName || '',
      enabled: tool.enabled !== false,
    });
    setDialogOpen(true);
  };

  const buildPayload = () => {
    let inputSchema;
    try {
      inputSchema = JSON.parse(form.inputSchemaText || '{}');
    } catch {
      throw new Error('Input schema must be valid JSON.');
    }
    return {
      name: form.name,
      description: form.description,
      inputSchema,
      handlerName: form.handlerName,
      enabled: form.enabled,
    };
  };

  const handleSave = async () => {
    if (!form.name || !form.description || !form.handlerName) {
      showMessage('error', 'Name, description and handler are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (editing) {
        await agentToolsApi.update(editing._id, payload);
        showMessage('success', 'Tool definition updated.');
      } else {
        await agentToolsApi.create(payload);
        showMessage('success', 'Tool definition added.');
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      showMessage('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await agentToolsApi.delete(deleteTarget._id);
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
          <Text className={styles.title}>App Tools</Text>
          <div className={styles.actions}>
            <Button appearance="primary" icon={<AddRegular />} onClick={openAdd} size="small">
              Add Tool
            </Button>
          </div>
        </div>

        {message && (
          <MessageBar intent={message.intent} style={{ marginBottom: 16 }}>
            <MessageBarBody>{message.text}</MessageBarBody>
          </MessageBar>
        )}

        {tools.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: tokens.colorNeutralForeground3 }}>
            <WrenchRegular style={{ fontSize: '48px', display: 'block', margin: '0 auto 12px' }} />
            <Text>No tool definitions. Missing code-registry defaults are re-inserted at every boot (deleted defaults return on restart; disable one to opt out) — add one to expose a handler under a new name.</Text>
          </div>
        ) : (
          <div className={styles.cardList}>
            {tools.map((t) => {
              const handler = handlerByName[t.handlerName];
              return (
                <div key={t._id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <Text className={styles.cardName}>{t.name}</Text>
                    {handler && kindBadge(handler.kind)}
                    {!handler && (
                      <Badge appearance="filled" color="danger" size="small">
                        missing handler: {t.handlerName}
                      </Badge>
                    )}
                    <Badge appearance="filled" color={t.enabled !== false ? 'success' : 'warning'} size="small">
                      {t.enabled !== false ? 'Enabled' : 'Disabled'}
                    </Badge>
                    <div className={styles.cardHeaderActions}>
                      <Tooltip content="Edit" relationship="label">
                        <Button appearance="subtle" icon={<EditRegular />} size="small" onClick={() => openEdit(t)} />
                      </Tooltip>
                      <Tooltip content="Delete" relationship="label">
                        <Button appearance="subtle" icon={<DeleteRegular />} size="small" onClick={() => setDeleteTarget(t)} />
                      </Tooltip>
                    </div>
                  </div>
                  <div className={styles.cardMeta}>
                    <span className={styles.mono}>handler: {t.handlerName}</span>
                    <span>{(t.description || '').split('\n')[0]}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(e, data) => { if (!data.open) setDialogOpen(false); }}>
        <DialogSurface style={{ maxWidth: '680px' }}>
          <DialogBody>
            <DialogTitle>{editing ? 'Edit Tool Definition' : 'Add Tool Definition'}</DialogTitle>
            <DialogContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Field
                  label="Name"
                  required
                  hint={editing
                    ? 'Immutable — the name is the join key for card grants, transcripts and eval examples. Create a new definition to rename.'
                    : 'Lowercase letters, digits and underscores, starting with a letter. Immutable after create.'}
                >
                  <Input
                    className={styles.mono}
                    value={form.name}
                    disabled={!!editing}
                    onChange={(e, d) => setForm((f) => ({ ...f, name: d.value }))}
                    placeholder="e.g. list_recent_invoices"
                  />
                </Field>
                <Field
                  label="Handler"
                  required
                  hint="The code-side function this definition executes. Read/write behaviour and the permission pre-filter come from the handler."
                >
                  <Dropdown
                    value={form.handlerName ? handlerLabel(handlerByName[form.handlerName] || { name: form.handlerName, kind: '?' }) : ''}
                    selectedOptions={form.handlerName ? [form.handlerName] : []}
                    onOptionSelect={(e, d) => setForm((f) => ({ ...f, handlerName: d.optionValue }))}
                    placeholder="Select a handler"
                  >
                    {handlers.map((h) => (
                      <Option key={h.name} value={h.name} text={handlerLabel(h)}>
                        {handlerLabel(h)}
                      </Option>
                    ))}
                  </Dropdown>
                </Field>
                <Field
                  label="Description"
                  required
                  hint="Model-visible: tells agents when and how to use the tool, and feeds the routing corpus."
                >
                  <Textarea
                    value={form.description}
                    onChange={(e, d) => setForm((f) => ({ ...f, description: d.value }))}
                    rows={6}
                  />
                </Field>
                <div>
                  <Field label="Input Schema (JSON Schema)">
                    <Textarea
                      className={styles.mono}
                      value={form.inputSchemaText}
                      onChange={(e, d) => setForm((f) => ({ ...f, inputSchemaText: d.value }))}
                      rows={10}
                    />
                  </Field>
                  <div className={styles.hint}>
                    Must be self-contained: keys must not start with "$" or contain "." (no $ref/$defs). Argument names must match what the handler expects.
                  </div>
                </div>
                <Checkbox
                  label="Enabled — disabled tools disappear from MCP, agent grants and routing"
                  checked={form.enabled}
                  onChange={(e, d) => setForm((f) => ({ ...f, enabled: d.checked }))}
                />
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
        title="Delete Tool Definition"
        message={`Delete "${deleteTarget?.name}"? Card grants referencing it go stale (skipped at runtime) and eval examples targeting it will show as misroutes. Consider disabling instead.`}
      />
    </div>
  );
}
