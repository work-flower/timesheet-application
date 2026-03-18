import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Card,
  Tooltip,
  mergeClasses,
} from '@fluentui/react-components';
import {
  ChevronLeftRegular,
  ChevronRightRegular,
  ArrowSyncRegular,
} from '@fluentui/react-icons';
import { calendarEventsApi } from '../../api/index.js';

const useStyles = makeStyles({
  card: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: '12px',
    flexShrink: 0,
    position: 'relative',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  navArrow: {
    cursor: 'pointer',
    fontSize: '16px',
    color: tokens.colorNeutralForeground3,
    display: 'flex',
    alignItems: 'center',
    padding: '2px',
    borderRadius: '4px',
    '&:hover': {
      color: tokens.colorNeutralForeground1,
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
  },
  dateLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginTop: '2px',
  },
  refresh: {
    position: 'absolute',
    top: 0,
    right: 0,
    cursor: 'pointer',
    fontSize: '14px',
    color: tokens.colorNeutralForeground3,
    display: 'flex',
    alignItems: 'center',
    padding: '2px',
    borderRadius: '4px',
    '&:hover': {
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
  scroll: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    position: 'relative',
    minHeight: 0,
  },
  grid: {
    position: 'relative',
    minHeight: '100%',
  },
  slot: {
    display: 'flex',
    height: '28px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    alignItems: 'flex-start',
  },
  slotHour: {
    borderBottomColor: tokens.colorNeutralStroke2,
  },
  timeLabel: {
    width: '44px',
    flexShrink: 0,
    fontSize: '10px',
    color: tokens.colorNeutralForeground3,
    lineHeight: '28px',
    paddingRight: '6px',
    textAlign: 'right',
    userSelect: 'none',
  },
  slotArea: {
    flex: 1,
    position: 'relative',
    height: '100%',
  },
  eventsLayer: {
    position: 'absolute',
    top: 0,
    left: '50px',
    right: '4px',
    bottom: 0,
    pointerEvents: 'none',
  },
  event: {
    position: 'absolute',
    borderRadius: '6px',
    padding: '3px 8px',
    overflow: 'hidden',
    cursor: 'pointer',
    pointerEvents: 'auto',
    fontSize: '11px',
    lineHeight: '1.35',
    boxSizing: 'border-box',
    borderLeft: '3px solid',
    transitionProperty: 'box-shadow',
    transitionDuration: '150ms',
    '&:hover': {
      zIndex: 10,
      boxShadow: tokens.shadow4,
    },
  },
  eventTitle: {
    fontWeight: tokens.fontWeightSemibold,
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  eventTime: {
    fontSize: '10px',
    fontWeight: tokens.fontWeightRegular,
    opacity: 0.7,
    display: 'block',
  },
  allDay: {
    borderRadius: '6px',
    padding: '4px 8px',
    margin: '0 0 4px 50px',
    fontSize: '11px',
    fontWeight: tokens.fontWeightSemibold,
    cursor: 'pointer',
    borderLeft: '3px solid',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    transitionProperty: 'box-shadow',
    transitionDuration: '150ms',
    '&:hover': {
      boxShadow: tokens.shadow4,
    },
  },
  empty: {
    position: 'sticky',
    top: '40%',
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    pointerEvents: 'none',
    zIndex: 5,
    marginBottom: '-20px',
  },
  tooltipBubble: {
    maxWidth: '280px',
  },
  tooltipTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    display: 'block',
    marginBottom: '4px',
  },
  tooltipRow: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    display: 'block',
    marginBottom: '2px',
  },
  tooltipDesc: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginTop: '4px',
    wordBreak: 'break-word',
  },
});

const SLOT_HEIGHT = 28;

export default function DayTimelineCard({ date }) {
  const styles = useStyles();
  const [timelineDate, setTimelineDate] = useState(() => date || new Date().toISOString().split('T')[0]);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    calendarEventsApi.getAll({ startDate: timelineDate, endDate: timelineDate })
      .then(setTimelineEvents)
      .catch(() => setTimelineEvents([]));
  }, [timelineDate]);

  const timelineSlots = useMemo(() => {
    const slots = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        slots.push({
          hour: h,
          minute: m,
          label: m === 0 ? `${String(h).padStart(2, '0')}:00` : '',
          isHour: m === 0,
        });
      }
    }
    return slots;
  }, []);

  const { timedEvents, allDayEvents } = useMemo(() => {
    const allDay = [];
    const timed = [];

    for (const evt of timelineEvents) {
      if (evt.allDay) {
        allDay.push(evt);
        continue;
      }
      const start = new Date(evt.start);
      const end = new Date(evt.end);
      const startSlot = start.getHours() * 2 + Math.floor(start.getMinutes() / 30);
      const endSlot = end.getHours() * 2 + Math.ceil(end.getMinutes() / 30);
      const span = Math.max(endSlot - startSlot, 1);
      timed.push({
        ...evt,
        startSlot,
        endSlot: startSlot + span,
        top: startSlot * SLOT_HEIGHT,
        height: span * SLOT_HEIGHT - 2,
        startTime: start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        endTime: end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      });
    }

    timed.sort((a, b) => a.startSlot - b.startSlot || (b.endSlot - b.startSlot) - (a.endSlot - a.startSlot));

    const columns = [];
    for (const evt of timed) {
      let placed = false;
      for (let c = 0; c < columns.length; c++) {
        const last = columns[c][columns[c].length - 1];
        if (last.endSlot <= evt.startSlot) {
          columns[c].push(evt);
          evt.col = c;
          placed = true;
          break;
        }
      }
      if (!placed) {
        evt.col = columns.length;
        columns.push([evt]);
      }
    }

    for (const evt of timed) {
      let maxCol = evt.col;
      for (const other of timed) {
        if (other.startSlot < evt.endSlot && other.endSlot > evt.startSlot) {
          maxCol = Math.max(maxCol, other.col);
        }
      }
      evt.totalCols = maxCol + 1;
    }

    return { timedEvents: timed, allDayEvents: allDay };
  }, [timelineEvents]);

  const dateLabel = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(timelineDate + 'T00:00:00');
    const diffDays = Math.round((target - today) / 86400000);
    const datePart = target.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    if (diffDays === 0) return { fuzzy: 'Today', date: datePart };
    if (diffDays === 1) return { fuzzy: 'Tomorrow', date: datePart };
    if (diffDays === -1) return { fuzzy: 'Yesterday', date: datePart };
    if (diffDays === 2) return { fuzzy: 'Day after tomorrow', date: datePart };
    if (diffDays === -2) return { fuzzy: '2 days ago', date: datePart };
    if (diffDays > 2 && diffDays <= 6) return { fuzzy: `In ${diffDays} days`, date: datePart };
    if (diffDays < -2 && diffDays >= -6) return { fuzzy: `${Math.abs(diffDays)} days ago`, date: datePart };
    return { fuzzy: datePart, date: '' };
  }, [timelineDate]);

  const shiftDate = useCallback((delta) => {
    setTimelineDate((prev) => {
      const d = new Date(prev + 'T00:00:00');
      d.setDate(d.getDate() + delta);
      return d.toISOString().split('T')[0];
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await calendarEventsApi.refreshAll();
      const evts = await calendarEventsApi.getEvents(timelineDate, timelineDate);
      setTimelineEvents(evts);
    } catch {}
    setRefreshing(false);
  }, [timelineDate]);

  const scrollRef = useCallback((node) => {
    if (node) node.scrollTop = 16 * SLOT_HEIGHT; // auto-scroll to 08:00
  }, []);

  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <Tooltip content="Refresh calendars" relationship="label">
          <span
            className={mergeClasses(styles.refresh, refreshing && styles.refreshSpinning)}
            onClick={refreshing ? undefined : handleRefresh}
            style={refreshing ? { cursor: 'default' } : undefined}
          >
            <ArrowSyncRegular />
          </span>
        </Tooltip>
        <div className={styles.nav}>
          <span className={styles.navArrow} onClick={() => shiftDate(-1)}>
            <ChevronLeftRegular />
          </span>
          <Text className={styles.title}>{dateLabel.fuzzy}</Text>
          <span className={styles.navArrow} onClick={() => shiftDate(1)}>
            <ChevronRightRegular />
          </span>
        </div>
        <Text className={styles.dateLabel}>{dateLabel.date || '\u00A0'}</Text>
      </div>
      {allDayEvents.map((evt, i) => (
        <Tooltip
          key={`ad-${i}`}
          relationship="description"
          positioning="before"
          content={
            <div className={styles.tooltipBubble}>
              <span className={styles.tooltipTitle}>{evt.summary}</span>
              <span className={styles.tooltipRow}>All day</span>
              <span className={styles.tooltipRow}>{evt.sourceName}</span>
              {evt.location && <span className={styles.tooltipRow}>{evt.location}</span>}
              {evt.description && <span className={styles.tooltipDesc}>{evt.description.length > 150 ? evt.description.slice(0, 150) + '...' : evt.description}</span>}
            </div>
          }
        >
          <div
            className={styles.allDay}
            style={{
              borderLeftColor: evt.sourceColour || '#0078D4',
              backgroundColor: (evt.sourceColour || '#0078D4') + '18',
              color: tokens.colorNeutralForeground1,
            }}
          >
            {evt.summary}
          </div>
        </Tooltip>
      ))}
      <div className={styles.scroll} ref={scrollRef}>
        {timelineEvents.length === 0 && (
          <div className={styles.empty}>
            <Text>No calendar events</Text>
          </div>
        )}
        <div className={styles.grid} style={{ height: 48 * SLOT_HEIGHT }}>
          {timelineSlots.map((slot, i) => (
            <div
              key={i}
              className={mergeClasses(styles.slot, slot.isHour && styles.slotHour)}
            >
              <span className={styles.timeLabel}>{slot.label}</span>
              <div className={styles.slotArea} />
            </div>
          ))}
          <div className={styles.eventsLayer}>
            {timedEvents.map((evt, i) => (
              <Tooltip
                key={i}
                relationship="description"
                positioning="before"
                content={
                  <div className={styles.tooltipBubble}>
                    <span className={styles.tooltipTitle}>{evt.summary}</span>
                    <span className={styles.tooltipRow}>{evt.startTime} — {evt.endTime}</span>
                    <span className={styles.tooltipRow}>{evt.sourceName}</span>
                    {evt.location && <span className={styles.tooltipRow}>{evt.location}</span>}
                    {evt.description && <span className={styles.tooltipDesc}>{evt.description.length > 150 ? evt.description.slice(0, 150) + '...' : evt.description}</span>}
                  </div>
                }
              >
                <div
                  className={styles.event}
                  style={{
                    top: evt.top,
                    height: evt.height,
                    left: `${(evt.col / evt.totalCols) * 100}%`,
                    width: `${(1 / evt.totalCols) * 100}%`,
                    borderLeftColor: evt.sourceColour || '#0078D4',
                    backgroundColor: (evt.sourceColour || '#0078D4') + '18',
                  }}
                >
                  <span className={styles.eventTitle}>{evt.summary}</span>
                  {evt.height >= 40 && (
                    <span className={styles.eventTime}>{evt.startTime} — {evt.endTime}</span>
                  )}
                </div>
              </Tooltip>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
