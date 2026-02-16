import { Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import { InfoRegular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'help',
    color: tokens.colorNeutralForeground3,
    fontSize: '14px',
    padding: '2px',
    borderRadius: '50%',
    '&:hover': {
      color: tokens.colorBrandForeground1,
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  content: {
    maxWidth: '320px',
    fontSize: tokens.fontSizeBase200,
    lineHeight: '1.5',
  },
  heading: {
    fontWeight: tokens.fontWeightSemibold,
    display: 'block',
    marginBottom: '2px',
    color: tokens.colorNeutralForeground1,
  },
  section: {
    display: 'block',
    marginBottom: '6px',
  },
  label: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
  },
});

/**
 * Info icon with a rich tooltip explaining a dashboard card.
 *
 * @param {Object} props
 * @param {string} props.calculation - How the metric is calculated
 * @param {string} props.purpose - What purpose this metric serves
 * @param {string} props.attention - When to pay attention
 * @param {string} [props.crossCheck] - Cross-checks with other cards
 */
export default function InfoTooltip({ calculation, purpose, attention, crossCheck }) {
  const styles = useStyles();

  const content = (
    <div className={styles.content}>
      <span className={styles.section}>
        <span className={styles.label}>Calculation: </span>
        {calculation}
      </span>
      <span className={styles.section}>
        <span className={styles.label}>Purpose: </span>
        {purpose}
      </span>
      <span className={styles.section}>
        <span className={styles.label}>Attention: </span>
        {attention}
      </span>
      {crossCheck && (
        <span className={styles.section}>
          <span className={styles.label}>Cross-check: </span>
          {crossCheck}
        </span>
      )}
    </div>
  );

  return (
    <Tooltip content={content} relationship="description" positioning="above" withArrow>
      <span className={styles.trigger} tabIndex={0} role="img" aria-label="More information">
        <InfoRegular />
      </span>
    </Tooltip>
  );
}
