import { getRawConfig } from './aiConfigService.js';

/**
 * Submit a single message as a batch request.
 * Returns { batchId, customId } for tracking.
 */
export async function submitBatch(systemPrompt, userMessage, maxTokens = 2048, customId = 'request-1') {
  const config = await getRawConfig();
  if (!config.apiKey) throw new Error('AI API key not configured. Go to Admin > System > AI Config to set it up.');

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.apiKey });

  const batch = await client.messages.batches.create({
    requests: [{
      custom_id: customId,
      params: {
        model: config.model,
        system: systemPrompt,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: userMessage }],
      },
    }],
  });

  return { batchId: batch.id, customId };
}

/**
 * Check batch status and retrieve result if complete.
 * Returns { status, text } where status is 'processing' | 'completed' | 'failed'.
 */
export async function checkBatch(batchId, customId = 'request-1') {
  const config = await getRawConfig();
  if (!config.apiKey) throw new Error('AI API key not configured.');

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.apiKey });

  const batch = await client.messages.batches.retrieve(batchId);

  if (batch.processing_status !== 'ended') {
    return { status: 'processing', text: null };
  }

  // Batch ended — retrieve results
  const decoder = await client.messages.batches.results(batchId);
  for await (const result of decoder) {
    if (result.custom_id === customId) {
      if (result.result.type === 'succeeded') {
        const textBlock = result.result.message.content.find(b => b.type === 'text');
        if (!textBlock) return { status: 'failed', text: null, error: 'AI returned no text response.' };
        return { status: 'completed', text: textBlock.text };
      }
      // errored or expired
      const error = result.result.error?.message || result.result.type;
      return { status: 'failed', text: null, error };
    }
  }

  return { status: 'failed', text: null, error: 'Batch result not found for custom ID.' };
}
