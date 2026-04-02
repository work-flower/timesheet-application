import { getRawConfig } from './aiConfigService.js';
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
  // Notebook content is at DATA_DIR/notebooks/{sanitizedTitle}/.contents/content.md
  // We need to find the folder — use the title
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

  // Linked tickets — today's comments, user notes, and ticket context
  if (plan && plan.ticketIds && plan.ticketIds.length > 0) {
    const linkedTickets = await tickets.find({ _id: { $in: plan.ticketIds } });
    if (linkedTickets.length > 0) {
      const ticketLines = [];
      for (const t of linkedTickets) {
        let line = `### ${t.externalId}: ${t.title}`;
        if (t.assignedTo) line += `\nAssignee: ${t.assignedTo}`;
        if (t.description) line += `\n${t.description.slice(0, 500)}`;

        // Filter comments to today
        const todayComments = (t.comments || []).filter(c => c.created && c.created.startsWith(planId));
        if (todayComments.length > 0) {
          line += '\n\n**Today\'s Comments:**\n' + todayComments.map(c =>
            `- ${c.author} (${c.created}): ${(c.body || '').slice(0, 500)}`
          ).join('\n');
        }

        // User notes from extension.comments
        const userNotes = t.extension?.comments;
        if (userNotes && userNotes.trim()) {
          line += `\n\n**My Notes:** ${userNotes}`;
        }

        ticketLines.push(line);
      }
      sections.push('## Linked Tickets\n' + ticketLines.join('\n\n'));
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

/**
 * Generate a daily recap: builds context from the day's data and writes recap.md.
 * Uses file-based state machine: backup existing → generate → restore on failure.
 */
export async function generateRecap(planId) {
  const config = await getRawConfig();
  if (!config.apiKey) throw new Error('AI API key not configured. Go to Admin > System > AI Config to set it up.');

  const { recapPath, backupPath, errorPath } = dailyPlanService.getRecapFilePaths(planId);

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
    const recap = await callClaude(prompt, `Generate a daily recap for ${planId}.\n\n${context}`, maxTokens);

    writeFileSync(recapPath, recap, 'utf8');

    // Success — remove backup
    if (existsSync(backupPath)) {
      rmSync(backupPath);
    }

    return { status: 'completed', content: recap };
  } catch (err) {
    // Write error file
    writeFileSync(errorPath, `${new Date().toISOString()}\n${err.message}`, 'utf8');
    // Restore backup
    if (existsSync(backupPath)) {
      renameSync(backupPath, recapPath);
    }
    throw err;
  }
}

/**
 * Check previous days for briefing — returns day list with plan existence and recap status.
 * Weekends without a plan are included but marked as optional.
 */
export async function checkBriefingDays(planId, days) {
  const planDate = new Date(planId + 'T00:00:00');
  const result = [];

  for (let i = 1; i <= days; i++) {
    const d = new Date(planDate);
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayOfWeek = d.getDay(); // 0=Sun, 6=Sat
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
      // Default: checked if has plan, unchecked if weekend without plan
      defaultSelected: hasPlan,
    });
  }

  return result;
}

/**
 * Generate a daily briefing from selected days' recaps.
 * Uses file-based state machine identical to recap.
 */
export async function generateBriefing(planId, selectedDates) {
  const config = await getRawConfig();
  if (!config.apiKey) throw new Error('AI API key not configured. Go to Admin > System > AI Config to set it up.');

  const { briefingPath, backupPath, errorPath } = dailyPlanService.getBriefingFilePaths(planId);

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

    const briefing = await callClaude(prompt, userMessage, maxTokens);

    // Ensure plan directory exists
    const planDir = dailyPlanService.getPlanDirectory(planId);
    if (!existsSync(planDir)) {
      mkdirSync(planDir, { recursive: true });
    }

    writeFileSync(briefingPath, briefing, 'utf8');

    if (existsSync(backupPath)) {
      rmSync(backupPath);
    }

    return { status: 'completed', content: briefing };
  } catch (err) {
    writeFileSync(errorPath, `${new Date().toISOString()}\n${err.message}`, 'utf8');
    if (existsSync(backupPath)) {
      renameSync(backupPath, briefingPath);
    }
    throw err;
  }
}

/**
 * Generate a meeting summary + hashtags from event data.
 * Returns { summary, hashtags } where summary is a paragraph and hashtags is a string like "#tag1 #tag2".
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

