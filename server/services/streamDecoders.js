/**
 * Provider response decoders, keyed by wireFormat.
 *
 * Each decoder is an async generator taking a fetch Response and yielding
 * neutral events consumed by the master loop / SSE endpoint:
 *   { type: 'text',     text }
 *   { type: 'thinking', text }
 *   { type: 'tool_use', id, name, input }   (accumulated JSON input)
 *   { type: 'stop',     reason }
 *   { type: 'error',    message }
 *
 * Streaming formats (anthropic-sse, openai-sse, gemini-sse) parse the SSE frame
 * stream incrementally. The 'json' format buffers the whole body, parses it, and
 * emits text via the provider's configured response-extraction path.
 */

import { extractPath } from './templateEngineService.js';

async function* iterateSseFrames(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep;
      // Frames are separated by a blank line (\n\n).
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        yield frame;
      }
    }
    if (buffer.trim()) yield buffer;
  } finally {
    reader.releaseLock();
  }
}

function parseDataLines(frame) {
  // Collects the `data:` payload from an SSE frame (ignores event:/id: lines).
  const dataLines = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  return dataLines.join('\n');
}

async function* decodeAnthropicSse(response) {
  const toolBlocks = {}; // index → { id, name, partialJson }
  for await (const frame of iterateSseFrames(response)) {
    const data = parseDataLines(frame);
    if (!data) continue;
    let evt;
    try {
      evt = JSON.parse(data);
    } catch {
      continue;
    }
    if (evt.type === 'content_block_start') {
      const block = evt.content_block || {};
      if (block.type === 'tool_use') {
        toolBlocks[evt.index] = { id: block.id, name: block.name, partialJson: '' };
      }
    } else if (evt.type === 'content_block_delta') {
      const d = evt.delta || {};
      if (d.type === 'text_delta') yield { type: 'text', text: d.text };
      else if (d.type === 'thinking_delta') yield { type: 'thinking', text: d.thinking };
      else if (d.type === 'input_json_delta' && toolBlocks[evt.index]) {
        toolBlocks[evt.index].partialJson += d.partial_json || '';
      }
    } else if (evt.type === 'content_block_stop') {
      const tb = toolBlocks[evt.index];
      if (tb) {
        let input = {};
        try {
          input = tb.partialJson ? JSON.parse(tb.partialJson) : {};
        } catch { /* leave empty on malformed */ }
        yield { type: 'tool_use', id: tb.id, name: tb.name, input };
        delete toolBlocks[evt.index];
      }
    } else if (evt.type === 'message_delta' && evt.delta?.stop_reason) {
      yield { type: 'stop', reason: evt.delta.stop_reason };
    } else if (evt.type === 'error') {
      yield { type: 'error', message: evt.error?.message || 'provider error' };
    }
  }
}

async function* decodeOpenAiSse(response) {
  const toolCalls = {}; // index → { id, name, args }
  for await (const frame of iterateSseFrames(response)) {
    const data = parseDataLines(frame);
    if (!data) continue;
    if (data === '[DONE]') {
      yield { type: 'stop', reason: 'stop' };
      continue;
    }
    let evt;
    try {
      evt = JSON.parse(data);
    } catch {
      continue;
    }
    const choice = evt.choices?.[0];
    if (!choice) continue;
    const delta = choice.delta || {};
    if (delta.content) yield { type: 'text', text: delta.content };
    if (delta.reasoning_content) yield { type: 'thinking', text: delta.reasoning_content };
    for (const tc of delta.tool_calls || []) {
      const idx = tc.index ?? 0;
      if (!toolCalls[idx]) toolCalls[idx] = { id: tc.id, name: '', args: '' };
      if (tc.id) toolCalls[idx].id = tc.id;
      if (tc.function?.name) toolCalls[idx].name += tc.function.name;
      if (tc.function?.arguments) toolCalls[idx].args += tc.function.arguments;
    }
    if (choice.finish_reason) {
      for (const tc of Object.values(toolCalls)) {
        let input = {};
        try {
          input = tc.args ? JSON.parse(tc.args) : {};
        } catch { /* leave empty */ }
        yield { type: 'tool_use', id: tc.id, name: tc.name, input };
      }
      yield { type: 'stop', reason: choice.finish_reason };
    }
  }
}

async function* decodeGeminiSse(response) {
  for await (const frame of iterateSseFrames(response)) {
    const data = parseDataLines(frame);
    if (!data) continue;
    let evt;
    try {
      evt = JSON.parse(data);
    } catch {
      continue;
    }
    const parts = evt.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (typeof part.text === 'string') yield { type: 'text', text: part.text };
      else if (part.functionCall) {
        yield {
          type: 'tool_use',
          id: part.functionCall.name,
          name: part.functionCall.name,
          input: part.functionCall.args || {},
        };
      }
    }
    const reason = evt.candidates?.[0]?.finishReason;
    if (reason) yield { type: 'stop', reason };
  }
}

async function* decodeJson(response, provider) {
  const body = await response.json();
  const textPath = provider?.responseTextPath || 'content.0.text';
  const text = extractPath(body, textPath);
  if (text != null) yield { type: 'text', text: String(text) };
  yield { type: 'stop', reason: 'stop' };
}

const DECODERS = {
  'anthropic-sse': decodeAnthropicSse,
  'openai-sse': decodeOpenAiSse,
  'gemini-sse': decodeGeminiSse,
  json: decodeJson,
};

/** Decode a provider response into neutral events, keyed by wireFormat. */
export function decodeResponse(wireFormat, response, provider) {
  const decoder = DECODERS[wireFormat] || DECODERS.json;
  return decoder(response, provider);
}

export const SUPPORTED_WIRE_FORMATS = Object.keys(DECODERS);
