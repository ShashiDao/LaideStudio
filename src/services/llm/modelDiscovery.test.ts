import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  getModelContextWindow, 
  formatContextWindow, 
  fetchAvailableModels,
  FALLBACK_CONTEXT_WINDOW 
} from './modelDiscovery';

describe('Model Discovery & Context Window Resolution', () => {
  describe('getModelContextWindow', () => {
    it('returns 200k for Anthropic Claude models', () => {
      expect(getModelContextWindow('anthropic', 'claude-3-7-sonnet-20250219')).toBe(200000);
      expect(getModelContextWindow('anthropic', 'claude-3-5-haiku-20241022')).toBe(200000);
      expect(getModelContextWindow('anthropic', 'claude-3-opus-20240229')).toBe(200000);
      expect(getModelContextWindow('anthropic', 'claude-3-7-sonnet')).toBe(200000);
      expect(getModelContextWindow('anthropic', '')).toBe(200000);
    });

    it('returns correct context windows for OpenAI models', () => {
      expect(getModelContextWindow('openai', 'gpt-4o')).toBe(128000);
      expect(getModelContextWindow('openai', 'gpt-4o-mini')).toBe(128000);
      expect(getModelContextWindow('openai', 'gpt-4-turbo')).toBe(128000);
      expect(getModelContextWindow('openai', 'o1')).toBe(200000);
      expect(getModelContextWindow('openai', 'o3-mini')).toBe(200000);
      expect(getModelContextWindow('openai', 'gpt-4')).toBe(8192);
      expect(getModelContextWindow('openai', 'gpt-3.5-turbo')).toBe(16385);
      expect(getModelContextWindow('openai', '')).toBe(128000);
    });

    it('returns correct context windows for Google Gemini models', () => {
      expect(getModelContextWindow('google', 'gemini-1.5-pro')).toBe(2000000);
      expect(getModelContextWindow('google', 'gemini-2.0-pro')).toBe(2000000);
      expect(getModelContextWindow('google', 'gemini-1.5-flash')).toBe(1000000);
      expect(getModelContextWindow('google', 'gemini-2.0-flash')).toBe(1000000);
      expect(getModelContextWindow('google', 'gemini-1.0-pro')).toBe(32768);
      expect(getModelContextWindow('google', '')).toBe(1000000);
    });

    it('recognizes known open-source model families on OpenAI-compatible/OpenRouter endpoints', () => {
      expect(getModelContextWindow('openai-compatible', 'meta-llama/llama-3.1-70b-instruct')).toBe(128000);
      expect(getModelContextWindow('openrouter', 'deepseek/deepseek-v3')).toBe(64000);
      expect(getModelContextWindow('openrouter', 'qwen/qwen-2.5-coder-32b-instruct')).toBe(128000);
      expect(getModelContextWindow('openai-compatible', 'mistralai/mistral-large-2407')).toBe(128000);
    });

    it('falls back to conservative 32000 for unknown local/OpenAI-compatible models', () => {
      expect(FALLBACK_CONTEXT_WINDOW).toBe(32000);
      expect(getModelContextWindow('openai-compatible', 'my-custom-local-model:latest')).toBe(32000);
      expect(getModelContextWindow('openrouter', 'custom-finetune-v1')).toBe(32000);
      expect(getModelContextWindow('custom-provider', 'unknown-model')).toBe(32000);
    });
  });

  describe('formatContextWindow', () => {
    it('formats tokens into human readable notation', () => {
      expect(formatContextWindow(2000000)).toBe('2M');
      expect(formatContextWindow(1000000)).toBe('1M');
      expect(formatContextWindow(200000)).toBe('200k');
      expect(formatContextWindow(128000)).toBe('128k');
      expect(formatContextWindow(32000)).toBe('32k');
      expect(formatContextWindow(8192)).toBe('8k');
      expect(formatContextWindow(500)).toBe('500');
    });
  });

  describe('fetchAvailableModels', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('returns empty array when API key is missing for standard providers', async () => {
      const models = await fetchAvailableModels('anthropic', '');
      expect(models).toEqual([]);
    });

    it('returns fallback models with contextWindow for Anthropic on network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
      const models = await fetchAvailableModels('anthropic', 'sk-ant-test');
      expect(models.length).toBeGreaterThan(0);
      expect(models[0].contextWindow).toBe(200000);
    });

    it('attaches contextWindow to OpenAI discovered models', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'gpt-4o' },
            { id: 'gpt-3.5-turbo' },
            { id: 'text-embedding-3-small' } // non-chat, filtered out
          ]
        })
      }));

      const models = await fetchAvailableModels('openai', 'sk-test');
      expect(models).toHaveLength(2);
      expect(models.find(m => m.id === 'gpt-4o')?.contextWindow).toBe(128000);
      expect(models.find(m => m.id === 'gpt-3.5-turbo')?.contextWindow).toBe(16385);
    });

    it('attaches inputTokenLimit to Google discovered models', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            { 
              name: 'models/gemini-1.5-pro', 
              displayName: 'Gemini 1.5 Pro',
              supportedGenerationMethods: ['generateContent'],
              inputTokenLimit: 2097152
            }
          ]
        })
      }));

      const models = await fetchAvailableModels('google', 'AIzaTest');
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('gemini-1.5-pro');
      expect(models[0].contextWindow).toBe(2097152);
    });
    it('discovers offline WebLLM models without API key', async () => {
      const models = await fetchAvailableModels('webllm', '');
      expect(models.length).toBeGreaterThanOrEqual(3);
      expect(models.some(m => m.id.includes('Qwen2.5-Coder'))).toBe(true);
      expect(models.some(m => m.id.includes('Llama-3.2'))).toBe(true);
      expect(models[0].contextWindow).toBeGreaterThanOrEqual(8192);
    });
  });
});
