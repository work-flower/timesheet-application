import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  makeStyles, mergeClasses, tokens, Text, Input, Checkbox, Spinner, MessageBar, MessageBarBody,
  Breadcrumb, BreadcrumbItem, BreadcrumbDivider, BreadcrumbButton,
  Badge, Button, Tooltip, Tab, TabList,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent,
  Menu, MenuTrigger, MenuPopover, MenuList, MenuItem,
} from '@fluentui/react-components';
import {
  AddRegular, DeleteRegular, CalendarClockRegular, DismissRegular, DismissCircleRegular,
  WeatherMoonRegular, WeatherSunnyRegular, ChevronDownRegular,
  BookRegular, LinkRegular, LinkDismissRegular, ArrowImportRegular,
} from '@fluentui/react-icons';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import TextToSpeechButton from '../../components/TextToSpeechButton.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import NotebookEditor from '../../components/editors/NotebookEditor.jsx';
import EntitySearchDialog from '../../components/editors/EntitySearchDialog.jsx';
import MDEditor from '@uiw/react-md-editor';
import { dailyPlansApi, todosApi, notebooksApi } from '../../api/index.js';
import useAppNavigate from '../../hooks/useAppNavigate.js';
import DayTimelineCard from '../../components/cards/DayTimelineCard.jsx';
import TicketsListCard from '../../components/cards/TicketsListCard.jsx';
import WeekIndicator from '../../components/WeekIndicator.jsx';

const AUTO_SAVE_DELAY = 1500;
function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

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
    maxWidth: '130px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'inline-block',
    ':hover': { opacity: 0.8 },
  },

  // Notebook banner
  notebookBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    flexWrap: 'wrap',
  },
  notebookBadge: {
    cursor: 'pointer',
    maxWidth: '160px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'inline-block',
    ':hover': { opacity: 0.8 },
  },

  // Two-column grid layout
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '2fr 5fr 3fr',
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
    padding: '2px 8px 2px 0',
    fontSize: tokens.fontSizeBase200,
  },
  todoDone: {
    textDecoration: 'line-through',
    color: tokens.colorNeutralForeground3,
  },
  todoText: {
    fontSize: tokens.fontSizeBase200,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
    flex: 1,
  },
  todoInput: {
    flex: 1,
    minWidth: 0,
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
  const [notebooksData, setNotebooksData] = useState([]);
  const [content, setContent] = useState('');
  const [newTodoText, setNewTodoText] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [popupTimesheetUrl, setPopupTimesheetUrl] = useState(null);
  const [popupNotebookUrl, setPopupNotebookUrl] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [recapStatus, setRecapStatus] = useState(null);
  const [recapContent, setRecapContent] = useState(null);
  const [activeInsightTab, setActiveInsightTab] = useState(() => {
    try { return localStorage.getItem('dailyPlan.insightTab') || 'briefing'; } catch { return 'briefing'; }
  });
  const [briefingContent, setBriefingContent] = useState(null);
  const [briefingStatus, setBriefingStatus] = useState(null);
  const [briefingAudioUrl, setBriefingAudioUrl] = useState(null);
  const [recapAudioUrl, setRecapAudioUrl] = useState(null);
  const [briefingDialogOpen, setBriefingDialogOpen] = useState(false);
  const [briefingDays, setBriefingDays] = useState([]);
  const [briefingDaysLoading, setBriefingDaysLoading] = useState(false);
  const [briefingDaysCount, setBriefingDaysCount] = useState(5);
  const [aiBannerText, setAiBannerText] = useState(null);
  const recapPollRef = useRef(null);
  const briefingPollRef = useRef(null);
  const briefingTtsRef = useRef(null);
  const recapTtsRef = useRef(null);
  const [commentTodoText, setCommentTodoText] = useState('');
  const [commentTodoOpen, setCommentTodoOpen] = useState(false);
  const [notebookSearchOpen, setNotebookSearchOpen] = useState(false);
  const [notebookSearchResults, setNotebookSearchResults] = useState([]);
  const [notebookSearchQuery, setNotebookSearchQuery] = useState('');
  const [notebookSearchLoading, setNotebookSearchLoading] = useState(false);
  const [notebookIncludeMeetingNotes, setNotebookIncludeMeetingNotes] = useState(false);
  const notebookImportRef = useRef(null);

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

  // --- Polling helpers ---

  const startRecapPoll = useCallback(() => {
    if (recapPollRef.current) return; // Already polling
    setRecapStatus(prev => ({ ...prev, status: 'generating' }));
    setAiBannerText('Recap is being generated...');
    recapPollRef.current = setInterval(async () => {
      try {
        const status = await dailyPlansApi.getRecapStatus(id);
        if (status.status === 'completed') {
          clearInterval(recapPollRef.current);
          recapPollRef.current = null;
          setRecapStatus(status);
          setAiBannerText(null);
          const rc = await dailyPlansApi.getRecap(id);
          setRecapContent(rc);
          setRecapAudioUrl(null); // Fresh recap — old audio is stale
          setTimeout(() => recapTtsRef.current?.play(rc), 100);
        } else if (status.status === 'failed') {
          clearInterval(recapPollRef.current);
          recapPollRef.current = null;
          setRecapStatus(status);
          setAiBannerText(null);
          setError(`Recap failed: ${status.error || 'Unknown error'}`);
        }
        // 'generating' — keep polling
      } catch { /* ignore, retry next tick */ }
    }, 10000);
  }, [id]);

  const startBriefingPoll = useCallback((reloadPlanFn) => {
    if (briefingPollRef.current) return;
    setBriefingStatus(prev => ({ ...prev, status: 'generating' }));
    setAiBannerText('Briefing is being generated...');
    briefingPollRef.current = setInterval(async () => {
      try {
        const status = await dailyPlansApi.getBriefingStatus(id);
        if (status.status === 'completed') {
          clearInterval(briefingPollRef.current);
          briefingPollRef.current = null;
          setBriefingStatus(status);
          setAiBannerText(null);
          const bc = await dailyPlansApi.getBriefing(id);
          setBriefingContent(bc);
          setBriefingAudioUrl(null); // Fresh briefing — old audio is stale
          // Auto-play TTS for the newly generated briefing
          setTimeout(() => briefingTtsRef.current?.play(bc), 100);
          // Reload plan to pick up carried-forward todos
          if (reloadPlanFn) reloadPlanFn();
        } else if (status.status === 'failed') {
          clearInterval(briefingPollRef.current);
          briefingPollRef.current = null;
          setBriefingStatus(status);
          setAiBannerText(null);
          setError(`Briefing failed: ${status.error || 'Unknown error'}`);
        }
      } catch { /* ignore, retry next tick */ }
    }, 10000);
  }, [id]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (recapPollRef.current) clearInterval(recapPollRef.current);
      if (briefingPollRef.current) clearInterval(briefingPollRef.current);
    };
  }, []);

  // --- Data loading ---

  const loadPlan = useCallback(async () => {
    try {
      const data = await dailyPlansApi.getById(id);
      setPlan(data);
      setTodosData(data.todosData || []);
      setTimesheetsData(data.timesheetsData || []);
      setNotebooksData(data.notebooksData || []);

      const md = await dailyPlansApi.getContent(id);
      setContent(md || '');
      lastSavedRef.current = md || '';

      // Load recap status + content (starts polling if generating)
      try {
        const status = await dailyPlansApi.getRecapStatus(id);
        setRecapStatus(status);
        if (status.status === 'completed') {
          const rc = await dailyPlansApi.getRecap(id);
          setRecapContent(rc);
          setRecapAudioUrl(dailyPlansApi.getRecapAudioUrl(id));
        } else {
          setRecapContent(null);
          setRecapAudioUrl(null);
          if (status.status === 'generating') startRecapPoll();
        }
      } catch { /* ignore */ }

      // Load briefing status + content (starts polling if generating)
      try {
        const bStatus = await dailyPlansApi.getBriefingStatus(id);
        setBriefingStatus(bStatus);
        if (bStatus.status === 'completed') {
          const bc = await dailyPlansApi.getBriefing(id);
          setBriefingContent(bc);
          // Always point to the audio endpoint — component handles 404
          setBriefingAudioUrl(dailyPlansApi.getBriefingAudioUrl(id));
        } else {
          setBriefingContent(null);
          setBriefingAudioUrl(null);
          // Pass loadPlan via a stable ref to avoid circular dependency
          if (bStatus.status === 'generating') startBriefingPoll(null);
        }
      } catch { /* ignore */ }
    } catch (err) {
      setError(err.message);
    } finally {
      setInitialized(true);
    }
  }, [id, startRecapPoll, startBriefingPoll]);

  useEffect(() => {
    if (id) loadPlan();
  }, [id, loadPlan]);

  // Auto-dismiss error after 10 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 10000);
    return () => clearTimeout(timer);
  }, [error]);

  // --- AI handlers ---

  const handleRecap = async () => {
    startRecapPoll();
    try {
      await dailyPlansApi.generateRecap(id);
    } catch (err) {
      // Submission failed — stop polling and show error
      if (recapPollRef.current) { clearInterval(recapPollRef.current); recapPollRef.current = null; }
      setAiBannerText(null);
      setRecapStatus(prev => ({ ...prev, status: 'failed' }));
      setError(err.message);
    }
  };

  // --- Briefing handlers ---

  const openBriefingDialog = async (days) => {
    setBriefingDaysCount(days);
    setBriefingDaysLoading(true);
    setBriefingDialogOpen(true);
    try {
      const result = await dailyPlansApi.checkBriefingDays(id, days);
      setBriefingDays(result.map(d => ({ ...d, selected: d.defaultSelected })));
    } catch (err) {
      setError(err.message);
      setBriefingDialogOpen(false);
    } finally {
      setBriefingDaysLoading(false);
    }
  };

  const handleBriefingDefault = async () => {
    // Check previous day — if recap is fresh, submit briefing directly; otherwise show dialog
    try {
      const days = await dailyPlansApi.checkBriefingDays(id, 1);
      const prev = days[0];
      if (prev && prev.hasPlan && prev.recapStatus === 'completed' && !prev.recapIsStale) {
        setActiveInsightTab('briefing');
        try { localStorage.setItem('dailyPlan.insightTab', 'briefing'); } catch {}
        await dailyPlansApi.generateBriefing(id, [prev.date]);
        startBriefingPoll(loadPlan);
      } else {
        openBriefingDialog(1);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleBriefingGenerate = async () => {
    const selected = briefingDays.filter(d => d.selected);
    if (selected.length === 0) return;
    setBriefingDialogOpen(false);
    setActiveInsightTab('briefing');
    try { localStorage.setItem('dailyPlan.insightTab', 'briefing'); } catch {}

    try {
      // Step 1: Submit recaps for stale/missing days
      const needsRecap = selected.filter(d => d.hasPlan && (d.recapStatus !== 'completed' || d.recapIsStale));
      if (needsRecap.length > 0) {
        for (const day of needsRecap) {
          try {
            await dailyPlansApi.generateRecap(day.date);
          } catch (err) {
            setError(`Recap submission failed for ${day.date}: ${err.message}. Exclude this day and retry.`);
            return;
          }
        }
        // Wait for all recaps to complete before submitting briefing
        setAiBannerText(`Generating recaps for ${needsRecap.length} day(s) before briefing...`);
        await waitForRecaps(needsRecap.map(d => d.date));
      }

      // Step 2: Submit briefing
      const selectedDates = selected.filter(d => d.hasPlan).map(d => d.date);
      if (selectedDates.length === 0) {
        setError('No days with daily plans selected.');
        return;
      }
      await dailyPlansApi.generateBriefing(id, selectedDates);
      startBriefingPoll(loadPlan);
    } catch (err) {
      setError(err.message);
      setAiBannerText(null);
    }
  };

  // Wait for recap batches on other days to complete (used by briefing flow)
  const waitForRecaps = async (dates) => {
    const pending = new Set(dates);
    while (pending.size > 0) {
      await new Promise(r => setTimeout(r, 10000));
      for (const date of [...pending]) {
        try {
          const status = await dailyPlansApi.getRecapStatus(date);
          if (status.status === 'completed') {
            pending.delete(date);
          } else if (status.status === 'failed') {
            throw new Error(`Recap failed for ${date}: ${status.error || 'Unknown error'}`);
          }
        } catch (err) {
          if (err.message.startsWith('Recap failed')) throw err;
          // API error — keep waiting
        }
      }
      if (pending.size > 0) {
        setAiBannerText(`Waiting for recaps (${pending.size} remaining)...`);
      }
    }
  };

  const handleTimesheetWithAi = () => {
    const bullets = [];

    // Meeting titles
    const meetings = plan?.meetingNotes || [];
    for (const mn of meetings) {
      if (mn.eventSummary) bullets.push(`- ${mn.eventSummary}`);
    }

    // Completed todos
    const doneTodos = todosData.filter(t => t.status === 'done');
    for (const t of doneTodos) {
      bullets.push(`- ${t.text}`);
    }

    const params = new URLSearchParams();
    params.set('date', id);
    if (bullets.length > 0) params.set('notes', bullets.join('\n'));
    params.set('embedded', 'true');
    setPopupTimesheetUrl(`/timesheets/new?${params.toString()}`);
  };

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
        if (cmd === 'back' || cmd === 'delete') {
          setPopupNotebookUrl(null);
          if (cmd === 'delete') loadPlan();
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
      setTodosData(prev => [...prev, { ...todo, planRefCount: 1 }]);
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

  const handleRemoveTodo = async (todo) => {
    try {
      // If only linked to this plan, delete permanently
      if (todo.planRefCount <= 1) {
        await dailyPlansApi.deleteTodoPermanent(id, todo._id);
      } else {
        await dailyPlansApi.removeTodo(id, todo._id);
      }
      setTodosData(prev => prev.filter(t => t._id !== todo._id));
      setPlan(prev => ({ ...prev, todos: (prev.todos || []).filter(tid => tid !== todo._id) }));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteTodo = async (todoId) => {
    try {
      await dailyPlansApi.deleteTodoPermanent(id, todoId);
      setTodosData(prev => prev.filter(t => t._id !== todoId));
      setPlan(prev => ({ ...prev, todos: (prev.todos || []).filter(tid => tid !== todoId) }));
    } catch (err) {
      setError(err.message);
    }
  };

  const [commentContext, setCommentContext] = useState(null);
  const [todoDialogSource, setTodoDialogSource] = useState(null); // 'comment' or 'ticket'

  const handleCommentClick = useCallback((comment) => {
    setCommentContext(comment);
    setTodoDialogSource('comment');
    setCommentTodoText(`${comment.externalId}: ${stripHtml(comment.body)}`);
    setCommentTodoOpen(true);
  }, []);

  const handleTicketShortcutClick = useCallback((ticket) => {
    setCommentContext({ externalId: ticket.externalId, ticketTitle: ticket.title, sourceColour: ticket.sourceColour });
    setTodoDialogSource('ticket');
    setCommentTodoText(`${ticket.externalId}: ${ticket.title}`);
    setCommentTodoOpen(true);
  }, []);

  const handleCreateTodoFromComment = async () => {
    if (!commentTodoText.trim()) return;
    try {
      const todo = await todosApi.create({ text: commentTodoText.trim(), createdInPlanId: id });
      await dailyPlansApi.addTodo(id, todo._id);
      setTodosData(prev => [...prev, { ...todo, planRefCount: 1 }]);
      setPlan(prev => ({ ...prev, todos: [...(prev.todos || []), todo._id] }));
      setCommentTodoOpen(false);
      setCommentTodoText('');
    } catch (err) {
      setError(err.message);
    }
  };

  // --- Notebook handlers ---

  const fetchNotebooks = useCallback(async (query, includeMeeting) => {
    setNotebookSearchLoading(true);
    try {
      const clauses = [];
      if (query.trim()) clauses.push(`contains(title,'${query.replace(/'/g, "''")}')`);
      if (!includeMeeting) clauses.push("type ne 'meeting-note'");
      const params = { status: 'active', $top: 15, $orderby: 'updatedAt desc' };
      if (clauses.length > 0) params.$filter = clauses.join(' and ');
      const results = await notebooksApi.getAll(params);
      const list = Array.isArray(results) ? results : results.value || [];
      const linkedIds = new Set(plan?.notebookIds || []);
      setNotebookSearchResults(list.filter(n => !linkedIds.has(n._id)));
    } catch {
      setNotebookSearchResults([]);
    } finally {
      setNotebookSearchLoading(false);
    }
  }, [plan]);

  const handleNotebookSearch = useCallback((query) => {
    setNotebookSearchQuery(query);
    fetchNotebooks(query, notebookIncludeMeetingNotes);
  }, [fetchNotebooks, notebookIncludeMeetingNotes]);

  const handleLinkNotebook = async (notebookId) => {
    try {
      const updated = await dailyPlansApi.addNotebook(id, notebookId);
      setPlan(updated);
      setNotebooksData(updated.notebooksData || []);
      setNotebookSearchOpen(false);
      setNotebookSearchQuery('');
      setNotebookSearchResults([]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUnlinkNotebook = async (notebookId) => {
    try {
      const updated = await dailyPlansApi.removeNotebook(id, notebookId);
      setPlan(updated);
      setNotebooksData(updated.notebooksData || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleNotebookImport = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const mdExts = ['.md', '.markdown'];
    const mdFiles = files.filter(f => mdExts.some(ext => f.name.toLowerCase().endsWith(ext)));
    if (mdFiles.length === 0) {
      setError('No markdown file found. Import requires at least one .md file.');
      return;
    }

    const contentFile = mdFiles.reduce((a, b) => (b.size > a.size ? b : a));
    const resourceFiles = files.filter(f => f !== contentFile);
    const contentText = await contentFile.text();

    const formData = new FormData();
    formData.append('content', contentText);
    for (const file of resourceFiles) formData.append('files', file);

    try {
      const notebook = await notebooksApi.importNotebook(formData);
      // Auto-link the imported notebook
      const updated = await dailyPlansApi.addNotebook(id, notebook._id);
      setPlan(updated);
      setNotebooksData(updated.notebooksData || []);
    } catch (err) {
      setError(`Import failed: ${err.message}`);
    }
  }, [id]);

  // --- Timeline event click → meeting note notebook ---

  const handleEventClick = useCallback(async (evt) => {
    const meetingNotes = plan?.meetingNotes || [];
    const existing = meetingNotes.find(n => n.calendarEventUid === evt.uid);

    if (existing) {
      // Verify the notebook still exists and isn't deleted
      try {
        const nb = await notebooksApi.getById(existing.notebookId);
        if (nb.status === 'deleted') {
          // Restore from recycle bin and open
          await notebooksApi.restore(existing.notebookId);
          setPopupNotebookUrl(`/notebooks/${existing.notebookId}/?embedded=true`);
          return;
        }
        setPopupNotebookUrl(`/notebooks/${existing.notebookId}/?embedded=true`);
        return;
      } catch {
        // Notebook was hard-deleted (purged) — remove stale mapping and fall through to create new
        const updatedNotes = meetingNotes.filter(n => n.calendarEventUid !== evt.uid);
        await dailyPlansApi.update(id, { meetingNotes: updatedNotes });
        setPlan(prev => ({ ...prev, meetingNotes: updatedNotes }));
      }
    }

    {
      // Create new notebook (or restore deleted one with same title) and link it
      try {
        const evtDate = id;
        const evtTime = evt.startTime || (evt.start ? new Date(evt.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
        const titleSuffix = evtTime ? ` - ${evtDate} ${evtTime}` : ` - ${evtDate}`;
        const meetingTitle = `${evt.summary || 'Meeting Notes'}${titleSuffix}`;

        let notebook;
        try {
          notebook = await notebooksApi.create({ type: 'meeting-note', title: meetingTitle });
        } catch (createErr) {
          // Title clash — likely a deleted notebook in the recycle bin, find and restore it
          if (createErr.message.includes('already exists')) {
            const all = await notebooksApi.getAll({ status: 'deleted', $filter: `title eq '${meetingTitle.replace(/'/g, "''")}'` });
            const deleted = (Array.isArray(all) ? all : all.value || [])[0];
            if (deleted) {
              await notebooksApi.restore(deleted._id);
              notebook = await notebooksApi.getById(deleted._id);
            } else {
              throw createErr;
            }
          } else {
            throw createErr;
          }
        }

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

        // Build attendee sections
        const attendees = evt.attendees || [];
        const buildAttendeeContent = () => {
          const organisers = attendees.filter(a => a.role === 'CHAIR');
          const required = attendees.filter(a => a.role === 'REQ-PARTICIPANT');
          const optional = attendees.filter(a => a.role === 'OPT-PARTICIPANT');
          const rooms = attendees.filter(a => a.type === 'ROOM');
          const other = attendees.filter(a =>
            a.role !== 'CHAIR' && a.role !== 'REQ-PARTICIPANT' && a.role !== 'OPT-PARTICIPANT' && a.type !== 'ROOM'
          );

          const formatAttendee = (a) => {
            const name = a.name || a.email || 'Unknown';
            const status = a.status ? ` — ${a.status.toLowerCase()}` : '';
            return `- ${name}${status}`;
          };

          const sections = [];
          if (organisers.length > 0) sections.push(`**Organiser:** ${organisers.map(a => a.name || a.email).join(', ')}`);
          if (required.length > 0) sections.push(`**Attendees:**\n${required.map(formatAttendee).join('\n')}`);
          if (optional.length > 0) sections.push(`**Optional:**\n${optional.map(formatAttendee).join('\n')}`);
          if (rooms.length > 0) sections.push(`**Room:** ${rooms.map(a => a.name || a.email).join(', ')}`);
          if (other.length > 0) sections.push(`**Other:**\n${other.map(formatAttendee).join('\n')}`);
          return sections.join('\n\n');
        };

        // Generate AI summary + populate content
        setAiLoading(true);
        setAiBannerText('Generating meeting summary...');
        try {
          const ai = await dailyPlansApi.generateMeetingSummary(id, {
            subject: evt.summary || '',
            description: evt.description || '',
            attendees: attendees.map(a => ({ name: a.name, email: a.email, role: a.role })),
          });

          const contentParts = [`# ${meetingTitle}`];
          if (ai.summary) contentParts.push(ai.summary);
          if (ai.hashtags) contentParts.push(ai.hashtags);
          const attendeeContent = buildAttendeeContent();
          if (attendeeContent) contentParts.push(attendeeContent);
          contentParts.push('## Notes\n\n');

          await notebooksApi.updateContent(notebook._id, contentParts.join('\n\n'));
        } catch {
          // AI failed — fall back to attendees only
          const contentParts = [`# ${meetingTitle}`, 'Summary paragraph here.', '#tags'];
          const attendeeContent = buildAttendeeContent();
          if (attendeeContent) contentParts.push(attendeeContent);
          contentParts.push('## Notes\n\n');

          await notebooksApi.updateContent(notebook._id, contentParts.join('\n\n'));
        } finally {
          setAiLoading(false);
          setAiBannerText(null);
        }

        setPopupNotebookUrl(`/notebooks/${notebook._id}/?embedded=true`);
      } catch (err) {
        setAiLoading(false);
        setAiBannerText(null);
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
    <div style={{ maxWidth: '320px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <Text style={{ fontSize: '13px', fontWeight: 600, lineHeight: '1.4', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {todo.text}
      </Text>
      <div style={{ borderTop: `1px solid ${tokens.colorNeutralStroke2}`, paddingTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <Text style={{ fontSize: '11px', color: tokens.colorNeutralForeground3 }}>
          Created: {formatRelativeDate(todo.createdAt)}{todo.createdInPlanId ? ` in ${todo.createdInPlanId}` : ''}
        </Text>
        {todo.status === 'done' && (
          <Text style={{ fontSize: '11px', color: tokens.colorNeutralForeground3 }}>
            Completed: {formatRelativeDate(todo.completedAt)}{todo.completedInPlanId ? ` in ${todo.completedInPlanId}` : ''}
          </Text>
        )}
      </div>
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
        <div style={{ display: 'inline-flex', alignItems: 'center' }}>
          <Button
            size="small"
            icon={briefingStatus?.status === 'generating' ? <Spinner size="tiny" /> : <WeatherSunnyRegular />}
            onClick={handleBriefingDefault}
            disabled={briefingStatus?.status === 'generating'}
          >
            Briefing
          </Button>
          <Menu>
            <MenuTrigger>
              <Button
                size="small"
                icon={<ChevronDownRegular />}
                disabled={briefingStatus?.status === 'generating'}
                style={{ minWidth: 'auto', paddingLeft: '2px', paddingRight: '2px', borderLeft: 'none', borderTopLeftRadius: 0, borderBottomLeftRadius: 0, marginLeft: '-1px' }}
              />
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem onClick={() => openBriefingDialog(3)}>Last 3 days</MenuItem>
                <MenuItem onClick={() => openBriefingDialog(5)}>Last 5 days</MenuItem>
                <MenuItem onClick={() => openBriefingDialog(7)}>Last 7 days</MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
        </div>
        <Tooltip
          content={
            !recapStatus || recapStatus.status === 'idle' ? 'No recap generated yet — click to generate'
            : recapStatus.status === 'generating' ? 'Recap is being generated...'
            : recapStatus.status === 'failed' ? `Last recap failed: ${recapStatus.error || 'Unknown error'}`
            : recapStatus.isStale ? 'Recap is stale — plan was updated since last generation'
            : `Recap is up to date (${recapStatus.generatedAt ? new Date(recapStatus.generatedAt).toLocaleString('en-GB') : ''})`
          }
          relationship="label"
        >
          <Button
            size="small"
            icon={recapStatus?.status === 'generating' ? <Spinner size="tiny" /> : <WeatherMoonRegular />}
            onClick={handleRecap}
            disabled={recapStatus?.status === 'generating'}
            style={{ position: 'relative' }}
          >
            Recap
            {recapStatus && (recapStatus.status === 'idle' || recapStatus.status === 'failed' || recapStatus.isStale) && (
              <span style={{
                position: 'absolute', top: 2, right: 2,
                width: 8, height: 8, borderRadius: '50%',
                backgroundColor: '#d13438',
              }} />
            )}
          </Button>
        </Tooltip>
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

        {(aiLoading || recapStatus?.status === 'generating' || briefingStatus?.status === 'generating') && (
          <MessageBar intent="info" className={styles.message}>
            <MessageBarBody style={{ display: 'flex', alignItems: 'center' }}><Spinner size="tiny" style={{ marginRight: '8px' }} />{aiBannerText || 'AI is processing...'}</MessageBarBody>
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
                  <div style={{ maxWidth: '320px' }}>
                    <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '4px' }}>{ts.hours}h — {ts.projectName || 'Unknown'}</div>
                    {ts.notes
                      ? <div data-color-mode="light">
                          <MDEditor.Markdown source={ts.notes} style={{ backgroundColor: 'transparent', fontSize: '11px', lineHeight: '1.5', padding: 0 }} />
                        </div>
                      : <span style={{ fontSize: '11px', color: '#888' }}>No description</span>
                    }
                  </div>
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
          <Tooltip content="Create new timesheet (AI generates description)" relationship="label">
            <Button
              appearance="subtle"
              icon={<AddRegular />}
              size="small"
              onClick={handleTimesheetWithAi}
              disabled={aiLoading}
            />
          </Tooltip>
          <div style={{ marginLeft: 'auto' }}>
            <WeekIndicator date={id} />
          </div>
          <input
            type="date"
            value={id || ''}
            onChange={async (e) => {
              const newDate = e.target.value;
              if (newDate && newDate !== id) {
                try {
                  await dailyPlansApi.changeDate(id, newDate);
                  navigate(`/daily-plans/${newDate}`);
                } catch (err) {
                  setError(err.message);
                }
              }
            }}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '13px',
              fontFamily: 'inherit',
              color: tokens.colorNeutralForeground3,
              cursor: 'pointer',
            }}
          />
        </div>

        {/* Main 3-column grid */}
        <div className={styles.mainGrid}>
          {/* Row 1: To-Do | Tickets | Timeline */}
          <div className={styles.section} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '400px' }}>
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
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {[...todosData].sort((a, b) => {
                if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
                return new Date(b.createdAt) - new Date(a.createdAt);
              }).map(todo => (
                <div key={todo._id} className={styles.todoItem}>
                  <Checkbox
                    checked={todo.status === 'done'}
                    onChange={() => handleToggleTodo(todo)}
                  />
                  <Tooltip content={todoTooltip(todo)} relationship="description" positioning="above">
                    <Text className={mergeClasses(styles.todoText, todo.status === 'done' && styles.todoDone)}>
                      {todo.text}
                    </Text>
                  </Tooltip>
                  <Tooltip content={todo.planRefCount > 1 ? `Remove from this plan (also in: ${(todo.linkedPlanDates || []).join(', ')})` : 'Delete'} relationship="label">
                    <Button
                      appearance="subtle"
                      icon={todo.planRefCount > 1 ? <DismissCircleRegular /> : <DeleteRegular />}
                      size="small"
                      onClick={() => handleRemoveTodo(todo)}
                      style={{ marginLeft: 'auto', minWidth: 'auto' }}
                    />
                  </Tooltip>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.section} style={{ height: '400px' }}>
            <TicketsListCard commentsInitialDate={id} onCommentClick={handleCommentClick} onTicketShortcutClick={handleTicketShortcutClick} />
          </div>
          <div className={styles.rightCell}>
            <div className={styles.timelineWrapper}>
              <DayTimelineCard date={id} onEventClick={handleEventClick} />
            </div>
          </div>

          {/* Row 2: Recap/Briefing tabs (span 2) | Miscellaneous */}
          <div className={styles.meetingSummary} style={{ gridColumn: 'span 2', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <TabList selectedValue={activeInsightTab} onTabSelect={(_, data) => { setActiveInsightTab(data.value); try { localStorage.setItem('dailyPlan.insightTab', data.value); } catch {} }} size="small">
              <Tab value="briefing">Briefing</Tab>
              <Tab value="recap">Recap</Tab>
            </TabList>
            <div style={{ flex: 1, paddingTop: '8px', overflowY: 'auto' }}>
              {activeInsightTab === 'recap' && (
                recapContent ? (
                  <div data-color-mode="light">
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                      <TextToSpeechButton
                        ref={recapTtsRef}
                        text={recapContent}
                        backgroundMusic
                        audioUrl={recapAudioUrl}
                        disabled={recapStatus?.status === 'generating'}
                        onAudioGenerated={(blob) => {
                          dailyPlansApi.saveRecapAudio(id, blob).then(() => {
                            setRecapAudioUrl(dailyPlansApi.getRecapAudioUrl(id));
                          }).catch(() => {});
                        }}
                      />
                    </div>
                    <MDEditor.Markdown source={recapContent} style={{ backgroundColor: 'transparent', fontSize: '13px', lineHeight: '1.5' }} />
                  </div>
                ) : (
                  <Text size={200} style={{ fontStyle: 'italic', color: tokens.colorNeutralForeground3 }}>
                    {recapStatus?.status === 'generating'
                      ? 'Recap is being generated...'
                      : recapStatus?.status === 'failed'
                      ? 'Recap generation failed. Click Recap to retry.'
                      : 'Click Recap to generate an end-of-day summary.'}
                  </Text>
                )
              )}
              {activeInsightTab === 'briefing' && (
                briefingContent ? (
                  <div data-color-mode="light">
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                      <TextToSpeechButton
                        ref={briefingTtsRef}
                        text={briefingContent}
                        backgroundMusic
                        audioUrl={briefingAudioUrl}
                        disabled={briefingStatus?.status === 'generating'}
                        onAudioGenerated={(blob) => {
                          dailyPlansApi.saveBriefingAudio(id, blob).then(() => {
                            setBriefingAudioUrl(dailyPlansApi.getBriefingAudioUrl(id));
                          }).catch(() => {});
                        }}
                      />
                    </div>
                    <MDEditor.Markdown source={briefingContent} style={{ backgroundColor: 'transparent', fontSize: '13px', lineHeight: '1.5' }} />
                  </div>
                ) : (
                  <Text size={200} style={{ fontStyle: 'italic', color: tokens.colorNeutralForeground3 }}>
                    {briefingStatus?.status === 'generating'
                      ? 'Briefing is being generated...'
                      : briefingStatus?.status === 'failed'
                      ? 'Briefing generation failed. Click Briefing to retry.'
                      : 'Click Briefing to generate a morning briefing from previous days\' recaps.'}
                  </Text>
                )
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Related Notebooks banner */}
          <div className={styles.notebookBanner}>
            <BookRegular style={{ fontSize: '16px', color: tokens.colorNeutralForeground3 }} />
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Notebooks:</Text>
            {notebooksData.length > 0 ? (
              notebooksData.map(nb => (
                <Tooltip
                  key={nb._id}
                  relationship="description"
                  positioning="above"
                  content={
                    <div style={{ maxWidth: '320px' }}>
                      <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '4px' }}>{nb.title}</div>
                      {nb.summary && <div style={{ fontSize: '11px', lineHeight: '1.4', marginBottom: '4px' }}>{nb.summary}</div>}
                      {nb.updatedAt && (
                        <div style={{ fontSize: '11px', color: '#999', marginBottom: '6px' }}>
                          Updated: {new Date(nb.updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                      <div
                        onClick={(e) => { e.stopPropagation(); handleUnlinkNotebook(nb._id); }}
                        style={{ fontSize: '11px', color: '#d13438', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <LinkDismissRegular style={{ fontSize: '12px' }} /> Unlink
                      </div>
                    </div>
                  }
                >
                  <Badge
                    appearance="tint"
                    color="informative"
                    size="small"
                    className={styles.notebookBadge}
                    onClick={() => setPopupNotebookUrl(`/notebooks/${nb._id}/?embedded=true`)}
                  >
                    {nb.title}
                  </Badge>
                </Tooltip>
              ))
            ) : (
              <Text size={200} style={{ color: tokens.colorNeutralForeground3, fontStyle: 'italic' }}>
                No notebooks linked
              </Text>
            )}
            <Tooltip content="Link an existing notebook" relationship="label">
              <Button
                appearance="subtle"
                icon={<LinkRegular />}
                size="small"
                onClick={() => { setNotebookSearchOpen(true); setNotebookSearchQuery(''); setNotebookIncludeMeetingNotes(false); fetchNotebooks('', false); }}
              />
            </Tooltip>
            <Tooltip content="Import markdown file as notebook" relationship="label">
              <Button
                appearance="subtle"
                icon={<ArrowImportRegular />}
                size="small"
                onClick={() => notebookImportRef.current?.click()}
              />
            </Tooltip>
            <input
              ref={notebookImportRef}
              type="file"
              accept=".md,.markdown"
              multiple
              style={{ display: 'none' }}
              onChange={handleNotebookImport}
            />
          </div>

          <div className={styles.miscSection} style={{ flex: 1 }}>
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

      {/* Comment/Ticket → Todo dialog */}
      <Dialog open={commentTodoOpen} onOpenChange={(_, data) => { if (!data.open) setCommentTodoOpen(false); }}>
        <DialogSurface style={{ maxWidth: '520px' }}>
          <DialogBody>
            <DialogTitle>{todoDialogSource === 'ticket' ? 'Create To-Do from Ticket' : 'Create To-Do from Comment'}</DialogTitle>
            <DialogContent>
              {commentContext && (
                <div style={{
                  backgroundColor: tokens.colorNeutralBackground3,
                  borderLeft: `3px solid ${commentContext.sourceColour || '#0078D4'}`,
                  borderRadius: '4px',
                  padding: '10px 12px',
                  marginBottom: '12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <Text style={{ fontWeight: 600, fontSize: '12px', fontFamily: 'monospace', color: tokens.colorBrandForeground1 }}>{commentContext.externalId}</Text>
                    <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground2 }}>{commentContext.ticketTitle}</Text>
                  </div>
                  {todoDialogSource === 'comment' && commentContext.author && (
                    <Text style={{ fontSize: '11px', color: tokens.colorNeutralForeground3, display: 'block', marginBottom: '4px' }}>
                      {commentContext.author} · {commentContext.created ? new Date(commentContext.created).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                    </Text>
                  )}
                  {todoDialogSource === 'comment' && commentContext.body && (
                    <Text style={{ fontSize: '12px', color: tokens.colorNeutralForeground1, lineHeight: '1.4' }}>
                      {stripHtml(commentContext.body)}
                    </Text>
                  )}
                </div>
              )}
              <Text style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>To-Do Text</Text>
              <textarea
                value={commentTodoText}
                onChange={(e) => setCommentTodoText(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  padding: '8px',
                  borderRadius: '4px',
                  border: `1px solid ${tokens.colorNeutralStroke1}`,
                  resize: 'vertical',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <Button appearance="secondary" onClick={() => setCommentTodoOpen(false)}>Cancel</Button>
                <Button appearance="primary" onClick={handleCreateTodoFromComment} disabled={!commentTodoText.trim()}>Create Todo</Button>
              </div>
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>


      {/* Briefing day picker dialog */}
      <Dialog open={briefingDialogOpen} onOpenChange={(_, data) => { if (!data.open) setBriefingDialogOpen(false); }}>
        <DialogSurface style={{ maxWidth: '480px' }}>
          <DialogBody>
            <DialogTitle>Briefing — Select Days</DialogTitle>
            <DialogContent>
              {briefingDaysLoading ? (
                <div style={{ padding: '24px', textAlign: 'center' }}><Spinner size="small" label="Checking previous days..." /></div>
              ) : (
                <>
                  <Text size={200} style={{ display: 'block', marginBottom: '8px', color: tokens.colorNeutralForeground3 }}>
                    Select which days to include. Days with stale or missing recaps will be generated automatically before briefing.
                  </Text>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '12px' }}>
                    {briefingDays.map((day, idx) => (
                      <div
                        key={day.date}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          backgroundColor: idx % 2 === 0 ? tokens.colorNeutralBackground1 : tokens.colorNeutralBackground3,
                        }}
                      >
                        <Checkbox
                          checked={day.selected}
                          onChange={() => setBriefingDays(prev => prev.map((d, i) => i === idx ? { ...d, selected: !d.selected } : d))}
                          disabled={!day.hasPlan}
                        />
                        <Text size={200} style={{ flex: 1, color: day.hasPlan ? tokens.colorNeutralForeground1 : tokens.colorNeutralForeground3 }}>
                          <span style={{ fontWeight: 600 }}>{day.dayName}</span>{' '}{day.date}
                        </Text>
                        {!day.hasPlan && (
                          <Badge appearance="tint" color="subtle" size="small">No plan</Badge>
                        )}
                        {day.hasPlan && day.recapStatus === 'completed' && !day.recapIsStale && (
                          <Badge appearance="tint" color="success" size="small">Recap ok</Badge>
                        )}
                        {day.hasPlan && day.recapStatus === 'completed' && day.recapIsStale && (
                          <Badge appearance="tint" color="warning" size="small">Recap stale</Badge>
                        )}
                        {day.hasPlan && day.recapStatus !== 'completed' && (
                          <Badge appearance="tint" color="danger" size="small">No recap</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                  {briefingDays.some(d => d.selected && d.hasPlan && (d.recapStatus !== 'completed' || d.recapIsStale)) && (
                    <MessageBar intent="warning" style={{ marginBottom: '12px' }}>
                      <MessageBarBody>
                        Some selected days have stale or missing recaps. These will be generated before the briefing.
                      </MessageBarBody>
                    </MessageBar>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <Button appearance="secondary" onClick={() => setBriefingDialogOpen(false)}>Cancel</Button>
                    <Button
                      appearance="primary"
                      onClick={handleBriefingGenerate}
                      disabled={!briefingDays.some(d => d.selected && d.hasPlan)}
                    >
                      Generate Briefing
                    </Button>
                  </div>
                </>
              )}
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Notebook search dialog */}
      <Dialog open={notebookSearchOpen} onOpenChange={(_, data) => { if (!data.open) setNotebookSearchOpen(false); }}>
        <DialogSurface style={{ maxWidth: '520px' }}>
          <DialogBody>
            <DialogTitle>Link Notebook</DialogTitle>
            <DialogContent>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Input
                  placeholder="Search notebooks by title..."
                  value={notebookSearchQuery}
                  onChange={(e, data) => handleNotebookSearch(data.value)}
                  style={{ flex: 1 }}
                  autoFocus
                />
                <Tooltip content="Include meeting notes" relationship="label">
                  <Button
                    appearance={notebookIncludeMeetingNotes ? 'primary' : 'subtle'}
                    icon={<CalendarClockRegular />}
                    size="small"
                    onClick={() => {
                      const next = !notebookIncludeMeetingNotes;
                      setNotebookIncludeMeetingNotes(next);
                      fetchNotebooks(notebookSearchQuery, next);
                    }}
                  />
                </Tooltip>
              </div>
              {notebookSearchLoading && (
                <div style={{ padding: '12px', textAlign: 'center' }}><Spinner size="tiny" /></div>
              )}
              {!notebookSearchLoading && notebookSearchResults.length === 0 && (
                <Text size={200} style={{ color: tokens.colorNeutralForeground3, fontStyle: 'italic', display: 'block', padding: '8px 0' }}>
                  No notebooks found
                </Text>
              )}
              {notebookSearchResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', maxHeight: '300px', overflowY: 'auto' }}>
                  {notebookSearchResults.map((nb, idx) => {
                    const isMeeting = nb.type === 'meeting-note';
                    const baseBg = idx % 2 === 0 ? tokens.colorNeutralBackground1 : tokens.colorNeutralBackground3;
                    return (
                      <div
                        key={nb._id}
                        onClick={() => handleLinkNotebook(nb._id)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          backgroundColor: baseBg,
                          borderLeft: isMeeting ? '3px solid #0078D4' : '3px solid transparent',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = tokens.colorNeutralBackground1Hover; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = baseBg; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                          <Text style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{nb.title}</Text>
                          {isMeeting && <Badge appearance="tint" color="brand" size="small" style={{ flexShrink: 0 }}>meeting</Badge>}
                        </div>
                        {nb.summary && <Text style={{ fontSize: '11px', color: tokens.colorNeutralForeground3, display: 'block', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nb.summary}</Text>}
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                <Button appearance="secondary" onClick={() => setNotebookSearchOpen(false)}>Cancel</Button>
              </div>
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>

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

      {/* Notebook popup */}
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
              Notebook
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
