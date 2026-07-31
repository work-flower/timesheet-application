import { makeStyles, tokens, Text, Button, Spinner, Tooltip } from '@fluentui/react-components';
import { AddRegular, DeleteRegular, ChatRegular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', height: '100%' },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  headerTitle: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  list: { flex: 1, overflowY: 'auto', padding: '4px' },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    '&:hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  itemActive: { backgroundColor: tokens.colorNeutralBackground1Selected },
  itemTitle: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: tokens.fontSizeBase200,
  },
  empty: { padding: '24px 12px', textAlign: 'center', color: tokens.colorNeutralForeground3 },
});

export default function ConversationList({ conversations, loading, activeId, onSelect, onCreate, onDelete }) {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Text className={styles.headerTitle}>Conversations</Text>
        <Button appearance="subtle" size="small" icon={<AddRegular />} onClick={onCreate}>New</Button>
      </div>
      <div className={styles.list}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center' }}><Spinner size="tiny" label="Loading…" /></div>
        ) : conversations.length === 0 ? (
          <div className={styles.empty}>
            <ChatRegular style={{ fontSize: 32, display: 'block', margin: '0 auto 8px' }} />
            <Text size={200}>No conversations yet.</Text>
          </div>
        ) : (
          conversations.map((c) => (
            <div
              key={c._id}
              className={`${styles.item} ${c._id === activeId ? styles.itemActive : ''}`}
              onClick={() => onSelect(c._id)}
            >
              <ChatRegular style={{ fontSize: 16, flexShrink: 0 }} />
              <span className={styles.itemTitle}>{c.title || 'Untitled'}</span>
              <Tooltip content="Delete" relationship="label">
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<DeleteRegular />}
                  onClick={(e) => { e.stopPropagation(); onDelete(c._id); }}
                />
              </Tooltip>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
