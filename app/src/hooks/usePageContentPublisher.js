import { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { pageContentApi } from '../api/index.js';
import { capturePageContent } from '../utils/capturePageContent.js';

/**
 * Publishes the current page snapshot to the server-side page-content store
 * while the Copilot pane is mounted. The pane only renders while the chat is
 * open (AppLayout), so MOUNTED here literally means "the page-context service
 * is running"; unmount (pane closed/collapsed) purges the per-user entry.
 *
 * Triggers:
 *   mount + route change — the pane persists across navigation, so the
 *     location effect covers both (first run = mount)
 *   publishNow() — awaited by the pane right before sending a message:
 *     send-time freshness, and with several tabs open the sending tab wins
 *     the per-user last-write slot at exactly the moment it matters
 *
 * Every call is fire-and-forget/swallowed: page context must never block or
 * break the chat.
 */
export function usePageContentPublisher() {
  const location = useLocation();

  const publishNow = useCallback(async () => {
    try {
      const snapshot = capturePageContent();
      if (snapshot) await pageContentApi.put(snapshot);
    } catch { /* non-fatal — page context is best-effort */ }
  }, []);

  useEffect(() => {
    publishNow();
  }, [location.pathname, location.search, publishNow]);

  useEffect(() => () => {
    try { pageContentApi.remove(); } catch { /* non-fatal */ }
  }, []);

  return { publishNow };
}
