import { getRawConfig } from './aiConfigService.js';
import * as dailyPlanService from './dailyPlanService.js';
import * as todoService from './todoService.js';
import * as calendarService from './calendarService.js';
import { tickets } from '../db/index.js';
import { notebooks } from '../db/index.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';

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

async function buildContext(planId, lookbackDays = 1) {
  const sections = [];

  // Current plan data
  const plan = await dailyPlanService.getById(planId);

  // Previous plans (lookback)
  const planDate = new Date(planId + 'T00:00:00');
  const previousPlans = [];
  for (let i = 1; i <= lookbackDays; i++) {
    const d = new Date(planDate);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const prev = await dailyPlanService.getById(dateStr);
    if (prev) previousPlans.push(prev);
  }

  // Incomplete todos (across all plans)
  const incompleteTodos = await todoService.getIncomplete();
  if (incompleteTodos.length > 0) {
    sections.push('## Incomplete To-Dos\n' + incompleteTodos.map(t =>
      `- ${t.text} (created: ${t.createdInPlanId || 'unknown'})`
    ).join('\n'));
  }

  // Previous plans' content
  for (const prev of previousPlans) {
    const content = await dailyPlanService.getContent(prev._id);
    if (content && content.trim()) {
      sections.push(`## Daily Plan — ${prev._id}\n${content}`);
    }

    // Previous plan's meeting notes
    if (prev.meetingNotes && prev.meetingNotes.length > 0) {
      for (const mn of prev.meetingNotes) {
        const nbContent = await readNotebookContent(mn.notebookId);
        if (nbContent && nbContent.trim()) {
          sections.push(`## Meeting Note: ${mn.eventSummary} (${prev._id})\n${nbContent.slice(0, 2000)}`);
        }
      }
    }

    // Previous plan's todos
    if (prev.todosData && prev.todosData.length > 0) {
      sections.push(`## To-Dos from ${prev._id}\n` + prev.todosData.map(t =>
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

  // Recent ticket comments
  try {
    const allTickets = await tickets.find({});
    const withRecentComments = allTickets.filter(t =>
      t.comments && t.comments.some(c => c.created && c.created.slice(0, 10) >= previousPlans[previousPlans.length - 1]?._id)
    ).slice(0, 10);
    if (withRecentComments.length > 0) {
      const ticketLines = [];
      for (const t of withRecentComments) {
        ticketLines.push(`### ${t.externalId}: ${t.title} (${t.state})`);
        const recentComments = (t.comments || []).slice(0, 3);
        for (const c of recentComments) {
          const body = (c.body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
          ticketLines.push(`  - ${c.author}: ${body}`);
        }
      }
      sections.push('## Recent Ticket Activity\n' + ticketLines.join('\n'));
    }
  } catch { /* no ticket data */ }

  // Current plan's meeting notes (for summarise day)
  if (plan && plan.meetingNotes && plan.meetingNotes.length > 0) {
    for (const mn of plan.meetingNotes) {
      const nbContent = await readNotebookContent(mn.notebookId);
      if (nbContent && nbContent.trim()) {
        sections.push(`## Today's Meeting Note: ${mn.eventSummary}\n${nbContent.slice(0, 2000)}`);
      }
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

async function callClaude(systemPrompt, userMessage) {
  const config = await getRawConfig();
  if (!config.apiKey) throw new Error('AI API key not configured. Go to Admin > System > AI Config to set it up.');

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.apiKey });

  const timeoutMs = (config.timeoutMinutes || 30) * 60 * 1000;
  const response = await client.messages.create({
    model: config.model,
    system: systemPrompt,
    max_tokens: 2048,
    messages: [{ role: 'user', content: userMessage }],
  }, { timeout: timeoutMs });

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error('AI returned no text response.');
  return textBlock.text;
}

/**
 * Wrap-up: carry forward incomplete todos + AI summary for a new daily plan.
 * Called after plan creation.
 */
export async function wrapUp(planId) {
  const plan = await dailyPlanService.getById(planId);
  if (!plan) throw new Error('Daily plan not found');

  // 1. Deterministic: carry forward incomplete todos from previous plans
  const incompleteTodos = await todoService.getIncomplete();
  const existingTodoIds = new Set(plan.todos || []);
  const toAdd = incompleteTodos.filter(t => !existingTodoIds.has(t._id));

  for (const todo of toAdd) {
    await dailyPlanService.addTodo(planId, todo._id);
  }

  // 2. AI: generate summary from previous day's context
  const config = await getRawConfig();
  let aiSummary = '';
  if (config.apiKey) {
    try {
      const context = await buildContext(planId, 1);
      const prompt = config.dailyPlanSystemPrompt || 'Summarise the previous day\'s work and suggest priorities for today.';
      aiSummary = await callClaude(prompt, `Today's date: ${planId}\n\n${context}`);
    } catch (err) {
      console.warn('AI wrap-up failed:', err.message);
      aiSummary = `> AI summary unavailable: ${err.message}`;
    }
  }

  // 3. Update content.md with AI summary
  if (aiSummary) {
    const existing = await dailyPlanService.getContent(planId) || '';
    const updatedContent = existing + `\n\n---\n*AI Generated Wrap-up*\n\n${aiSummary}\n`;
    await dailyPlanService.updateContent(planId, updatedContent);
  }

  return dailyPlanService.getById(planId);
}

/**
 * Scan previous X days and upsert incomplete todos + AI summary.
 * Does not overwrite existing content.
 */
export async function scanPreviousDays(planId, days) {
  const plan = await dailyPlanService.getById(planId);
  if (!plan) throw new Error('Daily plan not found');

  // 1. Carry forward incomplete todos (deduplicate)
  const incompleteTodos = await todoService.getIncomplete();
  const existingTodoIds = new Set(plan.todos || []);
  const toAdd = incompleteTodos.filter(t => !existingTodoIds.has(t._id));

  for (const todo of toAdd) {
    await dailyPlanService.addTodo(planId, todo._id);
  }

  // 2. AI: scan X days of context
  const config = await getRawConfig();
  let aiSummary = '';
  if (config.apiKey) {
    try {
      const context = await buildContext(planId, days);
      const prompt = config.dailyPlanSystemPrompt || 'Summarise the previous days\' work and suggest priorities for today.';
      aiSummary = await callClaude(prompt, `Today's date: ${planId}\nScanning previous ${days} day(s).\n\n${context}`);
    } catch (err) {
      console.warn('AI scan failed:', err.message);
      aiSummary = `> AI summary unavailable: ${err.message}`;
    }
  }

  // 3. Append to content without overwriting
  if (aiSummary) {
    const existing = await dailyPlanService.getContent(planId) || '';
    const updatedContent = existing + `\n\n---\n*AI Scan — Previous ${days} Day(s)*\n\n${aiSummary}\n`;
    await dailyPlanService.updateContent(planId, updatedContent);
  }

  return dailyPlanService.getById(planId);
}

/**
 * Summarise the day: reads all meeting notes, tasks, tickets, and current content
 * to produce an end-of-day summary.
 */
export async function summariseDay(planId) {
  const config = await getRawConfig();
  if (!config.apiKey) throw new Error('AI API key not configured. Go to Admin > System > AI Config to set it up.');

  const context = await buildContext(planId, 0);
  const prompt = config.dailyPlanSystemPrompt || 'Provide a concise end-of-day summary.';
  const summary = await callClaude(prompt, `Generate an end-of-day summary for ${planId}.\n\n${context}`);

  // Append as "Summary of the Day" to content
  const existing = await dailyPlanService.getContent(planId) || '';
  const updatedContent = existing + `\n\n---\n## Summary of the Day\n*AI Generated*\n\n${summary}\n`;
  await dailyPlanService.updateContent(planId, updatedContent);

  return { summary };
}

/**
 * Generate a timesheet description from the daily plan context.
 */
export async function generateTimesheetDescription(planId) {
  const config = await getRawConfig();
  if (!config.apiKey) throw new Error('AI API key not configured.');

  const context = await buildContext(planId, 0);
  const description = await callClaude(
    'You are a timesheet assistant. Based on the daily plan context, generate a concise professional timesheet description (2-4 sentences) summarising the work done today. Do not use markdown formatting, bullet points, or headers — write plain text suitable for a timesheet notes field.',
    `Generate a timesheet description for ${planId}.\n\n${context}`,
  );

  return { description: description.trim() };
}
