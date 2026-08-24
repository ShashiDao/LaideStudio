import type { LLMMessage, LLMTool } from '../llm/llmAdapter';

// gpt-tokenizer's encoder tables are ~1MB gzipped. This file is reachable from
// store.ts, which loads on every app boot, so a top-level `import { encode }`
// would drag that weight into the initial bundle for every session even when
// the active provider isn't OpenAI. Instead we lazy-load it once in the
// background and use a cheap heuristic until it's ready. Other call sites in
// this codebase (tokenizer.ts, ChatPanel.tsx) already do this on-demand.
type EncodeFn = (text: string) => unknown[];
let cachedEncode: EncodeFn | null = null;
let encodeLoadStarted = false;

function warmEncoder(): void {
  if (cachedEncode || encodeLoadStarted) return;
  encodeLoadStarted = true;
  import('gpt-tokenizer')
    .then((mod) => {
      cachedEncode = mod.encode as EncodeFn;
    })
    .catch(() => {
      // Leave cachedEncode null; the heuristic fallback below stays in effect.
      encodeLoadStarted = false;
    });
}

export interface ModelPricing {
  inputPricePerMillion: number;  // in USD
  outputPricePerMillion: number; // in USD
  isFree?: boolean;
}

export interface UsageRecord {
  id: string;
  timestamp: number;
  projectId?: string;
  provider: string;
  model: string;
  profileLabel?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  category: 'agent_chat' | 'ensemble_candidate_a' | 'ensemble_candidate_b' | 'bisect' | 'other';
  promptPreview?: string;
  stepCount?: number;
}

export interface ModelUsageSummary {
  model: string;
  provider: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  recordsCount: number;
}

export interface CategoryUsageSummary {
  category: UsageRecord['category'];
  label: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  recordsCount: number;
}

export interface SessionUsageSummary {
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  recordsCount: number;
  byModel: Record<string, ModelUsageSummary>;
  byCategory: Record<string, CategoryUsageSummary>;
  records: UsageRecord[];
}

/**
 * Standard public API pricing reference per 1 Million tokens (as of 2025/2026).
 * Prices are in USD.
 */
export const MODEL_PRICING_CATALOG: Record<string, ModelPricing> = {
  // Anthropic
  'claude-3-7-sonnet': { inputPricePerMillion: 3.0, outputPricePerMillion: 15.0 },
  'claude-3-7-sonnet-20250219': { inputPricePerMillion: 3.0, outputPricePerMillion: 15.0 },
  'claude-3-5-sonnet': { inputPricePerMillion: 3.0, outputPricePerMillion: 15.0 },
  'claude-3-5-sonnet-20240620': { inputPricePerMillion: 3.0, outputPricePerMillion: 15.0 },
  'claude-3-5-sonnet-20241022': { inputPricePerMillion: 3.0, outputPricePerMillion: 15.0 },
  'claude-3-5-haiku': { inputPricePerMillion: 0.8, outputPricePerMillion: 4.0 },
  'claude-3-5-haiku-20241022': { inputPricePerMillion: 0.8, outputPricePerMillion: 4.0 },
  'claude-3-opus': { inputPricePerMillion: 15.0, outputPricePerMillion: 75.0 },
  'claude-3-opus-20240229': { inputPricePerMillion: 15.0, outputPricePerMillion: 75.0 },
  'claude-3-haiku': { inputPricePerMillion: 0.25, outputPricePerMillion: 1.25 },
  'claude-3-haiku-20240307': { inputPricePerMillion: 0.25, outputPricePerMillion: 1.25 },

  // OpenAI
  'gpt-4o': { inputPricePerMillion: 2.5, outputPricePerMillion: 10.0 },
  'gpt-4o-2024-08-06': { inputPricePerMillion: 2.5, outputPricePerMillion: 10.0 },
  'gpt-4o-2024-05-13': { inputPricePerMillion: 5.0, outputPricePerMillion: 15.0 },
  'gpt-4o-2024-11-20': { inputPricePerMillion: 2.5, outputPricePerMillion: 10.0 },
  'gpt-4o-mini': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
  'gpt-4o-mini-2024-07-18': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
  'chatgpt-4o-latest': { inputPricePerMillion: 5.0, outputPricePerMillion: 15.0 },
  'gpt-4-turbo': { inputPricePerMillion: 10.0, outputPricePerMillion: 30.0 },
  'gpt-4-turbo-2024-04-09': { inputPricePerMillion: 10.0, outputPricePerMillion: 30.0 },
  'o1': { inputPricePerMillion: 15.0, outputPricePerMillion: 60.0 },
  'o1-2024-12-17': { inputPricePerMillion: 15.0, outputPricePerMillion: 60.0 },
  'o1-preview': { inputPricePerMillion: 15.0, outputPricePerMillion: 60.0 },
  'o1-mini': { inputPricePerMillion: 1.1, outputPricePerMillion: 4.4 },
  'o3': { inputPricePerMillion: 10.0, outputPricePerMillion: 40.0 },
  'o3-mini': { inputPricePerMillion: 1.1, outputPricePerMillion: 4.4 },
  'o3-mini-2025-01-31': { inputPricePerMillion: 1.1, outputPricePerMillion: 4.4 },
  'gpt-3.5-turbo': { inputPricePerMillion: 0.5, outputPricePerMillion: 1.5 },
  'gpt-3.5-turbo-0125': { inputPricePerMillion: 0.5, outputPricePerMillion: 1.5 },

  // Google Gemini
  'gemini-1.5-pro': { inputPricePerMillion: 1.25, outputPricePerMillion: 5.0 },
  'gemini-1.5-pro-latest': { inputPricePerMillion: 1.25, outputPricePerMillion: 5.0 },
  'gemini-2.0-pro': { inputPricePerMillion: 1.5, outputPricePerMillion: 6.0 },
  'gemini-2.0-pro-exp-02-05': { inputPricePerMillion: 1.5, outputPricePerMillion: 6.0 },
  'gemini-2.5-pro': { inputPricePerMillion: 1.5, outputPricePerMillion: 6.0 },
  'gemini-1.5-flash': { inputPricePerMillion: 0.075, outputPricePerMillion: 0.3 },
  'gemini-1.5-flash-latest': { inputPricePerMillion: 0.075, outputPricePerMillion: 0.3 },
  'gemini-1.5-flash-8b': { inputPricePerMillion: 0.0375, outputPricePerMillion: 0.15 },
  'gemini-2.0-flash': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.4 },
  'gemini-2.0-flash-exp': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.4 },
  'gemini-2.0-flash-lite': { inputPricePerMillion: 0.075, outputPricePerMillion: 0.3 },
  'gemini-2.0-flash-lite-preview-02-05': { inputPricePerMillion: 0.075, outputPricePerMillion: 0.3 },
  'gemini-2.5-flash': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.4 },

  // DeepSeek
  'deepseek-chat': { inputPricePerMillion: 0.14, outputPricePerMillion: 0.28 },
  'deepseek-v3': { inputPricePerMillion: 0.14, outputPricePerMillion: 0.28 },
  'deepseek-coder': { inputPricePerMillion: 0.14, outputPricePerMillion: 0.28 },
  'deepseek-reasoner': { inputPricePerMillion: 0.55, outputPricePerMillion: 2.19 },
  'deepseek-r1': { inputPricePerMillion: 0.55, outputPricePerMillion: 2.19 },

  // Meta Llama 3 (via Groq/OpenRouter/Together)
  'llama-3.3-70b-instruct': { inputPricePerMillion: 0.13, outputPricePerMillion: 0.4 },
  'llama-3.1-70b-instruct': { inputPricePerMillion: 0.13, outputPricePerMillion: 0.4 },
  'llama-3.1-8b-instruct': { inputPricePerMillion: 0.05, outputPricePerMillion: 0.08 },
  'llama-3-70b-instruct': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
  'llama-3-8b-instruct': { inputPricePerMillion: 0.05, outputPricePerMillion: 0.08 },

  // Mistral & Qwen
  'mistral-large-latest': { inputPricePerMillion: 2.0, outputPricePerMillion: 6.0 },
  'codestral-latest': { inputPricePerMillion: 0.3, outputPricePerMillion: 0.9 },
  'qwen-2.5-coder-32b-instruct': { inputPricePerMillion: 0.2, outputPricePerMillion: 0.6 },
  'qwen-2.5-72b-instruct': { inputPricePerMillion: 0.35, outputPricePerMillion: 0.4 },
};

export const DEFAULT_FALLBACK_PRICING: ModelPricing = {
  inputPricePerMillion: 1.0,
  outputPricePerMillion: 3.0
};

export const FREE_LOCAL_PRICING: ModelPricing = {
  inputPricePerMillion: 0.0,
  outputPricePerMillion: 0.0,
  isFree: true
};

/**
 * Resolves the pricing rate per million tokens for a given provider and model.
 * Detects local Ollama / LMStudio endpoints and marks them as free.
 */
export function getModelPricing(provider?: string, modelId?: string, baseUrl?: string): ModelPricing {
  const normBaseUrl = (baseUrl || '').toLowerCase();
  const isLocalHost = normBaseUrl.includes('localhost') || 
                      normBaseUrl.includes('127.0.0.1') || 
                      normBaseUrl.includes('0.0.0.0') ||
                      normBaseUrl.includes(':11434') || // Ollama
                      normBaseUrl.includes(':1234');    // LM Studio

  if (isLocalHost) {
    return FREE_LOCAL_PRICING;
  }

  if (!modelId || !modelId.trim()) {
    if (provider === 'anthropic') return { inputPricePerMillion: 3.0, outputPricePerMillion: 15.0 };
    if (provider === 'google') return { inputPricePerMillion: 0.1, outputPricePerMillion: 0.4 };
    if (provider === 'openai') return { inputPricePerMillion: 2.5, outputPricePerMillion: 10.0 };
    return DEFAULT_FALLBACK_PRICING;
  }

  const cleanId = modelId.trim().toLowerCase();

  // Exact catalog match
  if (MODEL_PRICING_CATALOG[cleanId]) {
    return MODEL_PRICING_CATALOG[cleanId];
  }

  // Handle common OpenRouter formats like "anthropic/claude-3.5-sonnet"
  const strippedVendor = cleanId.includes('/') ? cleanId.split('/').pop()! : cleanId;
  if (MODEL_PRICING_CATALOG[strippedVendor]) {
    return MODEL_PRICING_CATALOG[strippedVendor];
  }

  // Fuzzy prefix and substring matching
  if (cleanId.includes('claude-3-7-sonnet') || cleanId.includes('claude-3.7-sonnet')) {
    return { inputPricePerMillion: 3.0, outputPricePerMillion: 15.0 };
  }
  if (cleanId.includes('claude-3-5-sonnet') || cleanId.includes('claude-3.5-sonnet')) {
    return { inputPricePerMillion: 3.0, outputPricePerMillion: 15.0 };
  }
  if (cleanId.includes('claude-3-5-haiku') || cleanId.includes('claude-3.5-haiku')) {
    return { inputPricePerMillion: 0.8, outputPricePerMillion: 4.0 };
  }
  if (cleanId.includes('claude-3-opus') || cleanId.includes('claude-3.0-opus')) {
    return { inputPricePerMillion: 15.0, outputPricePerMillion: 75.0 };
  }
  if (cleanId.includes('claude-3-haiku')) {
    return { inputPricePerMillion: 0.25, outputPricePerMillion: 1.25 };
  }
  if (cleanId.includes('o1-mini') || cleanId.includes('o3-mini')) {
    return { inputPricePerMillion: 1.1, outputPricePerMillion: 4.4 };
  }
  if (cleanId.startsWith('o1') || cleanId.startsWith('o3')) {
    return { inputPricePerMillion: 15.0, outputPricePerMillion: 60.0 };
  }
  if (cleanId.includes('gpt-4o-mini')) {
    return { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 };
  }
  if (cleanId.includes('gpt-4o')) {
    return { inputPricePerMillion: 2.5, outputPricePerMillion: 10.0 };
  }
  if (cleanId.includes('gpt-4-turbo')) {
    return { inputPricePerMillion: 10.0, outputPricePerMillion: 30.0 };
  }
  if (cleanId.includes('gpt-3.5')) {
    return { inputPricePerMillion: 0.5, outputPricePerMillion: 1.5 };
  }
  if (cleanId.includes('gemini-1.5-pro') || cleanId.includes('gemini-2.0-pro') || cleanId.includes('gemini-2.5-pro')) {
    return { inputPricePerMillion: 1.25, outputPricePerMillion: 5.0 };
  }
  if (cleanId.includes('gemini-1.5-flash-8b')) {
    return { inputPricePerMillion: 0.0375, outputPricePerMillion: 0.15 };
  }
  if (cleanId.includes('gemini-1.5-flash') || cleanId.includes('gemini-2.0-flash') || cleanId.includes('gemini-2.5-flash')) {
    return { inputPricePerMillion: 0.1, outputPricePerMillion: 0.4 };
  }
  if (cleanId.includes('deepseek-reasoner') || cleanId.includes('deepseek-r1') || cleanId.includes('r1')) {
    return { inputPricePerMillion: 0.55, outputPricePerMillion: 2.19 };
  }
  if (cleanId.includes('deepseek')) {
    return { inputPricePerMillion: 0.14, outputPricePerMillion: 0.28 };
  }
  if (cleanId.includes('llama-3.3') || cleanId.includes('llama-3.1-70b') || cleanId.includes('llama-3-70b')) {
    return { inputPricePerMillion: 0.13, outputPricePerMillion: 0.4 };
  }
  if (cleanId.includes('llama-3.1-8b') || cleanId.includes('llama-3-8b')) {
    return { inputPricePerMillion: 0.05, outputPricePerMillion: 0.08 };
  }

  return DEFAULT_FALLBACK_PRICING;
}

/**
 * Calculates token count for arbitrary string using gpt-tokenizer with fallback.
 */
export function countTokensForText(text: string): number {
  if (!text) return 0;
  if (cachedEncode) {
    try {
      return cachedEncode(text).length;
    } catch (_e) {
      // fall through to heuristic
    }
  }
  warmEncoder();
  // Heuristic fallback: ~4 characters per token (used until the encoder
  // finishes its background load, or if it fails to load at all)
  return Math.ceil(text.length / 4);
}

/**
 * Calculates input and output token counts for a conversational turn or tool execution.
 */
export function countTurnTokens(
  messages: LLMMessage[],
  systemPrompt?: string,
  tools?: LLMTool[]
): { inputTokens: number; outputTokens: number; totalTokens: number } {
  let promptText = systemPrompt || '';

  if (tools && tools.length > 0) {
    promptText += '\n' + JSON.stringify(tools);
  }

  let outputText = '';

  // All messages except the last assistant response (or responses) constitute input
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    let msgText = '';

    if (typeof msg.content === 'string') {
      msgText = msg.content;
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text') {
          msgText += block.text + '\n';
        } else if (block.type === 'image') {
          // Add standard image token payload (~1600 tokens per screenshot)
          promptText += ' [image_payload_tokens_1600] ';
        }
      }
    }

    if (msg.toolCalls && msg.toolCalls.length > 0) {
      msgText += '\n' + JSON.stringify(msg.toolCalls);
    }

    if (msg.role === 'assistant') {
      outputText += `${msgText}\n`;
    } else {
      promptText += `${msg.role}: ${msgText}\n`;
    }
  }

  const inputTokens = countTokensForText(promptText);
  const outputTokens = countTokensForText(outputText);

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens
  };
}

/**
 * Calculates estimated USD cost from token counts and model pricing.
 */
export function calculateEstimatedCost(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing
): number {
  if (pricing.isFree) return 0;
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPricePerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPricePerMillion;
  return inputCost + outputCost;
}

/**
 * Formats a USD cost into readable string.
 */
export function formatUsdCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.0001) return '< $0.0001';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1.0) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Formats token count with human-readable suffix (k, M).
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    const formatted = Number(m.toFixed(2));
    return `${formatted}M`;
  }
  if (tokens >= 1_000) {
    const k = tokens / 1_000;
    const formatted = Number(k.toFixed(1));
    return `${formatted}k`;
  }
  return tokens.toLocaleString();
}

/**
 * Computes an aggregated session usage summary from a list of usage records.
 */
export function computeSessionUsageSummary(records: UsageRecord[]): SessionUsageSummary {
  let totalTokens = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;

  const byModel: Record<string, ModelUsageSummary> = {};
  const byCategory: Record<string, CategoryUsageSummary> = {
    agent_chat: {
      category: 'agent_chat',
      label: 'Agent Chat (Single)',
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      recordsCount: 0
    },
    ensemble_candidate_a: {
      category: 'ensemble_candidate_a',
      label: 'Ensemble Candidate A',
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      recordsCount: 0
    },
    ensemble_candidate_b: {
      category: 'ensemble_candidate_b',
      label: 'Ensemble Candidate B',
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      recordsCount: 0
    },
    bisect: {
      category: 'bisect',
      label: 'Bisect Debugger',
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      recordsCount: 0
    },
    other: {
      category: 'other',
      label: 'Other Runs',
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      recordsCount: 0
    }
  };

  for (const r of records) {
    totalTokens += r.totalTokens;
    totalInputTokens += r.inputTokens;
    totalOutputTokens += r.outputTokens;
    totalCostUsd += r.estimatedCostUsd;

    // By Model
    const modelKey = `${r.provider}:${r.model}`;
    if (!byModel[modelKey]) {
      byModel[modelKey] = {
        model: r.model,
        provider: r.provider,
        tokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        recordsCount: 0
      };
    }
    byModel[modelKey].tokens += r.totalTokens;
    byModel[modelKey].inputTokens += r.inputTokens;
    byModel[modelKey].outputTokens += r.outputTokens;
    byModel[modelKey].costUsd += r.estimatedCostUsd;
    byModel[modelKey].recordsCount += 1;

    // By Category
    const cat = r.category || 'other';
    if (!byCategory[cat]) {
      byCategory[cat] = {
        category: cat,
        label: cat,
        tokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        recordsCount: 0
      };
    }
    byCategory[cat].tokens += r.totalTokens;
    byCategory[cat].inputTokens += r.inputTokens;
    byCategory[cat].outputTokens += r.outputTokens;
    byCategory[cat].costUsd += r.estimatedCostUsd;
    byCategory[cat].recordsCount += 1;
  }

  return {
    totalTokens,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd,
    recordsCount: records.length,
    byModel,
    byCategory,
    records
  };
}

export const USAGE_STORAGE_KEY = 'laide_session_usage_records';

export function loadStoredUsageRecords(): UsageRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(USAGE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredUsageRecords(records: UsageRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    // Keep at most 200 most recent records to prevent storage bloat
    const trimmed = records.slice(-200);
    localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('Failed to save usage records to localStorage:', e);
  }
}
