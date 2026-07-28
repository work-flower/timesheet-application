import { useState, useEffect, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Spinner,
  Badge,
  MessageBar,
  MessageBarBody,
  Tooltip,
} from '@fluentui/react-components';
import { AddRegular, DeleteRegular, EditRegular, KeyRegular } from '@fluentui/react-icons';
import { rolesApi } from '../../api/index.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import useAppNavigate from '../../hooks/useAppNavigate.js';

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
});

export default function RolesPage() {
  const styles = useStyles();
  const { navigate } = useAppNavigate();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
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

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.pageBody}>
        <div className={styles.header}>
          <Text className={styles.title}>Roles</Text>
          <Button appearance="primary" icon={<AddRegular />} onClick={() => navigate('/access/roles/new')} size="small">
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
                      <Button
                        appearance="subtle"
                        icon={<EditRegular />}
                        size="small"
                        onClick={() => navigate(`/access/roles/${role._id}`)}
                      />
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
