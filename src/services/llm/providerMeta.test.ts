import { describe, it, expect } from 'vitest';
import { PROVIDER_TAGLINES } from './providerMeta';

describe('providerMeta', () => {
  it('defines expected taglines for all standard LLM providers', () => {
    expect(PROVIDER_TAGLINES['anthropic']).toBe('Claude 3.7');
    expect(PROVIDER_TAGLINES['openai']).toBe('GPT-4o');
    expect(PROVIDER_TAGLINES['google']).toBe('Gemini 1.5/2.0');
    expect(PROVIDER_TAGLINES['openrouter']).toBe('400+ Models');
    expect(PROVIDER_TAGLINES['openai-compatible']).toBe('Ollama / Local');
  });
});
