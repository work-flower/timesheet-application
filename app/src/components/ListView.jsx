import { makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    padding: '10px 16px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  topLine: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginLeft: 'auto',
    flexShrink: 0,
  },
  bottomLine: {
    paddingLeft: '78px',
    paddingTop: '2px',
  },
});

export default function ListView({ items, getRowId, onItemClick, renderTopLine, renderBottomLine, renderActions }) {
  const styles = useStyles();

  return (
    <div className={styles.container}>
      {items.map((item) => {
        const bottom = renderBottomLine?.(item);
        return (
          <div
            key={getRowId(item)}
            className={styles.row}
            onClick={() => onItemClick?.(item)}
          >
            <div className={styles.topLine}>
              {renderTopLine(item)}
              {renderActions && (
                <div className={styles.actions}>
                  {renderActions(item)}
                </div>
              )}
            </div>
            {bottom && (
              <div className={styles.bottomLine}>
                {bottom}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
