import { useState } from 'react';
import { makeStyles, tokens, Text, Button, Badge, Spinner, Input, Switch } from '@fluentui/react-components';
import { CheckmarkRegular, DismissRegular, WrenchRegular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  card: {
    maxWidth: '85%',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeft: `3px solid ${tokens.colorBrandStroke1}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  header: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  toolName: { fontFamily: 'monospace', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  byline: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  args: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    columnGap: '12px',
    rowGap: '4px',
    alignItems: 'center',
    fontSize: tokens.fontSizeBase200,
  },
  argKey: { color: tokens.colorNeutralForeground3 },
  argValue: { fontFamily: 'monospace', wordBreak: 'break-word' },
  argInput: { fontFamily: 'monospace', minWidth: 0 },
  actions: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
  result: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
});

const STATUS_BADGE = {
  confirmed: { color: 'success', label: 'Confirmed' },
  declined: { color: 'subtle', label: 'Declined' },
  failed: { color: 'danger', label: 'Failed' },
};

function formatValue(v) {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Only primitives are editable in place; objects/arrays/null stay read-only.
function isEditable(v) {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

/** Coerce an edited string back to the ORIGINAL value's primitive type. */
function coerce(edited, original) {
  if (typeof original === 'boolean') return !!edited;
  if (typeof original === 'number') {
    const n = Number(edited);
    return edited !== '' && Number.isFinite(n) ? n : edited;
  }
  return edited;
}

/**
 * Action card — a proposed WRITE tool call awaiting user confirmation.
 * While pending, primitive arguments are editable so the user can fix a minor
 * slip (7.5h typed as 8) instead of declining and re-asking; Confirm sends
 * only the keys that changed, and the server whitelists them against the
 * tool's schema. Args render as plain React text / Fluent inputs (inherently
 * escaped — model-authored values never hit a markdown/HTML path here);
 * assistant narration around the card stays in the SafeMarkdown bubbles.
 */
export default function ActionCard({ proposal, onConfirm, onDecline, busy, disabled }) {
  const styles = useStyles();
  const { proposalId, name, input, agent, status = 'pending', result } = proposal;
  const args = Object.entries(input || {});
  const badge = STATUS_BADGE[status];
  const pending = status === 'pending';
  const [edits, setEdits] = useState({}); // key → edited value (changed keys only)

  const currentValue = (k, v) => (k in edits ? edits[k] : v);

  const confirm = () => {
    const changed = {};
    for (const [k, v] of Object.entries(edits)) {
      const value = coerce(v, input?.[k]);
      if (value !== input?.[k]) changed[k] = value;
    }
    onConfirm?.(proposalId, Object.keys(changed).length ? changed : undefined);
  };

  const renderValue = (k, v) => {
    if (!pending || !isEditable(v)) return <span className={styles.argValue}>{formatValue(v)}</span>;
    if (typeof v === 'boolean') {
      return (
        <Switch
          checked={!!currentValue(k, v)}
          disabled={busy || disabled}
          onChange={(e, d) => setEdits((prev) => ({ ...prev, [k]: d.checked }))}
        />
      );
    }
    return (
      <Input
        size="small"
        className={styles.argInput}
        type={typeof v === 'number' ? 'number' : 'text'}
        value={String(currentValue(k, v) ?? '')}
        disabled={busy || disabled}
        onChange={(e, d) => setEdits((prev) => ({ ...prev, [k]: d.value }))}
      />
    );
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <WrenchRegular style={{ fontSize: 16, flexShrink: 0 }} />
        <span className={styles.toolName}>{name}</span>
        <Badge appearance="tint" size="small" color="warning">write</Badge>
        {agent && <span className={styles.byline}>proposed by @{agent}</span>}
        {badge && <Badge appearance="filled" size="small" color={badge.color}>{badge.label}</Badge>}
      </div>

      {args.length > 0 && (
        <div className={styles.args}>
          {args.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <span className={styles.argKey}>{k}</span>
              {renderValue(k, v)}
            </div>
          ))}
        </div>
      )}

      {pending && (
        <div className={styles.actions}>
          <Button
            appearance="primary"
            size="small"
            icon={busy ? <Spinner size="tiny" /> : <CheckmarkRegular />}
            disabled={busy || disabled}
            onClick={confirm}
          >
            Confirm
          </Button>
          <Button
            appearance="secondary"
            size="small"
            icon={<DismissRegular />}
            disabled={busy || disabled}
            onClick={() => onDecline?.(proposalId)}
          >
            Decline
          </Button>
          <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
            Adjust values if needed — nothing is saved until you confirm.
          </Text>
        </div>
      )}

      {!pending && result && <div className={styles.result}>{result}</div>}
    </div>
  );
}
