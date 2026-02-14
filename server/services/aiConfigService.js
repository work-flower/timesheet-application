import aiConfig from '../db/aiConfig.js';

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const DEFAULT_SYSTEM_PROMPT = `You are a bank statement parser. The attached file is a bank statement export which may be in CSV, OFX, PDF or other formats. Extract all transactions and return a JSON array. Each transaction must have: \`date\` (YYYY-MM-DD), \`description\` (string), \`amount\` (number, negative for debits, positive for credits). Include any other fields present such as \`balance\`, \`reference\`, \`transactionType\`, etc. Return ONLY the JSON array, no other text.`;

function maskSecret(value) {
  if (!value || value.length <= 4) return value ? '****' : '';
  return '*'.repeat(value.length - 4) + value.slice(-4);
}

export async function getConfig() {
  const docs = await aiConfig.find({});
  const doc = docs[0] || null;
  if (doc && doc.apiKey) {
    return { ...doc, apiKey: maskSecret(doc.apiKey) };
  }
  return doc;
}

export async function updateConfig(data) {
  const now = new Date().toISOString();
  const existing = await aiConfig.find({});
  const updateData = { ...data, updatedAt: now };
  delete updateData._id;

  // Normalise numeric fields — empty string/null → null, otherwise store as number
  for (const field of ['maxTokens', 'timeoutMinutes']) {
    if (updateData[field] === '' || updateData[field] == null) {
      updateData[field] = null;
    } else {
      updateData[field] = Number(updateData[field]);
    }
  }

  // If apiKey contains asterisks, retain existing stored value
  if (updateData.apiKey && updateData.apiKey.includes('*')) {
    if (existing.length > 0 && existing[0].apiKey) {
      updateData.apiKey = existing[0].apiKey;
    }
  }

  if (existing.length > 0) {
    delete updateData.createdAt;
    await aiConfig.update({ _id: existing[0]._id }, { $set: updateData });
    const updated = await aiConfig.findOne({ _id: existing[0]._id });
    return { ...updated, apiKey: maskSecret(updated.apiKey) };
  } else {
    updateData.createdAt = now;
    const created = await aiConfig.insert(updateData);
    return { ...created, apiKey: maskSecret(created.apiKey) };
  }
}

export async function getRawConfig() {
  const docs = await aiConfig.find({});
  if (docs[0]) return docs[0];

  // Auto-seed defaults on first use
  const now = new Date().toISOString();
  const defaults = {
    apiKey: '',
    model: DEFAULT_MODEL,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    maxTokens: null,
    timeoutMinutes: null,
    createdAt: now,
    updatedAt: now,
  };
  return aiConfig.insert(defaults);
}

export async function testConnection(data) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');

  // If apiKey is masked, get from stored config
  let apiKey = data.apiKey;
  if (apiKey && apiKey.includes('*')) {
    const stored = await getRawConfig();
    if (stored) apiKey = stored.apiKey;
  }

  if (!apiKey) throw new Error('API key is required');

  const model = data.model || DEFAULT_MODEL;
  const client = new Anthropic({ apiKey });

  await client.messages.create({
    model,
    max_tokens: 16,
    messages: [{ role: 'user', content: 'Reply with "ok".' }],
  });

  return { success: true };
}

export { DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT };
