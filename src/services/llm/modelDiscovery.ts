export interface DiscoveredModel {
  id: string;
  name?: string;
  description?: string;
  contextWindow?: number;
}

interface RawOpenAiModel {
  id: string;
}

interface RawAnthropicModel {
  id: string;
  display_name?: string;
}

interface RawGoogleModel {
  name: string;
  displayName?: string;
  description?: string;
  inputTokenLimit?: number;
  supportedGenerationMethods?: string[];
}

interface RawOpenAiCompatibleModel {
  id?: string;
  name?: string;
  description?: string;
  context_length?: number;
  context_window?: number;
}

export const FALLBACK_CONTEXT_WINDOW = 32000;

export const KNOWN_MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Anthropic (200k standard)
  'claude-3-7-sonnet-20250219': 200000,
  'claude-3-5-sonnet-20240620': 200000,
  'claude-3-5-haiku-20241022': 200000,
  'claude-3-7-sonnet': 200000,
  'claude-3-opus-20240229': 200000,
  'claude-3-sonnet-20240229': 200000,
  'claude-3-haiku-20240307': 200000,
  'claude-2.1': 200000,
  'claude-2.0': 100000,
  'claude-instant-1.2': 100000,

  // OpenAI
  'gpt-4o': 128000,
  'gpt-4o-2024-05-13': 128000,
  'gpt-4o-2024-08-06': 128000,
  'gpt-4o-2024-11-20': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4o-mini-2024-07-18': 128000,
  'chatgpt-4o-latest': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4-turbo-2024-04-09': 128000,
  'gpt-4-turbo-preview': 128000,
  'gpt-4-0125-preview': 128000,
  'gpt-4-1106-preview': 128000,
  'o1': 200000,
  'o1-2024-12-17': 200000,
  'o1-preview': 128000,
  'o1-preview-2024-09-12': 128000,
  'o1-mini': 128000,
  'o1-mini-2024-09-12': 128000,
  'o3': 200000,
  'o3-mini': 200000,
  'o3-mini-2025-01-31': 200000,
  'gpt-4-32k': 32768,
  'gpt-4-32k-0613': 32768,
  'gpt-4-32k-0314': 32768,
  'gpt-4': 8192,
  'gpt-4-0613': 8192,
  'gpt-4-0314': 8192,
  'gpt-3.5-turbo': 16385,
  'gpt-3.5-turbo-0125': 16385,
  'gpt-3.5-turbo-1106': 16385,
  'gpt-3.5-turbo-16k': 16385,
  'gpt-3.5-turbo-instruct': 4096,

  // Google Gemini
  'gemini-1.5-pro': 2000000,
  'gemini-1.5-pro-latest': 2000000,
  'gemini-1.5-pro-001': 2000000,
  'gemini-1.5-pro-002': 2000000,
  'gemini-2.0-pro': 2000000,
  'gemini-2.0-pro-exp-02-05': 2000000,
  'gemini-1.5-flash': 1000000,
  'gemini-1.5-flash-latest': 1000000,
  'gemini-1.5-flash-001': 1000000,
  'gemini-1.5-flash-002': 1000000,
  'gemini-1.5-flash-8b': 1000000,
  'gemini-1.5-flash-8b-latest': 1000000,
  'gemini-2.0-flash': 1000000,
  'gemini-2.0-flash-exp': 1000000,
  'gemini-2.0-flash-lite': 1000000,
  'gemini-2.0-flash-lite-preview-02-05': 1000000,
  'gemini-2.5-flash': 1000000,
  'gemini-2.5-pro': 2000000,
  'gemini-1.0-pro': 32768,
  'gemini-pro': 32768,

  // Offline / WebLLM models
  'qwen2.5-coder-1.5b-instruct-q4f16_1-mlc': 32768,
  'qwen2.5-coder-0.5b-instruct-q4f16_1-mlc': 16384,
  'llama-3.2-1b-instruct-q4f16_1-mlc': 16384,
  'smollm2-1.7b-instruct-q4f16_1-mlc': 8192,
};

export function formatContextWindow(tokens: number): string {
  if (tokens >= 1000000) {
    const m = tokens / 1000000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}k`;
  }
  return `${tokens}`;
}

export function getModelContextWindow(provider?: string, modelId?: string): number {
  if (!modelId || !modelId.trim()) {
    if (provider === 'anthropic') return 200000;
    if (provider === 'google') return 1000000;
    if (provider === 'openai') return 128000;
    return FALLBACK_CONTEXT_WINDOW; // 32000
  }

  const cleanId = modelId.trim().toLowerCase();
  
  // Exact lookup
  if (KNOWN_MODEL_CONTEXT_WINDOWS[cleanId]) {
    return KNOWN_MODEL_CONTEXT_WINDOWS[cleanId];
  }

  // Model ID prefix / substring matching
  if (cleanId.includes('gemini-1.5-pro') || cleanId.includes('gemini-2.0-pro') || cleanId.includes('gemini-2.5-pro')) {
    return 2000000;
  }
  if (cleanId.includes('gemini-1.5') || cleanId.includes('gemini-2.0') || cleanId.includes('gemini-2.5') || cleanId.includes('gemini-flash')) {
    return 1000000;
  }
  if (cleanId.includes('gemini-pro') || cleanId.includes('gemini-1.0')) {
    return 32768;
  }
  if (cleanId.startsWith('claude-3') || cleanId.startsWith('claude-2') || cleanId.includes('claude')) {
    return 200000;
  }
  if (cleanId.startsWith('o1') || cleanId.startsWith('o3')) {
    return cleanId.includes('preview') || cleanId.includes('mini') ? 128000 : 200000;
  }
  if (cleanId.startsWith('gpt-4o') || cleanId.includes('gpt-4-turbo')) {
    return 128000;
  }
  if (cleanId.includes('llama-3.1') || cleanId.includes('llama-3.2') || cleanId.includes('llama-3.3') || cleanId.includes('llama3.1') || cleanId.includes('llama3.2') || cleanId.includes('llama3.3')) {
    return 128000;
  }
  if (cleanId.includes('deepseek-v3') || cleanId.includes('deepseek-r1') || cleanId.includes('deepseek-coder')) {
    return 64000;
  }
  if (cleanId.includes('mistral-large') || cleanId.includes('codestral')) {
    return 128000;
  }
  if (cleanId.includes('qwen-2.5') || cleanId.includes('qwen2.5')) {
    return 128000;
  }
  if (cleanId.startsWith('gpt-4-32k')) {
    return 32768;
  }
  if (cleanId.startsWith('gpt-4')) {
    return 8192;
  }
  if (cleanId.startsWith('gpt-3.5')) {
    return 16385;
  }

  // Provider fallbacks
  if (provider === 'anthropic') return 200000;
  if (provider === 'google') return 1000000;
  if (provider === 'openai') return 128000;

  // Unknown OpenAI-compatible / local models default to conservative 32,000
  return FALLBACK_CONTEXT_WINDOW;
}

export async function fetchAvailableModels(
  provider: string,
  apiKey: string,
  baseUrl?: string
): Promise<DiscoveredModel[]> {
  if (!apiKey && provider !== 'openai-compatible' && provider !== 'openrouter' && provider !== 'webllm' && provider !== 'offline') {
    return [];
  }

  try {
    if (provider === 'webllm' || provider === 'offline') {
      const { OFFLINE_MODELS } = await import('./providers/webllm');
      return OFFLINE_MODELS.map(m => ({
        id: m.id,
        name: m.name,
        description: `${m.description} (Download: ${m.downloadSize}, ${m.vramRequired})`,
        contextWindow: m.contextWindow
      }));
    }
    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) throw new Error(`OpenAI error: ${res.statusText}`);
      const data = await res.json();
      const list: RawOpenAiModel[] = data.data || [];
      // Filter for GPT / chat / reasoning models and sort
      return list
        .filter(m => typeof m.id === 'string' && (m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3') || m.id.startsWith('chatgpt-')))
        .map(m => ({ 
          id: m.id, 
          name: m.id,
          contextWindow: getModelContextWindow('openai', m.id)
        }))
        .sort((a, b) => {
          // Put gpt-4o and latest o-series first
          if (a.id.includes('4o') && !b.id.includes('4o')) return -1;
          if (b.id.includes('4o') && !a.id.includes('4o')) return 1;
          return a.id.localeCompare(b.id);
        });
    }

    if (provider === 'anthropic') {
      try {
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
            'content-type': 'application/json'
          }
        });
        if (res.ok) {
          const data = await res.json();
          const list: RawAnthropicModel[] = data.data || [];
          if (list.length > 0) {
            return list.map(m => ({
              id: m.id,
              name: m.display_name || m.id,
              contextWindow: getModelContextWindow('anthropic', m.id)
            }));
          }
        }
      } catch {
        // Fallback below
      }
      // Fallback known models if endpoint unavailable
      return [
        { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', contextWindow: 200000 },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextWindow: 200000 },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextWindow: 200000 },
        { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', contextWindow: 200000 },
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', contextWindow: 200000 }
      ];
    }

    if (provider === 'google') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!res.ok) throw new Error(`Google API error: ${res.statusText}`);
      const data = await res.json();
      const list: RawGoogleModel[] = data.models || [];
      return list
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => {
          const id = m.name?.replace(/^models\//, '') || m.name;
          const ctx = typeof m.inputTokenLimit === 'number' 
            ? m.inputTokenLimit 
            : getModelContextWindow('google', id);
          return {
            id,
            name: m.displayName || id,
            description: m.description,
            contextWindow: ctx
          };
        })
        .sort((a, b) => {
          if (a.id.includes('pro') && !b.id.includes('pro')) return -1;
          if (b.id.includes('pro') && !a.id.includes('pro')) return 1;
          return a.id.localeCompare(b.id);
        });
    }

    if (provider === 'openai-compatible' || provider === 'openrouter') {
      const url = baseUrl ? baseUrl.replace(/\/+$/, '') : 'http://localhost:11434/v1';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      const res = await fetch(`${url}/models`, { headers });
      if (!res.ok) throw new Error(`Endpoint error: ${res.statusText}`);
      const data = await res.json();
      const list: RawOpenAiCompatibleModel[] = data.data || data.models || [];
      return list
        .filter(m => Boolean(m.id || m.name))
        .map(m => {
        const id = (m.id || m.name) as string;
        const ctx = typeof m.context_length === 'number' 
          ? m.context_length 
          : typeof m.context_window === 'number'
            ? m.context_window
            : getModelContextWindow(provider, id);
        return {
          id,
          name: m.name || m.id,
          description: m.description,
          contextWindow: ctx
        };
      });
    }
  } catch (err) {
    console.warn(`Could not discover models for ${provider}:`, err);
    throw err;
  }

  return [];
}
