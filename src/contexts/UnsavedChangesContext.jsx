import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog.jsx';

const UnsavedChangesContext = createContext(null);

export function useUnsavedChanges() {
  return useContext(UnsavedChangesContext);
}

export function UnsavedChangesProvider({ children }) {
  const navigate = useNavigate();
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

  const executePending = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return;
    if (pending.type === 'navigate') {
      navigate(pending.to, pending.options);
    } else if (pending.type === 'callback') {
      pending.fn();
    }
  }, [navigate]);

  const guardedNavigate = useCallback((to, options) => {
    if (guardRef.current?.isDirty) {
      pendingRef.current = { type: 'navigate', to, options };
      setDialogOpen(true);
    } else {
      navigate(to, options);
    }
  }, [navigate]);

  const requestNavigation = useCallback((action) => {
    if (guardRef.current?.isDirty) {
      pendingRef.current = action;
      setDialogOpen(true);
    } else {
      if (action.type === 'navigate') {
        navigate(action.to, action.options);
      } else if (action.type === 'callback') {
        action.fn();
      }
    }
  }, [navigate]);

  const handleSave = useCallback(async () => {
    const guard = guardRef.current;
    if (!guard) return;
    const result = await guard.onSave();
    const ok = typeof result === 'object' ? result.ok : result;
    setDialogOpen(false);
    if (ok) {
      executePending();
    } else {
      pendingRef.current = null;
    }
  }, [executePending]);

  const handleDiscard = useCallback(() => {
    setDialogOpen(false);
    executePending();
  }, [executePending]);

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

    // Push sentinel entry
    window.history.pushState({ sentinel: true }, '');
    sentinelPushedRef.current = true;

    const handler = (e) => {
      if (!guardRef.current?.isDirty) return;
      // Re-push sentinel to prevent navigation
      window.history.pushState({ sentinel: true }, '');
      // Show dialog with a callback that does history.go(-2)
      pendingRef.current = {
        type: 'callback',
        fn: () => window.history.go(-2),
      };
      setDialogOpen(true);
    };

    window.addEventListener('popstate', handler);
    return () => {
      window.removeEventListener('popstate', handler);
      // Clean up sentinel if still present and still the current entry
      if (sentinelPushedRef.current) {
        sentinelPushedRef.current = false;
        // Only go back if the sentinel is still the current history entry.
        // If an intentional navigation (e.g. Save & Close) already pushed
        // a new entry, history.go(-1) would undo that navigation.
        if (window.history.state?.sentinel) {
          window.history.go(-1);
        }
      }
    };
  }, [isAnyDirty]);

  const value = { registerGuard, guardedNavigate, requestNavigation };

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
