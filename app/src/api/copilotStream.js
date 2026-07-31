import { getTraceId } from './traceId.js';

/**
 * Stream a chat turn from the Copilot SSE endpoint.
 *
 * The message endpoint is a POST that returns text/event-stream, so neither the
 * shared request() helper (always .json()s) nor EventSource (GET-only, no custom
 * headers) fits — we read the ReadableStream directly and parse SSE frames.
 *
 * onEvent receives neutral events: { type: 'text'|'thinking'|'tool_use'|'stop'|'error'|'done', ... }.
 * Pass an AbortSignal to cancel the turn (the server aborts the upstream call on
 * client disconnect).
 */
export async function streamChat(conversationId, message, { providerId, onEvent, signal } = {}) {
  const res = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Trace-Id': getTraceId() },
    body: JSON.stringify({ message, providerId }),
    signal,
  });

  if (!res.ok || !res.body) {
    let detail = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
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
