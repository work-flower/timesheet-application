import { getRawConfig } from './aiConfigService.js';
import { submitBatch, checkBatch } from './aiBatchService.js';
import * as dailyPlanService from './dailyPlanService.js';
import * as todoService from './todoService.js';
import * as calendarService from './calendarService.js';
import * as timesheetService from './timesheetService.js';
import { notebooks, tickets } from '../db/index.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync, rmSync, renameSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function getDataDir() { return process.env.DATA_DIR || join(__dirname, '..', '..', 'data'); }

const CONTENTS_DIR = '.contents';

async function readNotebookContent(notebookId) {
  const nb = await notebooks.findOne({ _id: notebookId });
  if (!nb) return null;
  const { sanitizeTitle } = await import('./notebookGitService.js');
  const dir = join(getDataDir(), 'notebooks', sanitizeTitle(nb.title), CONTENTS_DIR, 'content.md');
  if (!existsSync(dir)) return null;
  return readFileSync(dir, 'utf8');
}

async function buildContext(planId) {
  const sections = [];

  const plan = await dailyPlanService.getById(planId);

  // Timesheet entries for this day
  try {
    const tsEntries = await timesheetService.getAll({ startDate: planId, endDate: planId });
    const tsList = Array.isArray(tsEntries) ? tsEntries : tsEntries.value || [];
    if (tsList.length > 0) {
      const totalHours = tsList.reduce((sum, t) => sum + (t.hours || 0), 0);
      sections.push("## Timesheet Entries\n" + tsList.map(t =>
        `- ${t.projectName}: ${t.hours}h (${t.days} days, £${t.amount})${t.notes ? ` — ${t.notes}` : ''}`
      ).join('\n') + `\n\n**Total: ${totalHours}h**`);
    } else {
      sections.push('## Timesheet Entries\n**RED FLAG: No timesheet entries logged for this day.** Check if work was done but not recorded.');
    }
  } catch { /* no timesheet data */ }

  // Todos linked to this plan
  if (plan && plan.todos && plan.todos.length > 0) {
    const planTodos = await todoService.getByIds(plan.todos);
    if (planTodos.length > 0) {
      sections.push('## To-Dos\n' + planTodos.map(t =>
        `- [${t.status === 'done' ? 'x' : ' '}] ${t.text}`
      ).join('\n'));
    }
  }

  // Today's calendar events
  try {
    const events = await calendarService.getEvents({ startDate: planId, endDate: planId });
    const eventList = Array.isArray(events) ? events : events.value || [];
    if (eventList.length > 0) {
      sections.push("## Today's Calendar\n" + eventList.map(e => {
        const time = e.allDay ? 'All day' : `${new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} — ${new Date(e.end).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
        return `- ${time}: ${e.summary}`;
      }).join('\n'));
    }
  } catch { /* no calendar data */ }

  // Current plan's meeting notes
  if (plan && plan.meetingNotes && plan.meetingNotes.length > 0) {
    for (const mn of plan.meetingNotes) {
      const nbContent = await readNotebookContent(mn.notebookId);
      if (nbContent && nbContent.trim()) {
        sections.push(`## Today's Meeting Note: ${mn.eventSummary}\n${nbContent.slice(0, 2000)}`);
      }
    }
  }

  // Related notebooks (summaries + tags)
  if (plan && plan.notebookIds && plan.notebookIds.length > 0) {
    const linkedNotebooks = await notebooks.find({ _id: { $in: plan.notebookIds } });
    const nbLines = linkedNotebooks
      .filter(n => n.summary || (n.tags && n.tags.length > 0))
      .map(n => {
        const tags = n.tags && n.tags.length > 0 ? ` (tags: ${n.tags.join(', ')})` : '';
        return `- **${n.title}**${tags}${n.summary ? ` — ${n.summary}` : ''}`;
      });
    if (nbLines.length > 0) {
      sections.push('## Related Notebooks\n' + nbLines.join('\n'));
    }
  }

  // Ticket activity on this plan's date — three independent date-driven queries.
  const datePrefix = new RegExp('^' + planId);

  // 1. Comments made today (across all tickets)
  const ticketsWithCommentsToday = await tickets.find({
    comments: { $elemMatch: { created: { $regex: datePrefix } } },
  });
  if (ticketsWithCommentsToday.length > 0) {
    const lines = [];
    for (const t of ticketsWithCommentsToday) {
      const todayComments = (t.comments || []).filter(c => c.created && c.created.startsWith(planId));
      if (todayComments.length === 0) continue;
      let block = `### ${t.externalId}: ${t.title}`;
      block += '\n' + todayComments.map(c =>
        `- ${c.author}: ${(c.body || '').slice(0, 500)}`
      ).join('\n');
      lines.push(block);
    }
    if (lines.length > 0) {
      sections.push('## Comments Today\n' + lines.join('\n\n'));
    }
  }

  // 2. Tickets updated today (description-bearing)
  const ticketsUpdatedToday = await tickets.find({
    updated: { $regex: datePrefix },
  });
  if (ticketsUpdatedToday.length > 0) {
    const lines = ticketsUpdatedToday.map(t => {
      let block = `### ${t.externalId}: ${t.title}`;
      if (t.assignedTo) block += `\nAssignee: ${t.assignedTo}`;
      if (t.description) block += `\n${t.description.slice(0, 500)}`;
      return block;
    });
    sections.push('## Tickets Updated Today\n' + lines.join('\n\n'));
  }

  // 3. My ticket notes (extension.comments) updated today
  const ticketsWithUserNotesToday = await tickets.find({
    'extension.commentsUpdatedAt': { $regex: datePrefix },
  });
  if (ticketsWithUserNotesToday.length > 0) {
    const lines = [];
    for (const t of ticketsWithUserNotesToday) {
      const notes = t.extension?.comments;
      if (!notes || !notes.trim()) continue;
      lines.push(`### ${t.externalId}: ${t.title}\n${notes}`);
    }
    if (lines.length > 0) {
      sections.push('## My Ticket Notes Today\n' + lines.join('\n\n'));
    }
  }

  // Current plan's content (for summarise day)
  if (plan) {
    const currentContent = await dailyPlanService.getContent(planId);
    if (currentContent && currentContent.trim()) {
      sections.push(`## Current Daily Plan Content\n${currentContent}`);
    }
  }

  return sections.join('\n\n');
}

async function callClaude(systemPrompt, userMessage, maxTokens = 2048) {
  const config = await getRawConfig();
  if (!config.apiKey) throw new Error('AI API key not configured. Go to Admin > System > AI Config to set it up.');

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.apiKey });

  const timeoutMs = (config.timeoutMinutes || 30) * 60 * 1000;
  const response = await client.messages.create({
    model: config.model,
    system: systemPrompt,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: userMessage }],
  }, { timeout: timeoutMs });

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error('AI returned no text response.');
  return textBlock.text;
}

// --- Batch file helpers ---

function getRecapBatchPath(planId) {
  return join(dailyPlanService.getPlanDirectory(planId), 'recap.batchid');
}

function getBriefingBatchPath(planId) {
  return join(dailyPlanService.getPlanDirectory(planId), 'briefing.batchid');
}

function saveBatchId(filePath, batchId, customId) {
  writeFileSync(filePath, JSON.stringify({ batchId, customId, submittedAt: new Date().toISOString() }), 'utf8');
}

function readBatchId(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// --- Recap ---

/**
 * Submit recap generation as a batch job.
 * Builds context, submits batch, saves batch ID to file, returns immediately.
 */
export async function generateRecap(planId) {
  const config = await getRawConfig();
  if (!config.apiKey) throw new Error('AI API key not configured. Go to Admin > System > AI Config to set it up.');

  const { recapPath, backupPath, errorPath } = dailyPlanService.getRecapFilePaths(planId);
  const batchPath = getRecapBatchPath(planId);

  // Ensure plan directory exists
  const planDir = dailyPlanService.getPlanDirectory(planId);
  if (!existsSync(planDir)) {
    mkdirSync(planDir, { recursive: true });
  }

  // Backup existing recap
  if (existsSync(recapPath)) {
    renameSync(recapPath, backupPath);
  }
  // Clear previous error
  if (existsSync(errorPath)) {
    rmSync(errorPath);
  }

  try {
    const context = await buildContext(planId);
    const prompt = config.dailyPlanSystemPrompt || 'Provide a comprehensive end-of-day recap.';
    const maxTokens = config.maxTokens || 4096;
    const customId = `recap-${planId}`;

    const { batchId } = await submitBatch(prompt, `Generate a daily recap for ${planId}.\n\n${context}`, maxTokens, customId);
    saveBatchId(batchPath, batchId, customId);

    return { status: 'generating' };
  } catch (err) {
    // Write error file and restore backup
    writeFileSync(errorPath, `${new Date().toISOString()}\n${err.message}`, 'utf8');
    if (existsSync(backupPath)) {
      renameSync(backupPath, recapPath);
    }
    throw err;
  }
}

/**
 * Check recap batch status and resolve if complete.
 * Called lazily from the status endpoint.
 */
export async function resolveRecapBatch(planId) {
  const batchPath = getRecapBatchPath(planId);
  const batchInfo = readBatchId(batchPath);
  if (!batchInfo) return null; // No pending batch

  const { recapPath, backupPath, errorPath } = dailyPlanService.getRecapFilePaths(planId);

  try {
    const result = await checkBatch(batchInfo.batchId, batchInfo.customId);

    if (result.status === 'processing') {
      return { status: 'generating' };
    }

    if (result.status === 'completed') {
      writeFileSync(recapPath, result.text, 'utf8');
      // Clean up backup and batch file
      if (existsSync(backupPath)) rmSync(backupPath);
      rmSync(batchPath);
      return { status: 'completed', content: result.text };
    }

    // Failed
    writeFileSync(errorPath, `${new Date().toISOString()}\n${result.error}`, 'utf8');
    if (existsSync(backupPath)) renameSync(backupPath, recapPath);
    rmSync(batchPath);
    return { status: 'failed', error: result.error };
  } catch (err) {
    // API error checking batch — don't clean up, let user retry
    console.warn(`Failed to check recap batch for ${planId}:`, err.message);
    return { status: 'generating' };
  }
}

// --- Briefing ---

/**
 * Submit briefing generation as a batch job.
 * Does todo carry-forward synchronously, then submits batch.
 */
export async function generateBriefing(planId, selectedDates) {
  const config = await getRawConfig();
  if (!config.apiKey) throw new Error('AI API key not configured. Go to Admin > System > AI Config to set it up.');

  const { briefingPath, backupPath, errorPath } = dailyPlanService.getBriefingFilePaths(planId);
  const batchPath = getBriefingBatchPath(planId);

  // Ensure plan directory exists
  const planDir = dailyPlanService.getPlanDirectory(planId);
  if (!existsSync(planDir)) {
    mkdirSync(planDir, { recursive: true });
  }

  // Backup existing briefing
  if (existsSync(briefingPath)) {
    renameSync(briefingPath, backupPath);
  }
  if (existsSync(errorPath)) {
    rmSync(errorPath);
  }

  try {
    // 1. Carry forward incomplete todos from scoped days into current plan
    const currentPlan = await dailyPlanService.getById(planId);
    const existingTodoIds = new Set(currentPlan?.todos || []);
    for (const date of selectedDates) {
      const plan = await dailyPlanService.getById(date);
      if (plan && plan.todos && plan.todos.length > 0) {
        const planTodos = await todoService.getByIds(plan.todos);
        for (const t of planTodos) {
          if (t.status !== 'done' && !existingTodoIds.has(t._id)) {
            await dailyPlanService.addTodo(planId, t._id);
            existingTodoIds.add(t._id);
          }
        }
      }
    }

    // 2. Read recap content and timesheet data from each selected date
    const recapSections = [];
    for (const date of selectedDates) {
      const d = new Date(date + 'T00:00:00');
      const dayName = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

      let section = `## ${dayName} (${date})`;

      // Timesheet entries for this date
      try {
        const tsEntries = await timesheetService.getAll({ startDate: date, endDate: date });
        const tsList = Array.isArray(tsEntries) ? tsEntries : tsEntries.value || [];
        if (tsList.length > 0) {
          const totalHours = tsList.reduce((sum, t) => sum + (t.hours || 0), 0);
          section += '\n\n### Timesheet\n' + tsList.map(t =>
            `- ${t.projectName}: ${t.hours}h (${t.days} days, £${t.amount})${t.notes ? ` — ${t.notes}` : ''}`
          ).join('\n') + `\n\n**Total: ${totalHours}h**`;
        } else {
          section += '\n\n### Timesheet\n**RED FLAG: No timesheet entries logged for this day.**';
        }
      } catch { /* skip */ }

      // Recap content
      const content = dailyPlanService.getRecapContent(date);
      if (content && content.trim()) {
        section += `\n\n### Recap\n\n${content}`;
      }

      recapSections.push(section);
    }

    if (recapSections.length === 0) {
      throw new Error('No recap content found for selected dates.');
    }

    const prompt = config.briefingSystemPrompt || 'Synthesise the provided daily recaps into a concise morning briefing.';
    const maxTokens = config.maxTokens || 4096;
    const userMessage = `Generate a morning briefing for ${planId} based on the following ${recapSections.length} day(s) of recaps.\n\n${recapSections.join('\n\n---\n\n')}`;
    const customId = `briefing-${planId}`;

    const { batchId } = await submitBatch(prompt, userMessage, maxTokens, customId);
    saveBatchId(batchPath, batchId, customId);

    return { status: 'generating' };
  } catch (err) {
    writeFileSync(errorPath, `${new Date().toISOString()}\n${err.message}`, 'utf8');
    if (existsSync(backupPath)) {
      renameSync(backupPath, briefingPath);
    }
    throw err;
  }
}

/**
 * Check briefing batch status and resolve if complete.
 */
export async function resolveBriefingBatch(planId) {
  const batchPath = getBriefingBatchPath(planId);
  const batchInfo = readBatchId(batchPath);
  if (!batchInfo) return null; // No pending batch

  const { briefingPath, backupPath, errorPath } = dailyPlanService.getBriefingFilePaths(planId);

  try {
    const result = await checkBatch(batchInfo.batchId, batchInfo.customId);

    if (result.status === 'processing') {
      return { status: 'generating' };
    }

    if (result.status === 'completed') {
      writeFileSync(briefingPath, result.text, 'utf8');
      if (existsSync(backupPath)) rmSync(backupPath);
      rmSync(batchPath);
      return { status: 'completed', content: result.text };
    }

    // Failed
    writeFileSync(errorPath, `${new Date().toISOString()}\n${result.error}`, 'utf8');
    if (existsSync(backupPath)) renameSync(backupPath, briefingPath);
    rmSync(batchPath);
    return { status: 'failed', error: result.error };
  } catch (err) {
    console.warn(`Failed to check briefing batch for ${planId}:`, err.message);
    return { status: 'generating' };
  }
}

/**
 * Check previous days for briefing — returns day list with plan existence and recap status.
 */
export async function checkBriefingDays(planId, days) {
  const planDate = new Date(planId + 'T00:00:00');
  const result = [];

  for (let i = 1; i <= days; i++) {
    const d = new Date(planDate);
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayOfWeek = d.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dayName = d.toLocaleDateString('en-GB', { weekday: 'short' });

    const plan = await dailyPlanService.getById(dateStr);
    const hasPlan = !!plan;

    let recapStatus = 'idle';
    let recapIsStale = false;
    if (hasPlan) {
      const recap = dailyPlanService.getRecapStatus(dateStr);
      recapStatus = recap.status;
      if (recap.status === 'completed' && plan.updatedAt) {
        recapIsStale = recap.recapMtime < new Date(plan.updatedAt).getTime();
      }
    }

    result.push({
      date: dateStr,
      dayName,
      isWeekend,
      hasPlan,
      recapStatus,
      recapIsStale,
      defaultSelected: hasPlan,
    });
  }

  return result;
}

/**
 * Generate a meeting summary + hashtags from event data.
 * Stays synchronous — small payload, user needs result inline.
 */
export async function generateMeetingSummary({ subject, description, attendees }) {
  const systemPrompt = `You are a meeting preparation assistant for a UK technology contractor. Given a meeting's subject, description, and attendee list, produce:

1. A concise summary paragraph (2-4 sentences) explaining what this meeting is likely about, its purpose, and any key context the contractor should know before attending.
2. A line of relevant hashtags (3-6 tags, lowercase, no spaces in tags, prefixed with #) that categorise this meeting by topic, project, or type.

Format your response EXACTLY as:

<summary>
Your summary paragraph here.
</summary>

<hashtags>
#tag1 #tag2 #tag3
</hashtags>

Do not include any other text outside these tags.`;

  const parts = [`Subject: ${subject}`];
  if (description && description.trim()) parts.push(`Description:\n${description.slice(0, 3000)}`);
  if (attendees && attendees.length > 0) {
    parts.push('Attendees:\n' + attendees.map(a => `- ${a.name || a.email}${a.role ? ` (${a.role})` : ''}`).join('\n'));
  }

  const result = await callClaude(systemPrompt, parts.join('\n\n'), 512);

  const summaryMatch = result.match(/<summary>\s*([\s\S]*?)\s*<\/summary>/);
  const hashtagsMatch = result.match(/<hashtags>\s*([\s\S]*?)\s*<\/hashtags>/);

  return {
    summary: summaryMatch ? summaryMatch[1].trim() : '',
    hashtags: hashtagsMatch ? hashtagsMatch[1].trim() : '',
  };
}
