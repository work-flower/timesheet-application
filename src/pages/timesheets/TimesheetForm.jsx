import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Field,
  Spinner,
  SpinButton,
  Select,
  MessageBar,
  MessageBarBody,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbDivider,
  BreadcrumbButton,
} from '@fluentui/react-components';
import { timesheetsApi, projectsApi } from '../../api/index.js';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import MarkdownEditor from '../../components/MarkdownEditor.jsx';
import { useFormTracker } from '../../hooks/useFormTracker.js';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx';

const useStyles = makeStyles({
  page: {},
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
  message: {
    marginBottom: '16px',
  },
  notes: {
    marginTop: '16px',
  },
});

const EXCLUDE_FIELDS = ['days', 'amount'];

export default function TimesheetForm() {
  const styles = useStyles();
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const { registerGuard, guardedNavigate } = useUnsavedChanges();

  const today = new Date().toISOString().split('T')[0];

  const { form, setForm, setBase, isDirty, changedFields } = useFormTracker({
    projectId: '',
    date: today,
    hours: 8,
    days: null,
    amount: null,
    notes: '',
  }, { excludeFields: EXCLUDE_FIELDS });

  const [loadedData, setLoadedData] = useState(null);
  const [allProjects, setAllProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Helper to compute days/amount from project + hours
  const computeDaysAmount = (hours, projectId, projectList) => {
    const proj = projectList.find((p) => p._id === projectId);
    if (!proj || !hours || hours <= 0) return { days: null, amount: null };
    const ewh = proj.effectiveWorkingHours || 8;
    const er = proj.effectiveRate || 0;
    const days = hours / ewh;
    const amount = days * er;
    return { days, amount };
  };

  useEffect(() => {
    const init = async () => {
      try {
        const projects = await projectsApi.getAll();
        const active = projects.filter((p) => p.status === 'active');
        setAllProjects(active);

        if (!isNew) {
          const data = await timesheetsApi.getById(id);
          setLoadedData(data);
          setBase({
            projectId: data.projectId || '',
            date: data.date || today,
            hours: data.hours || 8,
            days: data.days ?? null,
            amount: data.amount ?? null,
            notes: data.notes || '',
          });
        } else if (active.length > 0) {
          setBase({
            projectId: active[0]._id,
            date: today,
            hours: 8,
            days: null,
            amount: null,
            notes: '',
          });
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id, isNew, setBase, today]);

  const selectedProject = useMemo(
    () => allProjects.find((p) => p._id === form.projectId),
    [form.projectId, allProjects],
  );

  // Group projects by client
  const projectsByClient = useMemo(() => {
    const groups = {};
    for (const p of allProjects) {
      const key = p.clientName || 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    return groups;
  }, [allProjects]);

  const handleChange = (field) => (e, data) => {
    const value = data?.value ?? e.target.value;
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Recompute days/amount when project changes
      if (field === 'projectId') {
        Object.assign(next, computeDaysAmount(prev.hours, value, allProjects));
      }
      return next;
    });
  };

  const saveForm = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const { days, amount, ...payload } = form;
      if (isNew) {
        const created = await timesheetsApi.create(payload);
        return { ok: true, id: created._id };
      } else {
        await timesheetsApi.update(id, payload);
        const data = await timesheetsApi.getById(id);
        setBase({
          projectId: data.projectId || '',
          date: data.date || today,
          hours: data.hours || 8,
          days: data.days ?? null,
          amount: data.amount ?? null,
          notes: data.notes || '',
        });
        return { ok: true };
      }
    } catch (err) {
      setError(err.message);
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }, [form, isNew, id, setBase, today]);

  const handleSave = async () => {
    const result = await saveForm();
    if (result.ok) {
      if (isNew) {
        navigate(`/timesheets/${result.id}`, { replace: true });
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    }
  };

  const handleSaveAndClose = async () => {
    const result = await saveForm();
    if (result.ok) navigate('/timesheets');
  };

  const handleDelete = async () => {
    try {
      await timesheetsApi.delete(id);
      navigate('/timesheets');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    return registerGuard({ isDirty, onSave: saveForm });
  }, [isDirty, saveForm, registerGuard]);

  const isLocked = !isNew && loadedData?.isLocked;
  const lockReason = loadedData?.isLockedReason;

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  return (
    <div className={styles.page}>
      <FormCommandBar
        onBack={() => guardedNavigate('/timesheets')}
        onSave={handleSave}
        onSaveAndClose={handleSaveAndClose}
        onDelete={!isNew ? () => setDeleteOpen(true) : undefined}
        saveDisabled={!form.projectId || !form.date}
        saving={saving}
        locked={isLocked}
      />
      <div className={styles.pageBody}>
        <div className={styles.header}>
          <Breadcrumb>
            <BreadcrumbItem>
              <BreadcrumbButton onClick={() => guardedNavigate('/timesheets')}>Timesheets</BreadcrumbButton>
            </BreadcrumbItem>
            <BreadcrumbDivider />
            <BreadcrumbItem>
              <BreadcrumbButton current>{isNew ? 'New Entry' : 'Edit Entry'}</BreadcrumbButton>
            </BreadcrumbItem>
          </Breadcrumb>
          <Text className={styles.title}>{isNew ? 'New Timesheet Entry' : 'Edit Timesheet Entry'}</Text>
        </div>

        {error && <MessageBar intent="error" className={styles.message}><MessageBarBody>{error}</MessageBarBody></MessageBar>}
        {success && <MessageBar intent="success" className={styles.message}><MessageBarBody>Timesheet entry saved successfully.</MessageBarBody></MessageBar>}
        {isLocked && <MessageBar intent="warning" className={styles.message}><MessageBarBody>{lockReason || 'This record is locked.'}</MessageBarBody></MessageBar>}

        <fieldset disabled={!!isLocked} style={{ border: 'none', padding: 0, margin: 0 }}>
          <FormSection title="Entry Details">
            <FormField changed={changedFields.has('date')}>
              <Field label="Date" required>
                <Input type="date" value={form.date} max={today} onChange={handleChange('date')} />
              </Field>
            </FormField>
            <FormField changed={changedFields.has('projectId')}>
              <Field label="Project" required hint={selectedProject ? `Client: ${selectedProject.clientName}` : undefined}>
                <Select value={form.projectId} onChange={handleChange('projectId')}>
                  <option value="">Select project...</option>
                  {Object.entries(projectsByClient).map(([clientName, projs]) => (
                    <optgroup key={clientName} label={clientName}>
                      {projs.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.name} (£{p.effectiveRate}/day)
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
            </FormField>
            <FormField changed={changedFields.has('hours')}>
              <Field label="Hours" required hint={`Between 0.25 and 24, in 0.25 increments${selectedProject ? `. Project daily hours: ${selectedProject.effectiveWorkingHours || 8}h` : ''}`}>
                <SpinButton
                  defaultValue={form.hours}
                  onChange={(e, data) => {
                    const val = data.value ?? parseFloat(data.displayValue);
                    if (val != null && !isNaN(val)) {
                      setForm((prev) => ({
                        ...prev,
                        hours: val,
                        ...computeDaysAmount(val, prev.projectId, allProjects),
                      }));
                    }
                  }}
                  min={0.25}
                  max={24}
                  step={0.25}
                />
              </Field>
            </FormField>
            <FormField>
              <Field label="Days">
                <Input
                  readOnly
                  value={form.days != null ? form.days.toFixed(2) : '—'}
                />
              </Field>
            </FormField>
            <FormField>
              <Field label="Amount">
                <Input
                  readOnly
                  value={form.amount != null
                    ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(form.amount)
                    : '—'}
                />
              </Field>
            </FormField>
          </FormSection>

          <FormField fullWidth changed={changedFields.has('notes')}>
            <div className={styles.notes}>
              <MarkdownEditor
                label="Notes"
                value={form.notes}
                onChange={(val) => setForm((prev) => ({ ...prev, notes: val }))}
                placeholder="What did you work on today?"
                height={200}
              />
            </div>
          </FormField>
        </fieldset>
      </div>
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Timesheet Entry"
        message="Are you sure you want to delete this timesheet entry? This action cannot be undone."
      />
    </div>
  );
}
