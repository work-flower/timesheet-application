import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent,
  Input, Spinner, Text, makeStyles, tokens,
} from '@fluentui/react-components';
import { SearchRegular, DismissRegular } from '@fluentui/react-icons';
import { projectsApi, clientsApi, timesheetsApi } from '../../api/index.js';

const DEBOUNCE_MS = 300;

const ENTITY_CONFIG = {
  project: {
    title: 'Link Project',
    placeholder: 'Search projects by name...',
    fetch: (q) => {
      const params = { $top: '20', $orderby: 'name asc' };
      if (q) params.$filter = `contains(name,'${q}')`;
      return projectsApi.getAll(params);
    },
    display: (r) => r.name,
  },
  client: {
    title: 'Link Client',
    placeholder: 'Search clients by company name...',
    fetch: (q) => {
      const params = { $top: '20', $orderby: 'companyName asc' };
      if (q) params.$filter = `contains(companyName,'${q}')`;
      return clientsApi.getAll(params);
    },
    display: (r) => r.companyName,
  },
  timesheet: {
    title: 'Link Timesheet',
    placeholder: 'Search timesheets by notes...',
    fetch: (q) => {
      const params = { $top: '20', $orderby: 'date desc', $expand: 'project' };
      if (q) params.$filter = `contains(notes,'${q}')`;
      return timesheetsApi.getAll(params);
    },
    display: (r) => {
      const parts = [r.date];
      if (r.projectName) parts.push(r.projectName);
      return parts.join(' — ');
    },
  },
};

const useStyles = makeStyles({
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    minHeight: '200px',
    maxHeight: '400px',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  item: {
    padding: '8px 12px',
    cursor: 'pointer',
    borderRadius: tokens.borderRadiusMedium,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  empty: {
    padding: '24px',
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  spinner: {
    padding: '24px',
    display: 'flex',
    justifyContent: 'center',
  },
});

export default function EntitySearchDialog({ open, entityType, onSelect, onClose }) {
  const styles = useStyles();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);
  const inputRef = useRef(null);

  const config = ENTITY_CONFIG[entityType];

  const doSearch = useCallback(async (q) => {
    if (!config) return;
    setLoading(true);
    try {
      const data = await config.fetch(q);
      // Handle both array and OData { value: [] } responses
      setResults(Array.isArray(data) ? data : data.value || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [config]);

  // Load initial results when dialog opens
  useEffect(() => {
    if (open && config) {
      setSearch('');
      setResults([]);
      doSearch('');
    }
  }, [open, config, doSearch]);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSearchChange = (e) => {
    const q = e.target.value;
    setSearch(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(q), DEBOUNCE_MS);
  };

  const handleSelect = (record) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onSelect(record);
  };

  if (!config) return null;

  return (
    <Dialog open={open} onOpenChange={(e, data) => { if (!data.open) onClose(); }}>
      <DialogSurface style={{ maxWidth: '500px', width: '90vw' }}>
        <DialogBody>
          <DialogTitle
            action={
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <DismissRegular />
              </button>
            }
          >
            {config.title}
          </DialogTitle>
          <DialogContent className={styles.content}>
            <Input
              ref={inputRef}
              placeholder={config.placeholder}
              value={search}
              onChange={handleSearchChange}
              contentBefore={<SearchRegular />}
            />
            <div className={styles.list}>
              {loading && (
                <div className={styles.spinner}><Spinner size="small" /></div>
              )}
              {!loading && results.length === 0 && (
                <Text className={styles.empty}>
                  {search ? 'No results found.' : 'Loading...'}
                </Text>
              )}
              {!loading && results.map((record) => (
                <div
                  key={record._id}
                  className={styles.item}
                  onClick={() => handleSelect(record)}
                >
                  <Text>{config.display(record)}</Text>
                </div>
              ))}
            </div>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
