import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext.jsx';

export default function useAppNavigate() {
  const routerNavigate = useNavigate();
  const location = useLocation();
  const { checkGuard, isAnyDirty } = useUnsavedChanges();

  const navigate = useCallback((to, options) => {
    checkGuard(() => routerNavigate(to, options));
  }, [checkGuard, routerNavigate]);

  // Bypass the unsaved-changes guard. Use after a successful save
  // where isDirty hasn't flushed yet (e.g. handleSaveAndClose).
  const navigateUnguarded = useCallback((to, options) => {
    routerNavigate(to, options);
  }, [routerNavigate]);

  const goBack = useCallback((fallback) => {
    if (isAnyDirty) {
      // Dirty form: use fallback with replace. routerNavigate(-1) would
      // hit the sentinel history entry pushed by the dirty-form guard,
      // causing double dialogs. replace: true removes the sentinel cleanly.
      checkGuard(() => routerNavigate(fallback, { replace: true }));
    } else if (location.key !== 'default') {
      // Clean form with history: smart-back to previous page.
      routerNavigate(-1);
    } else {
      // Clean form, no history (direct URL): go to entity list.
      routerNavigate(fallback, { replace: true });
    }
  }, [checkGuard, routerNavigate, location.key, isAnyDirty]);

  return { navigate, navigateUnguarded, goBack };
}
