import { useState, useEffect, useCallback, useRef } from 'react';
import { makeStyles, tokens, Text, Button, Tooltip } from '@fluentui/react-components';
import { DismissRegular, ArrowLeftRegular } from '@fluentui/react-icons';
import { conversationsApi } from '../../api/index.js';
import { streamChat } from '../../api/copilotStream.js';
import ConversationList from './ConversationList.jsx';
import ChatView from './ChatView.jsx';
import ChatInput from './ChatInput.jsx';

const PANE_WIDTH = '380px';

const useStyles = makeStyles({
  pane: {
    width: PANE_WIDTH,
    flexShrink: 0,
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    height: '48px',
    padding: '0 8px 0 12px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0,
  },
  title: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400, flex: 1 },
  chatArea: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 },
});

export default function CopilotPane({ onClose }) {
  const styles = useStyles();
  const [conversations, setConversations] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(null); // null = not streaming; string = partial text
  const [activity, setActivity] = useState(null);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const loadList = useCallback(async () => {
    try {
      const data = await conversationsApi.getAll();
      setConversations(Array.isArray(data) ? data : data.value || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const openConversation = useCallback(async (id) => {
    setActiveId(id);
    setError(null);
    setStreaming(null);
    setActivity(null);
    try {
      const conversation = await conversationsApi.getById(id);
      setMessages(conversation.messages || []);
    } catch (err) {
      setError(err.message);
      setMessages([]);
    }
  }, []);

  const createConversation = useCallback(async () => {
    try {
      const conversation = await conversationsApi.create();
      await loadList();
      setActiveId(conversation._id);
      setMessages([]);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [loadList]);

  const deleteConversation = useCallback(async (id) => {
    try {
      await conversationsApi.delete(id);
      if (id === activeId) {
        setActiveId(null);
        setMessages([]);
      }
      await loadList();
    } catch (err) {
      setError(err.message);
    }
  }, [activeId, loadList]);

  const send = useCallback(async (text) => {
    let conversationId = activeId;
    // Create a conversation on first message if none is active.
    if (!conversationId) {
      try {
        const conversation = await conversationsApi.create();
        conversationId = conversation._id;
        setActiveId(conversationId);
        loadList();
      } catch (err) {
        setError(err.message);
        return;
      }
    }

    setError(null);
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setStreaming('');
    setActivity('Thinking…');

    const controller = new AbortController();
    abortRef.current = controller;
    let assistantText = '';

    await streamChat(conversationId, text, {
      signal: controller.signal,
      onEvent: (event) => {
        switch (event.type) {
          case 'text':
            assistantText += event.text;
            setActivity(null);
            setStreaming(assistantText);
            break;
          case 'thinking':
            setActivity('Thinking…');
            break;
          case 'tool_use':
            setActivity(`Using ${event.name || 'a tool'}…`);
            break;
          case 'error':
            setError(event.message);
            setActivity(null);
            break;
          case 'done':
          case 'stop':
            break;
          default:
            break;
        }
      },
    });

    setActivity(null);
    setStreaming(null);
    if (assistantText) {
      setMessages((prev) => [...prev, { role: 'assistant', content: assistantText }]);
    }
    // Refresh titles/timestamps in the list.
    loadList();
    abortRef.current = null;
  }, [activeId, loadList]);

  // Abort any in-flight stream on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const busy = streaming != null;

  return (
    <div className={styles.pane}>
      <div className={styles.header}>
        {activeId != null && (
          <Tooltip content="Back to conversations" relationship="label">
            <Button appearance="subtle" size="small" icon={<ArrowLeftRegular />} onClick={() => setActiveId(null)} />
          </Tooltip>
        )}
        <Text className={styles.title}>Assistant</Text>
        <Tooltip content="Close" relationship="label">
          <Button appearance="subtle" size="small" icon={<DismissRegular />} onClick={onClose} />
        </Tooltip>
      </div>

      {activeId == null ? (
        <ConversationList
          conversations={conversations}
          loading={loadingList}
          activeId={activeId}
          onSelect={openConversation}
          onCreate={createConversation}
          onDelete={deleteConversation}
        />
      ) : (
        <div className={styles.chatArea}>
          <ChatView messages={messages} streaming={streaming} activity={activity} error={error} />
          <ChatInput onSend={send} disabled={busy} />
        </div>
      )}
    </div>
  );
}
