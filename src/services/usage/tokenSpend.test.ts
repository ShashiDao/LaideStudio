// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getModelPricing,
  countTokensForText,
  countTurnTokens,
  calculateEstimatedCost,
  formatUsdCost,
  formatTokenCount,
  computeSessionUsageSummary,
  loadStoredUsageRecords,
  saveStoredUsageRecords,
  FREE_LOCAL_PRICING,
  type UsageRecord
} from './tokenSpend';

describe('Token Spend & Cost Tracking Utility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Model Pricing Lookup', () => {
    it('returns exact pricing for Anthropic Claude 3.7 / 3.5 Sonnet', () => {
      const p1 = getModelPricing('anthropic', 'claude-3-7-sonnet');
      expect(p1.inputPricePerMillion).toBe(3.0);
      expect(p1.outputPricePerMillion).toBe(15.0);

      const p2 = getModelPricing('anthropic', 'claude-3-5-sonnet-20241022');
      expect(p2.inputPricePerMillion).toBe(3.0);
      expect(p2.outputPricePerMillion).toBe(15.0);
    });

    it('returns exact pricing for Claude 3.5 Haiku', () => {
      const p = getModelPricing('anthropic', 'claude-3-5-haiku-20241022');
      expect(p.inputPricePerMillion).toBe(0.8);
      expect(p.outputPricePerMillion).toBe(4.0);
    });

    it('returns exact pricing for OpenAI GPT-4o and GPT-4o-mini', () => {
      const gpt4o = getModelPricing('openai', 'gpt-4o');
      expect(gpt4o.inputPricePerMillion).toBe(2.5);
      expect(gpt4o.outputPricePerMillion).toBe(10.0);

      const mini = getModelPricing('openai', 'gpt-4o-mini');
      expect(mini.inputPricePerMillion).toBe(0.15);
      expect(mini.outputPricePerMillion).toBe(0.6);
    });

    it('returns exact pricing for Google Gemini 1.5/2.0 Flash and Pro', () => {
      const flash = getModelPricing('google', 'gemini-2.0-flash');
      expect(flash.inputPricePerMillion).toBe(0.1);
      expect(flash.outputPricePerMillion).toBe(0.4);

      const pro = getModelPricing('google', 'gemini-1.5-pro');
      expect(pro.inputPricePerMillion).toBe(1.25);
      expect(pro.outputPricePerMillion).toBe(5.0);
    });

    it('returns exact pricing for DeepSeek and OpenRouter models', () => {
      const deepseek = getModelPricing('openai-compatible', 'deepseek/deepseek-chat');
      expect(deepseek.inputPricePerMillion).toBe(0.14);
      expect(deepseek.outputPricePerMillion).toBe(0.28);

      const r1 = getModelPricing('openai-compatible', 'deepseek-reasoner');
      expect(r1.inputPricePerMillion).toBe(0.55);
      expect(r1.outputPricePerMillion).toBe(2.19);
    });

    it('identifies local Ollama and LMStudio endpoints as free ($0)', () => {
      const ollama = getModelPricing('openai-compatible', 'llama3:latest', 'http://localhost:11434/v1');
      expect(ollama).toEqual(FREE_LOCAL_PRICING);
      expect(ollama.isFree).toBe(true);

      const lmstudio = getModelPricing('openai-compatible', 'qwen-coder', 'http://127.0.0.1:1234/v1');
      expect(lmstudio.isFree).toBe(true);
    });
  });

  describe('Token Counting', () => {
    it('counts tokens for text strings with gpt-tokenizer', () => {
      const count = countTokensForText('Hello world! This is a test.');
      expect(count).toBeGreaterThan(3);
      expect(count).toBeLessThan(15);
    });

    it('handles empty or blank strings gracefully', () => {
      expect(countTokensForText('')).toBe(0);
    });

    it('accurately parses message turns into input and output tokens', () => {
      const res = countTurnTokens(
        [
          { role: 'user', content: 'Create a button component' },
          { role: 'assistant', content: 'Here is the button component in React.' }
        ],
        'System prompt: you are an expert engineer',
        [{ name: 'write_file', description: 'write file', parameters: { type: 'object', properties: {} } }]
      );

      expect(res.inputTokens).toBeGreaterThan(5);
      expect(res.outputTokens).toBeGreaterThan(3);
      expect(res.totalTokens).toBe(res.inputTokens + res.outputTokens);
    });
  });

  describe('Cost Calculations & Formatting', () => {
    it('calculates cost based on token counts and pricing rates', () => {
      const pricing = { inputPricePerMillion: 3.0, outputPricePerMillion: 15.0 };
      // 100,000 input tokens = $0.30
      // 10,000 output tokens = $0.15
      // Total = $0.45
      const cost = calculateEstimatedCost(100_000, 10_000, pricing);
      expect(cost).toBeCloseTo(0.45, 4);
    });

    it('formats USD costs cleanly', () => {
      expect(formatUsdCost(0)).toBe('$0.00');
      expect(formatUsdCost(0.00002)).toBe('< $0.0001');
      expect(formatUsdCost(0.0042)).toBe('$0.0042');
      expect(formatUsdCost(0.35)).toBe('$0.350');
      expect(formatUsdCost(4.50)).toBe('$4.50');
    });

    it('formats token counts with k and M units', () => {
      expect(formatTokenCount(450)).toBe('450');
      expect(formatTokenCount(1500)).toBe('1.5k');
      expect(formatTokenCount(24000)).toBe('24k');
      expect(formatTokenCount(1500000)).toBe('1.5M');
    });
  });

  describe('computeSessionUsageSummary', () => {
    it('aggregates usage records by model and by category', () => {
      const records: UsageRecord[] = [
        {
          id: '1',
          timestamp: 1000,
          provider: 'anthropic',
          model: 'claude-3-7-sonnet',
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
          estimatedCostUsd: 0.0105,
          category: 'agent_chat'
        },
        {
          id: '2',
          timestamp: 2000,
          provider: 'anthropic',
          model: 'claude-3-7-sonnet',
          inputTokens: 2000,
          outputTokens: 1000,
          totalTokens: 3000,
          estimatedCostUsd: 0.0210,
          category: 'ensemble_candidate_a'
        },
        {
          id: '3',
          timestamp: 2000,
          provider: 'openai',
          model: 'gpt-4o',
          inputTokens: 2000,
          outputTokens: 800,
          totalTokens: 2800,
          estimatedCostUsd: 0.0130,
          category: 'ensemble_candidate_b'
        }
      ];

      const summary = computeSessionUsageSummary(records);

      expect(summary.totalTokens).toBe(7300);
      expect(summary.totalInputTokens).toBe(5000);
      expect(summary.totalOutputTokens).toBe(2300);
      expect(summary.totalCostUsd).toBeCloseTo(0.0445, 4);
      expect(summary.recordsCount).toBe(3);

      expect(summary.byModel['anthropic:claude-3-7-sonnet'].tokens).toBe(4500);
      expect(summary.byModel['openai:gpt-4o'].tokens).toBe(2800);

      expect(summary.byCategory.agent_chat.tokens).toBe(1500);
      expect(summary.byCategory.ensemble_candidate_a.tokens).toBe(3000);
      expect(summary.byCategory.ensemble_candidate_b.tokens).toBe(2800);
    });
  });

  describe('Storage Persistence', () => {
    it('persists and retrieves usage records from localStorage', () => {
      const records: UsageRecord[] = [
        {
          id: 'rec_1',
          timestamp: Date.now(),
          provider: 'anthropic',
          model: 'claude-3-5-sonnet',
          inputTokens: 500,
          outputTokens: 200,
          totalTokens: 700,
          estimatedCostUsd: 0.0045,
          category: 'agent_chat'
        }
      ];

      saveStoredUsageRecords(records);
      const loaded = loadStoredUsageRecords();
      expect(loaded.length).toBe(1);
      expect(loaded[0].id).toBe('rec_1');
      expect(loaded[0].model).toBe('claude-3-5-sonnet');
    });
  });
});
