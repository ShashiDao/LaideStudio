import { ConnectionProfile } from '../../db';
import { LLMAdapter, withRetry } from './llmAdapter';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAIProvider } from './providers/openai';
import { GoogleProvider } from './providers/google';
import { OpenAICompatibleProvider } from './providers/openaiCompatible';
import { WebLLMProvider } from './providers/webllm';
import { decryptData } from '../security/crypto';

export async function createLLMAdapter(profile: ConnectionProfile, aesKey: CryptoKey): Promise<LLMAdapter> {
  if (profile.provider === 'webllm' || profile.provider === 'offline') {
    return withRetry(new WebLLMProvider(profile.model));
  }

  const apiKey = await decryptData(aesKey, profile.encryptedApiKey);
  if (!apiKey && profile.provider !== 'openai-compatible') {
    throw new Error('Failed to decrypt API key for profile');
  }

  let adapter: LLMAdapter;
  switch (profile.provider) {
    case 'anthropic':
      adapter = new AnthropicProvider(apiKey || '', profile.model);
      break;
    case 'openai':
      adapter = new OpenAIProvider(apiKey || '', profile.model);
      break;
    case 'google':
      adapter = new GoogleProvider(apiKey || '', profile.model);
      break;
    case 'openrouter':
    case 'openai-compatible':
      adapter = new OpenAICompatibleProvider(profile.baseUrl || '', apiKey || '', profile.model);
      break;
    case 'webllm':
    case 'offline':
      adapter = new WebLLMProvider(profile.model);
      break;
    default:
      throw new Error(`Unsupported provider: ${profile.provider}`);
  }

  return withRetry(adapter);
}
