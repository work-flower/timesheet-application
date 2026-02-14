import { readFileSync } from 'fs';
import { extname } from 'path';
import { getRawConfig } from './aiConfigService.js';

export async function parseFile(filePath, filename, userPrompt) {
  const config = await getRawConfig();
  if (!config.apiKey) {
    throw new Error('AI API key not configured. Go to Settings → Transaction Import AI Config to set it up.');
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.apiKey });

  // Read file and build document block
  // PDF → Base64PDFSource, everything else → PlainTextSource
  const fileBuffer = readFileSync(filePath);
  const ext = extname(filename).toLowerCase();
  const isPdf = ext === '.pdf';

  const content = [];
  if (isPdf) {
    content.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: fileBuffer.toString('base64') },
    });
  } else {
    content.push({
      type: 'document',
      source: { type: 'text', media_type: 'text/plain', data: fileBuffer.toString('utf-8') },
      title: filename,
    });
  }

  if (userPrompt) {
    content.push({ type: 'text', text: userPrompt });
  }

  // Call Claude API with assistant prefill to force raw JSON (no markdown fences)
  const params = {
    model: config.model,
    system: config.systemPrompt,
    messages: [
      { role: 'user', content },
      { role: 'assistant', content: '[' },
    ],
  };
  params.max_tokens = Math.min(config.maxTokens ? Number(config.maxTokens) : 64000, 64000);

  const timeoutMs = (config.timeoutMinutes || 30) * 60 * 1000;
  let response;
  try {
    const stream = client.messages.stream(params, { timeout: timeoutMs });
    response = await stream.finalMessage();
  } catch (err) {
    throw new Error(`AI API call failed: ${err.message}`);
  }

  // Check for truncation
  if (response.stop_reason === 'max_tokens') {
    throw new Error('AI response was truncated — the bank statement may have too many transactions. Try splitting the file into smaller chunks.');
  }

  // Extract text response — prepend the prefilled "[" back
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) {
    throw new Error('AI returned no text response.');
  }

  const jsonText = '[' + textBlock.text.trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`Failed to parse AI response as JSON: ${err.message}\nResponse: ${jsonText.substring(0, 500)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('AI response is not an array of transactions.');
  }

  return { rows: parsed, stopReason: response.stop_reason };
}
