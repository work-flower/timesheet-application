import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Select,
  Button,
  InteractionTag,
  InteractionTagPrimary,
  Spinner,
  MessageBar,
  MessageBarBody,
  Tooltip,
  ToggleButton,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableCellLayout,
  createTableColumn,
} from '@fluentui/react-components';
import {
  SendRegular,
  DismissCircleRegular,
  WarningRegular,
} from '@fluentui/react-icons';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import PaginationControls from '../../components/PaginationControls.jsx';
import { usePagination } from '../../hooks/usePagination.js';
import FieldMappingConfig, { autoDetectMapping, getMissingRequiredTargets } from './FieldMappingConfig.jsx';
import { importJobsApi, stagedTransactionsApi, transactionsApi } from '../../api/index.js';

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: {
    padding: '16px 16px 0 16px',
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase500,
  },
  commandBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    gap: '4px',
    flexWrap: 'wrap',
  },
  filters: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 16px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexWrap: 'wrap',
  },
  filterToggleGroup: {
    display: 'flex',
    gap: '2px',
  },
  mappingSection: {
    padding: '12px 16px 0',
  },
  gridWrapper: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
  },
  summary: {
    display: 'flex',
    gap: '24px',
    padding: '12px 16px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  summaryItem: {
    display: 'flex',
    flexDirection: 'column',
  },
  summaryLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  summaryValue: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
  },
  message: {
    margin: '8px 16px',
  },
  unmappedCell: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '48px',
  },
  empty: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '48px',
    color: tokens.colorNeutralForeground3,
  },
});

const ACTION_VALUES = ['unmarked', 'transform', 'delete'];

const ACTION_LABELS = {
  unmarked: 'Unmarked',
  transform: 'Import',
  delete: 'Discard',
};

const ACTION_TAG_STYLES = {
  unmarked: {},
  transform: { backgroundColor: tokens.colorPaletteGreenBackground2, color: tokens.colorPaletteGreenForeground2 },
  delete: { backgroundColor: tokens.colorPaletteRedBackground2, color: tokens.colorPaletteRedForeground2 },
};

const ACTION_TOOLTIPS = {
  unmarked: 'This record will be skipped during submit',
  transform: 'This record will be imported as a transaction on submit',
  delete: 'This staged record will be discarded on submit',
};

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'unmarked', label: 'Unmarked' },
  { value: 'transform', label: 'Import' },
  { value: 'delete', label: 'Discard' },
];

const EXCLUDED_KEYS = new Set(['_id', 'importJobId', 'createdAt', 'updatedAt', 'compositeHash', 'action']);

export default function StagedTransactionReview() {
  const styles = useStyles();

  // State
  const [importJobs, setImportJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(() => localStorage.getItem('stagedTx.importJobId') || '');
  const [actionFilter, setActionFilter] = useState(() => localStorage.getItem('stagedTx.action') || 'all');
  const [stagedTxs, setStagedTxs] = useState([]);
  const [fieldMapping, setFieldMapping] = useState({});
  const [duplicateMap, setDuplicateMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [savingMapping, setSavingMapping] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [abandonConfirm, setAbandonConfirm] = useState(false);

  // Persist filters
  useEffect(() => { localStorage.setItem('stagedTx.importJobId', selectedJobId); }, [selectedJobId]);
  useEffect(() => { localStorage.setItem('stagedTx.action', actionFilter); }, [actionFilter]);

  // Load import jobs with ready_for_review status
  useEffect(() => {
    setJobsLoading(true);
    importJobsApi.getAll({ status: 'ready_for_review' })
      .then(setImportJobs)
      .catch((err) => setError(err.message))
      .finally(() => setJobsLoading(false));
  }, []);

  // Load data when job selected
  const loadJobData = useCallback(async (jobId) => {
    if (!jobId) {
      setStagedTxs([]);
      setFieldMapping({});
      setDuplicateMap({});
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [job, txs, dupes, schema] = await Promise.all([
        importJobsApi.getById(jobId),
        stagedTransactionsApi.getAll({ importJobId: jobId }),
        stagedTransactionsApi.checkDuplicates(jobId),
        transactionsApi.getMetadata(),
      ]);

      setStagedTxs(txs);
      setDuplicateMap(dupes);

      // Load or auto-detect field mapping
      if (job.fieldMapping && Object.keys(job.fieldMapping).length > 0) {
        setFieldMapping(job.fieldMapping);
      } else if (txs.length > 0) {
        const sourceFields = extractSourceFields(txs);
        const autoMapping = autoDetectMapping(sourceFields, schema);
        setFieldMapping(autoMapping);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobData(selectedJobId);
  }, [selectedJobId, loadJobData]);

  // Extract source fields from staged transactions
  const sourceFields = useMemo(() => {
    return extractSourceFields(stagedTxs);
  }, [stagedTxs]);

  // Filtered transactions (client-side filter by action)
  const filteredTxs = useMemo(() => {
    if (actionFilter === 'all') return stagedTxs;
    return stagedTxs.filter((tx) => tx.action === actionFilter);
  }, [stagedTxs, actionFilter]);

  const { pageItems, page, pageSize, setPage, setPageSize, totalPages, totalItems } = usePagination(filteredTxs);

  // Counts
  const unmarkedCount = stagedTxs.filter((tx) => tx.action === 'unmarked').length;
  const transformCount = stagedTxs.filter((tx) => tx.action === 'transform').length;
  const deleteCount = stagedTxs.filter((tx) => tx.action === 'delete').length;
  const duplicateCount = Object.keys(duplicateMap).length;
  const actionCount = transformCount + deleteCount;

  const mappingValid = getMissingRequiredTargets(fieldMapping).length === 0;

  // Save mapping
  const handleSaveMapping = async () => {
    if (!selectedJobId) return;
    setSavingMapping(true);
    try {
      await importJobsApi.update(selectedJobId, { fieldMapping });
      showSuccess('Field mapping saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingMapping(false);
    }
  };

  // Cycle action tag
  const handleCycleAction = async (txId, currentAction) => {
    const currentIndex = ACTION_VALUES.indexOf(currentAction || 'unmarked');
    const nextAction = ACTION_VALUES[(currentIndex + 1) % ACTION_VALUES.length];
    setError(null);
    try {
      await stagedTransactionsApi.update(txId, { action: nextAction });
      setStagedTxs((prev) => prev.map((tx) =>
        tx._id === txId ? { ...tx, action: nextAction } : tx
      ));
    } catch (err) {
      setError(err.message);
    }
  };

  // Submit batch
  const handleSubmit = async () => {
    if (!selectedJobId || !mappingValid || actionCount === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await stagedTransactionsApi.submit(selectedJobId, fieldMapping);

      // Remove transformed and deleted from local state
      const transformedIds = new Set(result.transformed.map((t) => t.source?._id).filter(Boolean));
      const deletedIds = new Set(result.deleted);
      setStagedTxs((prev) => prev.filter((tx) => !transformedIds.has(tx._id) && !deletedIds.has(tx._id)));

      if (result.errors.length > 0) {
        setError(`${result.transformed.length} imported, ${result.deleted.length} discarded, ${result.errors.length} failed: ${result.errors.map((e) => e.error).join('; ')}`);
      } else {
        showSuccess(`${result.transformed.length} imported, ${result.deleted.length} discarded.`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Abandon
  const handleAbandon = async () => {
    if (!selectedJobId) return;
    setError(null);
    try {
      await importJobsApi.abandon(selectedJobId);
      // Remove the job from the dropdown and clear selection
      setImportJobs((prev) => prev.filter((j) => j._id !== selectedJobId));
      setSelectedJobId('');
      setStagedTxs([]);
      showSuccess('Import job abandoned.');
    } catch (err) {
      setError(err.message);
    }
    setAbandonConfirm(false);
  };

  const showSuccess = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  // Build dynamic columns from field mapping
  const columns = useMemo(() => {
    const cols = [];

    // All source fields as read-only columns
    for (const sourceField of sourceFields) {
      const targetField = fieldMapping[sourceField];
      const isMapped = !!targetField;

      cols.push(createTableColumn({
        columnId: sourceField,
        compare: targetField === 'amount' || targetField === 'balance'
          ? (a, b) => (Number(a[sourceField]) || 0) - (Number(b[sourceField]) || 0)
          : (a, b) => (String(a[sourceField] ?? '')).localeCompare(String(b[sourceField] ?? '')),
        renderHeaderCell: () => sourceField,
        renderCell: (item) => {
          const value = item[sourceField];
          const isDuplicate = duplicateMap[item._id];
          return (
            <TableCellLayout>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {sourceField === sourceFields[0] && isDuplicate && (
                  <Tooltip content="Potential duplicate — a transaction with the same hash already exists" relationship="label">
                    <WarningRegular style={{ color: tokens.colorPaletteYellowForeground1, fontSize: '16px', flexShrink: 0 }} />
                  </Tooltip>
                )}
                <span className={!isMapped ? styles.unmappedCell : undefined}>{value ?? '—'}</span>
              </span>
            </TableCellLayout>
          );
        },
      }));
    }

    // Mark as column (last)
    cols.push(createTableColumn({
      columnId: '_action',
      renderHeaderCell: () => 'Mark as',
      renderCell: (item) => {
        const action = item.action || 'unmarked';
        return (
          <TableCellLayout>
            <Tooltip content={ACTION_TOOLTIPS[action]} relationship="label">
              <InteractionTag
                size="small"
                appearance="outline"
                shape="circular"
                onClick={(e) => { e.stopPropagation(); handleCycleAction(item._id, action); }}
                style={{ cursor: 'pointer', ...ACTION_TAG_STYLES[action] }}
              >
                <InteractionTagPrimary style={ACTION_TAG_STYLES[action]}>{ACTION_LABELS[action]}</InteractionTagPrimary>
              </InteractionTag>
            </Tooltip>
          </TableCellLayout>
        );
      },
    }));

    return cols;
  }, [fieldMapping, duplicateMap, sourceFields, styles.unmappedCell]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text className={styles.title}>Staged Transactions</Text>
      </div>

      {/* Command bar */}
      <div className={styles.commandBar}>
        <Button
          appearance="primary"
          icon={<SendRegular />}
          size="small"
          onClick={handleSubmit}
          disabled={!mappingValid || actionCount === 0 || submitting || !selectedJobId}
        >
          {submitting ? 'Submitting...' : `Submit (${actionCount} action${actionCount !== 1 ? 's' : ''})`}
        </Button>
        {selectedJobId && (
          <Button
            appearance="subtle"
            icon={<DismissCircleRegular />}
            size="small"
            onClick={() => setAbandonConfirm(true)}
          >
            Abandon
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <Text size={200} weight="semibold">Import Job:</Text>
        <Select
          size="small"
          value={selectedJobId}
          onChange={(e, data) => setSelectedJobId(data.value)}
          style={{ minWidth: 250 }}
          disabled={jobsLoading}
        >
          <option value="">— Select an import job —</option>
          {importJobs.map((job) => (
            <option key={job._id} value={job._id}>
              {job.filename} ({new Date(job.createdAt).toLocaleDateString('en-GB')})
            </option>
          ))}
        </Select>

        <Text size={200} weight="semibold">Action:</Text>
        <div className={styles.filterToggleGroup}>
          {FILTER_OPTIONS.map((opt) => (
            <ToggleButton
              key={opt.value}
              size="small"
              appearance={actionFilter === opt.value ? 'primary' : 'outline'}
              checked={actionFilter === opt.value}
              onClick={() => setActionFilter(opt.value)}
            >
              {opt.label}
            </ToggleButton>
          ))}
        </div>
      </div>
      <Text size={200} style={{ color: tokens.colorNeutralForeground3, fontStyle: 'italic', padding: '4px 16px 0' }}>
        Columns may vary between imports depending on the source file format.
      </Text>

      {/* Messages */}
      {error && <MessageBar intent="error" className={styles.message}><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {success && <MessageBar intent="success" className={styles.message}><MessageBarBody>{success}</MessageBarBody></MessageBar>}

      {/* Field mapping config */}
      {selectedJobId && sourceFields.length > 0 && (
        <div className={styles.mappingSection}>
          <FieldMappingConfig
            sourceFields={sourceFields}
            fieldMapping={fieldMapping}
            onMappingChange={setFieldMapping}
            onSave={handleSaveMapping}
            saving={savingMapping}
          />
        </div>
      )}

      {/* Grid */}
      <div className={styles.gridWrapper}>
        {!selectedJobId ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <Text style={{ color: tokens.colorNeutralForeground3 }}>Select an import job to review staged transactions.</Text>
          </div>
        ) : loading ? (
          <div className={styles.loading}><Spinner label="Loading..." /></div>
        ) : filteredTxs.length === 0 ? (
          <div className={styles.empty}><Text>No staged transactions found.</Text></div>
        ) : (
          <DataGrid
            items={pageItems}
            columns={columns}
            sortable
            getRowId={(item) => item._id}
            style={{ width: '100%' }}
          >
            <DataGridHeader>
              <DataGridRow>
                {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody>
              {({ item, rowId }) => (
                <DataGridRow key={rowId}>
                  {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        )}
      </div>

      <PaginationControls
        page={page} pageSize={pageSize} totalItems={totalItems}
        totalPages={totalPages} onPageChange={setPage} onPageSizeChange={setPageSize}
      />
      {/* Summary */}
      {selectedJobId && stagedTxs.length > 0 && (
        <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Unmarked</Text>
            <Text className={styles.summaryValue}>{unmarkedCount}</Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Import</Text>
            <Text className={styles.summaryValue}>{transformCount}</Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Discard</Text>
            <Text className={styles.summaryValue}>{deleteCount}</Text>
          </div>
          <div className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>Duplicates</Text>
            <Text className={styles.summaryValue}>{duplicateCount}</Text>
          </div>
        </div>
      )}

      {/* Abandon confirmation */}
      <ConfirmDialog
        open={abandonConfirm}
        onClose={() => setAbandonConfirm(false)}
        onConfirm={handleAbandon}
        title="Abandon Import"
        message="This will discard all staged transactions and mark this import job as abandoned. Continue?"
      />
    </div>
  );
}

function extractSourceFields(txs) {
  if (txs.length === 0) return [];
  const allKeys = new Set();
  for (const tx of txs) {
    for (const key of Object.keys(tx)) {
      if (!EXCLUDED_KEYS.has(key)) allKeys.add(key);
    }
  }

  // Preferred column order — common fields first, then rest alphabetically
  const preferred = ['date', 'description', 'amount', 'balance'];
  const ordered = [];
  for (const pk of preferred) {
    if (allKeys.has(pk)) {
      ordered.push(pk);
      allKeys.delete(pk);
    }
  }
  for (const key of [...allKeys].sort()) {
    ordered.push(key);
  }
  return ordered;
}
