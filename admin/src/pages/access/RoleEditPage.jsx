import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  makeStyles,
  mergeClasses,
  tokens,
  Text,
  Input,
  Field,
  Button,
  Spinner,
  Checkbox,
  Textarea,
  CounterBadge,
  MessageBar,
  MessageBarBody,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Popover,
  PopoverTrigger,
  PopoverSurface,
  Tooltip,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbDivider,
  BreadcrumbButton,
} from '@fluentui/react-components';
import {
  SubtractCircleRegular,
  CheckmarkCircleFilled,
  FilterRegular,
  EditRegular,
  WarningRegular,
  EyeOffRegular,
} from '@fluentui/react-icons';
import { rolesApi } from '../../api/index.js';
import FlsPicker from '../../components/FlsPicker.jsx';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx';
import useAppNavigate from '../../hooks/useAppNavigate.js';
import { useNotifyParent } from '../../hooks/useNotifyParent.js';
import { TABLES, ACTIONS, BASELINE_READ_TABLES } from '../../../../shared/authz/registry.js';
import { MODES, buildEditorState, fromEditorState } from './roleEditorState.js';

// Column order mirrors the user-facing CRUD reading: Read | Create | Update | Delete | Actions
const OP_COLUMNS = ['read', 'create', 'update', 'delete'];
const NEXT_MODE = { none: 'all', all: 'filtered', filtered: 'none' };
const GRID_COLUMNS = 'minmax(150px, 200px) repeat(4, minmax(160px, 1fr)) 90px';

const useStyles = makeStyles({
  page: { maxWidth: '1100px' },
  pageBody: { padding: '16px 24px' },
  header: { marginBottom: '16px' },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase500,
    display: 'block',
    marginBottom: '4px',
  },
  message: { marginBottom: '16px' },
  nameRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(200px, 320px) 1fr',
    gap: '16px',
    marginBottom: '16px',
  },
  matrix: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  gridRow: {
    display: 'grid',
    gridTemplateColumns: GRID_COLUMNS,
    alignItems: 'center',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    '&:last-child': { borderBottom: 'none' },
  },
  // 41px = FormCommandBar height (8px padding ×2 + 24px small button + 1px border)
  headerRow: {
    position: 'sticky',
    top: '41px',
    zIndex: 5,
    backgroundColor: tokens.colorNeutralBackground3,
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  headerCell: { padding: '8px 12px' },
  baselineRow: { backgroundColor: tokens.colorBrandBackground2 },
  tableCell: {
    padding: '6px 12px',
    fontFamily: 'monospace',
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    overflowX: 'hidden',
    textOverflow: 'ellipsis',
  },
  cell: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    padding: '4px 8px',
    minHeight: '36px',
  },
  switchBtn: { minWidth: '92px', justifyContent: 'flex-start' },
  switchNone: { color: tokens.colorNeutralForeground3 },
  switchAll: { color: tokens.colorPaletteGreenForeground1 },
  switchFiltered: { color: tokens.colorBrandForeground1 },
  warnIcon: {
    display: 'inline-flex',
    color: tokens.colorPaletteDarkOrangeForeground1,
    fontSize: '16px',
    padding: '0 2px',
  },
  actionsActive: { color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightSemibold },
  popSurface: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '320px',
  },
  popCaption: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  filterInput: { fontFamily: 'monospace', fontSize: tokens.fontSizeBase200, minHeight: '120px' },
  hint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, marginTop: '8px', display: 'block' },
});

// Empty string or unparseable JSON — the cell shows a warning and save rejects.
function filterInvalid(filter) {
  try {
    JSON.parse(filter || '');
    return false;
  } catch {
    return true;
  }
}

// One-click tri-state cell: No access → All records → Filtered → No access.
// boolOnly (create) skips Filtered — the grammar allows booleans only there.
function CellSwitch({ op, mode, onCycle }) {
  const styles = useStyles();
  const meta = {
    none: { icon: <SubtractCircleRegular />, label: 'None', cls: styles.switchNone },
    all: { icon: <CheckmarkCircleFilled />, label: 'All', cls: styles.switchAll },
    filtered: { icon: <FilterRegular />, label: 'Filtered', cls: styles.switchFiltered },
  }[mode];
  return (
    <Tooltip content={`${op}: ${MODES[mode]} — click to change`} relationship="label">
      <Button
        appearance="subtle"
        size="small"
        icon={meta.icon}
        className={mergeClasses(styles.switchBtn, meta.cls)}
        onClick={onCycle}
      >
        {meta.label}
      </Button>
    </Tooltip>
  );
}

function FlsPopoverButton({ table, op, fls, disabled, options, onOpen, onChange }) {
  const styles = useStyles();
  return (
    <Popover withArrow trapFocus onOpenChange={(e, data) => { if (data.open) onOpen(table); }}>
      <PopoverTrigger disableButtonEnhancement>
        <Tooltip content={`Hidden fields on ${op}`} relationship="label">
          <Button appearance="subtle" size="small" disabled={disabled} icon={<EyeOffRegular />}>
            {fls.length > 0 ? <CounterBadge count={fls.length} size="small" color="informative" /> : null}
          </Button>
        </Tooltip>
      </PopoverTrigger>
      <PopoverSurface className={styles.popSurface}>
        <Text className={styles.popCaption}>
          Hidden fields on <b>{op}</b> for <b>{table}</b> — masked on read, stripped from writes.
          Hide computed siblings together (e.g. hours/days/amount).
        </Text>
        <FlsPicker
          inline
          value={fls}
          options={options}
          onChange={onChange}
          placeholder={`Hidden fields on ${op}...`}
        />
      </PopoverSurface>
    </Popover>
  );
}

function ActionsPopoverButton({ table, granted, onToggle }) {
  const styles = useStyles();
  const actions = ACTIONS[table];
  return (
    <Popover withArrow>
      <PopoverTrigger disableButtonEnhancement>
        <Tooltip content={granted.length ? `Granted: ${granted.join(', ')}` : 'No actions granted'} relationship="label">
          <Button appearance="subtle" size="small" className={granted.length ? styles.actionsActive : undefined}>
            {granted.length}/{actions.length}
          </Button>
        </Tooltip>
      </PopoverTrigger>
      <PopoverSurface className={styles.popSurface}>
        <Text className={styles.popCaption}>
          Lifecycle actions for <b>{table}</b> (default deny)
        </Text>
        {actions.map((action) => (
          <Checkbox
            key={action}
            label={action}
            checked={granted.includes(action)}
            onChange={(e, d) => onToggle(action, !!d.checked)}
          />
        ))}
      </PopoverSurface>
    </Popover>
  );
}

export default function RoleEditPage() {
  const styles = useStyles();
  const { id } = useParams();
  const isNew = !id;
  const { registerGuard } = useUnsavedChanges();
  const { navigateUnguarded, goBack } = useAppNavigate();
  const notifyParent = useNotifyParent();

  const [form, setForm] = useState({ name: '', description: '' });
  const [privState, setPrivState] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  // { table, op } while the filter dialog is open
  const [filterEditor, setFilterEditor] = useState(null);
  // Sampled field names per table for the fls pickers, fetched lazily on first
  // popover open. Failures degrade to [] — custom entry via Enter still works.
  const [fieldOptions, setFieldOptions] = useState({});
  const fieldFetchRef = useRef(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let nextForm, nextPriv;
        if (isNew) {
          nextForm = { name: '', description: '' };
          // Baseline reads pre-added — list enrichment needs them (default deny otherwise)
          nextPriv = buildEditorState(Object.fromEntries(BASELINE_READ_TABLES.map((t) => [t, { read: true }])));
        } else {
          const role = await rolesApi.getById(id);
          nextForm = { name: role.name, description: role.description || '' };
          nextPriv = buildEditorState(role.privileges);
        }
        if (cancelled) return;
        setForm(nextForm);
        setPrivState(nextPriv);
        setBaseline(JSON.stringify({ form: nextForm, privState: nextPriv }));
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setInitialized(true);
      }
    })();
    return () => { cancelled = true; };
  }, [id, isNew]);

  const isDirty = useMemo(
    () => baseline !== null && JSON.stringify({ form, privState }) !== baseline,
    [form, privState, baseline]
  );

  const setOp = (table, op, patch) => {
    setPrivState((prev) => ({
      ...prev,
      [table]: { ...prev[table], [op]: { ...prev[table][op], ...patch } },
    }));
  };

  const setEntry = (table, patch) => {
    setPrivState((prev) => ({ ...prev, [table]: { ...prev[table], ...patch } }));
  };

  // Cycling only ever changes the mode — filter text and fls lists stay in
  // state so toggling away and back is non-destructive; fromEditorState emits
  // according to the final mode only.
  const cycleOp = (table, op) => {
    setOp(table, op, { mode: NEXT_MODE[privState[table][op].mode] });
  };

  const toggleAction = (table, action, checked) => {
    setPrivState((prev) => ({
      ...prev,
      [table]: {
        ...prev[table],
        actions: checked
          ? [...prev[table].actions, action]
          : prev[table].actions.filter((a) => a !== action),
      },
    }));
  };

  const ensureFieldOptions = useCallback((table) => {
    if (fieldFetchRef.current.has(table)) return;
    fieldFetchRef.current.add(table);
    rolesApi.getTableFields(table)
      .then((fields) => setFieldOptions((prev) => ({ ...prev, [table]: fields })))
      .catch(() => setFieldOptions((prev) => ({ ...prev, [table]: [] })));
  }, []);

  const saveForm = useCallback(async () => {
    if (!form.name.trim()) {
      setError('Role name is required.');
      return { ok: false };
    }
    const result = fromEditorState(privState);
    if (result.error) {
      setError(result.error);
      return { ok: false };
    }
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const payload = { name: form.name.trim(), description: form.description, privileges: result.privileges };
      if (isNew) {
        const created = await rolesApi.create(payload);
        return { ok: true, id: created._id };
      }
      await rolesApi.update(id, payload);
      const fresh = await rolesApi.getById(id);
      const nextForm = { name: fresh.name, description: fresh.description || '' };
      const nextPriv = buildEditorState(fresh.privileges);
      setForm(nextForm);
      setPrivState(nextPriv);
      setBaseline(JSON.stringify({ form: nextForm, privState: nextPriv }));
      return { ok: true };
    } catch (err) {
      setError(err.message);
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }, [form, privState, isNew, id]);

  const handleSave = async () => {
    const result = await saveForm();
    if (result.ok) {
      notifyParent('save', baseline ? JSON.parse(baseline).form : {}, form);
      if (isNew) {
        navigateUnguarded(`/access/roles/${result.id}`, { replace: true });
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 4000);
      }
    }
  };

  const handleSaveAndClose = async () => {
    const result = await saveForm();
    if (result.ok) {
      notifyParent('saveAndClose', baseline ? JSON.parse(baseline).form : {}, form);
      navigateUnguarded('/access/roles');
    }
  };

  useEffect(() => {
    return registerGuard({ isDirty, onSave: saveForm });
  }, [isDirty, saveForm, registerGuard]);

  const missingBaseline = privState
    ? BASELINE_READ_TABLES.filter((t) => privState[t].read.mode === 'none')
    : [];

  const renderOpCell = (table, op) => {
    const entry = privState[table];
    if (op === 'create') {
      return (
        <div key={op} className={styles.cell}>
          <CellSwitch
            op="create"
            mode={entry.create ? 'all' : 'none'}
            onCycle={() => setEntry(table, { create: !entry.create })}
          />
          <FlsPopoverButton
            table={table}
            op="create"
            fls={entry.createFls}
            disabled={!entry.create}
            options={fieldOptions[table]}
            onOpen={ensureFieldOptions}
            onChange={(createFls) => setEntry(table, { createFls })}
          />
        </div>
      );
    }
    const cellState = entry[op];
    return (
      <div key={op} className={styles.cell}>
        <CellSwitch op={op} mode={cellState.mode} onCycle={() => cycleOp(table, op)} />
        {cellState.mode === 'filtered' && (
          <>
            <Tooltip content="Edit filter" relationship="label">
              <Button
                appearance="subtle"
                size="small"
                icon={<EditRegular />}
                onClick={() => setFilterEditor({ table, op })}
              />
            </Tooltip>
            {filterInvalid(cellState.filter) && (
              <Tooltip content="Filter is empty or not valid JSON — the role cannot be saved" relationship="label">
                <span className={styles.warnIcon}><WarningRegular /></span>
              </Tooltip>
            )}
          </>
        )}
        {op !== 'delete' && (
          <FlsPopoverButton
            table={table}
            op={op}
            fls={cellState.fls}
            disabled={cellState.mode === 'none'}
            options={fieldOptions[table]}
            onOpen={ensureFieldOptions}
            onChange={(fls) => setOp(table, op, { fls })}
          />
        )}
      </div>
    );
  };

  const editorFilter = filterEditor ? privState[filterEditor.table][filterEditor.op].filter : '';

  return (
    <>
      {!initialized && <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>}
      {initialized && (
        <div className={styles.page}>
          <FormCommandBar
            onBack={() => goBack('/access/roles')}
            onSave={handleSave}
            onSaveAndClose={handleSaveAndClose}
            saveDisabled={!form.name.trim()}
            saving={saving}
          />
          <div className={styles.pageBody}>
            <Breadcrumb>
              <BreadcrumbItem>
                <BreadcrumbButton onClick={() => goBack('/access/roles')}>Roles</BreadcrumbButton>
              </BreadcrumbItem>
              <BreadcrumbDivider />
              <BreadcrumbItem>
                <BreadcrumbButton current>{isNew ? 'New Role' : form.name || 'Role'}</BreadcrumbButton>
              </BreadcrumbItem>
            </Breadcrumb>
            <div className={styles.header}>
              <Text className={styles.title}>{isNew ? 'New Role' : form.name}</Text>
            </div>

            {error && (
              <MessageBar intent="error" className={styles.message}>
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            {success && (
              <MessageBar intent="success" className={styles.message}>
                <MessageBarBody>Role updated. Changes apply to members on their next request.</MessageBarBody>
              </MessageBar>
            )}

            {privState && (
              <>
                <div className={styles.nameRow}>
                  <Field label="Name" required>
                    <Input
                      name="name"
                      value={form.name}
                      onChange={(e, d) => setForm((prev) => ({ ...prev, name: d.value }))}
                      placeholder="e.g. Contractor"
                    />
                  </Field>
                  <Field label="Description">
                    <Input
                      name="description"
                      value={form.description}
                      onChange={(e, d) => setForm((prev) => ({ ...prev, description: d.value }))}
                    />
                  </Field>
                </div>

                {missingBaseline.length > 0 && (
                  <MessageBar intent="warning" className={styles.message}>
                    <MessageBarBody>
                      Missing baseline reads: {missingBaseline.join(', ')} — list enrichment
                      needs read access on these or pages will fail with 403.
                    </MessageBarBody>
                  </MessageBar>
                )}

                <div className={styles.matrix}>
                  <div className={mergeClasses(styles.gridRow, styles.headerRow)}>
                    <div className={styles.headerCell}>Table</div>
                    <div className={styles.headerCell}>Read</div>
                    <div className={styles.headerCell}>Create</div>
                    <div className={styles.headerCell}>Update</div>
                    <div className={styles.headerCell}>Delete</div>
                    <div className={styles.headerCell}>Actions</div>
                  </div>
                  {TABLES.map((table) => (
                    <div
                      key={table}
                      className={mergeClasses(
                        styles.gridRow,
                        BASELINE_READ_TABLES.includes(table) && styles.baselineRow
                      )}
                    >
                      <div className={styles.tableCell}>{table}</div>
                      {OP_COLUMNS.map((op) => renderOpCell(table, op))}
                      <div className={styles.cell}>
                        {ACTIONS[table] ? (
                          <ActionsPopoverButton
                            table={table}
                            granted={privState[table].actions}
                            onToggle={(action, checked) => toggleAction(table, action, checked)}
                          />
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                <Text className={styles.hint}>
                  Filters are NeDB queries; macros: $$user.id, $$user.email, $$today, $$startOfWeek/Month/Year, $$today±Nd.
                </Text>
                <Text className={styles.hint}>
                  Hidden fields are masked/stripped for members on that operation; read-hidden fields are
                  also stripped from writes and rejected in filters/sorts. Hide computed siblings together
                  (e.g. hours/days/amount).
                </Text>
              </>
            )}
          </div>

          <Dialog open={!!filterEditor} onOpenChange={(e, data) => { if (!data.open) setFilterEditor(null); }}>
            <DialogSurface>
              <DialogBody>
                <DialogTitle>
                  {filterEditor ? `${filterEditor.table} — ${filterEditor.op} filter` : ''}
                </DialogTitle>
                <DialogContent>
                  <Field
                    validationState={filterEditor && filterInvalid(editorFilter) ? 'warning' : 'none'}
                    validationMessage={
                      filterEditor && filterInvalid(editorFilter)
                        ? 'Not valid JSON yet — the role cannot be saved until this parses.'
                        : undefined
                    }
                  >
                    <Textarea
                      className={styles.filterInput}
                      value={editorFilter}
                      onChange={(e, d) => setOp(filterEditor.table, filterEditor.op, { filter: d.value })}
                      placeholder='{"date": {"$gte": "$$startOfMonth"}}'
                      resize="vertical"
                    />
                  </Field>
                  <Text className={styles.hint}>
                    Filters are NeDB queries; macros: $$user.id, $$user.email, $$today, $$startOfWeek/Month/Year, $$today±Nd.
                  </Text>
                </DialogContent>
                <DialogActions>
                  <Button appearance="primary" onClick={() => setFilterEditor(null)}>Done</Button>
                </DialogActions>
              </DialogBody>
            </DialogSurface>
          </Dialog>
        </div>
      )}
    </>
  );
}
