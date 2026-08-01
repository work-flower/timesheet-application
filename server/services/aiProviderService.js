import aiProviders from '../db/aiProviders.js';
import { renderTemplate, renderHeaders } from './templateEngineService.js';
import { SUPPORTED_WIRE_FORMATS } from './streamDecoders.js';

/**
 * AI Providers — multi-record store abstracting an AI chat API behind a
 * declarative request template + wireFormat decoder. Cards reference a provider
 * by id; the master loop resolves the provider's endpoint, template and secret.
 *
 * Secrets (apiKey) are masked on read and retained-on-mask on update, matching
 * the aiConfigService idiom. This store is standalone and excluded from backups.
 */

// A ready-to-use Anthropic Messages API provider, seeded on first boot.
// tool_call/tool_result sub-templates render the neutral tool-exchange
// messages the master loop persists; {{$.tools}} receives the wireFormat-shaped
// tool definitions (stripped from the payload when empty).
const ANTHROPIC_TEMPLATE = {
  model: '{{$.model}}',
  max_tokens: 4096,
  stream: true,
  system: '{{$.system}}',
  tools: '{{$.tools}}',
  messages: {
    $forEachMessage: {
      user: { role: 'user', content: '{{$m.content}}' },
      assistant: { role: 'assistant', content: '{{$m.content}}' },
      tool_call: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: '{{$m.toolCallId}}', name: '{{$m.name}}', input: '{{$m.input}}' }],
      },
      tool_result: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: '{{$m.toolCallId}}', content: '{{$m.content}}' }],
      },
    },
  },
};

const ANTHROPIC_DEFAULTS = {
  name: 'Anthropic (Claude)',
  dialect: 'anthropic',
  endpointUrl: 'https://api.anthropic.com/v1/messages',
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
    'x-api-key': '{{$.apiKey}}',
  },
  model: 'claude-opus-4-8',
  wireFormat: 'anthropic-sse',
  payloadTemplate: ANTHROPIC_TEMPLATE,
  responseTextPath: 'content.0.text',
  apiKey: '',
  enabled: true,
};

function maskSecret(value) {
  if (!value || value.length <= 4) return value ? '****' : '';
  return '*'.repeat(value.length - 4) + value.slice(-4);
}

// Copy-pasted keys often carry invisible Unicode (zero-widths, word joiner,
// BOM, soft hyphen, NBSP) that later breaks fetch() header encoding. Clean at
// save time — mask-retention would otherwise preserve a dirty key forever.
function cleanSecret(value) {
  return String(value || '')
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF\u00AD]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}

// payloadTemplate is stored as a JSON string: NeDB rejects object keys starting
// with `$` (e.g. the `$forEachMessage` iteration node) or containing `.`. Every
// read path hydrates it back to an object; every write path serialises it.
function parseTemplate(value) {
  if (value == null) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function hydrate(doc) {
  if (!doc) return doc;
  return { ...doc, payloadTemplate: parseTemplate(doc.payloadTemplate) };
}

function mask(doc) {
  if (!doc) return doc;
  const hydrated = hydrate(doc);
  return { ...hydrated, apiKey: hydrated.apiKey ? maskSecret(hydrated.apiKey) : '' };
}

function validate(data) {
  if (!data.name || !data.name.trim()) throw new Error('Name is required');
  if (!data.endpointUrl || !data.endpointUrl.trim()) throw new Error('Endpoint URL is required');
  if (data.wireFormat && !SUPPORTED_WIRE_FORMATS.includes(data.wireFormat)) {
    throw new Error(`wireFormat must be one of: ${SUPPORTED_WIRE_FORMATS.join(', ')}`);
  }
  if (data.payloadTemplate && typeof data.payloadTemplate === 'string') {
    try {
      JSON.parse(data.payloadTemplate);
    } catch {
      throw new Error('payloadTemplate is not valid JSON');
    }
  }
}

/** Ensure at least the Anthropic provider exists (idempotent, boot-time). */
export async function ensureDefaults() {
  const count = await aiProviders.count({});
  if (count === 0) {
    const now = new Date().toISOString();
    await aiProviders.insert({
      ...ANTHROPIC_DEFAULTS,
      payloadTemplate: JSON.stringify(ANTHROPIC_DEFAULTS.payloadTemplate),
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function getAll() {
  const docs = await aiProviders.find({});
  docs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return docs.map(mask);
}

export async function getById(id) {
  const doc = await aiProviders.findOne({ _id: id });
  return doc ? mask(doc) : null;
}

/** Internal — returns the raw provider (real apiKey, hydrated template) for the master loop. */
export async function getRawById(id) {
  return hydrate(await aiProviders.findOne({ _id: id }));
}

/**
 * Internal — the default provider for chat turns that don't name one: the first
 * enabled provider by name. Raw key + HYDRATED template. Every consumer of a
 * provider record must go through this or getRawById — reading the store
 * directly returns payloadTemplate as its stored JSON string, and rendering a
 * string template produces a string body ("must be a JSON object, got str").
 */
export async function getDefaultRaw() {
  const enabled = await aiProviders.find({ enabled: { $ne: false } });
  enabled.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return enabled[0] ? hydrate(enabled[0]) : null;
}

export async function create(data) {
  validate(data);
  const now = new Date().toISOString();
  const doc = {
    name: data.name.trim(),
    dialect: data.dialect || 'custom',
    endpointUrl: data.endpointUrl.trim(),
    method: data.method || 'POST',
    headers: data.headers || {},
    model: data.model || '',
    wireFormat: data.wireFormat || 'json',
    payloadTemplate: JSON.stringify(normaliseTemplate(data.payloadTemplate)),
    responseTextPath: data.responseTextPath || '',
    apiKey: data.apiKey && !data.apiKey.includes('*') ? cleanSecret(data.apiKey) : '',
    enabled: data.enabled !== false,
    createdAt: now,
    updatedAt: now,
  };
  const created = await aiProviders.insert(doc);
  return mask(created);
}

export async function update(id, data) {
  const existing = await aiProviders.findOne({ _id: id });
  if (!existing) return null;
  validate({ ...existing, ...data });

  const now = new Date().toISOString();
  const updateData = { ...data, updatedAt: now };
  delete updateData._id;
  delete updateData.createdAt;

  if ('payloadTemplate' in updateData) {
    updateData.payloadTemplate = JSON.stringify(normaliseTemplate(updateData.payloadTemplate));
  }
  // Retain stored key when incoming value is masked or blank
  if (!updateData.apiKey || updateData.apiKey.includes('*')) {
    updateData.apiKey = existing.apiKey || '';
  } else {
    updateData.apiKey = cleanSecret(updateData.apiKey);
  }

  await aiProviders.update({ _id: id }, { $set: updateData });
  const updated = await aiProviders.findOne({ _id: id });
  return mask(updated);
}

export async function remove(id) {
  return aiProviders.remove({ _id: id });
}

function normaliseTemplate(template) {
  if (template == null) return {};
  if (typeof template === 'string') {
    try {
      return JSON.parse(template);
    } catch {
      return {};
    }
  }
  return template;
}

/**
 * Test a provider by sending a trivial one-turn request and confirming a
 * non-error HTTP response. Uses the stored key when the incoming one is masked.
 */
export async function testConnection(id, overrides = {}) {
  const provider = await getRawById(id);
  if (!provider) throw new Error('Provider not found');

  const apiKey = overrides.apiKey && !overrides.apiKey.includes('*') ? overrides.apiKey : provider.apiKey;
  const context = {
    apiKey,
    model: overrides.model || provider.model,
    system: 'You are a test.',
    messages: [{ role: 'user', content: 'Reply with "ok".' }],
  };
  const bodyTemplate = normaliseTemplate(overrides.payloadTemplate) || provider.payloadTemplate;
  const rendered = renderTemplate(
    Object.keys(bodyTemplate || {}).length ? bodyTemplate : provider.payloadTemplate,
    context,
  );
  // Force non-streaming for the probe where the template exposes a stream flag.
  if (rendered && typeof rendered === 'object' && 'stream' in rendered) rendered.stream = false;
  // The probe grants no tools, so a {{$.tools}} node renders to null — strip it
  // (same rule as the chat path; endpoints reject "tools": null).
  if (rendered && typeof rendered === 'object' && (rendered.tools == null || (Array.isArray(rendered.tools) && rendered.tools.length === 0))) {
    delete rendered.tools;
  }

  const headers = renderHeaders(provider.headers, context);
  const res = await fetch(provider.endpointUrl, {
    method: provider.method || 'POST',
    headers,
    body: JSON.stringify(rendered),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Provider returned ${res.status}: ${text.slice(0, 300)}`);
  }
  return { success: true };
}
