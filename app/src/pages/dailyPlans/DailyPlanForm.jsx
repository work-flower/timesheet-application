import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  makeStyles, tokens, Text, Input, Checkbox, Spinner, MessageBar, MessageBarBody,
  Breadcrumb, BreadcrumbItem, BreadcrumbDivider, BreadcrumbButton,
  Badge, Button, Tooltip,
} from '@fluentui/react-components';
import {
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent,
} from '@fluentui/react-components';
import {
  AddRegular, DeleteRegular, CalendarClockRegular, DismissRegular,
} from '@fluentui/react-icons';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { dailyPlansApi, todosApi } from '../../api/index.js';
import useAppNavigate from '../../hooks/useAppNavigate.js';
import DayTimelineCard from '../../components/cards/DayTimelineCard.jsx';

const useStyles = makeStyles({
  page: {},
  pageBody: { padding: '16px 24px' },
  header: { marginBottom: '16px' },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase500,
    display: 'block',
    marginBottom: '4px',
  },
  message: { marginBottom: '16px' },

  // Timesheet banner
  timesheetBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    marginBottom: '16px',
  },
  timesheetTag: {
    cursor: 'pointer',
    ':hover': { opacity: 0.8 },
  },

  // Two-column layout
  topRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '16px',
    alignItems: 'stretch',
  },
  leftColumn: {
    flex: 7,
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  rightColumn: {
    flex: 3,
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    minHeight: '340px',
    position: 'relative',
  },
  timelineWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: '60px', // reserve space for meeting summary below
    minHeight: '224px',
  },

  // Section cards
  section: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '12px',
  },
  sectionTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    display: 'block',
    marginBottom: '8px',
    color: tokens.colorNeutralForeground1,
  },

  // Todo items
  todoItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 0',
  },
  todoDone: {
    textDecoration: 'line-through',
    color: tokens.colorNeutralForeground3,
  },
  todoInput: {
    flex: 1,
  },
  addTodoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 0',
    marginTop: '4px',
  },

  // Tickets section
  ticketItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '4px 0',
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  ticketDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
    marginTop: '6px',
  },

  // Meeting summary
  meetingSummary: {
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    padding: '8px 12px',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    fontStyle: 'italic',
  },

  // Miscellaneous
  miscSection: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '12px',
    minHeight: '200px',
  },
});

export default function DailyPlanForm() {
  const styles = useStyles();
  const { id } = useParams(); // id = YYYY-MM-DD date string
  const { navigate, goBack } = useAppNavigate();

  const [plan, setPlan] = useState(null);
  const [todosData, setTodosData] = useState([]);
  const [timesheetsData, setTimesheetsData] = useState([]);
  const [content, setContent] = useState('');
  const [newTodoText, setNewTodoText] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [popupTimesheetUrl, setPopupTimesheetUrl] = useState(null);

  const contentRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  // Format date for display
  const dateObj = id ? new Date(id + 'T00:00:00') : null;
  const formattedDate = dateObj
    ? dateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  // Load plan data
  const loadPlan = useCallback(async () => {
    try {
      const data = await dailyPlansApi.getById(id);
      setPlan(data);
      setTodosData(data.todosData || []);
      setTimesheetsData(data.timesheetsData || []);

      const md = await dailyPlansApi.getContent(id);
      setContent(md || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setInitialized(true);
    }
  }, [id]);

  useEffect(() => {
    if (id) loadPlan();
  }, [id, loadPlan]);

  // Auto-save content with debounce
  const saveContent = useCallback(async (newContent) => {
    try {
      await dailyPlansApi.updateContent(id, newContent);
    } catch (err) {
      console.warn('Auto-save failed:', err.message);
    }
  }, [id]);

  const handleContentChange = useCallback((e) => {
    const val = e.target.value;
    setContent(val);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveContent(val), 1500);
  }, [saveContent]);

  // Flush content on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        // Flush pending save
        if (contentRef.current !== null) {
          dailyPlansApi.updateContent(id, contentRef.current).catch(() => {});
        }
      }
    };
  }, [id]);

  // Keep ref in sync for unmount flush
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // Listen for postMessage from embedded timesheet form
  useEffect(() => {
    const handler = (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.entity !== 'timesheets') return;
      const cmd = e.data.command;
      if (cmd === 'back' || cmd === 'saveAndClose' || cmd === 'delete') {
        setPopupTimesheetUrl(null);
        loadPlan();
      } else if (cmd === 'save') {
        loadPlan();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [loadPlan]);

  // --- Todo handlers ---

  const handleAddTodo = async () => {
    if (!newTodoText.trim()) return;
    try {
      const todo = await todosApi.create({ text: newTodoText.trim(), createdInPlanId: id });
      await dailyPlansApi.addTodo(id, todo._id);
      setTodosData(prev => [...prev, todo]);
      setPlan(prev => ({ ...prev, todos: [...(prev.todos || []), todo._id] }));
      setNewTodoText('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleTodo = async (todo) => {
    const newStatus = todo.status === 'done' ? 'pending' : 'done';
    try {
      const updated = await todosApi.update(todo._id, {
        status: newStatus,
        completedInPlanId: newStatus === 'done' ? id : null,
      });
      setTodosData(prev => prev.map(t => t._id === todo._id ? updated : t));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemoveTodo = async (todoId) => {
    try {
      await dailyPlansApi.removeTodo(id, todoId);
      setTodosData(prev => prev.filter(t => t._id !== todoId));
      setPlan(prev => ({ ...prev, todos: (prev.todos || []).filter(tid => tid !== todoId) }));
    } catch (err) {
      setError(err.message);
    }
  };

  // --- Delete handler ---

  const handleDelete = async () => {
    try {
      await dailyPlansApi.delete(id);
      navigate('/daily-plans');
    } catch (err) {
      setError(err.message);
    }
  };

  if (!initialized) {
    return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;
  }

  if (!plan) {
    return (
      <div className={styles.page}>
        <FormCommandBar onBack={() => goBack('/daily-plans')} />
        <div className={styles.pageBody}>
          <MessageBar intent="error" className={styles.message}>
            <MessageBarBody>Daily plan not found for {id}</MessageBarBody>
          </MessageBar>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <FormCommandBar
        onBack={() => goBack('/daily-plans')}
        onDelete={() => setDeleteOpen(true)}
        locked={false}
      >
        {/* Phase 4: Summarise Day button will go here */}
      </FormCommandBar>

      <div className={styles.pageBody}>
        {/* Breadcrumb */}
        <Breadcrumb className={styles.header}>
          <BreadcrumbItem>
            <BreadcrumbButton onClick={() => goBack('/daily-plans')}>Daily Plans</BreadcrumbButton>
          </BreadcrumbItem>
          <BreadcrumbDivider />
          <BreadcrumbItem>
            <BreadcrumbButton current>{formattedDate}</BreadcrumbButton>
          </BreadcrumbItem>
        </Breadcrumb>

        {/* Title */}
        <Text className={styles.title}>{formattedDate}</Text>
        <Badge
          appearance="filled"
          color={plan.status === 'complete' ? 'success' : 'informative'}
          size="small"
          style={{ marginBottom: '16px' }}
        >
          {plan.status}
        </Badge>

        {error && (
          <MessageBar intent="error" className={styles.message}>
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}

        {/* Timesheet Banner */}
        <div className={styles.timesheetBanner}>
          <CalendarClockRegular style={{ fontSize: '16px', color: tokens.colorNeutralForeground3 }} />
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Timesheets:</Text>
          {timesheetsData.length > 0 ? (
            timesheetsData.map(ts => (
              <Badge
                key={ts._id}
                appearance="tint"
                color="brand"
                size="small"
                className={styles.timesheetTag}
                onClick={() => setPopupTimesheetUrl(`/timesheets/${ts._id}?embedded=true`)}
              >
                {ts.hours}h — {ts.projectName || 'Unknown'}
              </Badge>
            ))
          ) : (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3, fontStyle: 'italic' }}>
              No timesheets linked
            </Text>
          )}
          <Tooltip content="Create new timesheet for this day" relationship="label">
            <Button
              appearance="subtle"
              icon={<AddRegular />}
              size="small"
              onClick={() => setPopupTimesheetUrl(`/timesheets/new?date=${id}&embedded=true`)}
            />
          </Tooltip>
        </div>

        {/* Top Row: Tasks + Timeline */}
        <div className={styles.topRow}>
          {/* Left Column: Tasks + Tickets */}
          <div className={styles.leftColumn}>
            {/* Tasks Section */}
            <div className={styles.section}>
              <Text className={styles.sectionTitle}>Tasks</Text>
              {todosData.map(todo => (
                <div key={todo._id} className={styles.todoItem}>
                  <Checkbox
                    checked={todo.status === 'done'}
                    onChange={() => handleToggleTodo(todo)}
                  />
                  <Text className={todo.status === 'done' ? styles.todoDone : undefined}>
                    {todo.text}
                  </Text>
                  <Tooltip content="Remove from this plan" relationship="label">
                    <Button
                      appearance="subtle"
                      icon={<DeleteRegular />}
                      size="small"
                      onClick={() => handleRemoveTodo(todo._id)}
                      style={{ marginLeft: 'auto', minWidth: 'auto' }}
                    />
                  </Tooltip>
                </div>
              ))}
              <div className={styles.addTodoRow}>
                <Input
                  placeholder="Add a task..."
                  value={newTodoText}
                  onChange={(e) => setNewTodoText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddTodo(); }}
                  className={styles.todoInput}
                  size="small"
                />
                <Button
                  appearance="subtle"
                  icon={<AddRegular />}
                  size="small"
                  onClick={handleAddTodo}
                  disabled={!newTodoText.trim()}
                />
              </div>
            </div>

            {/* Tickets Section — Phase 2 placeholder */}
            <div className={styles.section}>
              <Text className={styles.sectionTitle}>Tickets</Text>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3, fontStyle: 'italic' }}>
                Ticket integration coming in Phase 2
              </Text>
            </div>
          </div>

          {/* Right Column: Timeline + Meeting Summary */}
          <div className={styles.rightColumn}>
            <div className={styles.timelineWrapper}>
              <DayTimelineCard date={id} />
            </div>

            {/* Meeting Summary — Phase 4 placeholder */}
            <div className={styles.meetingSummary} style={{ marginTop: 'auto' }}>
              <Text size={200}>Meeting summary will appear here after summarisation.</Text>
            </div>
          </div>
        </div>

        {/* Miscellaneous Section — full width */}
        <div className={styles.miscSection}>
          <Text className={styles.sectionTitle}>Miscellaneous</Text>
          <textarea
            value={content}
            onChange={handleContentChange}
            placeholder="Freeform notes, AI summaries, and anything else..."
            style={{
              width: '100%',
              minHeight: '180px',
              border: 'none',
              outline: 'none',
              resize: 'vertical',
              fontFamily: tokens.fontFamilyBase,
              fontSize: tokens.fontSizeBase300,
              backgroundColor: 'transparent',
              color: tokens.colorNeutralForeground1,
              lineHeight: '1.6',
            }}
          />
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Daily Plan"
        message={`Are you sure you want to delete the daily plan for ${formattedDate}? This action cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />

      {/* Timesheet popup */}
      <Dialog
        open={!!popupTimesheetUrl}
        onOpenChange={(e, data) => { if (!data.open) setPopupTimesheetUrl(null); }}
      >
        <DialogSurface style={{ maxWidth: '90vw', width: '900px', maxHeight: '90vh', padding: 0 }}>
          <DialogBody style={{ padding: 0 }}>
            <DialogTitle
              action={
                <Button
                  appearance="subtle"
                  icon={<DismissRegular />}
                  onClick={() => setPopupTimesheetUrl(null)}
                />
              }
              style={{ padding: '8px 12px' }}
            >
              Timesheet
            </DialogTitle>
            <DialogContent style={{ padding: 0, overflow: 'hidden' }}>
              {popupTimesheetUrl && (
                <iframe
                  src={popupTimesheetUrl}
                  style={{ width: '100%', height: '70vh', border: 'none' }}
                />
              )}
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
