# Shared Components Guide

## FormCommandBar

**Location:** `src/components/FormCommandBar.jsx`

Sticky command bar at the top of all form views.

### Props

| Prop | Type | Description |
| --- | --- | --- |
| `onBack` | `() => void` | Required. Navigate back (use `guardedNavigate`). |
| `onSave` | `() => void` | Save handler. Hidden when `locked`. |
| `onSaveAndClose` | `() => void` | Optional. Save & Close handler. Hidden when `locked`. |
| `onDelete` | `() => void` | Optional. Opens delete confirmation. Hidden when `locked`. |
| `saveDisabled` | `boolean` | Disables Save buttons (e.g., missing required fields). |
| `saving` | `boolean` | Shows "Saving..." text on Save buttons. |
| `locked` | `boolean` | Hides Save/Delete buttons. Only Back is visible. |
| `children` | `ReactNode` | Extra buttons rendered after a ToolbarDivider. Visible even when locked. |

### Usage

Standard form:
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

Locked form with extra actions (e.g., TransactionForm):
```jsx
<FormCommandBar onBack={() => navigate('/transactions')} locked>
  <Button appearance="primary" icon={<SaveRegular />} onClick={handleAction} size="small">
    Action
  </Button>
</FormCommandBar>
```

All buttons passed as children must use `size="small"` to match the command bar.

---

## CommandBar

**Location:** `src/components/CommandBar.jsx`

Command bar for list views.

### Props

| Prop | Type | Description |
| --- | --- | --- |
| `onNew` | `() => void` | Optional. Navigate to create form. |
| `newLabel` | `string` | Button label (default: "New"). |
| `onDelete` | `() => void` | Optional. Delete selected item. |
| `deleteDisabled` | `boolean` | Disables delete button. |
| `searchValue` | `string` | Current search text. |
| `onSearchChange` | `(value) => void` | Search input handler. Omit to hide search. |
| `children` | `ReactNode` | Extra buttons in the left section. |

---

## FormSection

**Location:** `src/components/FormSection.jsx`

Wraps form fields in a titled 2-column grid.

### Props

| Prop | Type | Description |
| --- | --- | --- |
| `title` | `string` | Optional section heading. |
| `children` | `ReactNode` | `FormField` components. |

### Layout

- 2-column grid on desktop, 1-column on mobile (768px breakpoint)
- 16px gap between fields
- 16px vertical padding around each section

---

## FormField

**Location:** `src/components/FormSection.jsx` (same file)

Wraps individual fields inside a FormSection.

### Props

| Prop | Type | Description |
| --- | --- | --- |
| `fullWidth` | `boolean` | Spans both columns. |
| `changed` | `boolean` | Shows blue left-border indicator (Power Platform style). |
| `children` | `ReactNode` | Typically a Fluent UI `<Field>` with input inside. |

### Usage

```jsx
<FormField changed={changedFields.has('fieldName')}>
  <Field label="Field Label" required hint="Hint text">
    <Input value={form.fieldName} onChange={handleChange('fieldName')} />
  </Field>
</FormField>
```

---

## ConfirmDialog

**Location:** `src/components/ConfirmDialog.jsx`

Used for all destructive actions (delete, abandon, etc.).

### Props

| Prop | Type | Description |
| --- | --- | --- |
| `open` | `boolean` | Controls visibility. |
| `onClose` | `() => void` | Cancel handler. |
| `onConfirm` | `() => void` | Confirm handler. |
| `title` | `string` | Dialog title. |
| `message` | `string` | Dialog body text. |

### Usage

```jsx
const [deleteOpen, setDeleteOpen] = useState(false);

<ConfirmDialog
  open={deleteOpen}
  onClose={() => setDeleteOpen(false)}
  onConfirm={handleDelete}
  title="Delete Entity"
  message="Are you sure? This action cannot be undone."
/>
```

---

## MarkdownEditor

**Location:** `src/components/MarkdownEditor.jsx`

Wraps `@uiw/react-md-editor` for notes fields.

### Usage

Always placed as a fullWidth FormField, outside FormSection:

```jsx
<FormField fullWidth changed={changedFields.has('notes')}>
  <div className={styles.notes}>
    <MarkdownEditor
      label="Notes"
      value={form.notes}
      onChange={(val) => setForm((prev) => ({ ...prev, notes: val }))}
      placeholder="Internal notes..."
      height={200}
    />
  </div>
</FormField>
```

---

## PaginationControls

**Location:** `src/components/PaginationControls.jsx`

Client-side pagination UI. Used with the `usePagination` hook.

### Props

| Prop | Type | Description |
| --- | --- | --- |
| `page` | `number` | Current page (1-indexed). |
| `pageSize` | `number` | Items per page. |
| `totalItems` | `number` | Total item count. |
| `totalPages` | `number` | Total pages. |
| `onPageChange` | `(page) => void` | Page change handler. |
| `onPageSizeChange` | `(size) => void` | Page size change handler. |

### Usage

```jsx
const { pageItems, page, pageSize, setPage, setPageSize, totalPages, totalItems } = usePagination(items);

<PaginationControls
  page={page} pageSize={pageSize} totalItems={totalItems}
  totalPages={totalPages} onPageChange={setPage} onPageSizeChange={setPageSize}
/>
```

---

## AttachmentGallery

**Location:** `src/components/AttachmentGallery.jsx`

File upload and thumbnail gallery for expense attachments. Only shown on edit (not create).

### Usage

```jsx
{isNew ? (
  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
    Save first to add attachments.
  </Text>
) : (
  <AttachmentGallery
    expenseId={id}
    attachments={attachments}
    onUpload={handleUpload}
    onDelete={handleDeleteAttachment}
    uploading={uploading}
    readOnly={!!isLocked}
  />
)}
```

---

## Hooks

### useFormTracker

**Location:** `src/hooks/useFormTracker.js`

Tracks form state, dirty detection, and changed fields.

```jsx
const { form, setForm, setBase, isDirty, changedFields } = useFormTracker(
  initialState,
  { excludeFields: ['computedField'] }
);
```

- `setBase(state)` — call after API load and after save to set the baseline
- `isDirty` — true if any non-excluded field differs from baseline
- `changedFields` — `Set<string>` of field names that changed
- `excludeFields` — computed/read-only fields that don't count toward dirty state

### usePagination

**Location:** `src/hooks/usePagination.js`

Client-side array pagination.

```jsx
const { pageItems, page, pageSize, setPage, setPageSize, totalPages, totalItems } =
  usePagination(items, { defaultPageSize: 25 });
```

Resets to page 1 when items or pageSize change.
