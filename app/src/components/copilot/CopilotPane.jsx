import { useState, useEffect, useCallback, useRef } from 'react';
import { makeStyles, tokens, Text, Button, Tooltip, Input } from '@fluentui/react-components';
import { DismissRegular, ArrowLeftRegular, ArrowMaximizeRegular, ArrowMinimizeRegular } from '@fluentui/react-icons';
import { conversationsApi } from '../../api/index.js';
import { streamChat, streamProposalConfirm } from '../../api/copilotStream.js';
import { usePageContentPublisher } from '../../hooks/usePageContentPublisher.js';
import ConversationList from './ConversationList.jsx';
import ChatView from './ChatView.jsx';
import ChatInput from './ChatInput.jsx';

// Pane width is user-resizable (drag the left edge, or the expand toggle) and
// persisted per client in localStorage — long agent responses need the room.
const WIDTH_STORAGE_KEY = 'copilot-pane-width';
const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 320;
const maxWidth = () => Math.min(900, Math.round(window.innerWidth * 0.75));
const wideWidth = () => Math.min(820, Math.round(window.innerWidth * 0.7));
const clampWidth = (w) => Math.max(MIN_WIDTH, Math.min(maxWidth(), Math.round(w)));

function loadStoredWidth() {
  const stored = Number(localStorage.getItem(WIDTH_STORAGE_KEY));
  return Number.isFinite(stored) && stored >= MIN_WIDTH ? clampWidth(stored) : DEFAULT_WIDTH;
}

const useStyles = makeStyles({
  pane: {
    position: 'relative',
    flexShrink: 0,
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  resizeHandle: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '5px',
    cursor: 'col-resize',
    zIndex: 5,
    '&:hover': { backgroundColor: tokens.colorBrandBackground2 },
  },
  resizeHandleActive: {
    backgroundColor: tokens.colorBrandBackground2Pressed,
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
  subjectInput: { flex: 1, minWidth: 0 },
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

  // Page-context service: runs exactly while this pane is mounted (open).
  // Publishes on mount/route change; purges on unmount; publishNow() gives
  // send-time freshness below.
  const { publishNow } = usePageContentPublisher();

  // -- Resizable width (persisted per client) --------------------------------
  const [width, setWidth] = useState(loadStoredWidth);
  const [resizing, setResizing] = useState(false);

  const persistWidth = (w) => localStorage.setItem(WIDTH_STORAGE_KEY, String(w));

  const onResizeStart = useCallback((e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setResizing(true);
    let latest = width;
    const onMove = (ev) => {
      latest = clampWidth(window.innerWidth - ev.clientX);
      setWidth(latest);
    };
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setResizing(false);
      persistWidth(clampWidth(window.innerWidth - ev.clientX));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [width]);

  const resetWidth = () => {
    setWidth(DEFAULT_WIDTH);
    persistWidth(DEFAULT_WIDTH);
  };

  const isWide = width >= (DEFAULT_WIDTH + wideWidth()) / 2;
  const toggleWide = () => {
    const next = isWide ? DEFAULT_WIDTH : wideWidth();
    setWidth(next);
    persistWidth(next);
  };


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

  // -- Editable conversation subject (auto-saves on blur/Enter) --------------
  // Display value derives from the list (so server-side auto-titling flows in
  // via loadList); subjectDraft is non-null only while the user is editing.
  const [subjectDraft, setSubjectDraft] = useState(null);
  const listTitle = conversations.find((c) => c._id === activeId)?.title || '';

  useEffect(() => { setSubjectDraft(null); }, [activeId]);

  const commitSubject = useCallback(async () => {
    if (subjectDraft == null) return;
    const next = subjectDraft.trim();
    setSubjectDraft(null);
    if (!next || next === listTitle) return;
    try {
      await conversationsApi.update(activeId, { title: next });
      await loadList();
    } catch (err) {
      setError(err.message);
    }
  }, [subjectDraft, listTitle, activeId, loadList]);


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

  // One stream handler shared by chat turns and proposal-confirm resumes.
  // The loop can produce text in several rounds separated by tool calls —
  // flushAssistant turns the buffer into a message bubble at each boundary.
  const makeStreamHandler = useCallback(() => {
    let assistantText = '';
    let currentAgent = null; // direct takeover (@mention / auto-route / resume)
    let consultedAgents = []; // specialists answered via master delegation
    const startedAt = Date.now(); // per turn — bubbles show elapsed-since-ask

    const flushAssistant = () => {
      if (!assistantText) return;
      const content = assistantText;
      const attribution = currentAgent
        ? { agent: currentAgent }
        : consultedAgents.length ? { agents: [...consultedAgents] } : {};
      // durationMs is session-only (not persisted): user-perceived elapsed
      // time since the message was sent, cumulative across the turn's rounds.
      setMessages((prev) => [...prev, { role: 'assistant', content, ...attribution, durationMs: Date.now() - startedAt }]);
      assistantText = '';
      setStreaming('');
    };

    const onEvent = (event) => {
      switch (event.type) {
        case 'text':
          assistantText += event.text;
          setActivity(null);
          setStreaming(assistantText);
          break;
        case 'thinking':
          setActivity('Thinking…');
          break;
        case 'agent':
          currentAgent = event.agent;
          setActivity(`@${event.agent} is answering…`);
          break;
        case 'consulted':
          consultedAgents = event.agents || [];
          break;
        case 'proposal':
          // A write was proposed — render its action card in place.
          flushAssistant();
          setMessages((prev) => [...prev, { role: 'proposal', ...event.proposal }]);
          setActivity(null);
          break;
        case 'proposal_resolved':
          setMessages((prev) => prev.map((m) => (
            m.role === 'proposal' && m.proposalId === event.proposalId
              ? { ...m, status: event.status, result: event.content }
              : m
          )));
          break;
        case 'tool_use':
          flushAssistant();
          setActivity(
            event.name === 'find_agent' ? 'Finding the right agent…'
              : event.name === 'ask_agent' ? `Asking @${event.input?.agent || 'a specialist'}…`
              : `Using ${event.name || 'a tool'}…`,
          );
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
    };

    return { onEvent, flushAssistant };
  }, []);

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

    // Snapshot the page BEFORE the turn starts so get_page_content sees
    // exactly what the user is looking at as they ask. publishNow swallows
    // failures — a missed snapshot never blocks the message.
    await publishNow();

    const controller = new AbortController();
    abortRef.current = controller;
    const handler = makeStreamHandler();

    await streamChat(conversationId, text, { signal: controller.signal, onEvent: handler.onEvent });

    setActivity(null);
    handler.flushAssistant();
    setStreaming(null);
    // Refresh titles/timestamps in the list.
    loadList();
    abortRef.current = null;
  }, [activeId, loadList, makeStreamHandler, publishNow]);

  // -- Action-card proposals -------------------------------------------------
  const [busyProposalId, setBusyProposalId] = useState(null);

  // Confirm executes the write server-side and RESUMES the proposing agent's
  // loop — a stream, handled exactly like a chat turn.
  const confirmProposal = useCallback(async (proposalId) => {
    if (!activeId || streaming != null) return;
    setError(null);
    setBusyProposalId(proposalId);
    setStreaming('');
    setActivity('Executing…');

    const controller = new AbortController();
    abortRef.current = controller;
    const handler = makeStreamHandler();

    await streamProposalConfirm(activeId, proposalId, { signal: controller.signal, onEvent: handler.onEvent });

    setActivity(null);
    handler.flushAssistant();
    setStreaming(null);
    setBusyProposalId(null);
    loadList();
    abortRef.current = null;
  }, [activeId, streaming, makeStreamHandler, loadList]);

  const declineProposal = useCallback(async (proposalId) => {
    if (!activeId) return;
    setBusyProposalId(proposalId);
    try {
      await conversationsApi.declineProposal(activeId, proposalId);
      setMessages((prev) => prev.map((m) => (
        m.role === 'proposal' && m.proposalId === proposalId ? { ...m, status: 'declined' } : m
      )));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyProposalId(null);
    }
  }, [activeId]);

  // Abort any in-flight stream on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const busy = streaming != null;

  return (
    <div
      className={styles.pane}
      style={{ width, transition: resizing ? 'none' : 'width 150ms ease' }}
    >
      {/* Drag to resize; double-click to reset to the default width. */}
      <div
        className={`${styles.resizeHandle} ${resizing ? styles.resizeHandleActive : ''}`}
        onPointerDown={onResizeStart}
        onDoubleClick={resetWidth}
        title="Drag to resize — double-click to reset"
      />
      <div className={styles.header}>
        {activeId != null && (
          <Tooltip content="Back to conversations" relationship="label">
            <Button appearance="subtle" size="small" icon={<ArrowLeftRegular />} onClick={() => setActiveId(null)} />
          </Tooltip>
        )}
        {activeId == null ? (
          <Text className={styles.title}>Assistant</Text>
        ) : (
          <Input
            className={styles.subjectInput}
            appearance="underline"
            size="small"
            value={subjectDraft ?? listTitle}
            placeholder="Conversation subject…"
            onFocus={() => setSubjectDraft(listTitle)}
            onChange={(e, d) => setSubjectDraft(d.value)}
            onBlur={commitSubject}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setSubjectDraft(null);
            }}
            title="Conversation subject — saves automatically"
          />
        )}
        <Tooltip content={isWide ? 'Restore width' : 'Expand'} relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={isWide ? <ArrowMinimizeRegular /> : <ArrowMaximizeRegular />}
            onClick={toggleWide}
          />
        </Tooltip>
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
          <ChatView
            messages={messages}
            streaming={streaming}
            activity={activity}
            error={error}
            onConfirmProposal={confirmProposal}
            onDeclineProposal={declineProposal}
            busyProposalId={busyProposalId}
            proposalsDisabled={busy}
          />
          <ChatInput onSend={send} disabled={busy} />
        </div>
      )}
    </div>
  );
}
