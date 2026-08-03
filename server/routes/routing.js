import { Router } from 'express';
import { respondError } from '../utils/errors.js';
import * as routingConfigService from '../services/routingConfigService.js';
import { findAgent, getIndexStatus, rebuildIndex } from '../services/routingService.js';

const router = Router();

// GET /admin/api/routing/config
router.get('/config', async (req, res) => {
  try {
    res.json(await routingConfigService.getConfig());
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// PUT /admin/api/routing/config — takes effect on the next turn (no restart);
// corpus/model-affecting changes rebuild the index lazily via the hash check.
router.put('/config', async (req, res) => {
  try {
    res.json(await routingConfigService.updateConfig(req.body));
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// GET /admin/api/routing/defaults
router.get('/defaults', (req, res) => {
  res.json(routingConfigService.getDefaults());
});

// GET /admin/api/routing/status — index size/sources/model/built time
router.get('/status', async (req, res) => {
  try {
    res.json(await getIndexStatus());
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// POST /admin/api/routing/rebuild — force a full re-embed of the corpus
router.post('/rebuild', async (req, res) => {
  try {
    res.json(await rebuildIndex());
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// POST /admin/api/routing/probe — route an utterance and report WHICH TIER it
// lands in under the current configuration (the thresholds made tangible).
router.post('/probe', async (req, res) => {
  try {
    const utterance = String(req.body?.utterance || '').trim();
    if (!utterance) return res.status(400).json({ error: 'utterance is required' });

    const config = await routingConfigService.getConfig();
    const { candidates, top } = await findAgent(utterance);
    let tier = 'below-floor';
    if (top) {
      // Only AGENT-kind candidates can auto-route (tool matches are evidence-only).
      if (top.kind === 'agent' && config.autoRouteEnabled !== false && top.score >= config.autoRouteThreshold) tier = 'auto-route';
      else if (config.evidenceEnabled !== false && top.score >= config.evidenceFloor) tier = 'evidence';
    }
    res.json({
      tier,
      thresholds: {
        autoRoute: config.autoRouteEnabled !== false ? config.autoRouteThreshold : null,
        evidence: config.evidenceEnabled !== false ? config.evidenceFloor : null,
      },
      top,
      candidates: candidates.slice(0, Math.max(1, config.maxCandidates)),
    });
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

export default router;
