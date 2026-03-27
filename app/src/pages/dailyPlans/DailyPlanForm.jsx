import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  makeStyles, tokens, Text, Input, Checkbox, Spinner, MessageBar, MessageBarBody,
  Breadcrumb, BreadcrumbItem, BreadcrumbDivider, BreadcrumbButton,
  Badge, Button, Tooltip,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent,
} from '@fluentui/react-components';
import {
  AddRegular, DeleteRegular, CalendarClockRegular, DismissRegular,
} from '@fluentui/react-icons';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import NotebookEditor from '../../components/editors/NotebookEditor.jsx';
import EntitySearchDialog from '../../components/editors/EntitySearchDialog.jsx';
import MDEditor from '@uiw/react-md-editor';
import { dailyPlansApi, todosApi, notebooksApi } from '../../api/index.js';
import useAppNavigate from '../../hooks/useAppNavigate.js';
import DayTimelineCard from '../../components/cards/DayTimelineCard.jsx';
import TicketsListCard from '../../components/cards/TicketsListCard.jsx';

const AUTO_SAVE_DELAY = 1500;

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

  // Two-column grid layout
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '7fr 3fr',
    gap: '16px',
    marginBottom: '16px',
  },
  rightCell: {
    minHeight: '340px',
    position: 'relative',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
  },
  timelineWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: '224px',
  },

  // Section cards
  section: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '12px',
    overflow: 'hidden',
    minWidth: 0,
  },
  sectionTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    display: 'block',
    marginBottom: '8px',
    color: tokens.colorNeutralForeground1,
  },

  // To-Do + Tickets side by side
  todoTicketsRow: {
    display: 'flex',
    gap: '16px',
    alignItems: 'stretch',
  },

  // Todo items
  todoItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '2px 0',
    fontSize: tokens.fontSizeBase200,
  },
  todoDone: {
    textDecoration: 'line-through',
    color: tokens.colorNeutralForeground3,
  },
  todoText: {
    fontSize: tokens.fontSizeBase200,
  },
  todoInput: {
    flex: 1,
  },
  addTodoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '2px 0',
    marginBottom: '4px',
  },

  // Miscellaneous
  miscSection: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '12px',
    minHeight: '200px',
    minWidth: 0,
  },

  // Meeting summary
  meetingSummary: {
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '12px',
    color: tokens.colorNeutralForeground2,
    minWidth: 0,
  },

  // Todo tooltip
  todoTooltipContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    fontSize: tokens.fontSizeBase100,
  },
});

function formatRelativeDate(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}


export default function DailyPlanForm() {
  const styles = useStyles();
  const { id } = useParams();
  const { navigate, goBack } = useAppNavigate();

  const [plan, setPlan] = useState(null);
  const [todosData, setTodosData] = useState([]);
  const [timesheetsData, setTimesheetsData] = useState([]);
  const [content, setContent] = useState('');
  const [newTodoText, setNewTodoText] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [popupTimesheetUrl, setPopupTimesheetUrl] = useState(null);
  const [popupNotebookUrl, setPopupNotebookUrl] = useState(null);

  // Entity search dialog for slash menu
  const [entitySearchType, setEntitySearchType] = useState(null);
  const editorRef = useRef(null);

  const contentRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  const lastSavedRef = useRef(null);

  const dateObj = id ? new Date(id + 'T00:00:00') : null;
  const formattedDate = dateObj
    ? dateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  // --- Data loading ---

  const loadPlan = useCallback(async () => {
    try {
      const data = await dailyPlansApi.getById(id);
      setPlan(data);
      setTodosData(data.todosData || []);
      setTimesheetsData(data.timesheetsData || []);

      const md = await dailyPlansApi.getContent(id);
      setContent(md || '');
      lastSavedRef.current = md || '';
    } catch (err) {
      setError(err.message);
    } finally {
      setInitialized(true);
    }
  }, [id]);

  useEffect(() => {
    if (id) loadPlan();
  }, [id, loadPlan]);

  // --- Auto-save content with debounce (Milkdown onChange gives markdown string) ---

  const doSave = useCallback(async (md) => {
    if (md === lastSavedRef.current) return;
    try {
      await dailyPlansApi.updateContent(id, md);
      lastSavedRef.current = md;
    } catch (err) {
      console.warn('Auto-save failed:', err.message);
    }
  }, [id]);

  const scheduleSave = useCallback((md) => {
    contentRef.current = md;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => doSave(md), AUTO_SAVE_DELAY);
  }, [doSave]);

  const handleEditorChange = useCallback((md) => {
    contentRef.current = md;
    scheduleSave(md);
  }, [scheduleSave]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (contentRef.current !== null && contentRef.current !== lastSavedRef.current) {
        dailyPlansApi.updateContent(id, contentRef.current).catch(() => {});
      }
    };
  }, [id]);

  // --- PostMessage listeners ---

  useEffect(() => {
    const handler = (e) => {
      if (e.origin !== window.location.origin) return;
      const { entity, command: cmd } = e.data || {};

      if (entity === 'timesheets') {
        if (cmd === 'back' || cmd === 'saveAndClose' || cmd === 'delete') {
          setPopupTimesheetUrl(null);
          loadPlan();
        } else if (cmd === 'save') {
          loadPlan();
        }
      }

      if (entity === 'notebooks') {
        if (cmd === 'back') {
          setPopupNotebookUrl(null);
        }
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

  // --- Timeline event click → meeting note notebook ---

  const handleEventClick = useCallback(async (evt) => {
    const meetingNotes = plan?.meetingNotes || [];
    const existing = meetingNotes.find(n => n.calendarEventUid === evt.uid);

    if (existing) {
      // Open existing notebook
      setPopupNotebookUrl(`/notebooks/${existing.notebookId}/?embedded=true`);
    } else {
      // Create new notebook and link it
      try {
        const notebook = await notebooksApi.create({});
        // Set initial content with meeting title
        const initialContent = `# ${evt.summary || 'Meeting Notes'}\n\n`;
        await notebooksApi.updateContent(notebook._id, initialContent);
        // Link to daily plan
        await dailyPlansApi.addMeetingNote(id, {
          notebookId: notebook._id,
          calendarEventUid: evt.uid,
          eventSummary: evt.summary || 'Meeting',
        });
        setPlan(prev => ({
          ...prev,
          meetingNotes: [...(prev.meetingNotes || []), {
            notebookId: notebook._id,
            calendarEventUid: evt.uid,
            eventSummary: evt.summary || 'Meeting',
          }],
        }));
        setPopupNotebookUrl(`/notebooks/${notebook._id}/?embedded=true`);
      } catch (err) {
        setError(err.message);
      }
    }
  }, [plan, id]);

  // --- Entity search (slash menu) ---

  const handleEntitySelect = useCallback((entity) => {
    if (!entity || !editorRef.current) return;
    let href, displayName;
    if (entitySearchType === 'project') {
      href = `/projects/${entity._id}`;
      displayName = entity.name;
    } else if (entitySearchType === 'client') {
      href = `/clients/${entity._id}`;
      displayName = entity.companyName;
    } else if (entitySearchType === 'timesheet') {
      href = `/timesheets/${entity._id}`;
      displayName = `${entity.date} — ${entity.projectName || 'Timesheet'}`;
    } else if (entitySearchType === 'ticket') {
      href = `/tickets/${entity._id}`;
      displayName = `${entity.externalId || entity._id} — ${entity.title}`;
    }
    if (href) editorRef.current.insertEntityLink(href, displayName);
    setEntitySearchType(null);
  }, [entitySearchType]);

  // --- Delete handler ---

  const handleDelete = async () => {
    try {
      await dailyPlansApi.delete(id);
      navigate('/daily-plans');
    } catch (err) {
      setError(err.message);
    }
  };

  // --- Render helpers ---

  const todoTooltip = (todo) => (
    <div className={styles.todoTooltipContent}>
      <span>Created: {formatRelativeDate(todo.createdAt)}{todo.createdInPlanId ? ` in ${todo.createdInPlanId}` : ''}</span>
      {todo.status === 'done' && (
        <span>Completed: {formatRelativeDate(todo.completedAt)}{todo.completedInPlanId ? ` in ${todo.completedInPlanId}` : ''}</span>
      )}
    </div>
  );

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
              <Tooltip
                key={ts._id}
                relationship="description"
                positioning="above"
                content={
                  ts.notes
                    ? <div data-color-mode="light">
                        <MDEditor.Markdown source={ts.notes} style={{ maxWidth: '320px', backgroundColor: 'transparent', fontSize: '11px', lineHeight: '1.5', padding: 0 }} />
                      </div>
                    : 'No description'
                }
              >
                <Badge
                  appearance="tint"
                  color="brand"
                  size="small"
                  className={styles.timesheetTag}
                  onClick={() => setPopupTimesheetUrl(`/timesheets/${ts._id}?embedded=true`)}
                >
                  {ts.hours}h — {ts.projectName || 'Unknown'}
                </Badge>
              </Tooltip>
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

        {/* Main 2-column grid */}
        <div className={styles.mainGrid}>
          {/* Row 1 left: To-Do + Tickets */}
          <div className={styles.todoTicketsRow}>
            <div className={styles.section} style={{ flex: '4 1 0', minWidth: 0 }}>
              <Text className={styles.sectionTitle}>To-Do</Text>
              <div className={styles.addTodoRow}>
                <Input
                  placeholder="Add a to-do..."
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
              {todosData.map(todo => (
                <div key={todo._id} className={styles.todoItem}>
                  <Checkbox
                    checked={todo.status === 'done'}
                    onChange={() => handleToggleTodo(todo)}
                  />
                  <Tooltip content={todoTooltip(todo)} relationship="description" positioning="above">
                    <Text className={`${styles.todoText} ${todo.status === 'done' ? styles.todoDone : ''}`}>
                      {todo.text}
                    </Text>
                  </Tooltip>
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
            </div>
            <div className={styles.section} style={{ flex: '6 1 0', minWidth: 0, height: '400px' }}>
              <TicketsListCard commentsInitialDate={id} />
            </div>
          </div>

          {/* Row 1 right: Timeline */}
          <div className={styles.rightCell}>
            <div className={styles.timelineWrapper}>
              <DayTimelineCard date={id} onEventClick={handleEventClick} />
            </div>
          </div>

          {/* Row 2 left: Miscellaneous */}
          <div className={styles.miscSection}>
            <Text className={styles.sectionTitle}>Miscellaneous</Text>
            {initialized && (
              <NotebookEditor
                ref={editorRef}
                defaultValue={content}
                onChange={handleEditorChange}
                onEntitySearch={setEntitySearchType}
              />
            )}
          </div>

          {/* Row 2 right: Meeting Summary */}
          <div className={styles.meetingSummary}>
            <Text className={styles.sectionTitle}>Meeting Summary</Text>
            <Text size={200} style={{ fontStyle: 'italic' }}>Will appear here after summarisation.</Text>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Daily Plan"
        message={`Are you sure you want to delete the daily plan for ${formattedDate}? This action cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />

      {/* Entity search dialog for slash menu */}
      <EntitySearchDialog
        open={!!entitySearchType}
        entityType={entitySearchType}
        onSelect={handleEntitySelect}
        onClose={() => setEntitySearchType(null)}
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

      {/* Meeting note notebook popup */}
      <Dialog
        open={!!popupNotebookUrl}
        onOpenChange={(e, data) => { if (!data.open) setPopupNotebookUrl(null); }}
      >
        <DialogSurface style={{ maxWidth: '95vw', width: '1200px', maxHeight: '90vh', padding: 0 }}>
          <DialogBody style={{ padding: 0 }}>
            <DialogTitle
              action={
                <Button
                  appearance="subtle"
                  icon={<DismissRegular />}
                  onClick={() => setPopupNotebookUrl(null)}
                />
              }
              style={{ padding: '8px 12px' }}
            >
              Meeting Notes
            </DialogTitle>
            <DialogContent style={{ padding: 0, overflow: 'hidden' }}>
              {popupNotebookUrl && (
                <iframe
                  src={popupNotebookUrl}
                  style={{ width: '100%', height: '80vh', border: 'none' }}
                />
              )}
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
