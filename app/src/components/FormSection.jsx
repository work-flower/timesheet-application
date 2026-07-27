import { createContext, useContext, useMemo, Children, cloneElement, isValidElement } from 'react';
import { makeStyles, mergeClasses, tokens, Text, Field, Input } from '@fluentui/react-components';
import { EyeOffRegular } from '@fluentui/react-icons';
import { REDACTED } from '../../../shared/authz/redaction.js';

const useStyles = makeStyles({
  section: {
    padding: '16px 0',
  },
  sectionTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    marginBottom: '16px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    '@media (max-width: 768px)': {
      gridTemplateColumns: '1fr',
    },
  },
  fullWidth: {
    gridColumn: 'span 2',
    '@media (max-width: 768px)': {
      gridColumn: 'span 1',
    },
  },
  changed: {
    borderLeft: `3px solid ${tokens.colorBrandStroke1}`,
    paddingLeft: '8px',
    backgroundColor: tokens.colorBrandBackground2,
    borderRadius: tokens.borderRadiusSmall,
  },
});

export function FormSection({ title, children }) {
  const styles = useStyles();
  return (
    <div className={styles.section}>
      {title && <Text className={styles.sectionTitle} block>{title}</Text>}
      <div className={styles.grid}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FormDataProvider — thin per-form context binding data state to field UI.
//
// The form declares it once at its root; FormField (given a `name`) derives
// its own state from it: field-level security (redacted / write-blocked) and
// the changed indicator. It owns NO state — useFormTracker remains the single
// owner; this only publishes. (Write direction — carrying setForm/handleChange
// for self-wiring controls — is a deliberate future socket, not used today.)
// ---------------------------------------------------------------------------
const FormDataContext = createContext(null);

export function FormDataProvider({ table, isNew, fls, changedFields, locked, children }) {
  const value = useMemo(
    () => ({ table, isNew: !!isNew, fls, changedFields, locked: !!locked }),
    [table, isNew, fls, changedFields, locked]
  );
  return <FormDataContext.Provider value={value}>{children}</FormDataContext.Provider>;
}

export function useFormData() {
  return useContext(FormDataContext);
}

// ---------------------------------------------------------------------------
// Field-level security rendering
// ---------------------------------------------------------------------------
const EMPTY_SET = new Set();
const REDACTED_HINT = 'Hidden by your security role';
const READONLY_HINT = 'Read-only for your security role';
const BLOCKED_FIELDSET_STYLE = {
  border: 'none',
  padding: 0,
  margin: 0,
  pointerEvents: 'none',
  opacity: 0.6,
};

// Locate a control's `name` among children: <Input name>, <Select name>,
// <Checkbox name>, and Combobox's input={{ name }}.
function findControlName(children) {
  for (const el of Children.toArray(children)) {
    if (!isValidElement(el)) continue;
    const name = el.props?.name ?? el.props?.input?.name;
    if (typeof name === 'string') return name;
  }
  return undefined;
}

// The standard control shown in place of ANY redacted field, regardless of the
// original control type (number/date inputs and checkboxes cannot display a
// sentinel). Keeps `name` in the DOM so the form-load scanner still discovers
// the field (disabled inputs scan as '' — API overrides win in edit mode).
function RedactedControl({ name }) {
  return <Input name={name} value={REDACTED} disabled readOnly contentBefore={<EyeOffRegular />} />;
}

export function FormField({ fullWidth, changed, redacted, label, name, children }) {
  const styles = useStyles();
  const ctx = useFormData();

  // Derive state from the FormDataProvider when a `name` is given; explicit
  // props remain as fallback/override so provider-less forms work unchanged.
  const flsRead = ctx?.fls?.read || EMPTY_SET;
  const flsWrite = (ctx?.isNew ? ctx?.fls?.create : ctx?.fls?.update) || EMPTY_SET;
  const isRedacted = redacted !== undefined ? !!redacted : !!name && flsRead.has(name);
  const writeBlocked = !isRedacted && !!name && flsWrite.has(name);
  const isChanged =
    !isRedacted &&
    !writeBlocked &&
    (changed !== undefined ? !!changed : !!name && !!ctx?.changedFields?.has(name));

  const className = mergeClasses(
    fullWidth ? styles.fullWidth : undefined,
    isChanged ? styles.changed : undefined,
  );

  let content = children;
  if (isRedacted) {
    const child = Children.toArray(children).find(isValidElement);
    const controlName =
      name ?? findControlName(child?.type === Field ? child.props.children : children);
    if (child?.type === Field) {
      // Standard structure: keep the Field (label survives), neutralise
      // required/validation, swap the control for the redacted standard.
      content = cloneElement(
        child,
        {
          required: false,
          hint: REDACTED_HINT,
          validationState: undefined,
          validationMessage: undefined,
        },
        <RedactedControl name={controlName} />
      );
    } else {
      // Non-standard children (MarkdownEditor, custom layouts): labelled generic box.
      content = (
        <Field label={label} hint={REDACTED_HINT}>
          <RedactedControl name={controlName} />
        </Field>
      );
    }
  } else if (writeBlocked) {
    // Read-visible but not writable in this mode: real value shown, control
    // disabled via the record-lock fieldset technique.
    const child = Children.toArray(children).find(isValidElement);
    const inner =
      child?.type === Field
        ? cloneElement(child, {
            required: false,
            hint: READONLY_HINT,
            validationState: undefined,
            validationMessage: undefined,
          })
        : children;
    content = (
      <fieldset disabled style={BLOCKED_FIELDSET_STYLE}>
        {inner}
      </fieldset>
    );
  }

  return <div className={className}>{content}</div>;
}
