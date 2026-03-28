import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  makeStyles, tokens, Text, Button, Tooltip, ToggleButton, mergeClasses,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent,
} from '@fluentui/react-components';
import {
  ArrowSyncRegular, DismissRegular, NewsRegular,
  ChevronLeftRegular, ChevronRightRegular, OpenRegular,
} from '@fluentui/react-icons';
import { ticketsApi } from '../../api/index.js';

const STORAGE_KEY = 'ticketsListCard.stateFilter';

const useStyles = makeStyles({
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    color: tokens.colorNeutralForeground1,
  },
  refresh: {
    cursor: 'pointer',
    fontSize: '14px',
    color: tokens.colorNeutralForeground3,
    display: 'flex',
    alignItems: 'center',
    padding: '2px',
    borderRadius: '4px',
    ':hover': {
      color: tokens.colorNeutralForeground1,
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  refreshSpinning: {
    animationName: {
      from: { transform: 'rotate(0deg)' },
      to: { transform: 'rotate(360deg)' },
    },
    animationDuration: '1s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'linear',
  },
  body: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minHeight: 0,
  },
  filters: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginBottom: '8px',
    flexWrap: 'wrap',
  },
  split: {
    display: 'flex',
    gap: '12px',
    alignItems: 'stretch',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  list: {
    flex: 1,
    minWidth: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  item: {
    padding: '4px 0',
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    ':last-child': { borderBottom: 'none' },
  },
  itemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    overflow: 'hidden',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  key: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    cursor: 'pointer',
    flexShrink: 0,
    color: tokens.colorBrandForeground1,
    ':hover': { textDecoration: 'underline' },
  },
  ticketTitle: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  // Comments panel
  commentsPanel: {
    flexShrink: 0,
    width: '280px',
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingLeft: '12px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  commentsList: {
    flex: 1,
    overflowY: 'auto',
    minHeight: 0,
  },
  commentsPanelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginBottom: '8px',
  },
  commentsPanelTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorBrandForeground1,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    flex: 1,
  },
  commentsDateLabel: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    minWidth: '60px',
    textAlign: 'center',
  },
  commentsNavArrow: {
    cursor: 'pointer',
    fontSize: '14px',
    color: tokens.colorNeutralForeground3,
    display: 'flex',
    alignItems: 'center',
    padding: '2px',
    borderRadius: '4px',
    ':hover': {
      color: tokens.colorNeutralForeground1,
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  commentItem: {
    padding: '5px 6px',
    marginBottom: '4px',
    borderLeft: '3px solid transparent',
    borderRadius: tokens.borderRadiusMedium,
  },
  commentItemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginBottom: '2px',
  },
  commentTicketId: {
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    fontFamily: 'monospace',
  },
  commentAuthor: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground1,
  },
  commentTime: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    marginLeft: 'auto',
  },
  commentBody: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground2,
    lineHeight: '1.3',
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
});

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function hexToPastel(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const bg = `rgb(${Math.round(r + (255 - r) * 0.85)}, ${Math.round(g + (255 - g) * 0.85)}, ${Math.round(b + (255 - b) * 0.85)})`;
  const text = `rgb(${Math.round(r * 0.45)}, ${Math.round(g * 0.45)}, ${Math.round(b * 0.45)})`;
  return { bg, text };
}

function getCommentsForDate(items, dateStr) {
  const result = [];
  for (const ticket of items) {
    if (!ticket.comments?.length) continue;
    for (const c of ticket.comments) {
      if (c.created && c.created.slice(0, 10) === dateStr) {
        result.push({ ...c, ticketId: ticket._id, externalId: ticket.externalId, ticketTitle: ticket.title, sourceColour: ticket.sourceColour });
      }
    }
  }
  result.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  return result;
}

function formatCommentsDateLabel(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((target - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  return target.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function shiftDateStr(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().split('T')[0];
}

/**
 * Compact tickets list with state filters and a comments panel with day navigation.
 *
 * Props:
 * - commentsInitialDate (string, YYYY-MM-DD) — starting date for the comments panel (default: today)
 * - maxItems (number) — max tickets shown in the list (default: 12)
 * - storageKey (string) — localStorage key for persisted state filter (default: built-in)
 * - onCommentClick (function) — callback when a comment shortcut is clicked, receives the full comment object
 * - onTicketShortcutClick (function) — callback when a ticket shortcut icon is clicked, receives the full ticket object
 */
export default function TicketsListCard({ commentsInitialDate, maxItems = 12, storageKey, onCommentClick, onTicketShortcutClick }) {
  const styles = useStyles();
  const filterKey = storageKey || STORAGE_KEY;

  const [items, setItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [stateFilter, setStateFilter] = useState(() => {
    try { const raw = localStorage.getItem(filterKey); if (raw) return new Set(JSON.parse(raw)); } catch {} return new Set();
  });
  const [commentsDate, setCommentsDate] = useState(() => commentsInitialDate || new Date().toISOString().split('T')[0]);
  const [popupTicketId, setPopupTicketId] = useState(null);

  // Sync with external date prop
  useEffect(() => {
    if (commentsInitialDate) setCommentsDate(commentsInitialDate);
  }, [commentsInitialDate]);

  const fetchTickets = useCallback(() =>
    ticketsApi.getAll({ $top: '50', $orderby: 'updated desc' })
      .then(setItems)
      .catch(() => setItems([])),
  []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  // Listen for postMessage from embedded ticket form
  useEffect(() => {
    const handler = (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.entity !== 'tickets') return;
      const cmd = e.data.command;
      if (cmd === 'back' || cmd === 'saveAndClose') {
        setPopupTicketId(null);
        fetchTickets();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [fetchTickets]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await ticketsApi.refreshAll();
      await fetchTickets();
    } catch { /* ignore */ }
    setRefreshing(false);
  }, [fetchTickets]);

  const states = useMemo(() => {
    const s = [...new Set(items.map(t => t.state).filter(Boolean))];
    s.sort();
    return s;
  }, [items]);

  const filtered = useMemo(() => {
    if (stateFilter.size === 0) return items;
    return items.filter(t => stateFilter.has(t.state));
  }, [items, stateFilter]);

  const toggle = useCallback((state) => {
    setStateFilter(prev => {
      const next = new Set(prev);
      if (next.has(state)) next.delete(state); else next.add(state);
      try { localStorage.setItem(filterKey, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [filterKey]);

  const clearFilter = useCallback(() => {
    setStateFilter(new Set());
    try { localStorage.setItem(filterKey, '[]'); } catch {}
  }, [filterKey]);

  const dateComments = useMemo(() => getCommentsForDate(items, commentsDate), [items, commentsDate]);

  return (
    <>
      <div className={styles.headerRow}>
        <Text className={styles.title}>Tickets</Text>
        <Tooltip content="Refresh tickets" relationship="label">
          <span
            className={mergeClasses(styles.refresh, refreshing && styles.refreshSpinning)}
            onClick={refreshing ? undefined : handleRefresh}
            style={refreshing ? { cursor: 'default' } : undefined}
          >
            <ArrowSyncRegular />
          </span>
        </Tooltip>
      </div>

      {items.length === 0 ? (
        <Text size={200} style={{ color: tokens.colorNeutralForeground3, fontStyle: 'italic' }}>
          No recent tickets
        </Text>
      ) : (
        <div className={styles.body}>
          {states.length > 1 && (
            <div className={styles.filters}>
              {states.map(state => (
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
                <Button size="small" appearance="subtle" onClick={clearFilter}>Clear</Button>
              )}
            </div>
          )}
          <div className={styles.split}>
            {/* Left: ticket list */}
            <div className={styles.list}>
              {filtered.slice(0, maxItems).map(ticket => (
                <Tooltip
                  key={ticket._id}
                  relationship="description"
                  positioning="above"
                  content={(() => {
                    const colour = ticket.sourceColour || '#0078D4';
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', fontSize: '11px' }}>
                        {ticket.state && <span><span style={{ color: '#888' }}>Status:</span> {ticket.state}</span>}
                        {ticket.assignedTo && <span><span style={{ color: '#888' }}>Assigned:</span> {ticket.assignedTo}</span>}
                        {ticket.type && <span><span style={{ color: '#888' }}>Type:</span> {ticket.type}</span>}
                        {ticket.priority && <span><span style={{ color: '#888' }}>Priority:</span> {ticket.priority}</span>}
                        {ticket.sprint && <span><span style={{ color: '#888' }}>Sprint:</span> {ticket.sprint}</span>}
                        {ticket.sourceName && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ color: '#888' }}>Source:</span>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: colour, display: 'inline-block' }} />
                            {ticket.sourceName}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                >
                  <div className={styles.item}>
                    <div className={styles.itemHeader}>
                      <div
                        className={styles.dot}
                        style={{ backgroundColor: ticket.sourceColour || '#0078D4' }}
                      />
                      {onTicketShortcutClick && (
                        <OpenRegular
                          style={{ fontSize: '12px', color: tokens.colorNeutralForeground3, cursor: 'pointer', flexShrink: 0 }}
                          onClick={(e) => { e.stopPropagation(); setPopupTicketId(ticket._id); }}
                        />
                      )}
                      <Text
                        className={styles.key}
                        onClick={onTicketShortcutClick ? () => onTicketShortcutClick(ticket) : () => setPopupTicketId(ticket._id)}
                      >
                        {ticket.externalId}
                      </Text>
                      <Text className={styles.ticketTitle}>{ticket.title}</Text>
                    </div>
                  </div>
                </Tooltip>
              ))}
            </div>

            {/* Right: comments panel */}
            <div className={styles.commentsPanel}>
              <div className={styles.commentsPanelHeader}>
                <NewsRegular style={{ fontSize: '14px', color: tokens.colorBrandForeground1 }} />
                <Text className={styles.commentsPanelTitle}>Comments</Text>
                <span className={styles.commentsNavArrow} onClick={() => setCommentsDate(d => shiftDateStr(d, -1))}>
                  <ChevronLeftRegular />
                </span>
                <Text className={styles.commentsDateLabel}>{formatCommentsDateLabel(commentsDate)}</Text>
                <span className={styles.commentsNavArrow} onClick={() => setCommentsDate(d => shiftDateStr(d, 1))}>
                  <ChevronRightRegular />
                </span>
              </div>
              <div className={styles.commentsList}>
                {dateComments.length === 0 ? (
                  <Text style={{ fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 }}>
                    No comments for this date.
                  </Text>
                ) : (
                  dateComments.map(c => {
                    const colour = c.sourceColour || '#0078D4';
                    const pastel = hexToPastel(colour);
                    return (
                      <div
                        key={`${c.ticketId}-${c.id}`}
                        className={styles.commentItem}
                        style={{
                          borderLeftColor: colour,
                          backgroundColor: pastel.bg,
                        }}
                      >
                        <div className={styles.commentItemHeader}>
                          <Text className={styles.commentTicketId} style={{ color: pastel.text }}>{c.externalId}</Text>
                          <Text className={styles.commentAuthor}>{c.author}</Text>
                          {onCommentClick && (
                            <OpenRegular
                              style={{ fontSize: '11px', color: tokens.colorNeutralForeground3, cursor: 'pointer', flexShrink: 0 }}
                              onClick={() => onCommentClick(c)}
                            />
                          )}
                          <Text className={styles.commentTime}>
                            {c.created ? new Date(c.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </Text>
                        </div>
                        <Text className={styles.commentBody}>{stripHtml(c.body)}</Text>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ticket popup */}
      <Dialog
        open={!!popupTicketId}
        onOpenChange={(e, data) => { if (!data.open) setPopupTicketId(null); }}
      >
        <DialogSurface style={{ maxWidth: '90vw', width: '1100px', maxHeight: '90vh', padding: 0 }}>
          <DialogBody style={{ padding: 0 }}>
            <DialogTitle
              action={
                <Button
                  appearance="subtle"
                  icon={<DismissRegular />}
                  onClick={() => setPopupTicketId(null)}
                />
              }
              style={{ padding: '8px 12px' }}
            >
              Ticket
            </DialogTitle>
            <DialogContent style={{ padding: 0, overflow: 'hidden' }}>
              {popupTicketId && (
                <iframe
                  src={`/tickets/${popupTicketId}?embedded=true`}
                  style={{ width: '100%', height: '70vh', border: 'none' }}
                />
              )}
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
