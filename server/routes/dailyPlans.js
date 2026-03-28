import { Router } from 'express';
import * as dailyPlanService from '../services/dailyPlanService.js';
import * as dailyPlanAiService from '../services/dailyPlanAiService.js';

const router = Router();

// List all daily plans
router.get('/', async (req, res) => {
  try {
    const result = await dailyPlanService.getAll(req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a single daily plan by date (id = YYYY-MM-DD)
router.get('/:id', async (req, res) => {
  try {
    const result = await dailyPlanService.getById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get content.md for a daily plan
router.get('/:id/content', async (req, res) => {
  try {
    const content = await dailyPlanService.getContent(req.params.id);
    if (content === null) return res.status(404).json({ error: 'Not found' });
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new daily plan
router.post('/', async (req, res) => {
  try {
    const result = await dailyPlanService.create(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update a daily plan
router.put('/:id', async (req, res) => {
  try {
    const result = await dailyPlanService.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update content.md
router.put('/:id/content', async (req, res) => {
  try {
    const result = await dailyPlanService.updateContent(req.params.id, req.body.content);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete a daily plan
router.delete('/:id', async (req, res) => {
  try {
    const existing = await dailyPlanService.getById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await dailyPlanService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Change date (rename plan)
router.put('/:id/change-date', async (req, res) => {
  try {
    const result = await dailyPlanService.changeDate(req.params.id, req.body.newDate);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Sub-resource operations ---

// Add a todo to a daily plan
router.post('/:id/todos', async (req, res) => {
  try {
    const result = await dailyPlanService.addTodo(req.params.id, req.body.todoId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Remove a todo from a daily plan
router.delete('/:id/todos/:todoId', async (req, res) => {
  try {
    const result = await dailyPlanService.removeTodo(req.params.id, req.params.todoId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add a timesheet link
router.post('/:id/timesheets', async (req, res) => {
  try {
    const result = await dailyPlanService.addTimesheet(req.params.id, req.body.timesheetId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add a meeting note mapping
router.post('/:id/meeting-notes', async (req, res) => {
  try {
    const { notebookId, calendarEventUid, eventSummary } = req.body;
    const result = await dailyPlanService.addMeetingNote(req.params.id, notebookId, calendarEventUid, eventSummary);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- AI operations ---

// Wrap-up: carry forward todos + AI summary (called after creation)
router.post('/:id/wrap-up', async (req, res) => {
  try {
    const result = await dailyPlanAiService.wrapUp(req.params.id);
    res.json(result);
  } catch (err) {
    console.warn('Wrap-up failed:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// Scan previous X days
router.post('/:id/scan', async (req, res) => {
  try {
    const days = Number(req.body.days) || 1;
    const result = await dailyPlanAiService.scanPreviousDays(req.params.id, days);
    res.json(result);
  } catch (err) {
    console.warn('Scan failed:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// Summarise day (end-of-day)
router.post('/:id/summarise', async (req, res) => {
  try {
    const result = await dailyPlanAiService.summariseDay(req.params.id);
    res.json(result);
  } catch (err) {
    console.warn('Summarise failed:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// Generate timesheet description from plan context
router.post('/:id/timesheet-description', async (req, res) => {
  try {
    const result = await dailyPlanAiService.generateTimesheetDescription(req.params.id);
    res.json(result);
  } catch (err) {
    console.warn('Timesheet description failed:', err.message);
    res.status(400).json({ error: err.message });
  }
});

export default router;
