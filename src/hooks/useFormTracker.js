import { useState, useRef, useMemo, useCallback } from 'react';

export function useFormTracker(initialState, { excludeFields = [] } = {}) {
  const [form, setFormState] = useState(initialState);
  const baseRef = useRef(initialState);

  const setForm = useCallback((updater) => {
    setFormState((prev) => (typeof updater === 'function' ? updater(prev) : updater));
  }, []);

  const setBase = useCallback((state) => {
    baseRef.current = state;
    setFormState(state);
  }, []);

  const resetForm = useCallback(() => {
    setFormState(baseRef.current);
  }, []);

  const changedFields = useMemo(() => {
    const changed = new Set();
    const base = baseRef.current;
    const keys = new Set([...Object.keys(base), ...Object.keys(form)]);
    for (const key of keys) {
      if (excludeFields.includes(key)) continue;
      const bv = base[key] ?? '';
      const fv = form[key] ?? '';
      if (bv !== fv) changed.add(key);
    }
    return changed;
  }, [form, excludeFields]);

  const isDirty = changedFields.size > 0;

  return { form, setForm, setBase, resetForm, isDirty, changedFields };
}
