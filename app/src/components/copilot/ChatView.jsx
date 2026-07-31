import { useEffect, useRef } from 'react';
import { makeStyles, tokens, Text, Spinner } from '@fluentui/react-components';
import SafeMarkdown from '../SafeMarkdown.jsx';

const useStyles = makeStyles({
  root: { flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' },
  row: { display: 'flex', flexDirection: 'column', gap: '2px' },
  userRow: { alignItems: 'flex-end' },
  assistantRow: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '85%',
    padding: '8px 12px',
    borderRadius: tokens.borderRadiusLarge,
    fontSize: tokens.fontSizeBase300,
    lineHeight: '1.4',
    wordBreak: 'break-word',
  },
  userBubble: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    whiteSpace: 'pre-wrap',
  },
  assistantBubble: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground1,
  },
  activity: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontStyle: 'italic',
  },
  errorBubble: {
    backgroundColor: tokens.colorPaletteRedBackground2,
    color: tokens.colorPaletteRedForeground1,
    whiteSpace: 'pre-wrap',
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: tokens.colorNeutralForeground3,
    textAlign: 'center',
    padding: '24px',
  },
});

// Assistant output is untrusted LLM text — render it through SafeMarkdown, which
// sanitises raw HTML (MDEditor's renderer hardcodes rehype-raw). See SafeMarkdown.jsx.
function AssistantContent({ text }) {
  return (
    <div data-color-mode="light">
      <SafeMarkdown source={text || ''} style={{ background: 'transparent', fontSize: 'inherit' }} />
    </div>
  );
}

export default function ChatView({ messages, streaming, activity, error }) {
  const styles = useStyles();
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming, activity]);

  const hasContent = messages.length > 0 || streaming || activity || error;

  if (!hasContent) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>
          <Text size={300}>Ask a question to get started. The assistant answers from what you tell it.</Text>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {messages.map((m, i) => (
        <div key={i} className={`${styles.row} ${m.role === 'user' ? styles.userRow : styles.assistantRow}`}>
          <div className={`${styles.bubble} ${m.role === 'user' ? styles.userBubble : styles.assistantBubble}`}>
            {m.role === 'user' ? m.content : <AssistantContent text={m.content} />}
          </div>
        </div>
      ))}

      {streaming != null && (
        <div className={`${styles.row} ${styles.assistantRow}`}>
          <div className={`${styles.bubble} ${styles.assistantBubble}`}>
            {streaming ? <AssistantContent text={streaming} /> : <Spinner size="tiny" />}
          </div>
        </div>
      )}

      {activity && (
        <div className={styles.activity}>
          <Spinner size="tiny" /> <span>{activity}</span>
        </div>
      )}

      {error && (
        <div className={`${styles.row} ${styles.assistantRow}`}>
          <div className={`${styles.bubble} ${styles.errorBubble}`}>{error}</div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
