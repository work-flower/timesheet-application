import { useState, useEffect } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Select,
  Button,
  MessageBar,
  MessageBarBody,
  Spinner,
} from '@fluentui/react-components';
import {
  ChevronDownRegular,
  ChevronRightRegular,
  SaveRegular,
} from '@fluentui/react-icons';
import { transactionsApi } from '../../api/index.js';

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

// Module-level cache — fetched once per session
let cachedSchema = null;

/**
 * Extract mappable target fields from transaction JSON Schema.
 * Returns array of { value, label, required }.
 */
function extractTargetFields(schema) {
  if (!schema?.properties) return [];
  return Object.entries(schema.properties)
    .filter(([, prop]) => prop['x-mappable'])
    .map(([key, prop]) => ({
      value: key,
      label: prop.title || key,
      required: (schema.required || []).includes(key),
    }));
}

export function autoDetectMapping(sourceFields, schema) {
  const targetFields = extractTargetFields(schema || cachedSchema);
  const targetValues = new Set(targetFields.map((t) => t.value));

  const mapping = {};
  for (const field of sourceFields) {
    const lower = field.toLowerCase();
    // Try exact match first
    if (targetValues.has(field)) {
      mapping[field] = field;
    } else if (targetValues.has(lower)) {
      mapping[field] = lower;
    } else if (targetValues.has('date') && (lower === 'date' || lower.includes('date'))) {
      mapping[field] = mapping[field] || 'date';
    } else if (targetValues.has('description') && (lower === 'description' || lower.includes('description') || lower.includes('narrative') || lower.includes('details'))) {
      mapping[field] = mapping[field] || 'description';
    } else if (targetValues.has('amount') && (lower === 'amount' || lower.includes('amount') || lower.includes('value'))) {
      mapping[field] = mapping[field] || 'amount';
    } else if (targetValues.has('reference') && (lower === 'reference' || lower.includes('reference') || lower.includes('ref'))) {
      mapping[field] = mapping[field] || 'reference';
    } else if (targetValues.has('accountName') && (lower.includes('account') && lower.includes('name'))) {
      mapping[field] = mapping[field] || 'accountName';
    } else if (targetValues.has('accountNumber') && (lower.includes('account') && lower.includes('number'))) {
      mapping[field] = mapping[field] || 'accountNumber';
    } else {
      mapping[field] = null;
    }
  }

  // Deduplicate: if multiple source fields map to the same target, keep only the first
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

export function getMissingRequiredTargets(fieldMapping, schema) {
  const targetFields = extractTargetFields(schema || cachedSchema);
  const requiredTargets = targetFields.filter((t) => t.required).map((t) => t.value);
  const mappedTargets = new Set(Object.values(fieldMapping).filter(Boolean));
  return requiredTargets.filter((t) => !mappedTargets.has(t));
}

export default function FieldMappingConfig({ sourceFields, fieldMapping, onMappingChange, onSave, saving }) {
  const styles = useStyles();
  const [expanded, setExpanded] = useState(() => localStorage.getItem('stagedTx.mappingExpanded') !== 'false');
  useEffect(() => { localStorage.setItem('stagedTx.mappingExpanded', String(expanded)); }, [expanded]);

  const [targetFields, setTargetFields] = useState(() => extractTargetFields(cachedSchema));
  const [loadingSchema, setLoadingSchema] = useState(!cachedSchema);

  useEffect(() => {
    if (cachedSchema) return;
    transactionsApi.getMetadata()
      .then((schema) => {
        cachedSchema = schema;
        setTargetFields(extractTargetFields(schema));
      })
      .finally(() => setLoadingSchema(false));
  }, []);

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
          {loadingSchema ? (
            <Spinner size="tiny" label="Loading target fields..." />
          ) : (
            <>
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
                          <option value="">(ignore)</option>
                          {targetFields.map((opt) => (
                            <option
                              key={opt.value}
                              value={opt.value}
                              disabled={usedTargets.has(opt.value) && fieldMapping[field] !== opt.value}
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
