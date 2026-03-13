---
name: forms-guide
description: Standards for entity form views. Load this skill when creating, modifying, or fixing any form component — covers structure, save pattern, dirty tracking, field validation, record locking, query string pre-fill, navigation guards, and render order.
user-invocable: true
allowed-tools: Read, Grep, Glob
---

# Forms Guide

## File Location

`src/pages/{entity}/{EntityName}Form.jsx`

One component handles both create and edit — detected via `useParams().id`.

## Required Imports

```jsx
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { makeStyles, tokens, Text, Input, Field, Spinner, MessageBar, MessageBarBody,
  Breadcrumb, BreadcrumbItem, BreadcrumbDivider, BreadcrumbButton } from '@fluentui/react-components';
import { entityApi } from '../../api/index.js';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import MarkdownEditor from '../../components/MarkdownEditor.jsx';
import { useFormTracker } from '../../hooks/useFormTracker.js';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx';
import useAppNavigate from '../../hooks/useAppNavigate.js';
import { useNotifyParent } from '../../hooks/useNotifyParent.js';
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
  const isNew = !id;
  const { registerGuard } = useUnsavedChanges();
  const { navigate, goBack } = useAppNavigate();

  const { form, setForm, setBase, resetBase, formRef, isDirty, changedFields, base, baseReady } = useFormTracker();
  const notifyParent = useNotifyParent();
  const [initialized, setInitialized] = useState(false);

  const [loadedData, setLoadedData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // ... data loading, handlers, render
}
```

The hook owns `formRef`, `resetBase`, and `baseReady` — forms do not define these locally.

### Form Load Lifecycle (PROTECTED — do not change without explicit discussion, plan, and approval)

The form load lifecycle follows five strict milestones. The sequence below is the single source of truth for how forms initialize. Pre-work steps (data fetching, rendering the hidden form) happen before Milestone 1, but the milestones themselves MUST execute in this exact order:

| # | Milestone | What happens |
|---|-----------|--------------|
| 1 | **Build initial-object from DOM** | `resetBase(overrides)` scans all `[name]` elements via `buildInitialFromDOM(formRef.current)` → produces an object with every field name and its DOM default value. This is how we eliminated `|| ''` fallbacks — the scanner discovers field names from JSX, making JSX the single source of truth. |
| 2 | **Edit mode: merge API data** | If editing, the fetched API record is passed as `overrides` to `resetBase(data)` — API values override scanned defaults. |
| 3 | **New mode: keep initial-object** | If creating, only meaningful defaults are passed as overrides (e.g. `{ date: today, billable: true, projectId }`). Remaining fields keep their DOM-scanned defaults. |
| 4 | **Set values on form elements** | `setBase(merged)` inside `resetBase` writes the merged object to both `baseRef` (dirty-tracking baseline) and form state. The form becomes visible (`initialized = true`). |
| 5 | **QueryStringPrefill runs last** | QS prefill is gated on `baseReady` (not `initialized`). It calls `handleChange` for each URL param, simulating user interaction. Side effects fire naturally. Because the base already has all field names (from Milestone 1), side-effect-computed fields don't cause false dirty indicators. |

**Why this order matters:** The DOM scan (M1) must happen before QS prefill (M5) so the base contains every field name. QS prefill must run last because it simulates user input — any earlier and it would race with initialization.

**Hidden-form pattern enables M1:** The form always renders (hidden via `display: none` until `initialized`). This ensures the DOM exists when `resetBase` runs in the init `useEffect`, so the scanner finds all `[name]` elements. Field values use `?? ''` / `?? false` fallbacks for the brief hidden phase before `resetBase` populates real values — this keeps Fluent UI components in controlled mode from first render.

**Key rules:**
- All form inputs MUST have `name` attributes matching database field names
- MarkdownEditor fields MUST pass `name="fieldName"` prop (renders a hidden input for scanning)
- `useFormTracker()` is called with no arguments (defaults to `{}`) — no hardcoded initial objects. **Exception:** complex properties that cannot be discovered by DOM scanning (e.g. `lines: []` in InvoiceForm) may be passed as initial state: `useFormTracker({ lines: [] })`
- `formRef` and `resetBase` come from the hook, not defined locally
- `baseReady` gates QS prefill; `initialized` gates form visibility

## Data Loading Pattern

```jsx
useEffect(() => {
  const init = async () => {
    try {
      // Load lookup data (projects, clients, etc.)
      if (!isNew) {
        const data = await entityApi.getById(id);
        setLoadedData(data);
        resetBase(data);
      } else {
        resetBase({ date: today, hours: 8, projectId: active[0]._id });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setInitialized(true);
    }
  };
  init();
}, [id, isNew, resetBase]);
```

## GOLDEN RULE: Query String Pre-fill via `QueryStringPrefill`

**Every form MUST support query string parameters.** This is a core platform feature — any form (new or edit, any entity) can be opened with query params that map to entity field names. Pre-filled fields show the blue changed indicator automatically.

**Location:** `src/components/QueryStringPrefill.jsx`

`QueryStringPrefill` is a renderless component (returns `null`) that calls the form's `handleChange` for each URL query parameter. Values flow through the same code path as user interaction — all side effects fire naturally (VAT recalc, currency update, days/amount recomputation).

### How to mount

Mount it inside the form's main return, before `FormCommandBar`. Pass the form's `handleChange` function:

```jsx
return (
  <>
    {!initialized && <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>}
    <div className={styles.page} ref={formRef} style={{ display: initialized ? undefined : 'none' }}>
      <QueryStringPrefill handleChange={handleChange} ready={baseReady} />
      <FormCommandBar ... />
      ...
    </div>
  </>
);
```

**`ready={baseReady}`** — QS prefill is gated on `baseReady` (from `useFormTracker`), NOT `initialized`. This ensures the DOM scan and base setup (Milestones 1-4) complete before QS prefill fires (Milestone 5).

### Golden rules

1. **`handleChange` must handle all form fields.** The curried `handleChange(field)(e, data)` pattern must work for every field that might be QS-prefilled. Fields with special logic (VAT, currency, days/amount) need explicit branches; generic fields fall through the `else` branch.
2. **Form state keys in `useFormTracker` MUST match database field names.** URL query string keys map to the `field` argument of `handleChange`.
3. **VAT calculations MUST use `shared/expenseVatCalc.js`.** Never duplicate VAT logic in form code — call `deriveVatFromPercent`/`deriveVatFromAmount` from `handleChange`.

### How it works

1. On mount, reads `window.location.search` into `URLSearchParams`
2. Iterates params **in URL order** — applies each value sequentially
3. For each param, calls `handleChange(key)(null, { value: coercedValue })`
4. Basic type coercion: `'true'`/`'false'` → boolean, everything else → string as-is
5. `handleChange` runs with the same logic as user interaction → side effects fire → dirty styling appears
6. Non-field params (e.g. `embedded`, `transactionId`) pass through `handleChange`'s else branch harmlessly — they're added to form state but ignored by the API

### Developer responsibility

The component is intentionally simple — it does not validate, reorder, or reason about values. The developer building the URL is responsible for:
- Correct field names matching `handleChange` field keys
- Correct value formats (numbers as valid numeric strings, dates as YYYY-MM-DD)
- Correct key order when field dependencies matter (e.g. set `amount` before `vatPercent`)

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

Example URL: `/expenses/new?amount=45.60&date=2026-03-10&description=Train%20ticket`

### Side-effect params (e.g. `transactionId`)

Some query params are not form fields but trigger post-save side effects (e.g. linking an expense to a transaction). Read these separately — do NOT use `useSearchParams` from react-router (it causes re-renders). Use `window.location.search` directly:

```jsx
const sourceTransactionId = useMemo(() => {
  if (!isNew) return null;
  return new URLSearchParams(window.location.search).get('transactionId');
}, [isNew]);
```

### NEVER

- **NEVER** manually parse query params and merge them into `setForm()`/`resetBase()` — use the component
- **NEVER** use `useSearchParams` for form field pre-fill — the component handles it via DOM
- **NEVER** omit `name` attributes from form fields — even read-only/computed fields need them

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
      // Re-fetch and resetBase for fresh baseline
      const data = await entityApi.getById(id);
      resetBase(data);
      return { ok: true };
    }
  } catch (err) {
    setError(err.message);
    return { ok: false };
  } finally {
    setSaving(false);
  }
}, [form, isNew, id, resetBase]);

const handleSave = async () => {
  const result = await saveForm();
  if (result.ok) {
    notifyParent(handleSave.name, base, form);
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
  if (result.ok) {
    notifyParent(handleSaveAndClose.name, base, form);
    navigate('/entities');
  }
};
```

## Delete Pattern (optional — strongly advised)

Not mandatory, but strongly advised for entity forms. Missing delete handler should be flagged as a warning (not a failure) in audits. Some forms (e.g. ClientForm, ProjectForm) may omit delete when it's only available from the list view.

```jsx
const handleDelete = async () => {
  try {
    await entityApi.delete(id);
    notifyParent('delete', base, form);
    navigate('/entities');
  } catch (err) {
    setError(err.message);
  }
};
```

## Parent Notification (Embedded Mode)

Every form must call `notifyParent` after successful handler actions. This enables embedded mode — when a form is loaded in an iframe with `?embedded=true`, it posts a message to the parent window so the host page can react (e.g. close a dialog, refresh data).

```jsx
const notifyParent = useNotifyParent();
```

Call it in each handler **after the action succeeds**, passing a command name, `base` (from useFormTracker), and `form`:

```jsx
notifyParent(handleSave.name, base, form);
// or with string literals:
notifyParent('save', base, form);
```

Both `handleFn.name` and string literals are accepted. String literals are preferred when readability matters or to avoid production minification mangling function names.

- **No-op when not in iframe:** The hook checks `window.parent === window` and returns early.
- **Entity derived from route:** First path segment of `location.pathname` (e.g. `/expenses/new` → `"expenses"`).
- **Only generic handlers:** Call from `handleSave`, `handleSaveAndClose`, `handleDelete`. Do NOT call from lifecycle actions (confirm, post, unconfirm, abandon).

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
  onBack={() => goBack('/entities')}
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

### Numeric Fields

Use `<Input type="number">` for all numeric fields. This is a controlled component that stays in sync with form state:

```jsx
<Input
  name="fieldName"
  type="number"
  value={String(form.fieldName ?? '')}
  onChange={(e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) setForm((prev) => ({ ...prev, fieldName: val }));
  }}
  min={0}
  step={0.01}
/>
```

**Do NOT use SpinButton.** It requires uncontrolled mode (`defaultValue`) which only reads the value on mount and ignores subsequent state updates. This causes stale values when data loads asynchronously or the form baseline changes.

### Project Dropdown (grouped by client)

```jsx
<Select name="projectId" value={form.projectId} onChange={handleChange('projectId')}>
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

Forms use the hidden-form pattern — the form always renders (hidden via `display: none`) so DOM scanning works, with a spinner shown until `initialized` is true:

```jsx
return (
  <>
    {!initialized && <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>}
    <div className={styles.page} ref={formRef} style={{ display: initialized ? undefined : 'none' }}>
      <QueryStringPrefill handleChange={handleChange} ready={baseReady} />
      ...form content...
    </div>
  </>
);
```

Field values use `?? ''` (or `?? false` for checkboxes) to ensure Fluent UI components start in controlled mode during the hidden phase. After `resetBase` populates all fields, these fallbacks never activate:

```jsx
<Input name="amount" type="number" value={String(form.amount ?? '')} ... />
<Input name="date" type="date" value={form.date ?? ''} ... />
<Select name="projectId" value={form.projectId ?? ''} ... />
<Checkbox name="billable" checked={form.billable ?? false} ... />
```
