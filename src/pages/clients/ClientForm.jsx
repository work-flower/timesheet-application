import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Button,
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
import { SaveRegular, ArrowLeftRegular } from '@fluentui/react-icons';
import { clientsApi } from '../../api/index.js';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import EntityGrid from '../../components/EntityGrid.jsx';
import MarkdownEditor from '../../components/MarkdownEditor.jsx';

const useStyles = makeStyles({
  page: {
    padding: '16px 24px',
    maxWidth: '1000px',
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
  actions: {
    display: 'flex',
    gap: '8px',
    marginTop: '24px',
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

export default function ClientForm() {
  const styles = useStyles();
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [form, setForm] = useState({
    companyName: '', primaryContactName: '', primaryContactEmail: '',
    primaryContactPhone: '', defaultRate: 0, currency: 'GBP', workingHoursPerDay: 8,
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
          setForm({
            companyName: data.companyName || '',
            primaryContactName: data.primaryContactName || '',
            primaryContactEmail: data.primaryContactEmail || '',
            primaryContactPhone: data.primaryContactPhone || '',
            defaultRate: data.defaultRate || 0,
            currency: data.currency || 'GBP',
            workingHoursPerDay: data.workingHoursPerDay ?? 8,
            notes: data.notes || '',
            ir35Status: 'OUTSIDE_IR35',
          });
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [id, isNew]);

  const handleChange = (field) => (e, data) => {
    setForm((prev) => ({ ...prev, [field]: data?.value ?? e.target.value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      if (isNew) {
        const created = await clientsApi.create(form);
        navigate(`/clients/${created._id}`, { replace: true });
      } else {
        const { ir35Status, ...updatePayload } = form;
        await clientsApi.update(id, updatePayload);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        // Reload data
        const data = await clientsApi.getById(id);
        setClientData(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Breadcrumb>
          <BreadcrumbItem>
            <BreadcrumbButton onClick={() => navigate('/clients')}>Clients</BreadcrumbButton>
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

      {!isNew && (
        <TabList selectedValue={tab} onTabSelect={(e, data) => setTab(data.value)} className={styles.tabs}>
          <Tab value="general">General</Tab>
          <Tab value="projects">Projects ({clientData?.projects?.length || 0})</Tab>
          <Tab value="timesheets">Timesheets ({clientData?.timesheets?.length || 0})</Tab>
        </TabList>
      )}

      <div className={styles.tabContent}>
        {(isNew || tab === 'general') && (
          <>
            <FormSection title="Company Information">
              <FormField>
                <Field label="Company Name" required>
                  <Input value={form.companyName} onChange={handleChange('companyName')} />
                </Field>
              </FormField>
              <FormField>
                <Field label="Currency">
                  <Select value={form.currency} onChange={handleChange('currency')}>
                    <option value="GBP">GBP</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </Select>
                </Field>
              </FormField>
              <FormField>
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
              <FormField>
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
                <FormField>
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

            <FormSection title="Primary Contact">
              <FormField>
                <Field label="Contact Name"><Input value={form.primaryContactName} onChange={handleChange('primaryContactName')} /></Field>
              </FormField>
              <FormField>
                <Field label="Contact Email"><Input type="email" value={form.primaryContactEmail} onChange={handleChange('primaryContactEmail')} /></Field>
              </FormField>
              <FormField>
                <Field label="Contact Phone"><Input value={form.primaryContactPhone} onChange={handleChange('primaryContactPhone')} /></Field>
              </FormField>
            </FormSection>

            <div style={{ marginTop: '16px' }}>
              <MarkdownEditor
                label="Notes"
                value={form.notes}
                onChange={(val) => setForm((prev) => ({ ...prev, notes: val }))}
                placeholder="Additional notes..."
                height={180}
              />
            </div>

            <div className={styles.actions}>
              <Button appearance="secondary" icon={<ArrowLeftRegular />} onClick={() => navigate('/clients')}>Back</Button>
              <Button appearance="primary" icon={<SaveRegular />} onClick={handleSave} disabled={saving || !form.companyName}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </>
        )}

        {tab === 'projects' && clientData && (
          <EntityGrid
            columns={projectColumns}
            items={clientData.projects || []}
            emptyMessage="No projects for this client."
            onRowClick={(item) => navigate(`/projects/${item._id}`)}
          />
        )}

        {tab === 'timesheets' && clientData && (
          <EntityGrid
            columns={timesheetColumns}
            items={clientData.timesheets || []}
            emptyMessage="No timesheet entries for this client."
            onRowClick={(item) => navigate(`/timesheets/${item._id}`)}
          />
        )}
      </div>
    </div>
  );
}
