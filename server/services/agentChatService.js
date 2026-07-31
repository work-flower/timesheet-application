import { getRawById, getDefaultRaw } from './aiProviderService.js';
import { renderTemplate, renderHeaders } from './templateEngineService.js';
import { decodeResponse } from './streamDecoders.js';
import { readTranscript } from './conversationService.js';

/**
 * Master agent turn loop.
 *
 * P1 ("it talks"): a placeholder master with no routing, no specialists, no
 * tools. It resolves an AI Provider, builds a neutral chat context from the
 * conversation transcript, renders the provider's payload template, calls the
 * upstream endpoint, and streams decoded neutral events. Tool execution,
 * find_agent routing and specialist sub-loops arrive in P3.
 *
 * Neutral events yielded: { type: 'text'|'thinking'|'stop'|'error', ... }.
 */

const PLACEHOLDER_MASTER_SYSTEM = `You are the assistant for a UK contractor timesheet and invoicing application. Answer the user's questions helpfully and concisely. You do not yet have access to tools or specialist agents — if a request needs live data from the app, say so plainly rather than inventing an answer.`;

/** Resolve which provider to use: explicit id, else the first enabled provider.
 *  Always via the service (getRawById/getDefaultRaw) — those hydrate the stored
 *  payloadTemplate string back to an object; the raw store must not be read here. */
async function resolveProvider(providerId) {
  if (providerId) {
    const provider = await getRawById(providerId);
    if (provider) return provider;
  }
  return getDefaultRaw();
}

/** Build the neutral chat context from the stored transcript. The route appends
 *  the new user message to the transcript BEFORE calling streamTurn, so the
 *  transcript already ends with it — do not add it again here. */
function buildContext(provider, transcript) {
  const messages = transcript
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }));
  return {
    apiKey: provider.apiKey,
    model: provider.model,
    system: PLACEHOLDER_MASTER_SYSTEM,
    messages,
  };
}

/**
 * Stream a master turn. Async generator yielding neutral events, plus a final
 * accumulated assistant text the caller persists to the transcript.
 * Takes an AbortSignal so the SSE endpoint can cancel the upstream fetch when
 * the client disconnects.
 */
export async function* streamTurn(conversationId, userMessage, { providerId, signal } = {}) {
  const provider = await resolveProvider(providerId);
  if (!provider) {
    yield { type: 'error', message: 'No AI provider is configured. Add one in the admin console.' };
    return;
  }
  if (!provider.apiKey) {
    yield { type: 'error', message: `Provider "${provider.name}" has no API key configured.` };
    return;
  }

  const transcript = readTranscript(conversationId);
  const context = buildContext(provider, transcript);

  const wantsStream = provider.wireFormat && provider.wireFormat !== 'json';
  const rendered = renderTemplate(provider.payloadTemplate || {}, context);
  // A request body must be a JSON object. Anything else means the provider's
  // template is misconfigured (or was read unhydrated) — fail with a clear
  // message rather than posting a stringified non-object upstream.
  if (!rendered || typeof rendered !== 'object' || Array.isArray(rendered)) {
    yield { type: 'error', message: `Provider "${provider.name}" payload template did not render to a JSON object — check its Payload Template in the admin console.` };
    return;
  }
  if ('stream' in rendered) {
    rendered.stream = wantsStream;
  }
  const headers = renderHeaders(provider.headers, context);

  let response;
  try {
    response = await fetch(provider.endpointUrl, {
      method: provider.method || 'POST',
      headers,
      body: JSON.stringify(rendered),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') return;
    yield { type: 'error', message: `Failed to reach provider: ${err.message}` };
    return;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    yield { type: 'error', message: `Provider returned ${response.status}: ${text.slice(0, 300)}` };
    return;
  }

  try {
    for await (const event of decodeResponse(provider.wireFormat, response, provider)) {
      yield event;
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    yield { type: 'error', message: `Stream decode error: ${err.message}` };
  }
}

export { PLACEHOLDER_MASTER_SYSTEM };
