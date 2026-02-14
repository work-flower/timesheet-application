import { useState, useRef, useMemo, useCallback } from 'react';

function parseQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const result = {};
  for (const [key, raw] of params.entries()) {
    if (raw === '') continue;
    if (raw === 'true' || raw === 'false') {
      result[key] = raw === 'true';
    } else if (!isNaN(raw) && raw.trim() !== '') {
      result[key] = parseFloat(raw);
    } else {
      result[key] = raw;
    }
  }
  return result;
}

export function useFormTracker(initialState, { excludeFields = [] } = {}) {
  const queryParams = useMemo(() => parseQueryParams(), []);
  const queryParamsRef = useRef(queryParams);
  const appliedRef = useRef(false);

  const [form, setFormState] = useState(initialState);
  const baseRef = useRef(initialState);

  const setForm = useCallback((updater) => {
    setFormState((prev) => (typeof updater === 'function' ? updater(prev) : updater));
  }, []);

  const setBase = useCallback((state) => {
    baseRef.current = state;
    setFormState(state);
    // Apply query params once as user changes after the first setBase
    if (!appliedRef.current && Object.keys(queryParamsRef.current).length > 0) {
      appliedRef.current = true;
      setFormState((prev) => ({ ...prev, ...queryParamsRef.current }));
    }
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
