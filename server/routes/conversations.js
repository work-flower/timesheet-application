import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import * as conversationService from '../services/conversationService.js';
import {
  streamTurn, assertChatAccess, executeProposal, declineProposal, resumeAfterProposal,
} from '../services/agentChatService.js';

const router = Router();

// Proposals currently being confirmed (key `${conversationId}:${proposalId}`).
// Closes the check→execute race on double-click; the transcript's resolution
// row makes resolved-ness durable across restarts.
const inFlightProposals = new Set();

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

// Shared pre-stream gates for the chat/proposal endpoints. Returns the
// conversation or null AFTER having responded with the proper HTTP status.
async function gateConversation(req, res) {
  let conversation;
  try {
    conversation = await conversationService.assertVisible(req.params.id);
    await assertChatAccess();
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 403);
    return null;
  }
  if (!conversation) {
    res.status(404).json({ error: 'Not found' });
    return null;
  }
  return conversation;
}

// POST /api/conversations/:id/proposals/:pid/confirm — SSE. Executes the
// proposed write under the CALLER's identity, appends the resolution row, then
// RESUMES the proposing card's loop so the assistant narrates the outcome.
router.post('/:id/proposals/:pid/confirm', async (req, res) => {
  const { id, pid } = req.params;
  if (!(await gateConversation(req, res))) return;

  const { proposal, resolution } = conversationService.findProposal(id, pid);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  const flightKey = `${id}:${pid}`;
  if (resolution || inFlightProposals.has(flightKey)) {
    return res.status(409).json({ error: 'Proposal already resolved' });
  }
  inFlightProposals.add(flightKey);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event) => {
    if (event?.type === 'error') {
      console.warn(`Proposal confirm error (conversation ${id}, proposal ${pid}): ${event.message}`);
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
    // Execute under the request's caller ALS scope — the pipeline re-validates
    // roles/locks naturally. Failures resolve as status:'failed' and still
    // resume (the model narrates the failure).
    const { status, content } = await executeProposal(id, proposal);
    send({ type: 'proposal_resolved', proposalId: pid, status, content });

    for await (const event of resumeAfterProposal(id, proposal, { providerId: req.body?.providerId, signal: controller.signal })) {
      if (aborted) break;
      send(event);
    }
    if (!aborted) send({ type: 'done' });
  } catch (err) {
    console.error(err.message);
    if (!aborted) send({ type: 'error', message: err.message });
  } finally {
    inFlightProposals.delete(flightKey);
    if (!aborted) res.end();
  }
});

// POST /api/conversations/:id/proposals/:pid/decline — plain JSON, no model call.
router.post('/:id/proposals/:pid/decline', async (req, res) => {
  const { id, pid } = req.params;
  if (!(await gateConversation(req, res))) return;
  try {
    const { proposal, resolution } = conversationService.findProposal(id, pid);
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    if (resolution || inFlightProposals.has(`${id}:${pid}`)) {
      return res.status(409).json({ error: 'Proposal already resolved' });
    }
    await declineProposal(id, proposal);
    res.json({ success: true, proposal: { proposalId: pid, name: proposal.name, status: 'declined' } });
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
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
  if (!(await gateConversation(req, res))) return;
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
