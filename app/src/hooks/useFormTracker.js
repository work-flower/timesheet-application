import { useState, useRef, useMemo, useCallback } from 'react';

export function buildInitialFromDOM(containerEl) {
  const initial = {};
  if (!containerEl) return initial;
  for (const el of containerEl.querySelectorAll('[name]')) {
    if (el.hasAttribute('data-untracked')) continue;
    const name = el.getAttribute('name');
    if (el.type === 'checkbox') {
      initial[name] = el.checked;
    } else if (el.type === 'number') {
      const parsed = parseFloat(el.value);
      initial[name] = isNaN(parsed) ? null : parsed;
    } else if (el.readOnly || el.disabled) {
      initial[name] = '';
    } else {
      initial[name] = el.value;
    }
  }
  return initial;
}

export function useFormTracker(initialState = {}) {
  const formRef = useRef(null);
  const [form, setFormState] = useState(initialState);
  const baseRef = useRef(initialState);
  const [baseReady, setBaseReady] = useState(false);

  const setForm = useCallback((updater) => {
    setFormState((prev) => (typeof updater === 'function' ? updater(prev) : updater));
  }, []);

  const setBase = useCallback((state) => {
    baseRef.current = state;
    setFormState(state);
  }, []);

  const resetBase = useCallback((overrides) => {
    const initial = buildInitialFromDOM(formRef.current);
    setBase(overrides ? { ...initial, ...overrides } : initial);
    setBaseReady(true);
  }, [setBase]);

  const resetForm = useCallback(() => {
    setFormState(baseRef.current);
  }, []);

  const changedFields = useMemo(() => {
    const changed = new Set();
    const base = baseRef.current;
    const keys = new Set([...Object.keys(base), ...Object.keys(form)]);
    for (const key of keys) {
      const bv = base[key] ?? '';
      const fv = form[key] ?? '';
      if (bv !== fv) changed.add(key);
    }
    return changed;
  }, [form]);

  const isDirty = changedFields.size > 0;

  return { form, setForm, setBase, resetBase, formRef, resetForm, isDirty, changedFields, base: baseRef.current, baseReady };
}
