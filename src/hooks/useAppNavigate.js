import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext.jsx';

export default function useAppNavigate() {
  const routerNavigate = useNavigate();
  const location = useLocation();
  const { checkGuard } = useUnsavedChanges();

  const navigate = useCallback((to, options) => {
    checkGuard(() => routerNavigate(to, options));
  }, [checkGuard, routerNavigate]);

  const goBack = useCallback((fallback) => {
    checkGuard(() => {
      if (location.key !== 'default') {
        routerNavigate(-1);
      } else {
        routerNavigate(fallback);
      }
    });
  }, [checkGuard, routerNavigate, location.key]);

  return { navigate, goBack };
}
