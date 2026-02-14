import { useState, useEffect, useCallback } from 'react';
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
  CheckmarkRegular,
  DismissCircleRegular,
} from '@fluentui/react-icons';
import { importJobsApi, stagedTransactionsApi } from '../../api/index.js';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import EntityGrid from '../../components/EntityGrid.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
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
});

const statusColors = {
  processing: 'brand',
  ready_for_review: 'warning',
  committed: 'success',
  abandoned: 'subtle',
  failed: 'danger',
};

const statusLabels = {
  processing: 'Processing',
  ready_for_review: 'Ready for Review',
  committed: 'Committed',
  abandoned: 'Abandoned',
  failed: 'Failed',
};

const fmtGBP = (v) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(v || 0);

const terminalStatuses = new Set(['committed', 'abandoned', 'failed']);

export default function ImportJobForm() {
  const styles = useStyles();
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const { registerGuard, guardedNavigate } = useUnsavedChanges();

  const { form, setForm, setBase, isDirty, changedFields } = useFormTracker({
    filename: '',
    accountName: '',
  });

  const [jobData, setJobData] = useState(null);
  const [stagedTransactions, setStagedTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [stagedDeleteTarget, setStagedDeleteTarget] = useState(null);

  const status = jobData?.status || 'processing';
  const isTerminal = terminalStatuses.has(status);
  const isLocked = !!jobData?.isLocked || isTerminal;
  const lockReason = jobData?.isLockedReason || (isTerminal ? `${statusLabels[status]} import job` : null);

  useEffect(() => {
    const init = async () => {
      try {
        if (!isNew) {
          const data = await importJobsApi.getById(id);
          setJobData(data);
          setBase({
            filename: data.filename || '',
            accountName: data.accountName || '',
          });

          // Fetch staged transactions for non-terminal statuses
          if (!terminalStatuses.has(data.status)) {
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

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const saveForm = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const payload = {
        filename: form.filename,
        accountName: form.accountName,
      };

      if (isNew) {
        const created = await importJobsApi.create(payload);
        return { ok: true, id: created._id };
      } else {
        const updated = await importJobsApi.update(id, payload);
        setJobData(updated);
        setBase({
          filename: updated.filename || '',
          accountName: updated.accountName || '',
        });
        return { ok: true };
      }
    } catch (err) {
      setError(err.message);
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }, [form, isNew, id, setBase]);

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
      if (confirmAction === 'commit') {
        updated = await importJobsApi.commit(id);
      } else if (confirmAction === 'abandon') {
        updated = await importJobsApi.abandon(id);
      }
      if (updated) {
        setJobData(updated);
        setStagedTransactions([]);
        setBase({
          filename: updated.filename || '',
          accountName: updated.accountName || '',
        });
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (err) {
      setError(err.message);
    }
    setConfirmAction(null);
  };

  const handleDeleteStaged = async () => {
    if (!stagedDeleteTarget) return;
    try {
      await stagedTransactionsApi.delete(stagedDeleteTarget);
      setStagedTransactions((prev) => prev.filter((t) => t._id !== stagedDeleteTarget));
    } catch (err) {
      setError(err.message);
    }
    setStagedDeleteTarget(null);
  };

  useEffect(() => {
    return registerGuard({ isDirty, onSave: saveForm });
  }, [isDirty, saveForm, registerGuard]);

  const stagedColumns = [
    {
      key: 'date',
      label: 'Date',
      compare: (a, b) => (a.date || '').localeCompare(b.date || ''),
    },
    { key: 'description', label: 'Description' },
    {
      key: 'amount',
      label: 'Amount',
      compare: (a, b) => (a.amount || 0) - (b.amount || 0),
      render: (item) => fmtGBP(item.amount),
    },
    {
      key: 'balance',
      label: 'Balance',
      compare: (a, b) => (a.balance || 0) - (b.balance || 0),
      render: (item) => item.balance != null ? fmtGBP(item.balance) : '—',
    },
    {
      key: '_remove',
      label: '',
      render: (item) => (
        <Button
          appearance="subtle"
          icon={<DeleteRegular />}
          size="small"
          onClick={(e) => { e.stopPropagation(); setStagedDeleteTarget(item._id); }}
        />
      ),
    },
  ];

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  const actionLabels = {
    commit: { title: 'Commit Import', message: 'This will move all staged transactions into the main transactions table. This action cannot be undone. Continue?' },
    abandon: { title: 'Abandon Import', message: 'This will discard all staged transactions and mark this import job as abandoned. Continue?' },
  };

  const fmtDatetime = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-GB');
  };

  return (
    <div className={styles.page}>
      {/* Custom command bar */}
      <div className={styles.commandBar}>
        <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={() => guardedNavigate('/import-jobs')} size="small">
          Back
        </Button>
        {(!isLocked) && (
          <>
            <ToolbarDivider />
            <Button appearance="primary" icon={<SaveRegular />} onClick={handleSave} disabled={saving} size="small">
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button appearance="outline" icon={<SaveArrowRightRegular />} onClick={handleSaveAndClose} disabled={saving} size="small">
              Save & Close
            </Button>
          </>
        )}
        {!isNew && status === 'ready_for_review' && (
          <>
            <ToolbarDivider />
            <Button appearance="outline" icon={<CheckmarkRegular />} onClick={() => setConfirmAction('commit')} size="small">
              Commit
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
                {isNew ? 'New Import Job' : (form.filename || 'Import Job')}
              </BreadcrumbButton>
            </BreadcrumbItem>
          </Breadcrumb>
          <div className={styles.titleRow}>
            <Text className={styles.title}>
              {isNew ? 'New Import Job' : (form.filename || 'Import Job')}
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

        <fieldset disabled={!!isLocked} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0, ...(isLocked ? { pointerEvents: 'none', opacity: 0.6 } : {}) }}>
          <FormSection title="Import Details">
            <FormField changed={changedFields.has('filename')}>
              <Field label="Filename" required>
                <Input
                  value={form.filename}
                  onChange={handleChange('filename')}
                  disabled={!isNew && !!jobData}
                />
              </Field>
            </FormField>
            <FormField changed={changedFields.has('accountName')}>
              <Field label="Account Name">
                <Input
                  value={form.accountName}
                  onChange={handleChange('accountName')}
                />
              </Field>
            </FormField>
            {!isNew && (
              <>
                <FormField>
                  <Field label="Created">
                    <Input value={fmtDatetime(jobData?.createdAt)} disabled />
                  </Field>
                </FormField>
                <FormField>
                  <Field label="Completed">
                    <Input value={fmtDatetime(jobData?.completedAt)} disabled />
                  </Field>
                </FormField>
              </>
            )}
          </FormSection>
        </fieldset>

        {/* Staged Transactions section — non-locked statuses */}
        {!isNew && !isLocked && (
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
            <FormField>
              <Field label="Staged Count">
                <Input value={String(jobData?.stagedCount ?? '—')} disabled />
              </Field>
            </FormField>
            <FormField>
              <Field label="Committed Count">
                <Input value={String(jobData?.committedCount ?? '—')} disabled />
              </Field>
            </FormField>
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

      <ConfirmDialog
        open={!!stagedDeleteTarget}
        onClose={() => setStagedDeleteTarget(null)}
        onConfirm={handleDeleteStaged}
        title="Delete Staged Transaction"
        message="Are you sure you want to remove this staged transaction?"
      />
    </div>
  );
}
