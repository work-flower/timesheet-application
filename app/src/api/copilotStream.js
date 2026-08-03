import { getTraceId } from './traceId.js';

/**
 * SSE clients for the Copilot pane.
 *
 * These endpoints are POSTs that return text/event-stream, so neither the
 * shared request() helper (always .json()s) nor EventSource (GET-only, no
 * custom headers) fits — we read the ReadableStream directly and parse frames.
 *
 * onEvent receives neutral events: { type: 'text'|'thinking'|'tool_use'|
 * 'agent'|'consulted'|'proposal'|'proposal_resolved'|'stop'|'error'|'done', ... }.
 * Pass an AbortSignal to cancel (the server aborts upstream on disconnect).
 */
async function streamSse(url, body, { onEvent, signal } = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Trace-Id': getTraceId() },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    let detail = `Request failed: ${res.status}`;
    try {
      const resBody = await res.json();
      if (resBody?.error) detail = resBody.error;
    } catch { /* non-JSON error */ }
    onEvent?.({ type: 'error', message: detail });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch (err) {
      if (err.name === 'AbortError') return;
      onEvent?.({ type: 'error', message: err.message });
      return;
    }
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });

    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const dataLines = frame
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart());
      if (!dataLines.length) continue;
      try {
        onEvent?.(JSON.parse(dataLines.join('\n')));
      } catch { /* skip malformed frame */ }
    }
  }
}

/** Stream a chat turn. */
export function streamChat(conversationId, message, { providerId, onEvent, signal } = {}) {
  return streamSse(
    `/api/conversations/${conversationId}/messages`,
    { message, providerId },
    { onEvent, signal },
  );
}

/** Confirm an action-card proposal: the server executes the write under the
 *  caller's identity, then resumes the proposing agent's loop — so the
 *  response is a stream (proposal_resolved first, then narration). */
export function streamProposalConfirm(conversationId, proposalId, { onEvent, signal } = {}) {
  return streamSse(
    `/api/conversations/${conversationId}/proposals/${encodeURIComponent(proposalId)}/confirm`,
    {},
    { onEvent, signal },
  );
}
