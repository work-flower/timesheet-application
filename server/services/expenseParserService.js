import { getRawConfig, DEFAULT_EXPENSE_SYSTEM_PROMPT } from './aiConfigService.js';

export async function parseReceipt(fileBuffer, filename, mimeType) {
  const config = await getRawConfig();
  if (!config.apiKey) {
    throw new Error('AI API key not configured. Go to Settings → AI Config to set it up.');
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.apiKey });

  const systemPrompt = config.expenseSystemPrompt || DEFAULT_EXPENSE_SYSTEM_PROMPT;

  // Build content block — use document type for all files (better for document understanding)
  const content = [];
  if (mimeType === 'application/pdf' || mimeType.startsWith('image/')) {
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: mimeType, data: fileBuffer.toString('base64') },
    });
  } else {
    throw new Error(`Unsupported file type: ${mimeType}. Please upload an image or PDF.`);
  }

  content.push({ type: 'text', text: `Parse this receipt/invoice. Filename: ${filename}` });

  const params = {
    model: config.model,
    system: systemPrompt,
    max_tokens: 1024,
    messages: [
      { role: 'user', content },
      { role: 'assistant', content: '{' },
    ],
  };

  let response;
  try {
    const timeoutMs = (config.timeoutMinutes || 30) * 60 * 1000;
    response = await client.messages.create(params, { timeout: timeoutMs });
  } catch (err) {
    throw new Error(`AI API call failed: ${err.message}`);
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) {
    throw new Error('AI returned no text response.');
  }

  const jsonText = '{' + textBlock.text.trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`Failed to parse AI response as JSON: ${err.message}\nResponse: ${jsonText.substring(0, 500)}`);
  }

  // Coerce and validate fields
  const result = {
    date: typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
    amount: parsed.amount != null ? Number(parsed.amount) : 0,
    vatAmount: parsed.vatAmount != null ? Number(parsed.vatAmount) : 0,
    expenseType: typeof parsed.expenseType === 'string' ? parsed.expenseType : null,
    description: typeof parsed.description === 'string' ? parsed.description : null,
    externalReference: typeof parsed.externalReference === 'string' ? parsed.externalReference : null,
  };

  if (isNaN(result.amount)) result.amount = 0;
  if (isNaN(result.vatAmount)) result.vatAmount = 0;

  return result;
}
