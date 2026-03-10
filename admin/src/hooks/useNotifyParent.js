import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';

export function useNotifyParent() {
  const location = useLocation();

  return useCallback((commandName, base, form) => {
    if (window.parent === window) return;

    const entity = location.pathname.split('/').filter(Boolean)[0];

    window.parent.postMessage(
      { command: commandName, entity, initialData: base, formData: form },
      window.location.origin,
    );
  }, [location.pathname]);
}
