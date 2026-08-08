import { Router } from 'express';
import * as pageContentStore from '../services/pageContentStore.js';

/**
 * Current-page snapshot push/purge (`/api/current-page-content`) — the write
 * side of the Copilot page-context service. The browser PUTs <main>'s raw
 * outerHTML here; the store strips it asynchronously (204 returns at once).
 *
 * Deliberately NO userid in the path and NO GET route: the store is keyed by
 * the request's authenticated identity (identityKey), so a client can only
 * ever write/purge its own slot, and reads happen exclusively in-process via
 * the get_page_content tool handler — no cross-user read surface exists.
 */

const MAX_CONTENT_BYTES = 4 * 1024 * 1024; // raw markup — pre-strip

const router = Router();

router.put('/', (req, res) => {
  try {
    const { route, title, content } = req.body || {};
    if (typeof content !== 'string' || !content.trim()) {
      console.warn('Page content push rejected: content is required');
      return res.status(400).json({ error: 'content (string) is required' });
    }
    if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) {
      console.warn(`Page content push rejected: ${Buffer.byteLength(content, 'utf8')} bytes exceeds limit`);
      return res.status(413).json({ error: 'Page content too large' });
    }
    pageContentStore.set(pageContentStore.identityKey(), { route, title, content });
    res.status(204).end();
  } catch (err) {
    console.error('Page content push failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/', (req, res) => {
  try {
    pageContentStore.remove(pageContentStore.identityKey());
    res.status(204).end();
  } catch (err) {
    console.error('Page content purge failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
