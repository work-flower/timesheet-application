import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Textarea,
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
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableCellLayout,
  createTableColumn,
} from '@fluentui/react-components';
import { clientsApi, projectsApi, timesheetsApi, expensesApi, invoicesApi } from '../../api/index.js';
import { FormSection, FormField, FormDataProvider } from '../../components/FormSection.jsx';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import MarkdownEditor from '../../components/MarkdownEditor.jsx';
import { useFormTracker } from '../../hooks/useFormTracker.js';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx';
import useAppNavigate from '../../hooks/useAppNavigate.js';
import { useCurrentUser } from '../../contexts/CurrentUserContext.jsx';
import { useNotifyParent } from '../../hooks/useNotifyParent.js';
import QueryStringPrefill from '../../components/QueryStringPrefill.jsx';

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
  empty: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '48px',
    color: tokens.colorNeutralForeground3,
  },
  row: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
});

const makeProjectColumns = (hidden) => [
  createTableColumn({
    columnId: 'name',
    renderHeaderCell: () => 'Project Name',
    renderCell: (item) => <TableCellLayout>{item.name}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'ir35Status',
    renderHeaderCell: () => 'IR35 Status',
    renderCell: (item) => <TableCellLayout>{item.ir35Status?.replace('_', ' ')}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'rate',
    renderHeaderCell: () => 'Rate',
    renderCell: (item) => <TableCellLayout>{hidden.has('rate') ? '\u2014' : (item.rate != null ? `£${item.rate}/day` : 'Inherited')}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'status',
    renderHeaderCell: () => 'Status',
    renderCell: (item) => <TableCellLayout>{item.status}</TableCellLayout>,
  }),
];

const makeTimesheetColumns = (hidden) => [
  createTableColumn({
    columnId: 'date',
    renderHeaderCell: () => 'Date',
    renderCell: (item) => <TableCellLayout>{item.date}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'projectName',
    renderHeaderCell: () => 'Project',
    renderCell: (item) => <TableCellLayout>{item.projectName}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'hours',
    renderHeaderCell: () => 'Hours',
    renderCell: (item) => <TableCellLayout>{hidden.has('hours') ? '\u2014' : item.hours}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'notes',
    renderHeaderCell: () => 'Notes',
    renderCell: (item) => <TableCellLayout>{item.notes}</TableCellLayout>,
  }),
];

const makeExpenseColumns = (hidden) => [
  createTableColumn({
    columnId: 'date',
    renderHeaderCell: () => 'Date',
    renderCell: (item) => <TableCellLayout>{item.date}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'projectName',
    renderHeaderCell: () => 'Project',
    renderCell: (item) => <TableCellLayout>{item.projectName}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'expenseType',
    renderHeaderCell: () => 'Type',
    renderCell: (item) => <TableCellLayout>{item.expenseType}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'amount',
    renderHeaderCell: () => 'Amount',
    renderCell: (item) => <TableCellLayout>{hidden.has('amount') ? '\u2014' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(item.amount || 0)}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'billable',
    renderHeaderCell: () => 'Billable',
    renderCell: (item) => <TableCellLayout>{item.billable ? 'Yes' : 'No'}</TableCellLayout>,
  }),
];

const makeInvoiceColumns = (hidden) => [
  createTableColumn({
    columnId: 'invoiceNumber',
    renderHeaderCell: () => 'Invoice #',
    renderCell: (item) => <TableCellLayout>{item.invoiceNumber || 'Draft'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'invoiceDate',
    renderHeaderCell: () => 'Date',
    renderCell: (item) => <TableCellLayout>{item.invoiceDate}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'period',
    renderHeaderCell: () => 'Period',
    renderCell: (item) => <TableCellLayout>{item.servicePeriodStart && item.servicePeriodEnd ? `${item.servicePeriodStart} to ${item.servicePeriodEnd}` : '—'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'status',
    renderHeaderCell: () => 'Status',
    renderCell: (item) => <TableCellLayout>{item.status?.charAt(0).toUpperCase() + item.status?.slice(1)}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'total',
    renderHeaderCell: () => 'Amount',
    renderCell: (item) => <TableCellLayout>{hidden.has('total') ? '\u2014' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(item.total || 0)}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'paymentStatus',
    renderHeaderCell: () => 'Payment',
    renderCell: (item) => <TableCellLayout>{item.paymentStatus?.charAt(0).toUpperCase() + item.paymentStatus?.slice(1)}</TableCellLayout>,
  }),
];

export default function ClientForm() {
  const styles = useStyles();
  const { id } = useParams();
  const isNew = !id;
  const { registerGuard } = useUnsavedChanges();
  const { navigate, navigateUnguarded, goBack } = useAppNavigate();
  const { canCreate, canUpdate, fls } = useCurrentUser();

  // Field-level security: read-hidden fields render redacted; the strip set
  // (read ∪ mode-op) is removed from create defaults, QS prefill and payloads
  const tableFls = fls('clients');
  const stripSet = useMemo(
    () => new Set([...tableFls.read, ...(isNew ? tableFls.create : tableFls.update)]),
    [tableFls, isNew]
  );

  // Embedded grids show other tables' fields — dash their read-hidden numerics
  const projectColumns = useMemo(() => makeProjectColumns(fls('projects').read), [fls]);
  const timesheetColumns = useMemo(() => makeTimesheetColumns(fls('timesheets').read), [fls]);
  const expenseColumns = useMemo(() => makeExpenseColumns(fls('expenses').read), [fls]);
  const invoiceColumns = useMemo(() => makeInvoiceColumns(fls('invoices').read), [fls]);

  const { form, setForm, setBase, resetBase, formRef, isDirty, changedFields, base, baseReady } = useFormTracker();
  const notifyParent = useNotifyParent();
  const [initialized, setInitialized] = useState(false);

  const [clientData, setClientData] = useState(null);
  // Related records come from their own list endpoints (caller-scoped, enriched),
  // never embedded on the client read model
  const [related, setRelated] = useState({ projects: [], timesheets: [], expenses: [], invoices: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [tab, setTab] = useState('general');

  useEffect(() => {
    const init = async () => {
      try {
        if (!isNew) {
          // Each related fetch degrades to [] so a role without read on one
          // child table still opens the form
          const [data, projects, timesheets, expenses, invoices] = await Promise.all([
            clientsApi.getById(id),
            projectsApi.getAll({ clientId: id }).catch(() => []),
            timesheetsApi.getAll({ clientId: id }).catch(() => []),
            expensesApi.getAll({ clientId: id }).catch(() => []),
            invoicesApi.getAll({ clientId: id }).catch(() => []),
          ]);
          setClientData(data);
          setRelated({ projects, timesheets, expenses, invoices });
          resetBase(data);
        } else {
          const defaults = { defaultRate: 0, currency: 'GBP', workingHoursPerDay: 8, ir35Status: 'OUTSIDE_IR35' };
          // No phantom defaults in fields this user cannot see or set
          for (const f of stripSet) delete defaults[f];
          resetBase(defaults);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setInitialized(true);
      }
    };
    init();
  }, [id, isNew, resetBase, stripSet]);

  const handleChange = (field) => (e, data) => {
    const raw = data?.value ?? e.target.value;
    setForm((prev) => {
      const next = { ...prev };
      if (field === 'defaultRate' || field === 'workingHoursPerDay') {
        const val = parseFloat(raw);
        next[field] = isNaN(val) ? null : val;
      } else {
        next[field] = raw;
      }
      return next;
    });
  };

  const saveForm = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      // Never echo masked/blocked values back — the server strips them anyway,
      // but absent beats sending sentinels into service validation
      if (isNew) {
        const payload = { ...form };
        for (const f of stripSet) delete payload[f];
        const created = await clientsApi.create(payload);
        return { ok: true, id: created._id };
      } else {
        const { ir35Status, ...updatePayload } = form;
        for (const f of stripSet) delete updatePayload[f];
        await clientsApi.update(id, updatePayload);
        const data = await clientsApi.getById(id);
        setClientData(data);
        resetBase(data);
        return { ok: true };
      }
    } catch (err) {
      setError(err.message);
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }, [form, isNew, id, resetBase, stripSet]);

  const handleSave = async () => {
    const result = await saveForm();
    if (result.ok) {
      notifyParent(handleSave.name, base, form);
      if (isNew) {
        navigateUnguarded(`/clients/${result.id}`, { replace: true });
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    }
  };

  const handleSaveAndClose = async () => {
    const result = await saveForm();
    if (result.ok) {
      notifyParent(handleSaveAndClose.name, base, form);
      navigateUnguarded('/clients');
    }
  };

  useEffect(() => {
    return registerGuard({ isDirty, onSave: saveForm });
  }, [isDirty, saveForm, registerGuard]);

  const isLocked = (!isNew && clientData?.isLocked) || (isNew ? !canCreate('clients') : !canUpdate('clients'));
  const lockReason = clientData?.isLockedReason;

  return (
    <>
      {!initialized && <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>}
      <div className={styles.page} ref={formRef} style={{ display: initialized ? undefined : 'none' }}>
    <FormDataProvider table="clients" isNew={isNew} fls={tableFls} changedFields={changedFields} locked={isLocked}>
      <QueryStringPrefill handleChange={handleChange} ready={baseReady} exclude={stripSet} />
      <FormCommandBar
        onBack={() => goBack('/clients')}
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
              <BreadcrumbButton onClick={() => goBack('/clients')}>Clients</BreadcrumbButton>
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
            <Tab value="projects">Projects ({related.projects.length})</Tab>
            <Tab value="timesheets">Timesheets ({related.timesheets.length})</Tab>
            <Tab value="expenses">Expenses ({related.expenses.length})</Tab>
            <Tab value="invoices">Invoices ({related.invoices.length})</Tab>
          </TabList>
        )}

        <div className={styles.tabContent}>
          {(isNew || tab === 'general') && (
            <fieldset disabled={!!isLocked} style={{ border: 'none', padding: 0, margin: 0, ...(isLocked ? { pointerEvents: 'none', opacity: 0.6 } : {}) }}>
              <FormSection title="Company Information">
                <FormField name="companyName">
                  <Field label="Company Name" required>
                    <Input name="companyName" value={form.companyName ?? ''} onChange={handleChange('companyName')} />
                  </Field>
                </FormField>
                <FormField name="currency">
                  <Field label="Currency">
                    <Select name="currency" value={form.currency ?? ''} onChange={handleChange('currency')}>
                      <option value="GBP">GBP</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </Select>
                  </Field>
                </FormField>
                <FormField name="defaultRate">
                  <Field label="Default Rate (per day)">
                    <Input name="defaultRate" type="number" value={String(form.defaultRate ?? '')} onChange={handleChange('defaultRate')} min={0} step={25} />
                  </Field>
                </FormField>
                <FormField name="workingHoursPerDay">
                  <Field label="Working Hours Per Day">
                    <Input name="workingHoursPerDay" type="number" value={String(form.workingHoursPerDay ?? '')} onChange={handleChange('workingHoursPerDay')} min={0.25} max={24} step={0.25} />
                  </Field>
                </FormField>
                {isNew && (
                  <FormField name="ir35Status">
                    <Field label="IR35 Status (for default project)" required>
                      <Select name="ir35Status" value={form.ir35Status ?? ''} onChange={handleChange('ir35Status')}>
                        <option value="OUTSIDE_IR35">Outside IR35</option>
                        <option value="INSIDE_IR35">Inside IR35</option>
                        <option value="FIXED_TERM">Fixed Term</option>
                      </Select>
                    </Field>
                  </FormField>
                )}
              </FormSection>

              <FormSection title="Invoicing">
                <FormField name="invoicingEntityName">
                  <Field label="Invoicing Entity Name" hint="Used in the Bill To section of invoices. Falls back to company name.">
                    <Input name="invoicingEntityName" value={form.invoicingEntityName ?? ''} onChange={handleChange('invoicingEntityName')} />
                  </Field>
                </FormField>
                <FormField fullWidth name="invoicingEntityAddress">
                  <Field label="Invoicing Entity Address">
                    <Textarea name="invoicingEntityAddress" value={form.invoicingEntityAddress ?? ''} onChange={handleChange('invoicingEntityAddress')} resize="vertical" rows={3} />
                  </Field>
                </FormField>
              </FormSection>

              <FormSection title="Primary Contact">
                <FormField name="primaryContactName">
                  <Field label="Contact Name"><Input name="primaryContactName" value={form.primaryContactName ?? ''} onChange={handleChange('primaryContactName')} /></Field>
                </FormField>
                <FormField name="primaryContactEmail">
                  <Field label="Contact Email"><Input name="primaryContactEmail" type="email" value={form.primaryContactEmail ?? ''} onChange={handleChange('primaryContactEmail')} /></Field>
                </FormField>
                <FormField name="primaryContactPhone">
                  <Field label="Contact Phone"><Input name="primaryContactPhone" value={form.primaryContactPhone ?? ''} onChange={handleChange('primaryContactPhone')} /></Field>
                </FormField>
              </FormSection>

              <FormField fullWidth name="notes">
                <div style={{ marginTop: '16px' }}>
                  <MarkdownEditor
                    label="Notes"
                    name="notes"
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
            related.projects.length === 0 ? (
              <div className={styles.empty}><Text>No projects for this client.</Text></div>
            ) : (
              <DataGrid items={related.projects} columns={projectColumns} sortable getRowId={(item) => item._id} style={{ width: '100%' }}>
                <DataGridHeader>
                  <DataGridRow>
                    {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
                  </DataGridRow>
                </DataGridHeader>
                <DataGridBody>
                  {({ item, rowId }) => (
                    <DataGridRow key={rowId} className={styles.row} onClick={() => navigate(`/projects/${item._id}`)}>
                      {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                    </DataGridRow>
                  )}
                </DataGridBody>
              </DataGrid>
            )
          )}

          {tab === 'timesheets' && clientData && (
            related.timesheets.length === 0 ? (
              <div className={styles.empty}><Text>No timesheet entries for this client.</Text></div>
            ) : (
              <DataGrid items={related.timesheets} columns={timesheetColumns} sortable getRowId={(item) => item._id} style={{ width: '100%' }}>
                <DataGridHeader>
                  <DataGridRow>
                    {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
                  </DataGridRow>
                </DataGridHeader>
                <DataGridBody>
                  {({ item, rowId }) => (
                    <DataGridRow key={rowId} className={styles.row} onClick={() => navigate(`/timesheets/${item._id}`)}>
                      {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                    </DataGridRow>
                  )}
                </DataGridBody>
              </DataGrid>
            )
          )}

          {tab === 'expenses' && clientData && (
            related.expenses.length === 0 ? (
              <div className={styles.empty}><Text>No expenses for this client.</Text></div>
            ) : (
              <DataGrid items={related.expenses} columns={expenseColumns} sortable getRowId={(item) => item._id} style={{ width: '100%' }}>
                <DataGridHeader>
                  <DataGridRow>
                    {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
                  </DataGridRow>
                </DataGridHeader>
                <DataGridBody>
                  {({ item, rowId }) => (
                    <DataGridRow key={rowId} className={styles.row} onClick={() => navigate(`/expenses/${item._id}`)}>
                      {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                    </DataGridRow>
                  )}
                </DataGridBody>
              </DataGrid>
            )
          )}

          {tab === 'invoices' && clientData && (
            related.invoices.length === 0 ? (
              <div className={styles.empty}><Text>No invoices for this client.</Text></div>
            ) : (
              <DataGrid items={related.invoices} columns={invoiceColumns} sortable getRowId={(item) => item._id} style={{ width: '100%' }}>
                <DataGridHeader>
                  <DataGridRow>
                    {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
                  </DataGridRow>
                </DataGridHeader>
                <DataGridBody>
                  {({ item, rowId }) => (
                    <DataGridRow key={rowId} className={styles.row} onClick={() => navigate(`/invoices/${item._id}`)}>
                      {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                    </DataGridRow>
                  )}
                </DataGridBody>
              </DataGrid>
            )
          )}
        </div>
      </div>
    </FormDataProvider>
    </div>
    </>
  );
}
