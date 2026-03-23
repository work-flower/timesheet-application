import { makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  container: {
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: '12px',
    lineHeight: '1.5',
    overflow: 'auto',
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    padding: '12px',
    maxHeight: '500px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  added: {
    backgroundColor: '#e6ffed',
    color: '#24292e',
  },
  removed: {
    backgroundColor: '#ffeef0',
    color: '#24292e',
  },
  header: {
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  meta: {
    color: tokens.colorNeutralForeground3,
  },
});

/**
 * Renders a unified diff with coloured lines. No external library.
 */
export default function DiffViewer({ diff }) {
  const styles = useStyles();

  if (!diff || !diff.trim()) {
    return (
      <div className={styles.container}>
        <span className={styles.meta}>No changes</span>
      </div>
    );
  }

  const lines = diff.split('\n');

  return (
    <div className={styles.container}>
      {lines.map((line, i) => {
        let className = '';
        if (line.startsWith('+') && !line.startsWith('+++')) {
          className = styles.added;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          className = styles.removed;
        } else if (line.startsWith('@@')) {
          className = styles.header;
        } else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
          className = styles.meta;
        }
        return (
          <div key={i} className={className}>
            {line}
          </div>
        );
      })}
    </div>
  );
}
