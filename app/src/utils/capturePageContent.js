/**
 * Snapshot the page the user is currently viewing, for the Copilot
 * page-context service (PUT /api/current-page-content).
 *
 * Deliberately CHEAP on the client — the deal is that all pruning/stripping
 * happens server-side (server/services/pageContentStrip.js), off the user's
 * thread. The only client work beyond a native clone + serialise is the
 * form-control value sweep: controlled React inputs keep the live value in
 * DOM properties, never in serialised attributes, so without the sweep every
 * form would snapshot as its loaded state and unsaved edits — the whole point
 * of a live page view — would be invisible.
 *
 * Scope is <main> only (the routed page). The Copilot pane itself lives
 * outside <main>, so a snapshot can never contain the conversation — no
 * echo-chamber where page content feeds back into the chat that captured it.
 */
export function capturePageContent() {
  const main = document.querySelector('main');
  if (!main) return null;

  const clone = main.cloneNode(true);

  // Index-aligned sweep: cloneNode preserves document order, so live and
  // cloned querySelectorAll walk the same sequence.
  const live = main.querySelectorAll('input, textarea, select');
  const cloned = clone.querySelectorAll('input, textarea, select');
  live.forEach((el, i) => {
    const copy = cloned[i];
    if (!copy) return;
    if (el.tagName === 'TEXTAREA') {
      copy.textContent = el.value;
    } else if (el.tagName === 'SELECT') {
      const selected = el.selectedIndex >= 0 ? el.options[el.selectedIndex].text : '';
      copy.setAttribute('value', selected);
    } else if (el.type === 'checkbox' || el.type === 'radio') {
      if (el.checked) copy.setAttribute('checked', 'checked');
      else copy.removeAttribute('checked');
    } else if (el.type === 'password') {
      copy.setAttribute('value', '***');
    } else {
      copy.setAttribute('value', el.value);
    }
  });

  // Tab state is component state, not URL — surface the active tab(s) in the
  // title so the snapshot pointer distinguishes tabs on the same route (the
  // master's same-page reuse rule would otherwise treat a tab switch as the
  // same page and reuse a stale answer).
  const activeTabs = [...main.querySelectorAll('[role="tab"][aria-selected="true"]')]
    .map((t) => t.textContent.trim())
    .filter(Boolean);

  return {
    route: window.location.pathname + window.location.search,
    title: document.title + (activeTabs.length ? ` — tab: ${activeTabs.join(' / ')}` : ''),
    content: clone.outerHTML,
  };
}
