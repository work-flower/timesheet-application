import { makeStyles, tokens, Text, Button, Badge, Spinner } from '@fluentui/react-components';
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
    rowGap: '2px',
    fontSize: tokens.fontSizeBase200,
  },
  argKey: { color: tokens.colorNeutralForeground3 },
  argValue: { fontFamily: 'monospace', wordBreak: 'break-word' },
  actions: { display: 'flex', gap: '8px', alignItems: 'center' },
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

/**
 * Action card — a proposed WRITE tool call awaiting user confirmation.
 * Args render as plain React text (inherently escaped — model-authored values
 * never hit a markdown/HTML path here); assistant narration around the card
 * stays in the SafeMarkdown bubbles.
 */
export default function ActionCard({ proposal, onConfirm, onDecline, busy, disabled }) {
  const styles = useStyles();
  const { proposalId, name, input, agent, status = 'pending', result } = proposal;
  const args = Object.entries(input || {});
  const badge = STATUS_BADGE[status];

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
              <span className={styles.argValue}>{formatValue(v)}</span>
            </div>
          ))}
        </div>
      )}

      {status === 'pending' && (
        <div className={styles.actions}>
          <Button
            appearance="primary"
            size="small"
            icon={busy ? <Spinner size="tiny" /> : <CheckmarkRegular />}
            disabled={busy || disabled}
            onClick={() => onConfirm?.(proposalId)}
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
            Nothing is saved until you confirm.
          </Text>
        </div>
      )}

      {status !== 'pending' && result && <div className={styles.result}>{result}</div>}
    </div>
  );
}
