import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
import {
  AddRegular,
  DeleteRegular,
  EditRegular,
  ArrowSyncRegular,
  BotRegular,
  CrownRegular,
} from '@fluentui/react-icons';
import { agentCardsApi } from '../../api/index.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

const useStyles = makeStyles({
  page: { maxWidth: '1000px' },
  pageBody: { padding: '16px 24px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  title: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase500 },
  actions: { display: 'flex', gap: '8px' },
  cardList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  card: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '12px 16px',
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    '&:hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '8px' },
  cardName: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  slug: { fontFamily: 'monospace', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  cardHeaderActions: { marginLeft: 'auto', display: 'flex', gap: '4px' },
  description: {
    marginTop: '4px',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
});

export default function AgentCardsPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [rescanning, setRescanning] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    try {
      setCards(await agentCardsApi.getAll());
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

  const handleRescan = async () => {
    setRescanning(true);
    try {
      const result = await agentCardsApi.rescan();
      showMessage('success', `Rescanned: ${result.indexed} agent folder(s) indexed.`);
      await load();
    } catch (err) {
      showMessage('error', `Rescan failed: ${err.message}`);
    } finally {
      setRescanning(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await agentCardsApi.delete(deleteTarget.slug);
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
          <Text className={styles.title}>Agent Cards</Text>
          <div className={styles.actions}>
            <Tooltip content="Reindex agent folders on disk (after hand-editing or dropping in a card)" relationship="description">
              <Button appearance="outline" icon={<ArrowSyncRegular />} onClick={handleRescan} disabled={rescanning} size="small">
                {rescanning ? 'Rescanning...' : 'Rescan'}
              </Button>
            </Tooltip>
            <Button appearance="primary" icon={<AddRegular />} onClick={() => navigate('/agents/cards/new')} size="small">
              New Agent
            </Button>
          </div>
        </div>

        {message && (
          <MessageBar intent={message.intent} style={{ marginBottom: 16 }}>
            <MessageBarBody>{message.text}</MessageBarBody>
          </MessageBar>
        )}

        {cards.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: tokens.colorNeutralForeground3 }}>
            <BotRegular style={{ fontSize: '48px', display: 'block', margin: '0 auto 12px' }} />
            <Text>No agent cards yet. The master card is created automatically at server start.</Text>
          </div>
        ) : (
          <div className={styles.cardList}>
            {cards.map((card) => (
              <div key={card.slug} className={styles.card} onClick={() => navigate(`/agents/cards/${card.slug}`)}>
                <div className={styles.cardHeader}>
                  {card.isMaster ? <CrownRegular style={{ fontSize: 16 }} /> : <BotRegular style={{ fontSize: 16 }} />}
                  <Text className={styles.cardName}>{card.name}</Text>
                  <span className={styles.slug}>@{card.slug}</span>
                  {card.isMaster && <Badge appearance="filled" color="brand" size="small">Master</Badge>}
                  <Badge appearance="filled" color={card.enabled ? 'success' : 'warning'} size="small">
                    {card.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                  {card.hasPayloadTemplate && (
                    <Tooltip content="Overrides its provider's payload template" relationship="description">
                      <Badge appearance="tint" size="small">template override</Badge>
                    </Tooltip>
                  )}
                  <div className={styles.cardHeaderActions}>
                    <Tooltip content="Edit" relationship="label">
                      <Button
                        appearance="subtle" size="small" icon={<EditRegular />}
                        onClick={(e) => { e.stopPropagation(); navigate(`/agents/cards/${card.slug}`); }}
                      />
                    </Tooltip>
                    {!card.isMaster && (
                      <Tooltip content="Delete" relationship="label">
                        <Button
                          appearance="subtle" size="small" icon={<DeleteRegular />}
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(card); }}
                        />
                      </Tooltip>
                    )}
                  </div>
                </div>
                {card.description && <div className={styles.description}>{card.description}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Agent Card"
        message={`Delete "${deleteTarget?.name}" (@${deleteTarget?.slug})? Its folder — including agent.md, knowledge and skills — will be removed from disk.`}
      />
    </div>
  );
}
