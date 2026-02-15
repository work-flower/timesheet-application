# Forms Guide

## File Location

`src/pages/{entity}/{EntityName}Form.jsx`

One component handles both create and edit — detected via `useParams().id`.

## Required Imports

```jsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { makeStyles, tokens, Text, Input, Field, Spinner, MessageBar, MessageBarBody,
  Breadcrumb, BreadcrumbItem, BreadcrumbDivider, BreadcrumbButton } from '@fluentui/react-components';
import { entityApi } from '../../api/index.js';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import MarkdownEditor from '../../components/MarkdownEditor.jsx';
import { useFormTracker } from '../../hooks/useFormTracker.js';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx';
```

## Standard Styles

```jsx
const useStyles = makeStyles({
  page: {},
  pageBody: { padding: '16px 24px' },
  header: { marginBottom: '16px' },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase500,
    display: 'block',
    marginBottom: '4px',
  },
  message: { marginBottom: '16px' },
  notes: { marginTop: '16px' },
});
```

## Component Skeleton

```jsx
export default function EntityForm() {
  const styles = useStyles();
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const { registerGuard, guardedNavigate } = useUnsavedChanges();

  const { form, setForm, setBase, isDirty, changedFields } = useFormTracker({
    // all form fields with defaults
  }, { excludeFields: ['computedField1'] });

  const [loadedData, setLoadedData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // ... data loading, handlers, render
}
```

## Data Loading Pattern

```jsx
useEffect(() => {
  const init = async () => {
    try {
      // Load lookup data (projects, clients, etc.)
      if (!isNew) {
        const data = await entityApi.getById(id);
        setLoadedData(data);
        setBase({ /* map all fields from data */ });
      } else {
        setBase({ /* defaults for new record */ });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  init();
}, [id, isNew, setBase]);
```

## GOLDEN RULE: Query String Pre-fill

**Every form MUST support query string parameters.** This is a core platform feature — any form (new or edit, any entity) can be opened with query params that map to entity properties. Pre-filled fields show the blue changed indicator automatically.

**This is built into `useFormTracker`.** The hook's `setBase()` method automatically applies query params from `window.location.search` on its first call. No manual handling is needed.

### How it works (inside `useFormTracker`)

1. On hook init, `parseQueryParams()` reads all URL query params with auto type coercion (booleans, numbers, strings)
2. On the first `setBase()` call, the base is set (establishing the "clean" state), then query params are applied via `setForm()` on top
3. Result: overridden fields appear as changed (blue indicator), form is dirty, navigation guard activates

### What this means for form authors

- **Do nothing extra.** Just call `setBase()` as normal with defaults (new) or loaded data (edit). The hook handles query params automatically.
- **All query params are passed through.** Parameter names map to form property names. No filtering — the developer navigating to the form is responsible for passing valid keys.
- **Type coercion is automatic:** `"true"`/`"false"` → boolean, numeric strings → `parseFloat()`, everything else → string.
- **Works in both new and edit modes.** On edit, query params override loaded record values.

### Example: navigating with pre-fill

```jsx
// From TransactionForm — creates expense pre-filled from transaction data
const params = new URLSearchParams();
params.set('date', data.date);
params.set('amount', String(Math.abs(data.amount)));
params.set('description', data.description || '');
params.set('transactionId', id);
navigate(`/expenses/new?${params.toString()}`);
```

### Side-effect params (e.g. `transactionId`)

Some query params are not form fields but trigger post-save side effects (e.g. linking an expense to a transaction). Read these separately — do NOT use `useSearchParams` from react-router (it causes re-renders). Use `window.location.search` directly:

```jsx
const sourceTransactionId = useMemo(() => {
  if (!isNew) return null;
  return new URLSearchParams(window.location.search).get('transactionId');
}, [isNew]);
```

### NEVER

- **NEVER** manually parse query params and merge them into `setBase()` — this makes them invisible to dirty tracking
- **NEVER** use `useSearchParams` for form field pre-fill — the hook handles it
- **NEVER** filter or ignore unknown query params — pass everything through

## Save Pattern

`saveForm` returns `{ ok: boolean, id?: string }` — it does NOT navigate.

```jsx
const saveForm = useCallback(async () => {
  setSaving(true);
  setError(null);
  setSuccess(false);
  try {
    if (isNew) {
      const created = await entityApi.create(form);
      return { ok: true, id: created._id };
    } else {
      await entityApi.update(id, form);
      // Re-fetch and setBase for fresh baseline
      const data = await entityApi.getById(id);
      setBase({ /* map fields */ });
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
      navigate(`/entities/${result.id}`, { replace: true });
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  }
};

const handleSaveAndClose = async () => {
  const result = await saveForm();
  if (result.ok) navigate('/entities');
};
```

## Delete Pattern

```jsx
const handleDelete = async () => {
  try {
    await entityApi.delete(id);
    navigate('/entities');
  } catch (err) {
    setError(err.message);
  }
};
```

## Navigation Guard

Must be registered. Guard dialog calls `saveForm` directly.

```jsx
useEffect(() => {
  return registerGuard({ isDirty, onSave: saveForm });
}, [isDirty, saveForm, registerGuard]);
```

## Record Locking

Every form must support locking. Derive lock state from loaded data:

```jsx
const isLocked = !isNew && loadedData?.isLocked;
const lockReason = loadedData?.isLockedReason;
```

## Render Structure

The order is strict:

```
page (no padding)
  └── FormCommandBar (sticky at top)
  └── pageBody (padding: 16px 24px)
        └── Breadcrumb
        └── Title
        └── Error MessageBar (if error)
        └── Success MessageBar (if success)
        └── Lock warning MessageBar (if isLocked)
        └── <fieldset disabled={isLocked}> with lock styling
              └── FormSection(s) with FormField(s)
              └── MarkdownEditor for notes (fullWidth)
        └── ConfirmDialog for delete
```

### Fieldset Lock Wrapper

All form content must be inside this wrapper:

```jsx
<fieldset disabled={!!isLocked} style={{
  border: 'none', padding: 0, margin: 0,
  ...(isLocked ? { pointerEvents: 'none', opacity: 0.6 } : {})
}}>
```

### FormCommandBar

```jsx
<FormCommandBar
  onBack={() => guardedNavigate('/entities')}
  onSave={handleSave}
  onSaveAndClose={handleSaveAndClose}
  onDelete={!isNew ? () => setDeleteOpen(true) : undefined}
  saveDisabled={!form.requiredField}
  saving={saving}
  locked={isLocked}
/>
```

Extra action buttons can be passed as `children` — they render after a ToolbarDivider, even when `locked` is true. Use `size="small"` to match other command bar buttons.

### MessageBars

```jsx
{error && <MessageBar intent="error" className={styles.message}><MessageBarBody>{error}</MessageBarBody></MessageBar>}
{success && <MessageBar intent="success" className={styles.message}><MessageBarBody>Entity saved successfully.</MessageBarBody></MessageBar>}
{isLocked && <MessageBar intent="warning" className={styles.message}><MessageBarBody>{lockReason || 'This record is locked.'}</MessageBarBody></MessageBar>}
```

### Fields

- Wrap each field with `<FormField changed={changedFields.has('fieldName')}>` for the blue left-border indicator
- Use `<FormField fullWidth>` to span both columns
- Use `<Field label="..." required hint="...">` inside FormField
- Notes field uses `MarkdownEditor` component, placed outside FormSection, as a fullWidth FormField

### SpinButton

Must use uncontrolled mode. Never use `value` prop — use `defaultValue`:

```jsx
<SpinButton
  defaultValue={form.fieldName}
  onChange={(e, data) => {
    const val = data.value ?? parseFloat(data.displayValue);
    if (val != null && !isNaN(val)) {
      setForm((prev) => ({ ...prev, fieldName: val }));
    }
  }}
  min={0}
  step={0.01}
/>
```

### Project Dropdown (grouped by client)

```jsx
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
```

## Change Handler

```jsx
const handleChange = (field) => (e, data) => {
  const value = data?.value ?? e.target.value;
  setForm((prev) => ({ ...prev, [field]: value }));
};
```

## Loading State

```jsx
if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;
```
