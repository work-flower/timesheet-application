import { useState } from 'react';
import { makeStyles, tokens, Textarea, Button } from '@fluentui/react-components';
import { SendRegular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-end',
    padding: '12px',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  textarea: { flex: 1 },
});

// P1: plain composer. The @mention picker (single-turn agent routing) arrives
// with the agents collection in P3.
export default function ChatInput({ onSend, disabled }) {
  const styles = useStyles();
  const [value, setValue] = useState('');

  const send = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className={styles.root}>
      <Textarea
        className={styles.textarea}
        value={value}
        onChange={(e, d) => setValue(d.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask the assistant…"
        resize="vertical"
        rows={2}
      />
      <Button appearance="primary" icon={<SendRegular />} onClick={send} disabled={disabled || !value.trim()} />
    </div>
  );
}
