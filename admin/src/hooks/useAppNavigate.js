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

  const navigateUnguarded = useCallback((to, options) => {
    routerNavigate(to, options);
  }, [routerNavigate]);

  const goBack = useCallback((fallback) => {
    if (isAnyDirty) {
      checkGuard(() => routerNavigate(fallback, { replace: true }));
    } else if (location.key !== 'default') {
      routerNavigate(-1);
    } else {
      routerNavigate(fallback, { replace: true });
    }
  }, [checkGuard, routerNavigate, location.key, isAnyDirty]);

  return { navigate, navigateUnguarded, goBack };
}
