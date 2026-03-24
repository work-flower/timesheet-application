import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Select,
  Badge,
  Spinner,
  Button,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { ArrowUploadRegular } from '@fluentui/react-icons';
import CommandBar from '../../components/CommandBar.jsx';
import CardView, { CardMetaItem } from '../../components/CardView.jsx';
import PaginationControls from '../../components/PaginationControls.jsx';
import { useODataList } from '../../hooks/useODataList.js';
import { ticketsApi } from '../../api/index.js';
import useAppNavigate from '../../hooks/useAppNavigate.js';

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: { padding: '16px 16px 0 16px' },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase500,
  },
  filters: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 16px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexWrap: 'wrap',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '48px',
  },
  empty: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '48px',
    color: tokens.colorNeutralForeground3,
  },
  id: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    fontFamily: 'monospace',
  },
  titleText: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  footerText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
});

function stateBadgeColour(state) {
  const s = (state || '').toLowerCase();
  if (s.includes('done') || s.includes('closed') || s.includes('resolved') || s.includes('completed'))
    return { bg: '#E6F4EA', color: '#1B7D3A' };
  if (s.includes('active') || s.includes('in progress') || s.includes('doing') || s.includes('review'))
    return { bg: '#E0F0FF', color: '#0059B2' };
  if (s.includes('new') || s.includes('to do') || s.includes('open') || s.includes('backlog'))
    return { bg: '#FFF4E0', color: '#B25E00' };
  if (s.includes('blocked') || s.includes('impediment'))
    return { bg: '#FDE7E7', color: '#C41E3A' };
  return { bg: '#F0EEFE', color: '#5B3EC4' };
}

function hexToPastel(hex) {
  if (!hex || hex.length < 7) return { bg: '#F8F8F8' };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return {
    bg: `rgb(${Math.round(r + (255 - r) * 0.85)}, ${Math.round(g + (255 - g) * 0.85)}, ${Math.round(b + (255 - b) * 0.85)})`,
  };
}

export default function TicketList() {
  const styles = useStyles();
  const { navigate } = useAppNavigate();

  const {
    getFilterValue, setFilterValues,
    items, totalCount, loading, refresh,
    page, pageSize, totalPages, setPage, setPageSize,
  } = useODataList({
    key: 'tickets',
    apiFn: ticketsApi.getAll,
    filters: [
      { id: 'sourceId', field: 'sourceId', operator: 'eq', defaultValue: '', type: 'string' },
      { id: 'state', field: 'state', operator: 'eq', defaultValue: '', type: 'string' },
      { id: 'type', field: 'type', operator: 'eq', defaultValue: '', type: 'string' },
    ],
    defaultOrderBy: 'updated desc',
    defaultPageSize: 50,
  });

  const sourceId = getFilterValue('sourceId') || '';
  const stateFilter = getFilterValue('state') || '';
  const typeFilter = getFilterValue('type') || '';

  const [allSources, setAllSources] = useState([]);
  const [allStates, setAllStates] = useState([]);
  const [allTypes, setAllTypes] = useState([]);

  useEffect(() => {
    ticketsApi.getAll({ $top: '500', $select: 'sourceName,sourceId,state,type' })
      .then((result) => {
        const arr = Array.isArray(result) ? result : result.value || [];
        const sourceMap = {};
        const stateSet = new Set();
        const typeSet = new Set();
        for (const t of arr) {
          if (t.sourceId && t.sourceName) sourceMap[t.sourceId] = t.sourceName;
          if (t.state) stateSet.add(t.state);
          if (t.type) typeSet.add(t.type);
        }
        setAllSources(Object.entries(sourceMap).map(([id, name]) => ({ id, name })));
        setAllStates([...stateSet].sort());
        setAllTypes([...typeSet].sort());
      })
      .catch(() => {});
  }, []);

  const [search, setSearch] = useState('');
  const [message, setMessage] = useState(null);
  const fileInputRef = useRef(null);

  const handleImport = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const arr = Array.isArray(data) ? data : [data];
      const result = await ticketsApi.bulkImport(arr);
      setMessage({ intent: 'success', text: `Imported: ${result.created} created, ${result.updated} updated.` });
      setTimeout(() => setMessage(null), 4000);
      refresh();
    } catch (err) {
      setMessage({ intent: 'error', text: `Import failed: ${err.message}` });
    } finally {
      e.target.value = '';
    }
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((t) =>
      (t.externalId || '').toLowerCase().includes(q) ||
      (t.title || '').toLowerCase().includes(q) ||
      (t.assignedTo || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q)
    );
  }, [items, search]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text className={styles.title}>Tickets</Text>
      </div>

      <CommandBar
        searchValue={search}
        onSearchChange={setSearch}
      >
        <Button
          appearance="subtle"
          icon={<ArrowUploadRegular />}
          size="small"
          onClick={() => fileInputRef.current?.click()}
        >
          Import
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleImport}
        />
      </CommandBar>

      {message && (
        <MessageBar intent={message.intent} style={{ margin: '0 16px' }}>
          <MessageBarBody>{message.text}</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.filters}>
        <Select
          size="small"
          value={sourceId}
          onChange={(e, data) => setFilterValues({ sourceId: data.value })}
        >
          <option value="">All Sources</option>
          {allSources.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>

        <Select
          size="small"
          value={stateFilter}
          onChange={(e, data) => setFilterValues({ state: data.value })}
        >
          <option value="">All States</option>
          {allStates.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>

        <Select
          size="small"
          value={typeFilter}
          onChange={(e, data) => setFilterValues({ type: data.value })}
        >
          <option value="">All Types</option>
          {allTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div className={styles.loading}><Spinner label="Loading tickets..." /></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <Text>No tickets found.</Text>
          </div>
        ) : (
          <CardView
            items={filtered}
            getRowId={(item) => item._id}
            onItemClick={(item) => navigate(`/tickets/${item._id}`)}
            getCardStyle={(item) => {
              const colour = item.sourceColour || '#0078D4';
              const pastel = hexToPastel(colour);
              return { backgroundColor: pastel.bg, borderLeftColor: colour, borderLeftWidth: '3px', borderLeftStyle: 'solid' };
            }}
            renderHeader={(item) => {
              const badge = stateBadgeColour(item.state);
              return (
                <>
                  <Text className={styles.id}>{item.externalId}</Text>
                  <Text className={styles.titleText} style={{ flex: 1 }}>{item.title}</Text>
                  <Badge
                    appearance="filled"
                    size="small"
                    style={{ backgroundColor: badge.bg, color: badge.color }}
                  >
                    {item.state}
                  </Badge>
                </>
              );
            }}
            renderMeta={(item) => (
              <>
                {item.type && <CardMetaItem label="Type" value={item.type} />}
                {item.priority && <CardMetaItem label="Priority" value={item.priority} />}
                {item.assignedTo && <CardMetaItem label="Assigned To" value={item.assignedTo} />}
                {item.sprint && <CardMetaItem label="Sprint" value={item.sprint} />}
              </>
            )}
            renderFooter={(item) => (
              <Text className={styles.footerText}>
                {[item.sourceName, item.project, item.updated ? new Date(item.updated).toLocaleDateString() : ''].filter(Boolean).join(' · ')}
              </Text>
            )}
          />
        )}
      </div>

      <PaginationControls
        page={page}
        pageSize={pageSize}
        totalItems={totalCount}
        totalPages={totalPages}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}
