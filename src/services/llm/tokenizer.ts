import type { LLMRequest, LLMAdapter } from './llmAdapter';

export interface TokenCountResult {
  count: number;
  isEstimate: boolean;
}

export async function countRequestTokens(
  req: LLMRequest,
  providerId: 'anthropic' | 'openai' | 'google' | 'openrouter' | 'ollama' | string,
  adapter?: LLMAdapter
): Promise<TokenCountResult> {
  // 1. Anthropic: Use native exact API token counter
  if (providerId === 'anthropic' && adapter && adapter.countTokens) {
    try {
      const count = await adapter.countTokens(req);
      return { count, isEstimate: false };
    } catch (e) {
      console.warn('Anthropic API token count failed. Falling back.', e);
    }
  }

  // Build a unified textual representation of the payload to tokenize/estimate
  let textPayload = req.systemPrompt ? `system\n${req.systemPrompt}\n` : '';
  for (const m of req.messages) {
    let contentStr = '';
    if (typeof m.content === 'string') {
      contentStr = m.content;
    } else if (Array.isArray(m.content)) {
      contentStr = m.content
        .map(b => (b.type === 'text' ? b.text : `[IMAGE: ${b.mediaType || 'image/png'}]`))
        .join('\n');
    }
    textPayload += `${m.role}\n${contentStr}\n`;
  }
  if (req.tools && req.tools.length > 0) {
    textPayload += `tools\n${JSON.stringify(req.tools)}\n`;
  }

  // 2. OpenAI / OpenRouter: Use local gpt-tokenizer (lazy-loaded on demand)
  if (providerId === 'openai' || providerId === 'openrouter') {
    try {
      const { encode } = await import('gpt-tokenizer');
      const tokens = encode(textPayload);
      // Add standard framing overhead (approx 4 tokens per message)
      const messageOverhead = (req.messages.length + (req.systemPrompt ? 1 : 0)) * 4;
      return { count: tokens.length + messageOverhead, isEstimate: false };
    } catch (e) {
      console.warn('gpt-tokenizer encoding failed. Falling back to char estimation.', e);
    }
  }

  // 3. Google / Ollama / Fallbacks: Documented char-per-token heuristic (~4 chars/token)
  // Labeled securely as 'isEstimate: true' for the UI to badge appropriately.
  const estimate = Math.ceil(textPayload.length / 4);
  return { count: estimate, isEstimate: true };
}
