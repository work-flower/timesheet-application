import als from '../logging/asyncContext.js';
import { stripPageHtml } from './pageContentStrip.js';

/**
 * Per-user in-memory store of the page the user is currently viewing —
 * pushed by the Copilot pane (mount / route change / message send), read
 * in-process by the get_page_content app tool. Same module-scoped-cache idiom
 * as the agent tool registry.
 *
 * Lifecycle (deliberate, agreed in design): NO TTL — an entry lives until the
 * pane unmount DELETEs it, the next push overwrites it, or the server
 * restarts. Ephemeral by design: never persisted, never in backups.
 *
 * `content` is stored as a PROMISE: set() kicks off the server-side strip
 * without awaiting it, so the client's PUT returns immediately; get() awaits,
 * so a tool read can never see a half-stripped snapshot. The strip never
 * rejects (stripPageHtml falls back internally), but a belt-and-braces catch
 * keeps get() from ever throwing.
 */

const store = new Map();

/**
 * The store key AND the tool handler's identity source. Always the
 * authenticated (effective) identity from ALS — never a path segment, never
 * tool input. That single rule is the cross-user isolation guarantee.
 * Legacy single-user mode (AUTH_ENABLED off) has no store.auth → 'local'.
 */
export function identityKey() {
  return als.getStore()?.auth?.user?.email ?? 'local';
}

export function set(identity, { route, title, content }) {
  store.set(identity, {
    route: typeof route === 'string' ? route : '',
    title: typeof title === 'string' ? title : '',
    capturedAt: new Date().toISOString(),
    contentPromise: Promise.resolve(content)
      .then(stripPageHtml)
      .catch(() => ''),
  });
}

/**
 * Pointer-only read — route/title/capturedAt, synchronous, never the content
 * and never awaiting the strip. Stamped onto routing evidence (~15 tokens) so
 * the master can tell "same page → reuse the earlier page-context answer"
 * from "navigated → consult again" without paying for a snapshot read.
 */
export function peek(identity) {
  const entry = store.get(identity);
  if (!entry) return null;
  return { route: entry.route, title: entry.title, capturedAt: entry.capturedAt };
}

export async function get(identity) {
  const entry = store.get(identity);
  if (!entry) return null;
  const content = await entry.contentPromise;
  if (!content) return null;
  return { route: entry.route, title: entry.title, capturedAt: entry.capturedAt, content };
}

export function remove(identity) {
  store.delete(identity);
}
