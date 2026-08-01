import { useState, useEffect, useMemo, useRef } from 'react';
import { makeStyles, tokens, Textarea, Button, Text } from '@fluentui/react-components';
import { SendRegular, BotRegular } from '@fluentui/react-icons';
import { agentsApi } from '../../api/index.js';

const useStyles = makeStyles({
  root: {
    position: 'relative',
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-end',
    padding: '12px',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  textarea: { flex: 1 },
  mentionList: {
    position: 'absolute',
    bottom: '100%',
    left: '12px',
    right: '12px',
    marginBottom: '4px',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow8,
    overflow: 'hidden',
    zIndex: 10,
  },
  mentionItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    cursor: 'pointer',
    '&:hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  mentionSlug: { fontFamily: 'monospace', fontSize: tokens.fontSizeBase200 },
  mentionDesc: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

// Typing "@" at the start of the message opens the caller-scoped agent picker
// (the server only lists agents the user can see — visibility = talkability).
// An @mention routes a single turn directly to that specialist.
export default function ChatInput({ onSend, disabled }) {
  const styles = useStyles();
  const [value, setValue] = useState('');
  const [agents, setAgents] = useState([]);
  const inputRef = useRef(null);

  // Focus the composer when the conversation opens, and re-focus after a turn
  // completes (the textarea is disabled while streaming and drops focus).
  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  useEffect(() => {
    agentsApi.getAll()
      .then((list) => setAgents(list.filter((a) => !a.isMaster && a.enabled !== false)))
      .catch(() => setAgents([]));
  }, []);

  // Picker opens while the input is exactly an @-prefix being typed.
  const mentionQuery = useMemo(() => {
    const m = value.match(/^@([a-z0-9-]*)$/i);
    return m ? m[1].toLowerCase() : null;
  }, [value]);

  const mentionMatches = useMemo(() => {
    if (mentionQuery == null) return [];
    return agents.filter((a) => a.slug.startsWith(mentionQuery)).slice(0, 6);
  }, [mentionQuery, agents]);

  const pickMention = (slug) => setValue(`@${slug} `);

  const send = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (mentionMatches.length > 0) pickMention(mentionMatches[0].slug);
      else send();
    }
  };

  return (
    <div className={styles.root}>
      {mentionMatches.length > 0 && (
        <div className={styles.mentionList}>
          {mentionMatches.map((a) => (
            <div key={a.slug} className={styles.mentionItem} onClick={() => pickMention(a.slug)}>
              <BotRegular style={{ fontSize: 16, flexShrink: 0 }} />
              <span className={styles.mentionSlug}>@{a.slug}</span>
              <Text className={styles.mentionDesc}>{a.description || a.name}</Text>
            </div>
          ))}
        </div>
      )}
      <Textarea
        ref={inputRef}
        className={styles.textarea}
        value={value}
        onChange={(e, d) => setValue(d.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask the assistant… (@ to address an agent)"
        resize="vertical"
        rows={2}
      />
      <Button appearance="primary" icon={<SendRegular />} onClick={send} disabled={disabled || !value.trim()} />
    </div>
  );
}
