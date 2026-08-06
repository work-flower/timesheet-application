import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import * as agentCardService from '../services/agentCardService.js';
import { tools as appTools } from '../services/agentToolRegistry.js';

/**
 * Dual-mounted (calendar-sources pattern):
 *   /api/agents        — engine-protected, read-only. Caller-scoped list/get
 *                        (visibility = talkability; feeds the @mention picker).
 *   /admin/api/agents  — superuser. Full card CRUD + rescan + tool registry.
 * Card writes go to the FOLDERS (file-led) and reindex; see agentCardService.
 */

// ---- Read-only router (main surface) ----------------------------------------

export const agentsReadOnlyRouter = Router();

// GET /api/agents — caller-scoped picker list (no file contents)
agentsReadOnlyRouter.get('/', async (req, res) => {
  try {
    const cards = await agentCardService.getAllCards();
    res.json(cards.map(({ slug, name, description, isMaster, enabled }) => ({ slug, name, description, isMaster, enabled })));
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// ---- Admin router ------------------------------------------------------------

const router = Router();

// GET /admin/api/agents
router.get('/', async (req, res) => {
  try {
    res.json(await agentCardService.getAllCards());
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// GET /admin/api/agents/tools — enabled effective tools from the registry
// cache (card designer grant checkboxes + eval-set tool targets). Disabled
// definitions drop out and surface as stale grants in the card designer.
// kind: read executes in-loop, write becomes an action-card proposal;
// access: the { table, op } it exercises. Both come from the mapped handler.
router.get('/tools', (req, res) => {
  res.json(appTools.map(({ name, description, kind, access }) => ({ name, description, kind, access })));
});

// POST /admin/api/agents/rescan — reindex hand-edited/dropped-in folders
router.post('/rescan', async (req, res) => {
  try {
    res.json(await agentCardService.scanAgents());
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// GET /admin/api/agents/:slug — index doc + on-disk contents
router.get('/:slug', async (req, res) => {
  try {
    const card = await agentCardService.getCardDetail(req.params.slug);
    if (!card) return res.status(404).json({ error: 'Not found' });
    res.json(card);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// POST /admin/api/agents
router.post('/', async (req, res) => {
  try {
    res.status(201).json(await agentCardService.createCard(req.body));
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// PUT /admin/api/agents/:slug
router.put('/:slug', async (req, res) => {
  try {
    const card = await agentCardService.updateCard(req.params.slug, req.body);
    if (!card) return res.status(404).json({ error: 'Not found' });
    res.json(card);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// DELETE /admin/api/agents/:slug
router.delete('/:slug', async (req, res) => {
  try {
    const removed = await agentCardService.removeCard(req.params.slug);
    if (removed === null) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

export default router;
