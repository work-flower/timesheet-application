import { dailyPlans, timesheets, todos, projects, clients } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, renameSync, statSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function getDataDir() { return process.env.DATA_DIR || join(__dirname, '..', '..', 'data'); }
function getDailyPlansDir() { return join(getDataDir(), 'daily-plans'); }
function getPlanDir(date) { return join(getDailyPlansDir(), date); }
function getContentPath(date) { return join(getPlanDir(date), 'content.md'); }
function getRecapPath(date) { return join(getPlanDir(date), 'recap.md'); }
function getRecapBackupPath(date) { return join(getPlanDir(date), 'recap.md~1'); }
function getRecapErrorPath(date) { return join(getPlanDir(date), 'recap.err'); }

const DEFAULT_CONTENT = `## Miscellaneous

`;

export async function getAll(query = {}) {
  const baseFilter = {};

  if (query.status) baseFilter.status = query.status;
  if (query.startDate || query.endDate) {
    baseFilter._id = {};
    if (query.startDate) baseFilter._id.$gte = query.startDate;
    if (query.endDate) baseFilter._id.$lte = query.endDate;
  }

  const { results, totalCount } = await buildQuery(
    dailyPlans, query, { _id: -1 }, baseFilter
  );

  // Enrich with todo counts and timesheet info
  const enriched = await Promise.all(results.map(async (plan) => {
    const planTodos = plan.todos && plan.todos.length > 0
      ? await todos.find({ _id: { $in: plan.todos } })
      : [];
    const totalTodos = planTodos.length;
    const completedTodos = planTodos.filter(t => t.status === 'done').length;

    const linkedTimesheets = plan.timesheetIds && plan.timesheetIds.length > 0
      ? await timesheets.find({ _id: { $in: plan.timesheetIds } })
      : [];
    const hasTimesheet = linkedTimesheets.length > 0;

    const recap = getRecapStatus(plan._id);
    let recapIsStale = false;
    if (recap.status === 'completed' && plan.updatedAt) {
      recapIsStale = recap.recapMtime < new Date(plan.updatedAt).getTime();
    }

    return {
      ...plan,
      todoCount: totalTodos,
      todoCompletedCount: completedTodos,
      hasTimesheet,
      recapStatus: recap.status,
      recapIsStale,
    };
  }));

  const items = applySelect(enriched, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
}

export async function getById(id) {
  const plan = await dailyPlans.findOne({ _id: id });
  if (!plan) return null;

  // Enrich with full todo objects
  const planTodos = plan.todos && plan.todos.length > 0
    ? await todos.find({ _id: { $in: plan.todos } })
    : [];

  // Enrich with timesheets for this date (by date, not just linked IDs)
  const dateTimesheets = await timesheets.find({ date: id });
  const allProjects = dateTimesheets.length > 0 ? await projects.find({}) : [];
  const allClients = allProjects.length > 0 ? await clients.find({}) : [];
  const projectMap = Object.fromEntries(allProjects.map(p => [p._id, p]));
  const clientMap = Object.fromEntries(allClients.map(c => [c._id, c]));
  const enrichedTimesheets = dateTimesheets.map(ts => {
    const project = projectMap[ts.projectId];
    const client = project ? clientMap[project.clientId] : null;
    return {
      ...ts,
      projectName: project?.name || 'Unknown',
      clientName: client?.companyName || 'Unknown',
    };
  });

  return {
    ...plan,
    todosData: planTodos,
    timesheetsData: enrichedTimesheets,
  };
}

export async function create(data) {
  if (!data.date) throw new Error('Date is required');

  // Validate date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    throw new Error('Date must be in YYYY-MM-DD format');
  }

  // Enforce one plan per date — _id IS the date
  const existing = await dailyPlans.findOne({ _id: data.date });
  if (existing) throw new Error(`A daily plan already exists for ${data.date}`);

  // Create folder and content.md on disk
  const planDir = getPlanDir(data.date);
  mkdirSync(planDir, { recursive: true });
  writeFileSync(getContentPath(data.date), DEFAULT_CONTENT, 'utf8');

  const now = new Date().toISOString();
  const plan = await dailyPlans.insert({
    _id: data.date,
    status: 'active',
    todos: [],
    timesheetIds: [],
    meetingNotes: [],
    ticketIds: [],
    createdAt: now,
    updatedAt: now,
  });

  return getById(plan._id);
}

export async function update(id, data) {
  const existing = await dailyPlans.findOne({ _id: id });
  if (!existing) return null;

  const now = new Date().toISOString();
  const updateData = { updatedAt: now };

  // Only allow updating specific fields
  if (data.status !== undefined) updateData.status = data.status;
  if (data.todos !== undefined) updateData.todos = data.todos;
  if (data.timesheetIds !== undefined) updateData.timesheetIds = data.timesheetIds;
  if (data.meetingNotes !== undefined) updateData.meetingNotes = data.meetingNotes;
  if (data.ticketIds !== undefined) updateData.ticketIds = data.ticketIds;

  await dailyPlans.update({ _id: id }, { $set: updateData });
  return getById(id);
}

export async function remove(id) {
  const existing = await dailyPlans.findOne({ _id: id });
  if (!existing) return null;

  // Remove folder from disk
  const planDir = getPlanDir(id);
  if (existsSync(planDir)) {
    rmSync(planDir, { recursive: true });
  }

  return dailyPlans.remove({ _id: id });
}

// --- Content operations ---

export async function getContent(id) {
  const plan = await dailyPlans.findOne({ _id: id });
  if (!plan) return null;

  const contentPath = getContentPath(id);
  if (!existsSync(contentPath)) return '';
  return readFileSync(contentPath, 'utf8');
}

export async function updateContent(id, content) {
  const plan = await dailyPlans.findOne({ _id: id });
  if (!plan) return null;

  const planDir = getPlanDir(id);
  mkdirSync(planDir, { recursive: true });
  writeFileSync(getContentPath(id), content, 'utf8');

  await dailyPlans.update({ _id: id }, { $set: { updatedAt: new Date().toISOString() } });
  return { success: true };
}

// --- Todo management within a plan ---

export async function addTodo(planId, todoId) {
  const plan = await dailyPlans.findOne({ _id: planId });
  if (!plan) throw new Error('Daily plan not found');

  const todosList = plan.todos || [];
  if (todosList.includes(todoId)) return getById(planId); // Already linked

  await dailyPlans.update({ _id: planId }, { $set: { todos: [...todosList, todoId], updatedAt: new Date().toISOString() } });
  return getById(planId);
}

export async function removeTodo(planId, todoId) {
  const plan = await dailyPlans.findOne({ _id: planId });
  if (!plan) throw new Error('Daily plan not found');

  const todosList = (plan.todos || []).filter(id => id !== todoId);
  await dailyPlans.update({ _id: planId }, { $set: { todos: todosList, updatedAt: new Date().toISOString() } });
  return getById(planId);
}

// --- Timesheet management ---

export async function addTimesheet(planId, timesheetId) {
  const plan = await dailyPlans.findOne({ _id: planId });
  if (!plan) throw new Error('Daily plan not found');

  const ids = plan.timesheetIds || [];
  if (ids.includes(timesheetId)) return getById(planId);

  await dailyPlans.update({ _id: planId }, { $set: { timesheetIds: [...ids, timesheetId], updatedAt: new Date().toISOString() } });
  return getById(planId);
}

// --- Meeting note management ---

export async function addMeetingNote(planId, notebookId, calendarEventUid, eventSummary) {
  const plan = await dailyPlans.findOne({ _id: planId });
  if (!plan) throw new Error('Daily plan not found');

  const notes = plan.meetingNotes || [];
  const existing = notes.find(n => n.calendarEventUid === calendarEventUid);
  if (existing) return getById(planId); // Already mapped

  notes.push({ notebookId, calendarEventUid, eventSummary });
  await dailyPlans.update({ _id: planId }, { $set: { meetingNotes: notes, updatedAt: new Date().toISOString() } });
  return getById(planId);
}

export async function changeDate(oldDate, newDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) throw new Error('Date must be in YYYY-MM-DD format');

  const existing = await dailyPlans.findOne({ _id: oldDate });
  if (!existing) throw new Error('Daily plan not found');

  const conflict = await dailyPlans.findOne({ _id: newDate });
  if (conflict) throw new Error(`A daily plan already exists for ${newDate}`);

  // Rename folder on disk
  const oldDir = getPlanDir(oldDate);
  const newDir = getPlanDir(newDate);
  if (existsSync(oldDir)) {
    mkdirSync(getDailyPlansDir(), { recursive: true });
    renameSync(oldDir, newDir);
  }

  // Re-create record with new _id (NeDB doesn't allow _id changes)
  const { _id, ...rest } = existing;
  rest.updatedAt = new Date().toISOString();
  await dailyPlans.remove({ _id: oldDate });
  await dailyPlans.insert({ _id: newDate, ...rest });

  return getById(newDate);
}

export function getDailyPlansDirectory() {
  return getDailyPlansDir();
}

export function getPlanDirectory(date) {
  return getPlanDir(date);
}

// --- Recap operations ---

export function getRecapStatus(date) {
  const hasRecap = existsSync(getRecapPath(date));
  const hasBackup = existsSync(getRecapBackupPath(date));
  const hasError = existsSync(getRecapErrorPath(date));

  if (!hasRecap && !hasBackup && !hasError) {
    return { status: 'idle', generatedAt: null, error: null };
  }
  if (hasBackup && !hasError) {
    return { status: 'generating', generatedAt: null, error: null };
  }
  if (hasError) {
    const error = readFileSync(getRecapErrorPath(date), 'utf8');
    const generatedAt = hasRecap ? new Date(statSync(getRecapPath(date)).mtimeMs).toISOString() : null;
    return { status: 'failed', generatedAt, error };
  }
  // hasRecap only
  const recapMtime = statSync(getRecapPath(date)).mtimeMs;
  return { status: 'completed', generatedAt: new Date(recapMtime).toISOString(), recapMtime, error: null };
}

export function getRecapContent(date) {
  const recapPath = getRecapPath(date);
  if (!existsSync(recapPath)) return null;
  return readFileSync(recapPath, 'utf8');
}

export function getRecapFilePaths(date) {
  return {
    recapPath: getRecapPath(date),
    backupPath: getRecapBackupPath(date),
    errorPath: getRecapErrorPath(date),
  };
}
