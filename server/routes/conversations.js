import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import * as conversationService from '../services/conversationService.js';
import { streamTurn, assertChatAccess } from '../services/agentChatService.js';

const router = Router();

// GET /api/conversations
router.get('/', async (req, res) => {
  try {
    res.json(await conversationService.getAll(req.query));
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// GET /api/conversations/:id (includes full transcript)
router.get('/:id', async (req, res) => {
  try {
    const conversation = await conversationService.getById(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Not found' });
    res.json(conversation);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// POST /api/conversations
router.post('/', async (req, res) => {
  try {
    res.status(201).json(await conversationService.create(req.body));
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// PUT /api/conversations/:id (rename)
router.put('/:id', async (req, res) => {
  try {
    const conversation = await conversationService.update(req.params.id, req.body);
    if (!conversation) return res.status(404).json({ error: 'Not found' });
    res.json(conversation);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// DELETE /api/conversations/:id
router.delete('/:id', async (req, res) => {
  try {
    await conversationService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// POST /api/conversations/:id/messages — SSE streaming chat turn.
// Emits `data: {json}\n\n` frames of neutral events; the last frame is a
// {type:'done'} event carrying the persisted assistant message.
router.post('/:id/messages', async (req, res) => {
  const { id } = req.params;
  const userMessage = (req.body?.message || '').trim();

  // Visibility + access gates run BEFORE the SSE stream opens so failures are
  // proper HTTP statuses: conversation visibility (caller-scoped read) and the
  // chat access gate (caller must hold an agents read grant — "whatever agent
  // the user can see, they can talk to"; no grant, no assistant).
  let conversation;
  try {
    conversation = await conversationService.assertVisible(id);
    await assertChatAccess();
  } catch (err) {
    console.warn(err.message);
    return respondError(res, err, 403);
  }
  if (!conversation) return res.status(404).json({ error: 'Not found' });
  if (!userMessage) return res.status(400).json({ error: 'message is required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Choke point: every event forwarded to the pane passes through here, so
  // error events are ALSO logged server-side — SSE responses are HTTP 200 and
  // would otherwise leave no trace in the logs (managed upstream/provider
  // failures → warn, per the 4xx/5xx logging convention).
  const send = (event) => {
    if (event?.type === 'error') {
      console.warn(`Chat turn error (conversation ${id}): ${event.message}`);
    }
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const controller = new AbortController();
  let aborted = false;
  req.on('close', () => {
    aborted = true;
    controller.abort();
  });

  try {
    await conversationService.appendMessage(id, { role: 'user', content: userMessage });

    // The service persists assistant text and tool exchanges itself (the
    // master tool loop appends mid-turn); the route only forwards events.
    for await (const event of streamTurn(id, userMessage, { providerId: req.body?.providerId, signal: controller.signal })) {
      if (aborted) break;
      send(event);
    }

    if (!aborted) {
      send({ type: 'done' });
    }
  } catch (err) {
    // Streaming has begun — surface as an SSE error event, never respondError.
    console.error(err.message);
    if (!aborted) send({ type: 'error', message: err.message });
  } finally {
    if (!aborted) res.end();
  }
});

export default router;
