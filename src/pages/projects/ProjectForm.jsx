import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Field,
  Spinner,
  Select,
  Tab,
  TabList,
  MessageBar,
  MessageBarBody,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbDivider,
  BreadcrumbButton,
} from '@fluentui/react-components';
import { projectsApi, clientsApi, documentsApi, invoicesApi } from '../../api/index.js';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import EntityGrid from '../../components/EntityGrid.jsx';
import MarkdownEditor from '../../components/MarkdownEditor.jsx';
import { useFormTracker } from '../../hooks/useFormTracker.js';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx';

const useStyles = makeStyles({
  page: {
    maxWidth: '1000px',
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
  tabs: {
    marginTop: '16px',
  },
  tabContent: {
    marginTop: '16px',
  },
  message: {
    marginBottom: '16px',
  },
});

const timesheetColumns = [
  { key: 'date', label: 'Date' },
  { key: 'hours', label: 'Hours' },
  { key: 'notes', label: 'Notes' },
];

const expenseColumns = [
  { key: 'date', label: 'Date' },
  { key: 'expenseType', label: 'Type' },
  { key: 'description', label: 'Description' },
  {
    key: 'amount',
    label: 'Amount',
    render: (item) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(item.amount || 0),
  },
  {
    key: 'billable',
    label: 'Billable',
    render: (item) => item.billable ? 'Yes' : 'No',
  },
];

const invoiceColumns = [
  { key: 'invoiceNumber', label: 'Invoice #', render: (item) => item.invoiceNumber || 'Draft' },
  { key: 'invoiceDate', label: 'Date' },
  { key: 'status', label: 'Status', render: (item) => item.status?.charAt(0).toUpperCase() + item.status?.slice(1) },
  {
    key: 'total',
    label: 'Amount',
    render: (item) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(item.total || 0),
  },
];

const documentColumns = [
  { key: 'period', label: 'Period', render: (item) => `${item.periodStart} to ${item.periodEnd}` },
  { key: 'granularity', label: 'Type', render: (item) => item.granularity === 'weekly' ? 'Weekly' : 'Monthly' },
  { key: 'createdAt', label: 'Created', render: (item) => new Date(item.createdAt).toLocaleDateString('en-GB') },
];

export default function ProjectForm() {
  const styles = useStyles();
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const { registerGuard, guardedNavigate } = useUnsavedChanges();

  const { form, setForm, setBase, isDirty, changedFields } = useFormTracker({
    name: '', clientId: '', endClientId: '', ir35Status: 'OUTSIDE_IR35',
    rate: '', workingHoursPerDay: '', vatPercent: '', status: 'active', notes: '',
  });
  const [projectData, setProjectData] = useState(null);
  const [allClients, setAllClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [tab, setTab] = useState('general');
  const [documents, setDocuments] = useState([]);
  const [projectInvoices, setProjectInvoices] = useState([]);

  useEffect(() => {
    const init = async () => {
      try {
        const clients = await clientsApi.getAll();
        setAllClients(clients);

        if (!isNew) {
          const [data, docs] = await Promise.all([
            projectsApi.getById(id),
            documentsApi.getAll({ projectId: id }),
          ]);
          setDocuments(docs);
          setProjectData(data);
          // Fetch invoices for this project's client
          if (data.clientId) {
            try {
              const invs = await invoicesApi.getAll({ clientId: data.clientId });
              setProjectInvoices(invs);
            } catch {}
          }
          setBase({
            name: data.name || '',
            clientId: data.clientId || '',
            endClientId: data.endClientId || '',
            ir35Status: data.ir35Status || 'OUTSIDE_IR35',
            rate: data.rate != null ? String(data.rate) : '',
            workingHoursPerDay: data.workingHoursPerDay != null ? String(data.workingHoursPerDay) : '',
            vatPercent: data.vatPercent != null ? String(data.vatPercent) : '',
            status: data.status || 'active',
            notes: data.notes || '',
          });
        } else if (clients.length > 0) {
          const firstClient = clients[0];
          setBase({
            name: '', clientId: firstClient._id, endClientId: '', ir35Status: 'OUTSIDE_IR35',
            rate: firstClient.defaultRate != null ? String(firstClient.defaultRate) : '',
            workingHoursPerDay: firstClient.workingHoursPerDay != null ? String(firstClient.workingHoursPerDay) : '',
            vatPercent: '20',
            status: 'active', notes: '',
          });
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id, isNew, setBase]);

  const handleChange = (field) => (e, data) => {
    const value = data?.value ?? e.target.value;
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Auto-fill rate and working hours when client changes on new project
      if (field === 'clientId' && isNew) {
        const client = allClients.find((c) => c._id === value);
        if (client) {
          next.rate = client.defaultRate != null ? String(client.defaultRate) : '';
          next.workingHoursPerDay = client.workingHoursPerDay != null ? String(client.workingHoursPerDay) : '';
        }
      }
      return next;
    });
  };

  const saveForm = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const payload = {
        ...form,
        rate: form.rate !== '' ? Number(form.rate) : null,
        workingHoursPerDay: form.workingHoursPerDay !== '' ? Number(form.workingHoursPerDay) : null,
        vatPercent: form.vatPercent !== '' ? Number(form.vatPercent) : null,
      };
      if (isNew) {
        const created = await projectsApi.create(payload);
        return { ok: true, id: created._id };
      } else {
        const updated = await projectsApi.update(id, payload);
        setProjectData(updated);
        setBase({
          name: updated.name || '',
          clientId: updated.clientId || '',
          endClientId: updated.endClientId || '',
          ir35Status: updated.ir35Status || 'OUTSIDE_IR35',
          rate: updated.rate != null ? String(updated.rate) : '',
          workingHoursPerDay: updated.workingHoursPerDay != null ? String(updated.workingHoursPerDay) : '',
          vatPercent: updated.vatPercent != null ? String(updated.vatPercent) : '',
          status: updated.status || 'active',
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
  }, [form, isNew, id, setBase]);

  const handleSave = async () => {
    const result = await saveForm();
    if (result.ok) {
      if (isNew) {
        navigate(`/projects/${result.id}`, { replace: true });
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    }
  };

  const handleSaveAndClose = async () => {
    const result = await saveForm();
    if (result.ok) navigate('/projects');
  };

  useEffect(() => {
    return registerGuard({ isDirty, onSave: saveForm });
  }, [isDirty, saveForm, registerGuard]);

  const isLocked = !isNew && projectData?.isLocked;
  const lockReason = projectData?.isLockedReason;

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  // Compute placeholder for rate
  const selectedClient = allClients.find((c) => c._id === form.clientId);
  const ratePlaceholder = selectedClient ? `Inherited from client: £${selectedClient.defaultRate}/day` : 'Enter rate or leave blank to inherit';
  const hoursPlaceholder = selectedClient ? `Inherited from client: ${selectedClient.workingHoursPerDay ?? 8}h/day` : 'Enter hours or leave blank to inherit';

  return (
    <div className={styles.page}>
      <FormCommandBar
        onBack={() => guardedNavigate('/projects')}
        onSave={handleSave}
        onSaveAndClose={handleSaveAndClose}
        saveDisabled={!form.name || !form.clientId}
        saving={saving}
        locked={isLocked}
      />
      <div className={styles.pageBody}>
        <div className={styles.header}>
          <Breadcrumb>
            <BreadcrumbItem>
              <BreadcrumbButton onClick={() => guardedNavigate('/projects')}>Projects</BreadcrumbButton>
            </BreadcrumbItem>
            <BreadcrumbDivider />
            <BreadcrumbItem>
              <BreadcrumbButton current>{isNew ? 'New Project' : form.name}</BreadcrumbButton>
            </BreadcrumbItem>
          </Breadcrumb>
          <Text className={styles.title}>{isNew ? 'New Project' : form.name}</Text>
        </div>

        {error && <MessageBar intent="error" className={styles.message}><MessageBarBody>{error}</MessageBarBody></MessageBar>}
        {success && <MessageBar intent="success" className={styles.message}><MessageBarBody>Project saved successfully.</MessageBarBody></MessageBar>}
        {isLocked && <MessageBar intent="warning" className={styles.message}><MessageBarBody>{lockReason || 'This record is locked.'}</MessageBarBody></MessageBar>}

        {!isNew && (
          <TabList selectedValue={tab} onTabSelect={(e, data) => setTab(data.value)} className={styles.tabs}>
            <Tab value="general">General</Tab>
            <Tab value="timesheets">Timesheets ({projectData?.timesheets?.length || 0})</Tab>
            <Tab value="expenses">Expenses ({projectData?.expenses?.length || 0})</Tab>
            <Tab value="documents">Documents ({documents.length})</Tab>
            <Tab value="invoices">Invoices ({projectInvoices.length})</Tab>
          </TabList>
        )}

        <div className={styles.tabContent}>
          {(isNew || tab === 'general') && (
            <fieldset disabled={!!isLocked} style={{ border: 'none', padding: 0, margin: 0 }}>
              <FormSection title="Project Details">
                <FormField changed={changedFields.has('name')}>
                  <Field label="Project Name" required>
                    <Input value={form.name} onChange={handleChange('name')} />
                  </Field>
                </FormField>
                <FormField changed={changedFields.has('clientId')}>
                  <Field label="Client" required hint={!isNew && projectData?.isDefault ? 'Client cannot be changed for default projects' : undefined}>
                    <Select value={form.clientId} onChange={handleChange('clientId')} disabled={!isNew && projectData?.isDefault}>
                      <option value="">Select client...</option>
                      {allClients.map((c) => (
                        <option key={c._id} value={c._id}>{c.companyName}</option>
                      ))}
                    </Select>
                  </Field>
                </FormField>
                <FormField changed={changedFields.has('endClientId')}>
                  <Field label="End Client">
                    <Select value={form.endClientId} onChange={handleChange('endClientId')}>
                      <option value="">None</option>
                      {allClients.map((c) => (
                        <option key={c._id} value={c._id}>{c.companyName}</option>
                      ))}
                    </Select>
                  </Field>
                </FormField>
                <FormField changed={changedFields.has('ir35Status')}>
                  <Field label="IR35 Status" required>
                    <Select value={form.ir35Status} onChange={handleChange('ir35Status')}>
                      <option value="OUTSIDE_IR35">Outside IR35</option>
                      <option value="INSIDE_IR35">Inside IR35</option>
                      <option value="FIXED_TERM">Fixed Term</option>
                    </Select>
                  </Field>
                </FormField>
                <FormField changed={changedFields.has('rate')}>
                  <Field label="Rate (per day)" hint={form.rate === '' ? ratePlaceholder : undefined}>
                    <Input
                      type="number"
                      value={form.rate}
                      onChange={handleChange('rate')}
                      placeholder={ratePlaceholder}
                    />
                  </Field>
                </FormField>
                <FormField changed={changedFields.has('workingHoursPerDay')}>
                  <Field label="Working Hours Per Day" hint={form.workingHoursPerDay === '' ? hoursPlaceholder : undefined}>
                    <Input
                      type="number"
                      value={form.workingHoursPerDay}
                      onChange={handleChange('workingHoursPerDay')}
                      placeholder={hoursPlaceholder}
                    />
                  </Field>
                </FormField>
                <FormField changed={changedFields.has('vatPercent')}>
                  <Field label="VAT Rate (%)" hint={form.vatPercent === '' ? 'Leave empty for no VAT (exempt)' : undefined}>
                    <Input
                      type="number"
                      value={form.vatPercent}
                      onChange={handleChange('vatPercent')}
                      placeholder="Leave empty for no VAT"
                    />
                  </Field>
                </FormField>
                <FormField changed={changedFields.has('status')}>
                  <Field label="Status">
                    <Select value={form.status} onChange={handleChange('status')}>
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                    </Select>
                  </Field>
                </FormField>
              </FormSection>

              <FormField fullWidth changed={changedFields.has('notes')}>
                <div style={{ marginTop: '16px' }}>
                  <MarkdownEditor
                    label="Notes"
                    value={form.notes}
                    onChange={(val) => setForm((prev) => ({ ...prev, notes: val }))}
                    placeholder="Additional notes..."
                    height={180}
                  />
                </div>
              </FormField>
            </fieldset>
          )}

          {tab === 'timesheets' && projectData && (
            <EntityGrid
              columns={timesheetColumns}
              items={projectData.timesheets || []}
              emptyMessage="No timesheet entries for this project."
              onRowClick={(item) => guardedNavigate(`/timesheets/${item._id}`)}
            />
          )}

          {tab === 'expenses' && projectData && (
            <EntityGrid
              columns={expenseColumns}
              items={projectData.expenses || []}
              emptyMessage="No expenses for this project."
              onRowClick={(item) => guardedNavigate(`/expenses/${item._id}`)}
            />
          )}

          {tab === 'documents' && (
            <EntityGrid
              columns={documentColumns}
              items={documents}
              emptyMessage="No saved documents for this project."
              onRowClick={(item) => window.open(documentsApi.getFileUrl(item._id), '_blank')}
            />
          )}

          {tab === 'invoices' && (
            <EntityGrid
              columns={invoiceColumns}
              items={projectInvoices}
              emptyMessage="No invoices for this project's client."
              onRowClick={(item) => guardedNavigate(`/invoices/${item._id}`)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
