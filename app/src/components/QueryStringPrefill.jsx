import { useEffect } from 'react';

function coerce(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export default function QueryStringPrefill({ handleChange, onPrefill }) {
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const prefilled = new Set();

    for (const [key, raw] of qs.entries()) {
      handleChange(key)(null, { value: coerce(raw) });
      prefilled.add(key);
    }

    if (prefilled.size > 0 && onPrefill) {
      onPrefill(prefilled);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
