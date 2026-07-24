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
import { AddRegular, DeleteRegular, EditRegular, PeopleRegular } from '@fluentui/react-icons';
import { usersApi, rolesApi } from '../../api/index.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

const STATUS_BADGE = {
  pending: 'warning',
  active: 'success',
  disabled: 'danger',
};

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
  roleChecks: { display: 'flex', flexDirection: 'column', gap: '4px' },
  hint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, marginTop: '4px' },
});

export default function UsersPage() {
  const styles = useStyles();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({ email: '', status: 'pending', roleIds: [] });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [userData, roleData] = await Promise.all([usersApi.getAll(), rolesApi.getAll()]);
      setUsers(userData);
      setRoles(roleData);
    } catch (err) {
      showMessage('error', `Failed to load: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const showMessage = (intent, text) => {
    setMessage({ intent, text });
    if (intent === 'success') setTimeout(() => setMessage(null), 4000);
  };

  const openAdd = () => {
    setEditingUser(null);
    setFormData({ email: '', status: 'pending', roleIds: [] });
    setDialogOpen(true);
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setFormData({ email: user.email, status: user.status, roleIds: user.roleIds || [] });
    setDialogOpen(true);
  };

  const toggleRole = (roleId, checked) => {
    setFormData((prev) => ({
      ...prev,
      roleIds: checked ? [...prev.roleIds, roleId] : prev.roleIds.filter((id) => id !== roleId),
    }));
  };

  const handleSaveUser = async () => {
    if (!editingUser && !formData.email.trim()) {
      showMessage('error', 'Email is required.');
      return;
    }
    setSaving(true);
    try {
      if (editingUser) {
        await usersApi.update(editingUser._id, { status: formData.status, roleIds: formData.roleIds });
        showMessage('success', 'User updated.');
      } else {
        await usersApi.create(formData);
        showMessage('success', 'User created.');
      }
      setDialogOpen(false);
      await loadData();
    } catch (err) {
      showMessage('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await usersApi.delete(deleteTarget._id);
      showMessage('success', `"${deleteTarget.email}" deleted.`);
      setDeleteTarget(null);
      await loadData();
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
          <Text className={styles.title}>Users</Text>
          <Button appearance="primary" icon={<AddRegular />} onClick={openAdd} size="small">
            Add User
          </Button>
        </div>

        {message && (
          <MessageBar intent={message.intent} style={{ marginBottom: 16 }}>
            <MessageBarBody>{message.text}</MessageBarBody>
          </MessageBar>
        )}

        {users.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: tokens.colorNeutralForeground3 }}>
            <PeopleRegular style={{ fontSize: '48px', display: 'block', margin: '0 auto 12px' }} />
            <Text>No users yet. Users appear automatically (pending) on their first visit, or add one ahead of time.</Text>
          </div>
        ) : (
          <div className={styles.cardList}>
            {users.map((user) => (
              <div key={user._id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <Text className={styles.cardName}>{user.email}</Text>
                  <Badge appearance="filled" color={STATUS_BADGE[user.status] || 'informative'} size="small">
                    {user.status}
                  </Badge>
                  <div className={styles.cardHeaderActions}>
                    <Tooltip content="Edit" relationship="label">
                      <Button appearance="subtle" icon={<EditRegular />} size="small" onClick={() => openEdit(user)} />
                    </Tooltip>
                    <Tooltip content="Delete" relationship="label">
                      <Button appearance="subtle" icon={<DeleteRegular />} size="small" onClick={() => setDeleteTarget(user)} />
                    </Tooltip>
                  </div>
                </div>
                <div className={styles.cardMeta}>
                  <div className={styles.metaItem}>
                    <Text className={styles.metaLabel}>Roles</Text>
                    <Text className={styles.metaValue}>
                      {user.roleNames?.length ? user.roleNames.join(', ') : 'None'}
                    </Text>
                  </div>
                  <div className={styles.metaItem}>
                    <Text className={styles.metaLabel}>Created</Text>
                    <Text className={styles.metaValue}>
                      {user.createdAt ? new Date(user.createdAt).toLocaleString('en-GB') : '—'}
                    </Text>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(e, data) => { if (!data.open) setDialogOpen(false); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{editingUser ? `Edit ${editingUser.email}` : 'Add User'}</DialogTitle>
            <DialogContent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {!editingUser && (
                  <Field label="Email" required>
                    <Input
                      value={formData.email}
                      onChange={(e, d) => setFormData((prev) => ({ ...prev, email: d.value }))}
                      placeholder="user@example.com"
                      type="email"
                    />
                  </Field>
                )}
                <Field label="Status">
                  <Dropdown
                    value={formData.status}
                    selectedOptions={[formData.status]}
                    onOptionSelect={(e, d) => setFormData((prev) => ({ ...prev, status: d.optionValue }))}
                  >
                    <Option value="pending">pending</Option>
                    <Option value="active">active</Option>
                    <Option value="disabled">disabled</Option>
                  </Dropdown>
                </Field>
                <Field label="Roles">
                  <div className={styles.roleChecks}>
                    {roles.length === 0 && (
                      <Text className={styles.hint}>No roles defined yet — create one on the Roles page first.</Text>
                    )}
                    {roles.map((role) => (
                      <Checkbox
                        key={role._id}
                        label={role.name}
                        checked={formData.roleIds.includes(role._id)}
                        onChange={(e, d) => toggleRole(role._id, d.checked)}
                      />
                    ))}
                  </div>
                </Field>
                <Text className={styles.hint}>
                  An active user with no roles can sign in but sees nothing (default deny).
                </Text>
              </div>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">Cancel</Button>
              </DialogTrigger>
              <Button appearance="primary" onClick={handleSaveUser} disabled={saving}>
                {saving ? 'Saving...' : (editingUser ? 'Update' : 'Add')}
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
        title="Delete User"
        message={`Delete "${deleteTarget?.email}"? They will be re-created as pending on their next visit while their Cloudflare Access policy still admits them.`}
      />
    </div>
  );
}
