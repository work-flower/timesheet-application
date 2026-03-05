import { makeStyles, tokens, Text } from '@fluentui/react-components';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px 16px',
  },
  card: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '12px 16px',
    cursor: 'pointer',
    backgroundColor: tokens.colorNeutralBackground1,
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      borderColor: tokens.colorNeutralStroke1Hover,
    },
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
  },
  headerActions: {
    marginLeft: 'auto',
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginTop: '4px',
    paddingBottom: '8px',
  },
  footer: {
    marginTop: '8px',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingTop: '8px',
  },
  metaItem: {
    display: 'flex',
    flexDirection: 'column',
  },
  metaLabel: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  metaValue: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
});

export function CardMetaItem({ label, value }) {
  const styles = useStyles();
  return (
    <div className={styles.metaItem}>
      <Text className={styles.metaLabel}>{label}</Text>
      <Text className={styles.metaValue}>{value}</Text>
    </div>
  );
}

export default function CardView({ items, getRowId, onItemClick, renderHeader, renderMeta, renderFooter, renderActions }) {
  const styles = useStyles();

  return (
    <div className={styles.container}>
      {items.map((item) => {
        const footer = renderFooter?.(item);
        return (
          <div
            key={getRowId(item)}
            className={styles.card}
            onClick={() => onItemClick?.(item)}
          >
            <div className={styles.header}>
              {renderHeader(item)}
              {renderActions && (
                <div className={styles.headerActions}>
                  {renderActions(item)}
                </div>
              )}
            </div>
            {renderMeta && (
              <div className={styles.meta}>
                {renderMeta(item)}
              </div>
            )}
            {footer && (
              <div className={styles.footer}>
                {footer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
