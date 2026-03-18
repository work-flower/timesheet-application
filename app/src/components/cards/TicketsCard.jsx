import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Card,
  Badge,
  Button,
  ToggleButton,
} from '@fluentui/react-components';
import { ticketsApi } from '../../api/index.js';

const STORAGE_KEY = 'dashboard.ticketStateFilter';

const useStyles = makeStyles({
  wrapper: {
    marginBottom: '24px',
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground3,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    display: 'block',
    marginBottom: '8px',
    marginTop: '8px',
  },
  filters: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '12px',
    flexWrap: 'wrap',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, 200px)',
    gap: '6px',
  },
  card: {
    width: '200px',
    padding: '5px 8px',
    borderRadius: tokens.borderRadiusMedium,
    borderLeft: '3px solid transparent',
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'box-shadow 0.15s ease',
    '&:hover': {
      boxShadow: tokens.shadow8,
      textDecoration: 'none',
    },
    '& a': { textDecoration: 'none' },
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  id: {
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    fontFamily: 'monospace',
    lineHeight: '1',
  },
  cardTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: '1.2',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    lineHeight: '1',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  sep: {
    color: tokens.colorNeutralStroke2,
  },
  toast: {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '8px 20px',
    borderRadius: tokens.borderRadiusMedium,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    zIndex: 10000,
    pointerEvents: 'none',
    backgroundColor: '#fff',
    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.15)',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
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
  if (s.includes('removed') || s.includes('won\'t') || s.includes('cancelled'))
    return { bg: '#F0F0F0', color: '#616161' };
  return { bg: '#F0EEFE', color: '#5B3EC4' };
}

function hexToPastel(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const bg = `rgb(${Math.round(r + (255 - r) * 0.85)}, ${Math.round(g + (255 - g) * 0.85)}, ${Math.round(b + (255 - b) * 0.85)})`;
  const text = `rgb(${Math.round(r * 0.45)}, ${Math.round(g * 0.45)}, ${Math.round(b * 0.45)})`;
  return { bg, text };
}

function loadSavedFilter() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set();
}

function saveFilter(filterSet) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...filterSet]));
  } catch { /* ignore */ }
}

export default function TicketsCard({ onTicketClick }) {
  const styles = useStyles();
  const [items, setItems] = useState([]);
  const [stateFilter, setStateFilter] = useState(loadSavedFilter);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    ticketsApi.getAll({ $top: '50', $orderby: 'updated desc' })
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  const states = useMemo(() => {
    const s = [...new Set(items.map((t) => t.state).filter(Boolean))];
    s.sort();
    return s;
  }, [items]);

  const filtered = useMemo(() => {
    if (stateFilter.size === 0) return items;
    return items.filter((t) => stateFilter.has(t.state));
  }, [items, stateFilter]);

  const toggle = useCallback((state) => {
    setStateFilter((prev) => {
      const next = new Set(prev);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      saveFilter(next);
      return next;
    });
  }, []);

  const clearFilter = useCallback(() => {
    setStateFilter(new Set());
    saveFilter(new Set());
  }, []);

  const showToast = useCallback((message, intent) => {
    clearTimeout(toastTimer.current);
    setToast({ message, intent });
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }, []);

  const handleClick = useCallback(async (ticket) => {
    if (!onTicketClick) return;
    try {
      await onTicketClick(ticket);
      showToast('Link copied to clipboard', 'success');
    } catch {
      showToast('Failed to copy link', 'error');
    }
  }, [onTicketClick, showToast]);

  if (items.length === 0) return null;

  return (
    <div className={styles.wrapper}>
      <Text className={styles.title}>Tickets</Text>
      {states.length > 1 && (
        <div className={styles.filters}>
          {states.map((state) => (
            <ToggleButton
              key={state}
              size="small"
              checked={stateFilter.has(state)}
              onClick={() => toggle(state)}
            >
              {state}
            </ToggleButton>
          ))}
          {stateFilter.size > 0 && (
            <Button size="small" appearance="subtle" onClick={clearFilter}>
              Clear
            </Button>
          )}
        </div>
      )}
      <div className={styles.grid}>
        {filtered.slice(0, 12).map((ticket) => {
          const colour = ticket.sourceColour || '#0078D4';
          const pastel = hexToPastel(colour);
          const badge = stateBadgeColour(ticket.state);
          return (
            <Card
              key={ticket._id}
              className={styles.card}
              style={{ backgroundColor: pastel.bg, borderLeftColor: colour }}
              onClick={() => handleClick(ticket)}
            >
              <div className={styles.cardHeader}>
                {ticket.externalId && (
                  <Text className={styles.id} style={{ color: pastel.text }}>
                    {ticket.externalId}
                  </Text>
                )}
                <Badge
                  appearance="filled"
                  size="small"
                  style={{ backgroundColor: badge.bg, color: badge.color, marginLeft: 'auto' }}
                >
                  {ticket.state}
                </Badge>
              </div>
              <Text className={styles.cardTitle}>{ticket.title}</Text>
              <div className={styles.footer}>
                {ticket.assignedTo && <span>{ticket.assignedTo}</span>}
                {ticket.assignedTo && (ticket.sprint || ticket.areaPath || ticket.sourceName) && <span className={styles.sep}>·</span>}
                {ticket.sprint && <span>{ticket.sprint}</span>}
                {ticket.sprint && (ticket.areaPath || ticket.sourceName) && <span className={styles.sep}>·</span>}
                {ticket.areaPath && <span>{ticket.areaPath}</span>}
                {ticket.areaPath && ticket.sourceName && <span className={styles.sep}>·</span>}
                {ticket.sourceName && <span>{ticket.sourceName}</span>}
              </div>
            </Card>
          );
        })}
      </div>
      {toast && (
        <div
          className={styles.toast}
          style={{
            color: toast.intent === 'success' ? '#1B7D3A' : '#C41E3A',
            animation: 'fadeInOut 2s ease',
          }}
        >
          {toast.message}
        </div>
      )}
      <style>{`@keyframes fadeInOut { 0% { opacity: 0; } 10% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }`}</style>
    </div>
  );
}
