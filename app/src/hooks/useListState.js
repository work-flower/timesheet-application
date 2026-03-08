import { useState, useCallback } from 'react';

export function useListState(key, defaults) {
  const [state, setState] = useState(() => {
    try {
      const stored = localStorage.getItem(`list.${key}`);
      if (stored) return { ...defaults, ...JSON.parse(stored) };
    } catch {}
    return defaults;
  });

  const updateState = useCallback((updates) => {
    setState(prev => {
      const next = { ...prev, ...updates };
      localStorage.setItem(`list.${key}`, JSON.stringify(next));
      return next;
    });
  }, [key]);

  return [state, updateState];
}
