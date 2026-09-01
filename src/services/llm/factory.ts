import { ConnectionProfile } from '../../db';
import { LLMAdapter } from './llmAdapter';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAIProvider } from './providers/openai';
import { GoogleProvider } from './providers/google';
import { OpenAICompatibleProvider } from './providers/openaiCompatible';
import { WebLLMProvider } from './providers/webllm';


export async function createLLMAdapter(profile: ConnectionProfile, aesKey: CryptoKey): Promise<LLMAdapter> {
  if (profile.provider === 'webllm' || profile.provider === 'offline') {
    return new WebLLMProvider(profile.model);
  }

  const { decryptData } = await import('../security/crypto');
  const apiKey = await decryptData(aesKey, profile.encryptedApiKey);
  if (!apiKey && profile.provider !== 'openai-compatible') {
    throw new Error('Failed to decrypt API key for profile');
  }

  switch (profile.provider) {
    case 'anthropic':
      return new AnthropicProvider(apiKey || '', profile.model);
    case 'openai':
      return new OpenAIProvider(apiKey || '', profile.model);
    case 'google':
      return new GoogleProvider(apiKey || '', profile.model);
    case 'openrouter':
    case 'openai-compatible':
      return new OpenAICompatibleProvider(profile.baseUrl || '', apiKey || '', profile.model);
    case 'webllm':
    case 'offline':
      return new WebLLMProvider(profile.model);
    default:
      throw new Error(`Unsupported provider: ${profile.provider}`);
  }
}
