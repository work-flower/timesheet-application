import { makeStyles, mergeClasses, tokens, Text } from '@fluentui/react-components';

const useStyles = makeStyles({
  section: {
    padding: '16px 0',
  },
  sectionTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    marginBottom: '16px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    '@media (max-width: 768px)': {
      gridTemplateColumns: '1fr',
    },
  },
  fullWidth: {
    gridColumn: 'span 2',
    '@media (max-width: 768px)': {
      gridColumn: 'span 1',
    },
  },
  changed: {
    borderLeft: `3px solid ${tokens.colorBrandStroke1}`,
    paddingLeft: '8px',
    backgroundColor: tokens.colorBrandBackground2,
    borderRadius: tokens.borderRadiusSmall,
  },
});

export function FormSection({ title, children }) {
  const styles = useStyles();
  return (
    <div className={styles.section}>
      {title && <Text className={styles.sectionTitle} block>{title}</Text>}
      <div className={styles.grid}>{children}</div>
    </div>
  );
}

export function FormField({ fullWidth, changed, children }) {
  const styles = useStyles();
  const className = mergeClasses(
    fullWidth ? styles.fullWidth : undefined,
    changed ? styles.changed : undefined,
  );
  return <div className={className}>{children}</div>;
}
