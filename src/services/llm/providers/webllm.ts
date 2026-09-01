import type { 
  LLMAdapter, 
  LLMRequest, 
  LLMResponse, 
  LLMStreamYield, 
  LLMUsage,
  LLMToolCall 
} from '../llmAdapter';

export interface OfflineModelInfo {
  id: string;
  name: string;
  downloadSize: string;
  vramRequired: string;
  description: string;
  contextWindow: number;
  recommended?: boolean;
}

export const OFFLINE_MODELS: OfflineModelInfo[] = [
  {
    id: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 Coder 1.5B (q4f16_1)',
    downloadSize: '~1.1 GB',
    vramRequired: '~1.4 GB VRAM',
    description: 'Recommended: Best balance of code reasoning, patch generation, and tool adherence in a compact size.',
    contextWindow: 32768,
    recommended: true
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 1B Instruct (q4f16_1)',
    downloadSize: '~880 MB',
    vramRequired: '~1.1 GB VRAM',
    description: 'Fast, lightweight general instruction model with low latency and low memory footprint.',
    contextWindow: 16384
  },
  {
    id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 1.7B Instruct (q4f16_1)',
    downloadSize: '~1.0 GB',
    vramRequired: '~1.3 GB VRAM',
    description: 'Strong reasoning in a compact parameter size, suitable for conversational edits.',
    contextWindow: 8192
  },
  {
    id: 'Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 Coder 0.5B (q4f16_1)',
    downloadSize: '~450 MB',
    vramRequired: '~700 MB VRAM',
    description: 'Ultra-compact model for memory-constrained devices. Lower reasoning capability.',
    contextWindow: 16384
  }
];

export const DEFAULT_OFFLINE_MODEL = 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC';

export interface WebGPUSupportResult {
  supported: boolean;
  reason?: string;
  adapterInfo?: {
    vendor?: string;
    architecture?: string;
    description?: string;
  };
}

/**
 * Checks whether WebGPU is available and can request an adapter on the current system.
 */
export async function checkWebGPUSupport(): Promise<WebGPUSupportResult> {
  const nav = typeof navigator !== 'undefined' 
    ? (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } })
    : (typeof globalThis !== 'undefined' ? (globalThis as unknown as { navigator?: { gpu?: { requestAdapter: () => Promise<unknown> } } }).navigator : undefined);

  if (!nav || !('gpu' in nav) || !nav.gpu) {
    return {
      supported: false,
      reason: 'WebGPU is not supported by your browser. Please use Chrome 113+, Edge 113+, Safari 18+, or Firefox Nightly with WebGPU enabled.'
    };
  }

  try {
    const adapter = (await nav.gpu.requestAdapter()) as {
      vendor?: string;
      architecture?: string;
      requestAdapterInfo?: () => Promise<{ vendor?: string; architecture?: string; description?: string; device?: string }>;
    } | null;

    if (!adapter) {
      return {
        supported: false,
        reason: 'WebGPU adapter could not be initialized. Hardware acceleration or compatible GPU driver is missing.'
      };
    }

    let info: { vendor?: string; architecture?: string; description?: string; device?: string } = {};
    if (typeof adapter.requestAdapterInfo === 'function') {
      try {
        info = await adapter.requestAdapterInfo();
      } catch {
        // Fallback info
      }
    }

    return {
      supported: true,
      adapterInfo: {
        vendor: info.vendor || adapter.vendor,
        architecture: info.architecture || adapter.architecture,
        description: info.description || info.device
      }
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      supported: false,
      reason: `WebGPU initialization failed: ${errorMsg}`
    };
  }
}

export type ModelProgressCallback = (progress: {
  progress: number;
  text: string;
  timeElapsed?: number;
}) => void;

// Singleton engine instance state
interface EngineState {
  engine: unknown | null;
  loadedModelId: string | null;
  status: 'unloaded' | 'downloading' | 'loading' | 'ready' | 'error';
  progress: number;
  progressText: string;
  error: string | null;
}

const engineState: EngineState = {
  engine: null,
  loadedModelId: null,
  status: 'unloaded',
  progress: 0,
  progressText: '',
  error: null
};

const progressListeners = new Set<ModelProgressCallback>();

export function getEngineState(): Readonly<EngineState> {
  return { ...engineState };
}

export function subscribeToEngineProgress(callback: ModelProgressCallback): () => void {
  progressListeners.add(callback);
  return () => {
    progressListeners.delete(callback);
  };
}

function notifyProgress(progress: number, text: string, timeElapsed?: number) {
  engineState.progress = progress;
  engineState.progressText = text;
  for (const listener of progressListeners) {
    try {
      listener({ progress, text, timeElapsed });
    } catch {
      // Ignore listener errors
    }
  }
}

/**
 * Checks if the model weights are stored in the browser's Cache API / OPFS.
 */
export async function isModelCachedInBrowser(modelId: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return false;
  }

  try {
    const webllm = await import('@mlc-ai/web-llm');
    if (typeof webllm.hasModelInCache === 'function') {
      return await webllm.hasModelInCache(modelId);
    }
  } catch {
    // Fallback manual check in CacheStorage
    try {
      const keys = await caches.keys();
      const hasWasm = keys.some(k => k.includes('webllm/wasm') || k.includes('webllm_wasm'));
      const hasModel = keys.some(k => k.includes(modelId) || k.includes('webllm/model'));
      return hasWasm && hasModel;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Purges cached model weights from Cache API.
 */
export async function deleteCachedModel(modelId: string): Promise<boolean> {
  try {
    const webllm = await import('@mlc-ai/web-llm');
    if (typeof webllm.deleteModelAllInfoInCache === 'function') {
      await webllm.deleteModelAllInfoInCache(modelId);
    }
  } catch {
    // Fallback: delete caches matching modelId
    if (typeof window !== 'undefined' && 'caches' in window) {
      const keys = await caches.keys();
      for (const key of keys) {
        if (key.includes(modelId)) {
          await caches.delete(key);
        }
      }
    }
  }

  if (engineState.loadedModelId === modelId) {
    engineState.engine = null;
    engineState.loadedModelId = null;
    engineState.status = 'unloaded';
  }

  return true;
}

export const deleteCachedOfflineModel = deleteCachedModel;

export interface MLCEngineLike {
  chat: {
    completions: {
      create: (params: unknown) => Promise<unknown>;
    };
  };
  unload?: () => Promise<void>;
  interruptGenerate?: () => void;
}

/**
 * Explicitly initializes and loads a WebLLM model into memory.
 * Never called automatically on page load.
 */
export async function loadOfflineModel(
  modelId: string = DEFAULT_OFFLINE_MODEL,
  onProgress?: ModelProgressCallback
): Promise<MLCEngineLike> {
  // If already ready with the requested model, return existing engine
  if (engineState.engine && engineState.loadedModelId === modelId && engineState.status === 'ready') {
    return engineState.engine as MLCEngineLike;
  }

  const gpuCheck = await checkWebGPUSupport();
  if (!gpuCheck.supported) {
    const err = gpuCheck.reason || 'WebGPU is not supported on this device/browser.';
    engineState.status = 'error';
    engineState.error = err;
    throw new Error(err);
  }

  engineState.status = 'downloading';
  engineState.error = null;
  engineState.progress = 0;
  engineState.progressText = 'Initializing WebGPU engine...';
  notifyProgress(0, 'Initializing WebGPU engine...');

  try {
    const webllm = await import('@mlc-ai/web-llm');

    const initProgressCallback = (report: { progress: number; text: string; timeElapsed?: number }) => {
      engineState.status = report.progress >= 1 ? 'loading' : 'downloading';
      notifyProgress(report.progress, report.text, report.timeElapsed);
      onProgress?.(report);
    };

    const engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback
    });

    engineState.engine = engine;
    engineState.loadedModelId = modelId;
    engineState.status = 'ready';
    engineState.progress = 1;
    engineState.progressText = 'Model loaded and ready for offline inference.';
    notifyProgress(1, 'Model loaded and ready for offline inference.');

    return engine as MLCEngineLike;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    engineState.status = 'error';
    engineState.error = errorMsg;
    notifyProgress(0, `Failed to load model: ${errorMsg}`);
    throw new Error(`Failed to load offline WebLLM model "${modelId}": ${errorMsg}`);
  }
}

/**
 * Unloads the active offline model from GPU VRAM.
 */
export async function unloadOfflineModel(): Promise<void> {
  if (engineState.engine) {
    try {
      const engine = engineState.engine as MLCEngineLike;
      if (typeof engine.unload === 'function') {
        await engine.unload();
      }
    } catch {
      // Ignore unload errors
    }
  }
  engineState.engine = null;
  engineState.loadedModelId = null;
  engineState.status = 'unloaded';
  engineState.progress = 0;
  engineState.progressText = '';
  engineState.error = null;
}

/**
 * Helper to extract any JSON-formatted tool calls in case small models
 * output JSON code blocks instead of structured function calling responses.
 */
function extractToolCallsFromText(text: string): LLMToolCall[] {
  const toolCalls: LLMToolCall[] = [];
  if (!text) return toolCalls;

  // Check for ```json { "tool": "...", "parameters": { ... } } ```
  const jsonCodeBlockRegex = /```(?:json)?\s*(\{\s*"tool"[\s\S]*?\})\s*```/g;
  let match;
  while ((match = jsonCodeBlockRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.tool) {
        toolCalls.push({
          id: `call_${Math.random().toString(36).slice(2, 9)}`,
          name: parsed.tool,
          args: typeof parsed.parameters === 'string' ? parsed.parameters : JSON.stringify(parsed.parameters || {})
        });
      }
    } catch {
      // Ignore parse failure
    }
  }

  // Check for XML <tool_call><name>...</name><arguments>...</arguments></tool_call>
  const xmlToolRegex = /<tool_call>[\s\S]*?<name>([\w_]+)<\/name>[\s\S]*?<arguments>([\s\S]*?)<\/arguments>[\s\S]*?<\/tool_call>/g;
  while ((match = xmlToolRegex.exec(text)) !== null) {
    toolCalls.push({
      id: `call_${Math.random().toString(36).slice(2, 9)}`,
      name: match[1].trim(),
      args: match[2].trim()
    });
  }

  return toolCalls;
}

/**
 * WebLLM Offline Model Provider Adapter conforming to LLMAdapter.
 */
export class WebLLMProvider implements LLMAdapter {
  private model: string;
  private customEngine?: MLCEngineLike;

  constructor(model: string = DEFAULT_OFFLINE_MODEL, customEngine?: MLCEngineLike) {
    this.model = model || DEFAULT_OFFLINE_MODEL;
    this.customEngine = customEngine;
  }

  private async getOrInitEngine(): Promise<MLCEngineLike> {
    if (this.customEngine) {
      return this.customEngine;
    }

    if (engineState.engine && engineState.loadedModelId === this.model && engineState.status === 'ready') {
      return engineState.engine as MLCEngineLike;
    }

    // If model is not loaded yet, require explicit loading to avoid surprise downloads
    throw new Error(
      `Offline model "${this.model}" is not loaded into memory yet. ` +
      `Please load or download the model weights (requires WebGPU) before running inference.`
    );
  }

  private formatMessages(req: LLMRequest): Array<{ role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string }> {
    const formatted: Array<{ role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string }> = [];

    if (req.systemPrompt) {
      formatted.push({ role: 'system', content: req.systemPrompt });
    }

    for (const m of req.messages) {
      let textContent = '';
      if (typeof m.content === 'string') {
        textContent = m.content;
      } else if (Array.isArray(m.content)) {
        textContent = m.content
          .filter(b => b.type === 'text')
          .map(b => (b as { text: string }).text)
          .join('\n');
      }

      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        formatted.push({
          role: 'assistant',
          content: textContent || '',
          tool_calls: m.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: tc.args
            }
          }))
        });
      } else if (m.role === 'tool') {
        formatted.push({
          role: 'tool',
          content: textContent,
          tool_call_id: m.toolCallId
        });
      } else {
        formatted.push({
          role: m.role,
          content: textContent
        });
      }
    }

    return formatted;
  }

  async countTokens(req: LLMRequest): Promise<number> {
    // Fast estimation for offline context management (approx 4 chars per token)
    let charCount = req.systemPrompt?.length || 0;
    for (const m of req.messages) {
      if (typeof m.content === 'string') {
        charCount += m.content.length;
      } else if (Array.isArray(m.content)) {
        for (const b of m.content) {
          if (b.type === 'text') charCount += b.text.length;
        }
      }
    }
    return Math.ceil(charCount / 4);
  }

  async send(req: LLMRequest): Promise<LLMResponse> {
    const engine = await this.getOrInitEngine();
    const messages = this.formatMessages(req);
    const tools = req.tools?.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));

    const chatParams: Record<string, unknown> = {
      messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 2048,
      stream: false
    };

    if (tools && tools.length > 0) {
      chatParams.tools = tools;
    }

    const response = (await engine.chat.completions.create(chatParams)) as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
      };
    };

    const choice = response.choices?.[0];
    let text = choice?.message?.content || '';
    let toolCalls: LLMToolCall[] | undefined;

    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
      toolCalls = choice.message.tool_calls.map((tc, idx) => ({
        id: tc.id || `call_${idx}_${Math.random().toString(36).slice(2, 7)}`,
        name: tc.function?.name || '',
        args: tc.function?.arguments || ''
      }));
    } else {
      // Fallback text parsing for smaller models that format JSON tool calls in body
      const extracted = extractToolCallsFromText(text);
      if (extracted.length > 0) {
        toolCalls = extracted;
      }
    }

    const usage: LLMUsage = {
      inputTokens: response.usage?.prompt_tokens || Math.ceil(JSON.stringify(messages).length / 4),
      outputTokens: response.usage?.completion_tokens || Math.ceil(text.length / 4)
    };

    return { text, toolCalls, usage };
  }

  async *stream(req: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown> {
    const engine = await this.getOrInitEngine();
    const messages = this.formatMessages(req);
    const tools = req.tools?.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));

    const chatParams: Record<string, unknown> = {
      messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 2048,
      stream: true
    };

    if (tools && tools.length > 0) {
      chatParams.tools = tools;
    }

    const streamResponse = (await engine.chat.completions.create(chatParams)) as AsyncIterable<{
      choices?: Array<{
        delta?: {
          content?: string;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
      };
    }>;

    let totalText = '';
    const activeToolCalls: Record<number, LLMToolCall> = {};
    const usage: LLMUsage = {
      inputTokens: Math.ceil(JSON.stringify(messages).length / 4),
      outputTokens: 0
    };

    // Handle abort signal
    let isAborted = false;
    const abortHandler = () => {
      isAborted = true;
      if (typeof engine.interruptGenerate === 'function') {
        engine.interruptGenerate();
      }
    };

    if (req.signal) {
      req.signal.addEventListener('abort', abortHandler, { once: true });
    }

    try {
      for await (const chunk of streamResponse) {
        if (isAborted || req.signal?.aborted) {
          break;
        }

        if (chunk.usage) {
          usage.inputTokens = chunk.usage.prompt_tokens || usage.inputTokens;
          usage.outputTokens = chunk.usage.completion_tokens || usage.outputTokens;
        }

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        if (choice.delta?.content) {
          totalText += choice.delta.content;
          yield { type: 'text', text: choice.delta.content };
        }

        if (choice.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (tc.id) {
              if (activeToolCalls[idx]) {
                yield { type: 'tool_call', toolCall: { ...activeToolCalls[idx] } };
              }
              activeToolCalls[idx] = {
                id: tc.id,
                name: tc.function?.name || '',
                args: tc.function?.arguments || ''
              };
            } else if (tc.function?.arguments) {
              if (activeToolCalls[idx]) {
                activeToolCalls[idx].args += tc.function.arguments;
              }
            }
          }
        }

        if (choice.finish_reason === 'tool_calls') {
          for (const idx in activeToolCalls) {
            yield { type: 'tool_call', toolCall: { ...activeToolCalls[idx] } };
            delete activeToolCalls[idx];
          }
        }
      }

      // Flush remaining structured tool calls
      for (const idx in activeToolCalls) {
        yield { type: 'tool_call', toolCall: { ...activeToolCalls[idx] } };
      }

      // Fallback text parsing if no structured tool calls were emitted during stream
      if (Object.keys(activeToolCalls).length === 0) {
        const extracted = extractToolCallsFromText(totalText);
        for (const tc of extracted) {
          yield { type: 'tool_call', toolCall: tc };
        }
      }

      if (usage.outputTokens === 0) {
        usage.outputTokens = Math.ceil(totalText.length / 4);
      }

      yield { type: 'usage', usage };
    } finally {
      if (req.signal) {
        req.signal.removeEventListener('abort', abortHandler);
      }
    }
  }
}
