import { useState, useEffect, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Field,
  Button,
  Spinner,
  Badge,
  Checkbox,
  Textarea,
  MessageBar,
  MessageBarBody,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Dropdown,
  Option,
  Tooltip,
} from '@fluentui/react-components';
import { AddRegular, DeleteRegular, EditRegular, KeyRegular, DismissRegular } from '@fluentui/react-icons';
import { rolesApi } from '../../api/index.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { TABLES, ACTIONS, BASELINE_READ_TABLES } from '../../../../shared/authz/registry.js';
import { validatePrivileges } from '../../../../shared/authz/filterValidate.js';

const FILTER_OPS = ['read', 'update', 'delete'];
const MODES = { none: 'No access', all: 'All records', filtered: 'Filtered' };

const useStyles = makeStyles({
  page: { maxWidth: '1000px' },
  pageBody: { padding: '16px 24px' },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase500,
  },
  cardList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  card: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '12px 16px',
    backgroundColor: tokens.colorNeutralBackground1,
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      borderColor: tokens.colorNeutralStroke1Hover,
    },
  },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' },
  cardHeaderActions: { marginLeft: 'auto', display: 'flex', gap: '4px' },
  cardName: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  cardMeta: { display: 'flex', alignItems: 'center', gap: '16px', marginTop: '4px', paddingBottom: '4px' },
  metaItem: { display: 'flex', flexDirection: 'column' },
  metaLabel: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  metaValue: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  dialogSurface: { maxWidth: '760px', width: '760px' },
  tableSection: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '10px 12px',
    marginBottom: '10px',
  },
  tableHeader: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' },
  tableName: { fontWeight: tokens.fontWeightSemibold, fontFamily: 'monospace' },
  opRow: { display: 'grid', gridTemplateColumns: '70px 150px 1fr', gap: '8px', alignItems: 'start', marginBottom: '6px' },
  opLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    paddingTop: '6px',
    textTransform: 'capitalize',
  },
  filterInput: { fontFamily: 'monospace', fontSize: tokens.fontSizeBase200 },
  filterError: { color: tokens.colorPaletteRedForeground1, fontSize: tokens.fontSizeBase200 },
  actionsRow: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' },
  addTableRow: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' },
  hint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, marginTop: '4px' },
});

function emptyOp() {
  return { mode: 'none', filter: '' };
}

// role.privileges (API shape) → editor state
function toEditorState(privileges = {}) {
  const state = {};
  for (const [table, priv] of Object.entries(privileges)) {
    const entry = { create: priv.create === true, actions: priv.actions || [] };
    for (const op of FILTER_OPS) {
      const value = priv[op];
      if (value === true) entry[op] = { mode: 'all', filter: '' };
      else if (value && typeof value === 'object') entry[op] = { mode: 'filtered', filter: JSON.stringify(value, null, 2) };
      else entry[op] = emptyOp();
    }
    state[table] = entry;
  }
  return state;
}

// editor state → role.privileges; returns { privileges } or { error }
function fromEditorState(state) {
  const privileges = {};
  for (const [table, entry] of Object.entries(state)) {
    const priv = {};
    for (const op of FILTER_OPS) {
      const { mode, filter } = entry[op];
      if (mode === 'all') priv[op] = true;
      else if (mode === 'filtered') {
        let parsed;
        try {
          parsed = JSON.parse(filter || '');
        } catch {
          return { error: `${table}.${op}: filter is not valid JSON` };
        }
        priv[op] = parsed;
      }
    }
    if (entry.create) priv.create = true;
    if (entry.actions.length > 0) priv.actions = entry.actions;
    if (Object.keys(priv).length > 0) privileges[table] = priv;
  }
  const { ok, errors } = validatePrivileges(privileges);
  if (!ok) return { error: errors.join('; ') };
  return { privileges };
}

export default function RolesPage() {
  const styles = useStyles();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [privState, setPrivState] = useState({});
  const [dialogError, setDialogError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadRoles = useCallback(async () => {
    try {
      const data = await rolesApi.getAll();
      setRoles(data);
    } catch (err) {
      showMessage('error', `Failed to load: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  const showMessage = (intent, text) => {
    setMessage({ intent, text });
    if (intent === 'success') setTimeout(() => setMessage(null), 4000);
  };

  const openAdd = () => {
    setEditingRole(null);
    setFormData({ name: '', description: '' });
    // Baseline reads pre-added — list enrichment needs them (default deny otherwise)
    setPrivState(toEditorState(Object.fromEntries(BASELINE_READ_TABLES.map((t) => [t, { read: true }]))));
    setDialogError(null);
    setDialogOpen(true);
  };

  const openEdit = (role) => {
    setEditingRole(role);
    setFormData({ name: role.name, description: role.description || '' });
    setPrivState(toEditorState(role.privileges));
    setDialogError(null);
    setDialogOpen(true);
  };

  const setOp = (table, op, patch) => {
    setPrivState((prev) => ({
      ...prev,
      [table]: { ...prev[table], [op]: { ...prev[table][op], ...patch } },
    }));
  };

  const addTable = (table) => {
    if (!table || privState[table]) return;
    setPrivState((prev) => ({
      ...prev,
      [table]: { read: emptyOp(), update: emptyOp(), delete: emptyOp(), create: false, actions: [] },
    }));
  };

  const removeTable = (table) => {
    setPrivState((prev) => {
      const next = { ...prev };
      delete next[table];
      return next;
    });
  };

  const toggleAction = (table, action, checked) => {
    setPrivState((prev) => ({
      ...prev,
      [table]: {
        ...prev[table],
        actions: checked
          ? [...prev[table].actions, action]
          : prev[table].actions.filter((a) => a !== action),
      },
    }));
  };

  const handleSaveRole = async () => {
    if (!formData.name.trim()) {
      setDialogError('Role name is required.');
      return;
    }
    const result = fromEditorState(privState);
    if (result.error) {
      setDialogError(result.error);
      return;
    }
    setSaving(true);
    setDialogError(null);
    try {
      const payload = { ...formData, privileges: result.privileges };
      if (editingRole) {
        await rolesApi.update(editingRole._id, payload);
        showMessage('success', 'Role updated. Changes apply to members on their next request.');
      } else {
        await rolesApi.create(payload);
        showMessage('success', 'Role created.');
      }
      setDialogOpen(false);
      await loadRoles();
    } catch (err) {
      setDialogError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await rolesApi.delete(deleteTarget._id);
      showMessage('success', `"${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
      await loadRoles();
    } catch (err) {
      showMessage('error', `Delete failed: ${err.message}`);
      setDeleteTarget(null);
    }
  };

  const availableTables = TABLES.filter((t) => !privState[t]);
  const missingBaseline = BASELINE_READ_TABLES.filter(
    (t) => !privState[t] || privState[t].read.mode === 'none'
  );

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.pageBody}>
        <div className={styles.header}>
          <Text className={styles.title}>Roles</Text>
          <Button appearance="primary" icon={<AddRegular />} onClick={openAdd} size="small">
            Add Role
          </Button>
        </div>

        {message && (
          <MessageBar intent={message.intent} style={{ marginBottom: 16 }}>
            <MessageBarBody>{message.text}</MessageBarBody>
          </MessageBar>
        )}

        {roles.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: tokens.colorNeutralForeground3 }}>
            <KeyRegular style={{ fontSize: '48px', display: 'block', margin: '0 auto 12px' }} />
            <Text>No roles defined. Access is default-deny — users need at least one role to see anything.</Text>
          </div>
        ) : (
          <div className={styles.cardList}>
            {roles.map((role) => (
              <div key={role._id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <Text className={styles.cardName}>{role.name}</Text>
                  <Badge appearance="filled" color="informative" size="small">
                    {Object.keys(role.privileges || {}).length} tables
                  </Badge>
                  <div className={styles.cardHeaderActions}>
                    <Tooltip content="Edit" relationship="label">
                      <Button appearance="subtle" icon={<EditRegular />} size="small" onClick={() => openEdit(role)} />
                    </Tooltip>
                    <Tooltip content="Delete" relationship="label">
                      <Button appearance="subtle" icon={<DeleteRegular />} size="small" onClick={() => setDeleteTarget(role)} />
                    </Tooltip>
                  </div>
                </div>
                <div className={styles.cardMeta}>
                  <div className={styles.metaItem}>
                    <Text className={styles.metaLabel}>Members</Text>
                    <Text className={styles.metaValue}>{role.userCount ?? 0}</Text>
                  </div>
                  {role.description && (
                    <div className={styles.metaItem}>
                      <Text className={styles.metaLabel}>Description</Text>
                      <Text className={styles.metaValue}>{role.description}</Text>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(e, data) => { if (!data.open) setDialogOpen(false); }}>
        <DialogSurface className={styles.dialogSurface}>
          <DialogBody>
            <DialogTitle>{editingRole ? `Edit ${editingRole.name}` : 'Add Role'}</DialogTitle>
            <DialogContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field label="Name" required>
                  <Input
                    value={formData.name}
                    onChange={(e, d) => setFormData((prev) => ({ ...prev, name: d.value }))}
                    placeholder="e.g. Contractor"
                  />
                </Field>
                <Field label="Description">
                  <Input
                    value={formData.description}
                    onChange={(e, d) => setFormData((prev) => ({ ...prev, description: d.value }))}
                  />
                </Field>

                <Field label="Table privileges">
                  <div>
                    {missingBaseline.length > 0 && (
                      <MessageBar intent="warning" style={{ marginBottom: 8 }}>
                        <MessageBarBody>
                          Missing baseline reads: {missingBaseline.join(', ')} — list enrichment
                          needs read access on these or pages will fail with 403.
                        </MessageBarBody>
                      </MessageBar>
                    )}
                    {Object.keys(privState).map((table) => (
                      <div key={table} className={styles.tableSection}>
                        <div className={styles.tableHeader}>
                          <Text className={styles.tableName}>{table}</Text>
                          <Tooltip content="Remove table" relationship="label">
                            <Button
                              appearance="subtle"
                              icon={<DismissRegular />}
                              size="small"
                              style={{ marginLeft: 'auto' }}
                              onClick={() => removeTable(table)}
                            />
                          </Tooltip>
                        </div>
                        {FILTER_OPS.map((op) => (
                          <div key={op} className={styles.opRow}>
                            <Text className={styles.opLabel}>{op}</Text>
                            <Dropdown
                              size="small"
                              value={MODES[privState[table][op].mode]}
                              selectedOptions={[privState[table][op].mode]}
                              onOptionSelect={(e, d) => setOp(table, op, { mode: d.optionValue })}
                            >
                              <Option value="none">No access</Option>
                              <Option value="all">All records</Option>
                              <Option value="filtered">Filtered</Option>
                            </Dropdown>
                            {privState[table][op].mode === 'filtered' ? (
                              <Textarea
                                className={styles.filterInput}
                                value={privState[table][op].filter}
                                onChange={(e, d) => setOp(table, op, { filter: d.value })}
                                placeholder='{"date": {"$gte": "$$startOfMonth"}}'
                                resize="vertical"
                              />
                            ) : (
                              <span />
                            )}
                          </div>
                        ))}
                        <div className={styles.actionsRow}>
                          <Checkbox
                            label="Create"
                            checked={privState[table].create}
                            onChange={(e, d) =>
                              setPrivState((prev) => ({
                                ...prev,
                                [table]: { ...prev[table], create: !!d.checked },
                              }))
                            }
                          />
                          {(ACTIONS[table] || []).map((action) => (
                            <Checkbox
                              key={action}
                              label={`Action: ${action}`}
                              checked={privState[table].actions.includes(action)}
                              onChange={(e, d) => toggleAction(table, action, d.checked)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    <div className={styles.addTableRow}>
                      <Dropdown
                        size="small"
                        placeholder="Add table..."
                        value=""
                        selectedOptions={[]}
                        onOptionSelect={(e, d) => addTable(d.optionValue)}
                      >
                        {availableTables.map((t) => (
                          <Option key={t} value={t}>{t}</Option>
                        ))}
                      </Dropdown>
                      <Text className={styles.hint}>
                        Filters are NeDB queries; macros: $$user.id, $$user.email, $$today, $$startOfWeek/Month/Year, $$today±Nd.
                      </Text>
                    </div>
                  </div>
                </Field>

                {dialogError && (
                  <MessageBar intent="error">
                    <MessageBarBody>{dialogError}</MessageBarBody>
                  </MessageBar>
                )}
              </div>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">Cancel</Button>
              </DialogTrigger>
              <Button appearance="primary" onClick={handleSaveRole} disabled={saving}>
                {saving ? 'Saving...' : (editingRole ? 'Update' : 'Add')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Role"
        message={`Delete "${deleteTarget?.name}"? ${deleteTarget?.userCount ? `${deleteTarget.userCount} user(s) will lose this role's access immediately.` : ''}`}
      />
    </div>
  );
}
