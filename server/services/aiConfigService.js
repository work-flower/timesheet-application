import aiConfig from '../db/aiConfig.js';

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const DEFAULT_SYSTEM_PROMPT = `You are a bank statement parser. The attached file is a bank statement export which may be in CSV, OFX, PDF or other formats. Extract all transactions and return a JSON array. Each transaction must have: \`date\` (YYYY-MM-DD), \`description\` (string), \`amount\` (number, negative for debits, positive for credits). Include any other fields present such as \`balance\`, \`reference\`, \`transactionType\`, etc. Return ONLY the JSON array, no other text.`;
const DEFAULT_EXPENSE_SYSTEM_PROMPT = `You are a receipt/invoice parser. The attached file is a photo or scan of a receipt or invoice. Extract the expense details and return a JSON object with these fields:
- \`date\` (string, YYYY-MM-DD format)
- \`amount\` (number, gross total paid including VAT/tax, negative for credit notes/refunds)
- \`vatAmount\` (number, VAT/tax portion included in amount, 0 if no VAT shown)
- \`expenseType\` (string, category e.g. "Travel", "Meals", "Equipment", "Software", "Office Supplies", "Accommodation")
- \`description\` (string, brief client-facing description of what was purchased)
- \`externalReference\` (string, invoice number, order ID, receipt number, or any other reference identifier found on the document)

Return ONLY the JSON object, no other text. If a field cannot be determined, use null for strings and 0 for numbers.`;

const DEFAULT_DAILY_PLAN_SYSTEM_PROMPT = `You are a daily work assistant for a UK technology contractor. Generate an end-of-day recap that captures the full state of the day. This document will be read by both humans and AI systems for context.

Include these sections:
- **Completed work**: Tasks done, tickets progressed, key accomplishments
- **Meetings**: Summary of each meeting attended, key decisions and action items
- **Outstanding items**: Incomplete tasks, blockers, items carrying forward
- **Timesheet summary**: Hours logged and on which projects
- **Notes**: Any other relevant context from the day

Keep the tone professional. Use markdown with clear headings and bullet points. Be comprehensive but concise — capture everything needed to understand what happened today.`;

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
    expenseSystemPrompt: DEFAULT_EXPENSE_SYSTEM_PROMPT,
    dailyPlanSystemPrompt: DEFAULT_DAILY_PLAN_SYSTEM_PROMPT,
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

export { DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT, DEFAULT_EXPENSE_SYSTEM_PROMPT };
