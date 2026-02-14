import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Field,
  Spinner,
  Badge,
  Button,
  MessageBar,
  MessageBarBody,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbDivider,
  BreadcrumbButton,
  ToolbarDivider,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular,
  SaveRegular,
  SaveArrowRightRegular,
  DeleteRegular,
  DismissCircleRegular,
} from '@fluentui/react-icons';
import { importJobsApi, stagedTransactionsApi } from '../../api/index.js';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import EntityGrid from '../../components/EntityGrid.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import MarkdownEditor from '../../components/MarkdownEditor.jsx';
import { useFormTracker } from '../../hooks/useFormTracker.js';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx';

const useStyles = makeStyles({
  page: {},
  commandBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    gap: '4px',
    position: 'sticky',
    top: 0,
    zIndex: 10,
    flexWrap: 'wrap',
  },
  pageBody: {
    padding: '16px 24px',
  },
  header: {
    marginBottom: '16px',
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase500,
    display: 'block',
    marginBottom: '4px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '4px',
  },
  message: {
    marginBottom: '16px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    marginTop: '24px',
  },
  fileInput: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  processingBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '24px',
    justifyContent: 'center',
  },
});

const statusColors = {
  processing: 'brand',
  ready_for_review: 'warning',
  abandoned: 'subtle',
  failed: 'danger',
};

const statusLabels = {
  processing: 'Processing',
  ready_for_review: 'Ready for Review',
  abandoned: 'Abandoned',
  failed: 'Failed',
};

const fmtGBP = (v) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(v || 0);

const terminalStatuses = new Set(['abandoned', 'failed']);

// Keys to exclude from dynamic staged transaction columns
const EXCLUDED_KEYS = new Set(['_id', 'importJobId', 'createdAt', 'updatedAt', 'compositeHash']);

export default function ImportJobForm() {
  const styles = useStyles();
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const { registerGuard, guardedNavigate } = useUnsavedChanges();

  const { form, setForm, setBase, isDirty, changedFields } = useFormTracker({
    userPrompt: 'Parse the attached bank statement.',
  });

  const [jobData, setJobData] = useState(null);
  const [stagedTransactions, setStagedTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  const status = jobData?.status || 'processing';
  const isTerminal = terminalStatuses.has(status);
  const isLocked = !!jobData?.isLocked || isTerminal;
  const lockReason = jobData?.isLockedReason || (isTerminal ? `${statusLabels[status]} import job` : null);
  const isProcessing = status === 'processing' && !isNew;

  // Polling while processing
  useEffect(() => {
    if (!isProcessing || !id) return;

    pollRef.current = setInterval(async () => {
      try {
        const data = await importJobsApi.getById(id);
        if (data.status !== 'processing') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setJobData(data);
          setBase({ userPrompt: data.userPrompt || '' });

          if (data.status === 'ready_for_review') {
            const staged = await stagedTransactionsApi.getAll({ importJobId: id });
            setStagedTransactions(staged);
          }
        }
      } catch {
        // Polling failure — ignore silently
      }
    }, 3000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isProcessing, id, setBase]);

  useEffect(() => {
    const init = async () => {
      try {
        if (!isNew) {
          const data = await importJobsApi.getById(id);
          setJobData(data);
          setBase({
            userPrompt: data.userPrompt || '',
          });

          // Fetch staged transactions for non-terminal, non-processing statuses
          if (!terminalStatuses.has(data.status) && data.status !== 'processing') {
            const staged = await stagedTransactionsApi.getAll({ importJobId: id });
            setStagedTransactions(staged);
          }
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id, isNew, setBase]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const saveForm = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      if (isNew) {
        if (!selectedFile) {
          setError('Please select a file to upload.');
          return { ok: false };
        }
        const fd = new FormData();
        fd.append('file', selectedFile);
        fd.append('userPrompt', form.userPrompt);
        const created = await importJobsApi.create(fd);
        return { ok: true, id: created._id };
      } else {
        // Check if we're re-uploading a file on a failed job
        if (selectedFile && jobData?.status === 'failed') {
          const fd = new FormData();
          fd.append('file', selectedFile);
          fd.append('userPrompt', form.userPrompt);
          const updated = await importJobsApi.update(id, fd);
          setJobData(updated);
          setBase({ userPrompt: updated.userPrompt || '' });
          setSelectedFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return { ok: true };
        }

        const updated = await importJobsApi.update(id, { userPrompt: form.userPrompt });
        setJobData(updated);
        setBase({ userPrompt: updated.userPrompt || '' });
        return { ok: true };
      }
    } catch (err) {
      setError(err.message);
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }, [form, isNew, id, selectedFile, jobData, setBase]);

  const handleSave = async () => {
    const result = await saveForm();
    if (result.ok) {
      if (isNew) {
        navigate(`/import-jobs/${result.id}`, { replace: true });
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    }
  };

  const handleSaveAndClose = async () => {
    const result = await saveForm();
    if (result.ok) navigate('/import-jobs');
  };

  const handleDelete = async () => {
    try {
      await importJobsApi.delete(id);
      navigate('/import-jobs');
    } catch (err) {
      setError(err.message);
    }
    setDeleteConfirm(false);
  };

  const handleLifecycleAction = async () => {
    setError(null);
    try {
      let updated;
      if (confirmAction === 'abandon') {
        updated = await importJobsApi.abandon(id);
      }
      if (updated) {
        setJobData(updated);
        setStagedTransactions([]);
        setBase({ userPrompt: updated.userPrompt || '' });
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (err) {
      setError(err.message);
    }
    setConfirmAction(null);
  };

  useEffect(() => {
    return registerGuard({ isDirty, onSave: saveForm });
  }, [isDirty, saveForm, registerGuard]);

  // Dynamic column definitions based on staged transaction fields
  const stagedColumns = useMemo(() => {
    if (stagedTransactions.length === 0) {
      return [
        { key: 'date', label: 'Date' },
        { key: 'description', label: 'Description' },
        { key: 'amount', label: 'Amount', render: (item) => fmtGBP(item.amount) },
      ];
    }

    // Gather all unique keys from staged transactions
    const allKeys = new Set();
    for (const tx of stagedTransactions) {
      for (const key of Object.keys(tx)) {
        if (!EXCLUDED_KEYS.has(key)) allKeys.add(key);
      }
    }

    // Preferred column order
    const preferred = ['date', 'description', 'amount', 'balance'];
    const orderedKeys = [];
    for (const pk of preferred) {
      if (allKeys.has(pk)) {
        orderedKeys.push(pk);
        allKeys.delete(pk);
      }
    }
    // Append remaining keys alphabetically
    for (const key of [...allKeys].sort()) {
      orderedKeys.push(key);
    }

    const cols = orderedKeys.map((key) => {
      const col = {
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
      };

      // Format known numeric fields
      if (key === 'amount' || key === 'balance') {
        col.compare = (a, b) => (Number(a[key]) || 0) - (Number(b[key]) || 0);
        col.render = (item) => item[key] != null ? fmtGBP(item[key]) : '—';
      } else if (key === 'date') {
        col.compare = (a, b) => (a.date || '').localeCompare(b.date || '');
      }

      return col;
    });

    return cols;
  }, [stagedTransactions]);

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  const actionLabels = {
    abandon: { title: 'Abandon Import', message: 'This will discard all staged transactions and mark this import job as abandoned. Continue?' },
  };

  const fmtDatetime = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-GB');
  };

  const canSave = isNew ? !!selectedFile : true;

  return (
    <div className={styles.page}>
      {/* Custom command bar */}
      <div className={styles.commandBar}>
        <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={() => guardedNavigate('/import-jobs')} size="small">
          Back
        </Button>
        {(!isLocked && !isProcessing) && (
          <>
            <ToolbarDivider />
            <Button appearance="primary" icon={<SaveRegular />} onClick={handleSave} disabled={saving || !canSave} size="small">
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button appearance="outline" icon={<SaveArrowRightRegular />} onClick={handleSaveAndClose} disabled={saving || !canSave} size="small">
              Save & Close
            </Button>
          </>
        )}
        {!isNew && (status === 'processing' || status === 'ready_for_review') && (
          <>
            <Button appearance="subtle" icon={<DismissCircleRegular />} onClick={() => setConfirmAction('abandon')} size="small">
              Abandon
            </Button>
          </>
        )}
        {!isNew && isLocked && (
          <>
            <ToolbarDivider />
            <Button appearance="subtle" icon={<DeleteRegular />} onClick={() => setDeleteConfirm(true)} size="small">
              Delete
            </Button>
          </>
        )}
      </div>

      <div className={styles.pageBody}>
        <div className={styles.header}>
          <Breadcrumb>
            <BreadcrumbItem>
              <BreadcrumbButton onClick={() => guardedNavigate('/import-jobs')}>Import Transactions</BreadcrumbButton>
            </BreadcrumbItem>
            <BreadcrumbDivider />
            <BreadcrumbItem>
              <BreadcrumbButton current>
                {isNew ? 'New Import Job' : (jobData?.filename || 'Import Job')}
              </BreadcrumbButton>
            </BreadcrumbItem>
          </Breadcrumb>
          <div className={styles.titleRow}>
            <Text className={styles.title}>
              {isNew ? 'New Import Job' : (jobData?.filename || 'Import Job')}
            </Text>
            {!isNew && (
              <Badge appearance="filled" color={statusColors[status]} size="medium">
                {statusLabels[status] || status}
              </Badge>
            )}
          </div>
        </div>

        {error && <MessageBar intent="error" className={styles.message}><MessageBarBody>{error}</MessageBarBody></MessageBar>}
        {success && <MessageBar intent="success" className={styles.message}><MessageBarBody>Saved successfully.</MessageBarBody></MessageBar>}
        {isLocked && lockReason && <MessageBar intent="warning" className={styles.message}><MessageBarBody>{lockReason}</MessageBarBody></MessageBar>}
        {jobData?.error && (
          <MessageBar intent="error" className={styles.message}>
            <MessageBarBody>{jobData.error}</MessageBarBody>
          </MessageBar>
        )}

        {/* Processing spinner */}
        {isProcessing && (
          <div className={styles.processingBox}>
            <Spinner size="medium" />
            <Text>Processing file... This may take a moment.</Text>
          </div>
        )}

        <fieldset disabled={!!isLocked || !isNew} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0, ...((isLocked || !isNew) ? { pointerEvents: 'none', opacity: 0.6 } : {}) }}>
          <FormSection title="Import Details">
            {isNew && (
              <FormField fullWidth>
                <Field label="File" required hint="CSV, PDF, OFX, XML, TXT, XLS, XLSX">
                  <div className={styles.fileInput}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.pdf,.ofx,.xml,.txt,.xls,.xlsx"
                      onChange={handleFileChange}
                      style={{ fontSize: tokens.fontSizeBase300 }}
                    />
                  </div>
                </Field>
              </FormField>
            )}
            {!isNew && (
              <>
                <FormField>
                  <Field label="Filename">
                    <Input value={jobData?.filename || ''} disabled />
                  </Field>
                </FormField>
                <FormField>
                  <Field label="Created">
                    <Input value={fmtDatetime(jobData?.createdAt)} disabled />
                  </Field>
                </FormField>
                {jobData?.completedAt && (
                  <FormField>
                    <Field label="Completed">
                      <Input value={fmtDatetime(jobData?.completedAt)} disabled />
                    </Field>
                  </FormField>
                )}
              </>
            )}
            <FormField fullWidth changed={changedFields.has('userPrompt')}>
              <MarkdownEditor
                label="User Prompt"
                value={form.userPrompt}
                onChange={(val) => setForm((prev) => ({ ...prev, userPrompt: val }))}
                height={150}
                placeholder="Job-specific instructions sent alongside the file..."
              />
            </FormField>
          </FormSection>
        </fieldset>

        {/* File re-upload for failed jobs — outside fieldset */}
        {!isNew && status === 'failed' && (
          <div style={{ padding: '0 24px' }}>
            <FormField fullWidth>
              <Field label="Re-upload File" hint="Upload a new file to retry parsing">
                <div className={styles.fileInput}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.pdf,.ofx,.xml,.txt,.xls,.xlsx"
                    onChange={handleFileChange}
                    style={{ fontSize: tokens.fontSizeBase300 }}
                  />
                </div>
              </Field>
            </FormField>
          </div>
        )}

        {/* Staged Transactions section — non-locked, non-processing statuses */}
        {!isNew && !isLocked && !isProcessing && (
          <>
            <div className={styles.sectionHeader}>
              <Text style={{ fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400 }}>
                Staged Transactions ({stagedTransactions.length})
              </Text>
            </div>
            <EntityGrid
              columns={stagedColumns}
              items={stagedTransactions}
              emptyMessage="No staged transactions."
              getRowId={(item) => item._id}
            />
          </>
        )}

        {/* Results section — locked/terminal statuses */}
        {!isNew && isLocked && (
          <FormSection title="Results">
            {jobData?.aiStopReason && (
              <FormField>
                <Field label="AI Stop Reason">
                  <Input value={jobData.aiStopReason} disabled />
                </Field>
              </FormField>
            )}
          </FormSection>
        )}
      </div>

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Import Job"
        message="Are you sure you want to delete this import job?"
      />

      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleLifecycleAction}
        title={actionLabels[confirmAction]?.title || 'Confirm'}
        message={actionLabels[confirmAction]?.message || 'Are you sure?'}
      />

    </div>
  );
}
