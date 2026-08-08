import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
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
  Button,
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
import { AddRegular, DeleteRegular } from '@fluentui/react-icons';
import { projectsApi, clientsApi, documentsApi, invoicesApi, timesheetsApi, expensesApi } from '../../api/index.js';
import { FormSection, FormField, FormDataProvider } from '../../components/FormSection.jsx';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import ResourceDialog from './ResourceDialog.jsx';
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

const makeTimesheetColumns = (hidden) => [
  createTableColumn({
    columnId: 'date',
    renderHeaderCell: () => 'Date',
    renderCell: (item) => <TableCellLayout>{item.date}</TableCellLayout>,
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
    columnId: 'expenseType',
    renderHeaderCell: () => 'Type',
    renderCell: (item) => <TableCellLayout>{item.expenseType}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'description',
    renderHeaderCell: () => 'Description',
    renderCell: (item) => <TableCellLayout>{item.description}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'amount',
    renderHeaderCell: () => 'Amount',
    renderCell: (item) => (
      <TableCellLayout>
        {hidden.has('amount') ? '\u2014' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(item.amount || 0)}
      </TableCellLayout>
    ),
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
    columnId: 'status',
    renderHeaderCell: () => 'Status',
    renderCell: (item) => (
      <TableCellLayout>{item.status?.charAt(0).toUpperCase() + item.status?.slice(1)}</TableCellLayout>
    ),
  }),
  createTableColumn({
    columnId: 'total',
    renderHeaderCell: () => 'Amount',
    renderCell: (item) => (
      <TableCellLayout>
        {hidden.has('total') ? '\u2014' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(item.total || 0)}
      </TableCellLayout>
    ),
  }),
];

const makeResourceColumns = (onDelete, isLocked) => [
  createTableColumn({
    columnId: 'userEmail',
    renderHeaderCell: () => 'User',
    renderCell: (item) => <TableCellLayout>{item.userEmail || item.userId}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'dailyRate',
    renderHeaderCell: () => 'Daily Rate',
    renderCell: (item) => (
      <TableCellLayout>
        {item.dailyRate != null
          ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(item.dailyRate)
          : '—'}
      </TableCellLayout>
    ),
  }),
  createTableColumn({
    columnId: 'engagement',
    renderHeaderCell: () => 'Engagement',
    renderCell: (item) => (
      <TableCellLayout>{item.engagement === 'PART_TIME' ? 'Part-time' : 'Full-time'}</TableCellLayout>
    ),
  }),
  createTableColumn({
    columnId: 'description',
    renderHeaderCell: () => 'Description',
    renderCell: (item) => <TableCellLayout>{item.description}</TableCellLayout>,
  }),
  ...(isLocked ? [] : [
    createTableColumn({
      columnId: '_remove',
      renderHeaderCell: () => '',
      renderCell: (item) => (
        <Button
          appearance="subtle"
          icon={<DeleteRegular />}
          aria-label="Remove resource"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item);
          }}
        />
      ),
    }),
  ]),
];

const documentColumns = [
  createTableColumn({
    columnId: 'period',
    renderHeaderCell: () => 'Period',
    renderCell: (item) => <TableCellLayout>{`${item.periodStart} to ${item.periodEnd}`}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'granularity',
    renderHeaderCell: () => 'Type',
    renderCell: (item) => (
      <TableCellLayout>{item.granularity === 'weekly' ? 'Weekly' : 'Monthly'}</TableCellLayout>
    ),
  }),
  createTableColumn({
    columnId: 'createdAt',
    renderHeaderCell: () => 'Created',
    renderCell: (item) => (
      <TableCellLayout>{new Date(item.createdAt).toLocaleDateString('en-GB')}</TableCellLayout>
    ),
  }),
];

export default function ProjectForm() {
  const styles = useStyles();
  const { id } = useParams();
  const isNew = !id;
  const { registerGuard } = useUnsavedChanges();
  const { navigate, navigateUnguarded, goBack } = useAppNavigate();
  const { canCreate, canUpdate, fls } = useCurrentUser();

  // Field-level security: read-hidden fields render redacted; the strip set
  // (read ∪ mode-op) is removed from create defaults, QS prefill and payloads
  const tableFls = fls('projects');
  const stripSet = useMemo(
    () => new Set([...tableFls.read, ...(isNew ? tableFls.create : tableFls.update)]),
    [tableFls, isNew]
  );
  // Resources tab is not FormField-based — block it wholesale when the
  // resources field is hidden or write-blocked for this mode
  const resourcesBlocked = stripSet.has('resources');

  const { form, setForm, setBase, resetBase, formRef, isDirty, changedFields, base, baseReady } = useFormTracker({ resources: [] });
  const notifyParent = useNotifyParent();
  const [initialized, setInitialized] = useState(false);

  const coerceApi = (data) => ({
    ...data,
    rate: data.rate != null ? String(data.rate) : '',
    workingHoursPerDay: data.workingHoursPerDay != null ? String(data.workingHoursPerDay) : '',
    vatPercent: data.vatPercent != null ? String(data.vatPercent) : '',
    resources: Array.isArray(data.resources) ? data.resources : [],
  });

  const [projectData, setProjectData] = useState(null);
  const [allClients, setAllClients] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [tab, setTab] = useState('general');
  const [documents, setDocuments] = useState([]);
  const [projectInvoices, setProjectInvoices] = useState([]);
  const [projectTimesheets, setProjectTimesheets] = useState([]);
  const [projectExpenses, setProjectExpenses] = useState([]);
  const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
  const [editingResource, setEditingResource] = useState(null);
  const [resourceToDelete, setResourceToDelete] = useState(null);

  useEffect(() => {
    const init = async () => {
      try {
        const clients = await clientsApi.getAll();
        setAllClients(clients);

        if (!isNew) {
          // Related records come from their own list endpoints (caller-scoped,
          // enriched); each degrades to [] so a role without read on one child
          // table still opens the form
          const [data, docs, tsRows, expRows] = await Promise.all([
            projectsApi.getById(id),
            documentsApi.getAll({ projectId: id }).catch(() => []),
            timesheetsApi.getAll({ projectId: id }).catch(() => []),
            expensesApi.getAll({ projectId: id }).catch(() => []),
          ]);
          setDocuments(docs);
          setProjectTimesheets(tsRows);
          setProjectExpenses(expRows);
          setProjectData(data);
          // Fetch invoices for this project's client
          if (data.clientId) {
            try {
              const invs = await invoicesApi.getAll({ clientId: data.clientId });
              setProjectInvoices(invs);
            } catch {}
          }
          resetBase(coerceApi(data));
        } else {
          const firstClient = clients[0];
          const defaults = firstClient
            ? {
                clientId: firstClient._id, ir35Status: 'OUTSIDE_IR35',
                rate: firstClient.defaultRate != null ? String(firstClient.defaultRate) : '',
                workingHoursPerDay: firstClient.workingHoursPerDay != null ? String(firstClient.workingHoursPerDay) : '',
                vatPercent: '20', status: 'active', resources: [],
              }
            : { ir35Status: 'OUTSIDE_IR35', vatPercent: '20', status: 'active', resources: [] };
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

  const openAddResource = () => {
    setEditingResource(null);
    setResourceDialogOpen(true);
  };

  const openEditResource = (item) => {
    setEditingResource(item);
    setResourceDialogOpen(true);
  };

  // Immutable updates only — useFormTracker detects changes by reference
  const handleResourceSubmit = (values) => {
    setForm((prev) => {
      const list = prev.resources || [];
      return editingResource
        ? { ...prev, resources: list.map((r) => (r.id === editingResource.id ? { ...r, ...values } : r)) }
        : { ...prev, resources: [...list, { id: crypto.randomUUID(), ...values }] };
    });
  };

  const handleResourceDelete = () => {
    setForm((prev) => ({
      ...prev,
      resources: (prev.resources || []).filter((r) => r.id !== resourceToDelete.id),
    }));
    setResourceToDelete(null);
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
      // Never echo masked/blocked values back — the server strips them anyway,
      // but absent beats sending sentinels into service validation
      for (const f of stripSet) delete payload[f];
      if (isNew) {
        const created = await projectsApi.create(payload);
        return { ok: true, id: created._id };
      } else {
        const updated = await projectsApi.update(id, payload);
        setProjectData(updated);
        resetBase(coerceApi(updated));
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
        navigateUnguarded(`/projects/${result.id}`, { replace: true });
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
      navigateUnguarded('/projects');
    }
  };

  useEffect(() => {
    return registerGuard({ isDirty, onSave: saveForm });
  }, [isDirty, saveForm, registerGuard]);

  const isLocked = (!isNew && projectData?.isLocked) || (isNew ? !canCreate('projects') : !canUpdate('projects'));
  const lockReason = projectData?.isLockedReason;

  const resourceColumns = useMemo(() => makeResourceColumns(setResourceToDelete, !!isLocked), [isLocked]);
  // Embedded grids show other tables' fields — dash their read-hidden numerics
  const timesheetColumns = useMemo(() => makeTimesheetColumns(fls('timesheets').read), [fls]);
  const expenseColumns = useMemo(() => makeExpenseColumns(fls('expenses').read), [fls]);
  const invoiceColumns = useMemo(() => makeInvoiceColumns(fls('invoices').read), [fls]);

  // Compute placeholder for rate
  const selectedClient = allClients.find((c) => c._id === form.clientId);
  const ratePlaceholder = selectedClient ? `Inherited from client: £${selectedClient.defaultRate}/day` : 'Enter rate or leave blank to inherit';
  const hoursPlaceholder = selectedClient ? `Inherited from client: ${selectedClient.workingHoursPerDay ?? 8}h/day` : 'Enter hours or leave blank to inherit';

  return (
    <>
      {!initialized && <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>}
      <div className={styles.page} ref={formRef} style={{ display: initialized ? undefined : 'none' }}>
    <FormDataProvider table="projects" isNew={isNew} fls={tableFls} changedFields={changedFields} locked={isLocked}>
      <QueryStringPrefill handleChange={handleChange} ready={baseReady} exclude={stripSet} />
      <FormCommandBar
        onBack={() => goBack('/projects')}
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
              <BreadcrumbButton onClick={() => goBack('/projects')}>Projects</BreadcrumbButton>
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
            <Tab value="resources">Resources ({(form.resources || []).length})</Tab>
            <Tab value="timesheets">Timesheets ({projectTimesheets.length})</Tab>
            <Tab value="expenses">Expenses ({projectExpenses.length})</Tab>
            <Tab value="documents">Documents ({documents.length})</Tab>
            <Tab value="invoices">Invoices ({projectInvoices.length})</Tab>
          </TabList>
        )}

        <div className={styles.tabContent}>
          {(isNew || tab === 'general') && (
            <fieldset disabled={!!isLocked} style={{ border: 'none', padding: 0, margin: 0, ...(isLocked ? { pointerEvents: 'none', opacity: 0.6 } : {}) }}>
              <FormSection title="Project Details">
                <FormField name="name">
                  <Field label="Project Name" required>
                    <Input name="name" value={form.name ?? ''} onChange={handleChange('name')} />
                  </Field>
                </FormField>
                <FormField name="clientId">
                  <Field label="Client" required hint={!isNew && projectData?.isDefault ? 'Client cannot be changed for default projects' : undefined}>
                    <Select name="clientId" value={form.clientId ?? ''} onChange={handleChange('clientId')} disabled={!isNew && projectData?.isDefault}>
                      <option value="">Select client...</option>
                      {allClients.map((c) => (
                        <option key={c._id} value={c._id}>{c.companyName}</option>
                      ))}
                    </Select>
                  </Field>
                </FormField>
                <FormField name="endClientId">
                  <Field label="End Client">
                    <Select name="endClientId" value={form.endClientId ?? ''} onChange={handleChange('endClientId')}>
                      <option value="">None</option>
                      {allClients.map((c) => (
                        <option key={c._id} value={c._id}>{c.companyName}</option>
                      ))}
                    </Select>
                  </Field>
                </FormField>
                <FormField name="ir35Status">
                  <Field label="IR35 Status" required>
                    <Select name="ir35Status" value={form.ir35Status ?? ''} onChange={handleChange('ir35Status')}>
                      <option value="OUTSIDE_IR35">Outside IR35</option>
                      <option value="INSIDE_IR35">Inside IR35</option>
                      <option value="FIXED_TERM">Fixed Term</option>
                    </Select>
                  </Field>
                </FormField>
                <FormField name="rate">
                  <Field label="Rate (per day)" hint={form.rate === '' ? ratePlaceholder : undefined}>
                    <Input
                      name="rate"
                      type="number"
                      value={form.rate ?? ''}
                      onChange={handleChange('rate')}
                      placeholder={ratePlaceholder}
                    />
                  </Field>
                </FormField>
                <FormField name="workingHoursPerDay">
                  <Field label="Working Hours Per Day" hint={form.workingHoursPerDay === '' ? hoursPlaceholder : undefined}>
                    <Input
                      name="workingHoursPerDay"
                      type="number"
                      value={form.workingHoursPerDay ?? ''}
                      onChange={handleChange('workingHoursPerDay')}
                      placeholder={hoursPlaceholder}
                    />
                  </Field>
                </FormField>
                <FormField name="vatPercent">
                  <Field label="VAT Rate (%)" hint={form.vatPercent === '' ? 'Leave empty for no VAT (exempt)' : undefined}>
                    <Input
                      name="vatPercent"
                      type="number"
                      value={form.vatPercent ?? ''}
                      onChange={handleChange('vatPercent')}
                      placeholder="Leave empty for no VAT"
                    />
                  </Field>
                </FormField>
                <FormField name="status">
                  <Field label="Status">
                    <Select name="status" value={form.status ?? ''} onChange={handleChange('status')}>
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                    </Select>
                  </Field>
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

          {tab === 'resources' && (
            <fieldset disabled={resourcesBlocked} style={{ border: 'none', padding: 0, margin: 0, ...(resourcesBlocked ? { pointerEvents: 'none', opacity: 0.6 } : {}) }}>
              <div style={{ marginBottom: '12px' }}>
                <Button
                  appearance="outline"
                  size="small"
                  icon={<AddRegular />}
                  onClick={openAddResource}
                  disabled={!!isLocked || resourcesBlocked}
                >
                  Add resource
                </Button>
              </div>
              {(form.resources || []).length === 0 ? (
                <div className={styles.empty}>
                  <Text>No resources assigned to this project.</Text>
                </div>
              ) : (
                <DataGrid
                  items={form.resources || []}
                  columns={resourceColumns}
                  sortable
                  getRowId={(item) => item.id}
                  style={{ width: '100%' }}
                >
                  <DataGridHeader>
                    <DataGridRow>
                      {({ renderHeaderCell }) => (
                        <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                      )}
                    </DataGridRow>
                  </DataGridHeader>
                  <DataGridBody>
                    {({ item, rowId }) => (
                      <DataGridRow
                        key={rowId}
                        className={isLocked ? undefined : styles.row}
                        onClick={() => {
                          if (!isLocked) openEditResource(item);
                        }}
                      >
                        {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                      </DataGridRow>
                    )}
                  </DataGridBody>
                </DataGrid>
              )}
            </fieldset>
          )}

          {tab === 'timesheets' && projectData && (
            projectTimesheets.length === 0 ? (
              <div className={styles.empty}>
                <Text>No timesheet entries for this project.</Text>
              </div>
            ) : (
              <DataGrid
                items={projectTimesheets}
                columns={timesheetColumns}
                sortable
                getRowId={(item) => item._id}
                style={{ width: '100%' }}
              >
                <DataGridHeader>
                  <DataGridRow>
                    {({ renderHeaderCell }) => (
                      <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                    )}
                  </DataGridRow>
                </DataGridHeader>
                <DataGridBody>
                  {({ item, rowId }) => (
                    <DataGridRow
                      key={rowId}
                      className={styles.row}
                      onClick={() => navigate(`/timesheets/${item._id}`)}
                    >
                      {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                    </DataGridRow>
                  )}
                </DataGridBody>
              </DataGrid>
            )
          )}

          {tab === 'expenses' && projectData && (
            projectExpenses.length === 0 ? (
              <div className={styles.empty}>
                <Text>No expenses for this project.</Text>
              </div>
            ) : (
              <DataGrid
                items={projectExpenses}
                columns={expenseColumns}
                sortable
                getRowId={(item) => item._id}
                style={{ width: '100%' }}
              >
                <DataGridHeader>
                  <DataGridRow>
                    {({ renderHeaderCell }) => (
                      <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                    )}
                  </DataGridRow>
                </DataGridHeader>
                <DataGridBody>
                  {({ item, rowId }) => (
                    <DataGridRow
                      key={rowId}
                      className={styles.row}
                      onClick={() => navigate(`/expenses/${item._id}`)}
                    >
                      {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                    </DataGridRow>
                  )}
                </DataGridBody>
              </DataGrid>
            )
          )}

          {tab === 'documents' && (
            documents.length === 0 ? (
              <div className={styles.empty}>
                <Text>No saved documents for this project.</Text>
              </div>
            ) : (
              <DataGrid
                items={documents}
                columns={documentColumns}
                sortable
                getRowId={(item) => item._id}
                style={{ width: '100%' }}
              >
                <DataGridHeader>
                  <DataGridRow>
                    {({ renderHeaderCell }) => (
                      <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                    )}
                  </DataGridRow>
                </DataGridHeader>
                <DataGridBody>
                  {({ item, rowId }) => (
                    <DataGridRow
                      key={rowId}
                      className={styles.row}
                      onClick={() => window.open(documentsApi.getFileUrl(item._id), '_blank')}
                    >
                      {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                    </DataGridRow>
                  )}
                </DataGridBody>
              </DataGrid>
            )
          )}

          {tab === 'invoices' && (
            projectInvoices.length === 0 ? (
              <div className={styles.empty}>
                <Text>No invoices for this project's client.</Text>
              </div>
            ) : (
              <DataGrid
                items={projectInvoices}
                columns={invoiceColumns}
                sortable
                getRowId={(item) => item._id}
                style={{ width: '100%' }}
              >
                <DataGridHeader>
                  <DataGridRow>
                    {({ renderHeaderCell }) => (
                      <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
                    )}
                  </DataGridRow>
                </DataGridHeader>
                <DataGridBody>
                  {({ item, rowId }) => (
                    <DataGridRow
                      key={rowId}
                      className={styles.row}
                      onClick={() => navigate(`/invoices/${item._id}`)}
                    >
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

      <ResourceDialog
        open={resourceDialogOpen}
        onClose={() => {
          setResourceDialogOpen(false);
          setEditingResource(null);
        }}
        onSubmit={handleResourceSubmit}
        resource={editingResource}
        assignedUserIds={(form.resources || []).filter((r) => r.id !== editingResource?.id).map((r) => r.userId)}
        defaultDailyRate={projectData?.effectiveRate}
      />
      <ConfirmDialog
        open={!!resourceToDelete}
        onClose={() => setResourceToDelete(null)}
        onConfirm={handleResourceDelete}
        title="Remove Resource"
        message={`Remove ${resourceToDelete?.userEmail || 'this resource'} from this project? This takes effect when you save.`}
      />
    </div>
    </>
  );
}
