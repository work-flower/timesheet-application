import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Textarea,
  Field,
  Spinner,
  SpinButton,
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
import { clientsApi } from '../../api/index.js';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import EntityGrid from '../../components/EntityGrid.jsx';
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

const projectColumns = [
  { key: 'name', label: 'Project Name' },
  { key: 'ir35Status', label: 'IR35 Status', render: (item) => item.ir35Status?.replace('_', ' ') },
  { key: 'rate', label: 'Rate', render: (item) => item.rate != null ? `£${item.rate}/day` : 'Inherited' },
  { key: 'status', label: 'Status' },
];

const timesheetColumns = [
  { key: 'date', label: 'Date' },
  { key: 'projectName', label: 'Project' },
  { key: 'hours', label: 'Hours' },
  { key: 'notes', label: 'Notes' },
];

const expenseColumns = [
  { key: 'date', label: 'Date' },
  { key: 'projectName', label: 'Project' },
  { key: 'expenseType', label: 'Type' },
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
  { key: 'period', label: 'Period', render: (item) => item.servicePeriodStart && item.servicePeriodEnd ? `${item.servicePeriodStart} to ${item.servicePeriodEnd}` : '—' },
  { key: 'status', label: 'Status', render: (item) => item.status?.charAt(0).toUpperCase() + item.status?.slice(1) },
  {
    key: 'total',
    label: 'Amount',
    render: (item) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(item.total || 0),
  },
  { key: 'paymentStatus', label: 'Payment', render: (item) => item.paymentStatus?.charAt(0).toUpperCase() + item.paymentStatus?.slice(1) },
];

export default function ClientForm() {
  const styles = useStyles();
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const { registerGuard, guardedNavigate } = useUnsavedChanges();

  const { form, setForm, setBase, isDirty, changedFields } = useFormTracker({
    companyName: '', primaryContactName: '', primaryContactEmail: '',
    primaryContactPhone: '', defaultRate: 0, currency: 'GBP', workingHoursPerDay: 8,
    invoicingEntityName: '', invoicingEntityAddress: '',
    notes: '', ir35Status: 'OUTSIDE_IR35',
  });
  const [clientData, setClientData] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [tab, setTab] = useState('general');

  useEffect(() => {
    if (!isNew) {
      clientsApi.getById(id)
        .then((data) => {
          setClientData(data);
          setBase({
            companyName: data.companyName || '',
            primaryContactName: data.primaryContactName || '',
            primaryContactEmail: data.primaryContactEmail || '',
            primaryContactPhone: data.primaryContactPhone || '',
            defaultRate: data.defaultRate || 0,
            currency: data.currency || 'GBP',
            workingHoursPerDay: data.workingHoursPerDay ?? 8,
            invoicingEntityName: data.invoicingEntityName || '',
            invoicingEntityAddress: data.invoicingEntityAddress || '',
            notes: data.notes || '',
            ir35Status: 'OUTSIDE_IR35',
          });
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [id, isNew, setBase]);

  const handleChange = (field) => (e, data) => {
    setForm((prev) => ({ ...prev, [field]: data?.value ?? e.target.value }));
  };

  const saveForm = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      if (isNew) {
        const created = await clientsApi.create(form);
        return { ok: true, id: created._id };
      } else {
        const { ir35Status, ...updatePayload } = form;
        await clientsApi.update(id, updatePayload);
        const data = await clientsApi.getById(id);
        setClientData(data);
        setBase({
          companyName: data.companyName || '',
          primaryContactName: data.primaryContactName || '',
          primaryContactEmail: data.primaryContactEmail || '',
          primaryContactPhone: data.primaryContactPhone || '',
          defaultRate: data.defaultRate || 0,
          currency: data.currency || 'GBP',
          workingHoursPerDay: data.workingHoursPerDay ?? 8,
          invoicingEntityName: data.invoicingEntityName || '',
          invoicingEntityAddress: data.invoicingEntityAddress || '',
          notes: data.notes || '',
          ir35Status: 'OUTSIDE_IR35',
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
        navigate(`/clients/${result.id}`, { replace: true });
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    }
  };

  const handleSaveAndClose = async () => {
    const result = await saveForm();
    if (result.ok) navigate('/clients');
  };

  useEffect(() => {
    return registerGuard({ isDirty, onSave: saveForm });
  }, [isDirty, saveForm, registerGuard]);

  const isLocked = !isNew && clientData?.isLocked;
  const lockReason = clientData?.isLockedReason;

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  return (
    <div className={styles.page}>
      <FormCommandBar
        onBack={() => guardedNavigate('/clients')}
        onSave={handleSave}
        onSaveAndClose={handleSaveAndClose}
        saveDisabled={!form.companyName}
        saving={saving}
        locked={isLocked}
      />
      <div className={styles.pageBody}>
        <div className={styles.header}>
          <Breadcrumb>
            <BreadcrumbItem>
              <BreadcrumbButton onClick={() => guardedNavigate('/clients')}>Clients</BreadcrumbButton>
            </BreadcrumbItem>
            <BreadcrumbDivider />
            <BreadcrumbItem>
              <BreadcrumbButton current>{isNew ? 'New Client' : form.companyName}</BreadcrumbButton>
            </BreadcrumbItem>
          </Breadcrumb>
          <Text className={styles.title}>{isNew ? 'New Client' : form.companyName}</Text>
        </div>

        {error && <MessageBar intent="error" className={styles.message}><MessageBarBody>{error}</MessageBarBody></MessageBar>}
        {success && <MessageBar intent="success" className={styles.message}><MessageBarBody>Client saved successfully.</MessageBarBody></MessageBar>}
        {isLocked && <MessageBar intent="warning" className={styles.message}><MessageBarBody>{lockReason || 'This record is locked.'}</MessageBarBody></MessageBar>}

        {!isNew && (
          <TabList selectedValue={tab} onTabSelect={(e, data) => setTab(data.value)} className={styles.tabs}>
            <Tab value="general">General</Tab>
            <Tab value="projects">Projects ({clientData?.projects?.length || 0})</Tab>
            <Tab value="timesheets">Timesheets ({clientData?.timesheets?.length || 0})</Tab>
            <Tab value="expenses">Expenses ({clientData?.expenses?.length || 0})</Tab>
            <Tab value="invoices">Invoices ({clientData?.invoices?.length || 0})</Tab>
          </TabList>
        )}

        <div className={styles.tabContent}>
          {(isNew || tab === 'general') && (
            <fieldset disabled={!!isLocked} style={{ border: 'none', padding: 0, margin: 0, ...(isLocked ? { pointerEvents: 'none', opacity: 0.6 } : {}) }}>
              <FormSection title="Company Information">
                <FormField changed={changedFields.has('companyName')}>
                  <Field label="Company Name" required>
                    <Input value={form.companyName} onChange={handleChange('companyName')} />
                  </Field>
                </FormField>
                <FormField changed={changedFields.has('currency')}>
                  <Field label="Currency">
                    <Select value={form.currency} onChange={handleChange('currency')}>
                      <option value="GBP">GBP</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </Select>
                  </Field>
                </FormField>
                <FormField changed={changedFields.has('defaultRate')}>
                  <Field label="Default Rate (per day)">
                    <SpinButton
                      defaultValue={form.defaultRate}
                      onChange={(e, data) => {
                        const val = data.value ?? parseFloat(data.displayValue);
                        if (val != null && !isNaN(val)) setForm((prev) => ({ ...prev, defaultRate: val }));
                      }}
                      min={0}
                      step={25}
                    />
                  </Field>
                </FormField>
                <FormField changed={changedFields.has('workingHoursPerDay')}>
                  <Field label="Working Hours Per Day">
                    <SpinButton
                      defaultValue={form.workingHoursPerDay}
                      onChange={(e, data) => {
                        const val = data.value ?? parseFloat(data.displayValue);
                        if (val != null && !isNaN(val)) setForm((prev) => ({ ...prev, workingHoursPerDay: val }));
                      }}
                      min={0.25}
                      max={24}
                      step={0.25}
                    />
                  </Field>
                </FormField>
                {isNew && (
                  <FormField changed={changedFields.has('ir35Status')}>
                    <Field label="IR35 Status (for default project)" required>
                      <Select value={form.ir35Status} onChange={handleChange('ir35Status')}>
                        <option value="OUTSIDE_IR35">Outside IR35</option>
                        <option value="INSIDE_IR35">Inside IR35</option>
                        <option value="FIXED_TERM">Fixed Term</option>
                      </Select>
                    </Field>
                  </FormField>
                )}
              </FormSection>

              <FormSection title="Invoicing">
                <FormField changed={changedFields.has('invoicingEntityName')}>
                  <Field label="Invoicing Entity Name" hint="Used in the Bill To section of invoices. Falls back to company name.">
                    <Input value={form.invoicingEntityName} onChange={handleChange('invoicingEntityName')} />
                  </Field>
                </FormField>
                <FormField fullWidth changed={changedFields.has('invoicingEntityAddress')}>
                  <Field label="Invoicing Entity Address">
                    <Textarea value={form.invoicingEntityAddress} onChange={handleChange('invoicingEntityAddress')} resize="vertical" rows={3} />
                  </Field>
                </FormField>
              </FormSection>

              <FormSection title="Primary Contact">
                <FormField changed={changedFields.has('primaryContactName')}>
                  <Field label="Contact Name"><Input value={form.primaryContactName} onChange={handleChange('primaryContactName')} /></Field>
                </FormField>
                <FormField changed={changedFields.has('primaryContactEmail')}>
                  <Field label="Contact Email"><Input type="email" value={form.primaryContactEmail} onChange={handleChange('primaryContactEmail')} /></Field>
                </FormField>
                <FormField changed={changedFields.has('primaryContactPhone')}>
                  <Field label="Contact Phone"><Input value={form.primaryContactPhone} onChange={handleChange('primaryContactPhone')} /></Field>
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

          {tab === 'projects' && clientData && (
            <EntityGrid
              columns={projectColumns}
              items={clientData.projects || []}
              emptyMessage="No projects for this client."
              onRowClick={(item) => guardedNavigate(`/projects/${item._id}`)}
            />
          )}

          {tab === 'timesheets' && clientData && (
            <EntityGrid
              columns={timesheetColumns}
              items={clientData.timesheets || []}
              emptyMessage="No timesheet entries for this client."
              onRowClick={(item) => guardedNavigate(`/timesheets/${item._id}`)}
            />
          )}

          {tab === 'expenses' && clientData && (
            <EntityGrid
              columns={expenseColumns}
              items={clientData.expenses || []}
              emptyMessage="No expenses for this client."
              onRowClick={(item) => guardedNavigate(`/expenses/${item._id}`)}
            />
          )}

          {tab === 'invoices' && clientData && (
            <EntityGrid
              columns={invoiceColumns}
              items={clientData.invoices || []}
              emptyMessage="No invoices for this client."
              onRowClick={(item) => guardedNavigate(`/invoices/${item._id}`)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
