import { useEffect, useState } from 'react';
import { Spinner } from '@fluentui/react-components';
import useAppNavigate from '../../hooks/useAppNavigate.js';
import { notebooksApi } from '../../api/index.js';

/**
 * Create-on-open: immediately creates a draft notebook and redirects to its form.
 */
export default function NotebookNew() {
  const { navigate } = useAppNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    notebooksApi.create({})
      .then((record) => {
        if (!cancelled) {
          navigate(`/notebooks/${record._id}/`, { replace: true });
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => { cancelled = true; };
  }, [navigate]);

  if (error) {
    return <div style={{ padding: 48, textAlign: 'center', color: 'red' }}>{error}</div>;
  }

  return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Creating notebook..." /></div>;
}
