import { useEffect } from 'react';

function coerce(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export default function QueryStringPrefill({ handleChange, onPrefill, ready = true, exclude }) {
  useEffect(() => {
    if (!ready) return;
    const qs = new URLSearchParams(window.location.search);
    const prefilled = new Set();

    for (const [key, raw] of qs.entries()) {
      // Field-level security: fields hidden/stripped for this user must not be
      // settable via URL params (server would strip them on save anyway)
      if (exclude?.has(key)) continue;
      handleChange(key)(null, { value: coerce(raw) });
      prefilled.add(key);
    }

    if (prefilled.size > 0 && onPrefill) {
      onPrefill(prefilled);
    }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
