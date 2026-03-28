import { getRawConfig } from './aiConfigService.js';
import * as dailyPlanService from './dailyPlanService.js';
import * as todoService from './todoService.js';
import * as calendarService from './calendarService.js';
import { notebooks } from '../db/index.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync, rmSync, renameSync } from 'fs';

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
 * Generate a timesheet description from the daily plan context.
 */
export async function generateTimesheetDescription(planId) {
  const config = await getRawConfig();
  if (!config.apiKey) throw new Error('AI API key not configured.');

  const context = await buildContext(planId);
  const description = await callClaude(
    'You are a timesheet assistant. Based on the daily plan context, generate a concise professional timesheet description (2-4 sentences) summarising the work done today. Do not use markdown formatting, bullet points, or headers — write plain text suitable for a timesheet notes field.',
    `Generate a timesheet description for ${planId}.\n\n${context}`,
  );

  return { description: description.trim() };
}
