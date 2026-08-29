import { describe, it, expect, vi } from 'vitest';
import { createLLMAdapter } from './factory';
import { OpenAICompatibleProvider } from './providers/openaiCompatible';
import { ConnectionProfile } from '../../db';

vi.mock('../security/crypto', () => ({
  decryptData: vi.fn(async (key, encrypted) => {
    if (encrypted === 'bad') return null;
    return 'decrypted-key-' + encrypted;
  })
}));

describe('LLM Factory', () => {
  it('routes openrouter to OpenAICompatibleProvider', async () => {
    const profile: ConnectionProfile = {
      id: '1',
      label: 'OpenRouter',
      provider: 'openrouter',
      encryptedApiKey: 'sk-or-123',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'anthropic/claude-3.5-sonnet'
    };
    
    // Using a fake key just to satisfy typescript
    const adapter = await createLLMAdapter(profile, {} as CryptoKey);
    
    expect(adapter).toBeInstanceOf(OpenAICompatibleProvider);
    // You can't easily assert on private fields, but creating it without throwing is good
  });

  it('routes openai-compatible to OpenAICompatibleProvider', async () => {
    const profile: ConnectionProfile = {
      id: '2',
      label: 'Local',
      provider: 'openai-compatible',
      encryptedApiKey: 'sk-local',
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3'
    };
    
    const adapter = await createLLMAdapter(profile, {} as CryptoKey);
    
    expect(adapter).toBeInstanceOf(OpenAICompatibleProvider);
  });
});
