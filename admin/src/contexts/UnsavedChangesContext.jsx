import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog.jsx';

const UnsavedChangesContext = createContext(null);

export function useUnsavedChanges() {
  return useContext(UnsavedChangesContext);
}

export function UnsavedChangesProvider({ children }) {
  const guardRef = useRef(null);
  const [isAnyDirty, setIsAnyDirty] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const pendingRef = useRef(null);
  const sentinelPushedRef = useRef(false);

  const registerGuard = useCallback((guard) => {
    guardRef.current = guard;
    setIsAnyDirty(guard.isDirty);
    return () => {
      if (guardRef.current === guard) {
        guardRef.current = null;
        setIsAnyDirty(false);
      }
    };
  }, []);

  const checkGuard = useCallback((execute) => {
    if (guardRef.current?.isDirty) {
      pendingRef.current = execute;
      setDialogOpen(true);
    } else {
      execute();
    }
  }, []);

  const runPending = useCallback(() => {
    const fn = pendingRef.current;
    pendingRef.current = null;
    if (fn) fn();
  }, []);

  const handleSave = useCallback(async () => {
    const guard = guardRef.current;
    if (!guard) return;
    const result = await guard.onSave();
    const ok = typeof result === 'object' ? result.ok : result;
    setDialogOpen(false);
    if (ok) {
      if (guardRef.current) guardRef.current.isDirty = false;
      runPending();
    } else {
      pendingRef.current = null;
    }
  }, [runPending]);

  const handleDiscard = useCallback(() => {
    setDialogOpen(false);
    if (guardRef.current) guardRef.current.isDirty = false;
    runPending();
  }, [runPending]);

  const handleCancel = useCallback(() => {
    setDialogOpen(false);
    pendingRef.current = null;
  }, []);

  // beforeunload
  useEffect(() => {
    const handler = (e) => {
      if (guardRef.current?.isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // popstate sentinel for browser back/forward
  useEffect(() => {
    if (!isAnyDirty) {
      if (sentinelPushedRef.current) {
        sentinelPushedRef.current = false;
      }
      return;
    }

    window.history.pushState({ sentinel: true }, '');
    sentinelPushedRef.current = true;

    const handler = (e) => {
      if (!guardRef.current?.isDirty) return;
      window.history.pushState({ sentinel: true }, '');
      pendingRef.current = () => window.history.go(-2);
      setDialogOpen(true);
    };

    window.addEventListener('popstate', handler);
    return () => {
      window.removeEventListener('popstate', handler);
      if (sentinelPushedRef.current) {
        sentinelPushedRef.current = false;
        if (window.history.state?.sentinel) {
          window.history.go(-1);
        }
      }
    };
  }, [isAnyDirty]);

  const value = { registerGuard, checkGuard, isAnyDirty };

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <UnsavedChangesDialog
        open={dialogOpen}
        onSave={handleSave}
        onDiscard={handleDiscard}
        onCancel={handleCancel}
      />
    </UnsavedChangesContext.Provider>
  );
}
