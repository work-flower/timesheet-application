import { useState } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Select,
  Button,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import {
  ChevronDownRegular,
  ChevronRightRegular,
  SaveRegular,
} from '@fluentui/react-icons';

const useStyles = makeStyles({
  container: {
    marginBottom: '16px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  body: {
    padding: '0 16px 16px',
  },
  table: {
    width: '100%',
    maxWidth: '500px',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '6px 12px',
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  td: {
    padding: '4px 12px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    verticalAlign: 'middle',
  },
  sourceField: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '12px',
  },
  warning: {
    marginBottom: '8px',
  },
});

const TARGET_OPTIONS = [
  { value: '', label: '(ignore)' },
  { value: 'date', label: 'Transaction Date' },
  { value: 'description', label: 'Transaction Description' },
  { value: 'amount', label: 'Transaction Amount' },
  { value: 'balance', label: 'Transaction Balance' },
];

const REQUIRED_TARGETS = ['date', 'description', 'amount'];

export function autoDetectMapping(sourceFields) {
  const mapping = {};
  for (const field of sourceFields) {
    const lower = field.toLowerCase();
    if (lower === 'date' || lower.includes('date')) {
      mapping[field] = mapping[field] || 'date';
    } else if (lower === 'description' || lower.includes('description') || lower.includes('narrative') || lower.includes('details')) {
      mapping[field] = mapping[field] || 'description';
    } else if (lower === 'amount' || lower.includes('amount') || lower.includes('value')) {
      mapping[field] = mapping[field] || 'amount';
    } else if (lower === 'balance' || lower.includes('balance')) {
      mapping[field] = mapping[field] || 'balance';
    } else {
      mapping[field] = null;
    }
  }

  // Deduplicate: if multiple source fields map to the same target, keep only the first exact match
  const usedTargets = new Set();
  for (const field of sourceFields) {
    const target = mapping[field];
    if (target) {
      if (usedTargets.has(target)) {
        mapping[field] = null;
      } else {
        usedTargets.add(target);
      }
    }
  }

  return mapping;
}

export function getMissingRequiredTargets(fieldMapping) {
  const mappedTargets = new Set(Object.values(fieldMapping).filter(Boolean));
  return REQUIRED_TARGETS.filter((t) => !mappedTargets.has(t));
}

export default function FieldMappingConfig({ sourceFields, fieldMapping, onMappingChange, onSave, saving }) {
  const styles = useStyles();
  const [expanded, setExpanded] = useState(true);

  const missing = getMissingRequiredTargets(fieldMapping);
  const isValid = missing.length === 0;

  const handleTargetChange = (sourceField, targetValue) => {
    const newMapping = { ...fieldMapping, [sourceField]: targetValue || null };
    onMappingChange(newMapping);
  };

  // Determine which targets are already used (for disabling duplicates)
  const usedTargets = new Set();
  for (const [, target] of Object.entries(fieldMapping)) {
    if (target) usedTargets.add(target);
  }

  return (
    <div className={styles.container}>
      <div className={styles.header} onClick={() => setExpanded((v) => !v)}>
        <div className={styles.headerLeft}>
          {expanded ? <ChevronDownRegular /> : <ChevronRightRegular />}
          <Text weight="semibold">Field Mapping</Text>
          {!isValid && <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>({missing.length} required field{missing.length > 1 ? 's' : ''} unmapped)</Text>}
        </div>
      </div>
      {expanded && (
        <div className={styles.body}>
          {!isValid && (
            <MessageBar intent="warning" className={styles.warning}>
              <MessageBarBody>
                Required fields not mapped: {missing.join(', ')}. Transform is disabled until all required fields are mapped.
              </MessageBarBody>
            </MessageBar>
          )}
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Staged Transaction Field</th>
                <th className={styles.th}>Maps To</th>
              </tr>
            </thead>
            <tbody>
              {sourceFields.map((field) => (
                <tr key={field}>
                  <td className={styles.td}>
                    <span className={styles.sourceField}>{field}</span>
                  </td>
                  <td className={styles.td}>
                    <Select
                      size="small"
                      value={fieldMapping[field] || ''}
                      onChange={(e, data) => handleTargetChange(field, data.value)}
                      style={{ minWidth: 140 }}
                    >
                      {TARGET_OPTIONS.map((opt) => (
                        <option
                          key={opt.value}
                          value={opt.value}
                          disabled={opt.value && usedTargets.has(opt.value) && fieldMapping[field] !== opt.value}
                        >
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.actions}>
            <Button
              appearance="primary"
              icon={<SaveRegular />}
              size="small"
              onClick={onSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Mapping'}
            </Button>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3, fontStyle: 'italic' }}>
              Mapping controls direct field addressing on the Transaction record. The full staged transaction data is always preserved in the Transaction source field.
            </Text>
          </div>
        </div>
      )}
    </div>
  );
}
