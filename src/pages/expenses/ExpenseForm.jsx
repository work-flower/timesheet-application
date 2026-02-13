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
  Checkbox,
  Combobox,
  Option,
  Textarea,
  MessageBar,
  MessageBarBody,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbDivider,
  BreadcrumbButton,
} from '@fluentui/react-components';
import { expensesApi, projectsApi, clientsApi } from '../../api/index.js';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import MarkdownEditor from '../../components/MarkdownEditor.jsx';
import AttachmentGallery from '../../components/AttachmentGallery.jsx';
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
  attachments: {
    marginTop: '24px',
  },
  sectionTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    marginBottom: '8px',
  },
});

export default function ExpenseForm() {
  const styles = useStyles();
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const { registerGuard, guardedNavigate } = useUnsavedChanges();

  const today = new Date().toISOString().split('T')[0];

  const { form, setForm, setBase, isDirty, changedFields } = useFormTracker({
    projectId: '',
    date: today,
    expenseType: '',
    description: '',
    amount: 0,
    vatAmount: 0,
    vatPercent: 0,
    billable: true,
    currency: 'GBP',
    notes: '',
  }, { excludeFields: ['vatPercent'] });

  const [loadedData, setLoadedData] = useState(null);
  const [allProjects, setAllProjects] = useState([]);
  const [allClients, setAllClients] = useState([]);
  const [expenseTypes, setExpenseTypes] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const [projects, clients, types] = await Promise.all([
          projectsApi.getAll(),
          clientsApi.getAll(),
          expensesApi.getTypes(),
        ]);
        const active = projects.filter((p) => p.status === 'active');
        setAllProjects(active);
        setAllClients(clients);
        setExpenseTypes(types);

        const clientMap = Object.fromEntries(clients.map((c) => [c._id, c]));

        if (!isNew) {
          const data = await expensesApi.getById(id);
          setLoadedData(data);
          setAttachments(data.attachments || []);
          setBase({
            projectId: data.projectId || '',
            date: data.date || today,
            expenseType: data.expenseType || '',
            description: data.description || '',
            amount: data.amount || 0,
            vatAmount: data.vatAmount || 0,
            vatPercent: data.vatPercent || 0,
            billable: data.billable !== false,
            currency: data.currency || 'GBP',
            notes: data.notes || '',
          });
        } else if (active.length > 0) {
          const firstProj = active[0];
          const firstClient = clientMap[firstProj.clientId];
          setBase({
            projectId: firstProj._id,
            date: today,
            expenseType: '',
            description: '',
            amount: 0,
            vatAmount: 0,
            vatPercent: 0,
            billable: true,
            currency: firstClient?.currency || 'GBP',
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

  const selectedProject = useMemo(
    () => allProjects.find((p) => p._id === form.projectId),
    [form.projectId, allProjects],
  );

  // Lookup client currency from project
  const clientMap = useMemo(
    () => Object.fromEntries(allClients.map((c) => [c._id, c])),
    [allClients],
  );

  const handleChange = (field) => (e, data) => {
    const value = data?.value ?? e.target.value;
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Update currency when project changes
      if (field === 'projectId') {
        const proj = allProjects.find((p) => p._id === value);
        const client = proj ? clientMap[proj.clientId] : null;
        next.currency = client?.currency || 'GBP';
      }
      return next;
    });
  };

  const saveForm = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      if (isNew) {
        const created = await expensesApi.create(form);
        return { ok: true, id: created._id };
      } else {
        const updated = await expensesApi.update(id, form);
        setAttachments(updated.attachments || []);
        setBase({
          projectId: updated.projectId || '',
          date: updated.date || today,
          expenseType: updated.expenseType || '',
          description: updated.description || '',
          amount: updated.amount || 0,
          vatAmount: updated.vatAmount || 0,
          vatPercent: updated.vatPercent || 0,
          billable: updated.billable !== false,
          currency: updated.currency || 'GBP',
          notes: updated.notes || '',
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
        navigate(`/expenses/${result.id}`, { replace: true });
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    }
  };

  const handleSaveAndClose = async () => {
    const result = await saveForm();
    if (result.ok) navigate('/expenses');
  };

  const handleDelete = async () => {
    try {
      await expensesApi.delete(id);
      navigate('/expenses');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpload = async (files) => {
    setUploading(true);
    try {
      const updated = await expensesApi.uploadAttachments(id, files);
      setAttachments(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAttachment = async (filename) => {
    try {
      const updated = await expensesApi.deleteAttachment(id, filename);
      setAttachments(updated);
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
        onBack={() => guardedNavigate('/expenses')}
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
              <BreadcrumbButton onClick={() => guardedNavigate('/expenses')}>Expenses</BreadcrumbButton>
            </BreadcrumbItem>
            <BreadcrumbDivider />
            <BreadcrumbItem>
              <BreadcrumbButton current>{isNew ? 'New Expense' : 'Edit Expense'}</BreadcrumbButton>
            </BreadcrumbItem>
          </Breadcrumb>
          <Text className={styles.title}>{isNew ? 'New Expense' : 'Edit Expense'}</Text>
        </div>

        {error && <MessageBar intent="error" className={styles.message}><MessageBarBody>{error}</MessageBarBody></MessageBar>}
        {success && <MessageBar intent="success" className={styles.message}><MessageBarBody>Expense saved successfully.</MessageBarBody></MessageBar>}
        {isLocked && <MessageBar intent="warning" className={styles.message}><MessageBarBody>{lockReason || 'This record is locked.'}</MessageBarBody></MessageBar>}

        <fieldset disabled={!!isLocked} style={{ border: 'none', padding: 0, margin: 0 }}>
        <FormSection title="Entry Details">
          <FormField changed={changedFields.has('date')}>
            <Field label="Date" required>
              <Input type="date" value={form.date} max={today} onChange={handleChange('date')} />
            </Field>
          </FormField>
          <FormField changed={changedFields.has('amount')}>
            <Field label="Amount (gross)" required hint="Total amount paid including VAT">
              <SpinButton
                defaultValue={form.amount}
                onChange={(e, data) => {
                  const val = data.value ?? parseFloat(data.displayValue);
                  if (val != null && !isNaN(val)) {
                    setForm((prev) => {
                      const vatPct = val > 0 ? Math.round((prev.vatAmount / val) * 10000) / 100 : 0;
                      return { ...prev, amount: val, vatPercent: vatPct };
                    });
                  }
                }}
                min={0}
                step={0.01}
              />
            </Field>
          </FormField>
          <FormField changed={changedFields.has('projectId')}>
            <Field label="Project" required hint={selectedProject ? `Client: ${selectedProject.clientName}` : undefined}>
              <Select value={form.projectId} onChange={handleChange('projectId')}>
                <option value="">Select project...</option>
                {Object.entries(projectsByClient).map(([clientName, projs]) => (
                  <optgroup key={clientName} label={clientName}>
                    {projs.map((p) => (
                      <option key={p._id} value={p._id}>{p.name}</option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
          </FormField>
          <FormField changed={changedFields.has('vatAmount')}>
            <Field label="VAT Amount" hint="VAT portion included in the Amount (gross)">
              <SpinButton
                defaultValue={form.vatAmount}
                onChange={(e, data) => {
                  const val = data.value ?? parseFloat(data.displayValue);
                  if (val != null && !isNaN(val)) {
                    setForm((prev) => {
                      const vatPct = prev.amount > 0 ? Math.round((val / prev.amount) * 10000) / 100 : 0;
                      return { ...prev, vatAmount: val, vatPercent: vatPct };
                    });
                  }
                }}
                min={0}
                step={0.01}
              />
            </Field>
          </FormField>
          <FormField changed={changedFields.has('expenseType')}>
            <Field label="Expense Type" hint="Select from previous types or type a new one">
              <Combobox
                freeform
                value={form.expenseType}
                onOptionSelect={(e, data) => setForm((prev) => ({ ...prev, expenseType: data.optionText || '' }))}
                onChange={(e) => setForm((prev) => ({ ...prev, expenseType: e.target.value }))}
                placeholder="e.g. Travel, Mileage, Equipment..."
              >
                {expenseTypes.map((t) => (
                  <Option key={t} value={t}>{t}</Option>
                ))}
              </Combobox>
            </Field>
          </FormField>
          <FormField>
            <Field label="VAT %">
              <Input
                readOnly
                value={form.vatPercent != null ? `${form.vatPercent.toFixed(2)}%` : '—'}
              />
            </Field>
          </FormField>
          <FormField changed={changedFields.has('billable')}>
            <Field>
              <Checkbox
                checked={form.billable}
                onChange={(e, data) => setForm((prev) => ({ ...prev, billable: data.checked }))}
                label="Billable to client"
              />
            </Field>
          </FormField>
          <FormField changed={changedFields.has('currency')}>
            <Field label="Currency" hint="Inherited from client">
              <Input readOnly value={form.currency} />
            </Field>
          </FormField>
          <FormField fullWidth changed={changedFields.has('description')}>
            <Field label="Description" hint="Visible to the client on invoices/reports">
              <Textarea
                value={form.description}
                onChange={(e, data) => setForm((prev) => ({ ...prev, description: data.value }))}
                placeholder="e.g. Return train London to Manchester for project kickoff"
                resize="vertical"
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
              placeholder="Internal notes (not visible to client)..."
              height={200}
            />
          </div>
        </FormField>

        <div className={styles.attachments}>
          <Text className={styles.sectionTitle} block>Attachments</Text>
          {isNew ? (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              Save the expense first to add attachments.
            </Text>
          ) : (
            <AttachmentGallery
              expenseId={id}
              attachments={attachments}
              onUpload={handleUpload}
              onDelete={handleDeleteAttachment}
              uploading={uploading}
            />
          )}
        </div>
        </fieldset>
      </div>
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Expense"
        message="Are you sure you want to delete this expense? This action cannot be undone."
      />
    </div>
  );
}
