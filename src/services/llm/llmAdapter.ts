import { isRateLimitError } from './friendlyError';

export type LLMImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export type LLMContentBlock =
  | { type: 'text'; text: string; cacheable?: boolean }
  | { type: 'image'; mediaType: LLMImageMediaType | string; data: string; cacheable?: boolean };

export type LLMContentPart = LLMContentBlock;

export interface LLMMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string | LLMContentBlock[];
  cacheable?: boolean;
  toolCalls?: LLMToolCall[]; // Present if role is 'assistant' and model called tools
  toolCallId?: string; // Present if role is 'tool'
  toolName?: string; // Present if role is 'tool' (Google needs it)
  model?: string; // Model or profile name associated with assistant message
}

export interface LLMTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
}

export interface LLMRequest {
  messages: LLMMessage[];
  systemPrompt?: string;
  systemPromptCacheable?: boolean;
  tools?: LLMTool[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
}

export interface LLMToolCall {
  id: string;
  name: string;
  args: string;
}

export interface LLMResponse {
  text: string;
  toolCalls?: LLMToolCall[];
  usage: LLMUsage;
}

export type LLMStreamYield = 
  | { type: 'text'; text: string }
  | { type: 'tool_call'; toolCall: LLMToolCall }
  | { type: 'usage'; usage: LLMUsage };

export interface LLMAdapter {
  send(request: LLMRequest): Promise<LLMResponse>;
  stream(request: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown>;
  countTokens(request: LLMRequest): Promise<number>;
}

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  retryIf?: (error: unknown) => boolean;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export async function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted', 'AbortError');
  }
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onAbort = () => {
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(new DOMException('The operation was aborted', 'AbortError'));
    };

    timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export function calculateBackoffDelay(
  attempt: number,
  options?: Pick<RetryOptions, 'initialDelayMs' | 'maxDelayMs' | 'jitter'>
): number {
  const initialDelay = options?.initialDelayMs ?? 500;
  const maxDelay = options?.maxDelayMs ?? 5000;
  const useJitter = options?.jitter ?? true;

  // Exponential backoff: initialDelay * 2^(attempt - 1)
  const base = Math.min(initialDelay * Math.pow(2, Math.max(0, attempt - 1)), maxDelay);
  const jitterAmount = useJitter ? Math.random() * (base * 0.25) : 0;
  return Math.round(base + jitterAmount);
}

/**
 * Shared retry helper with exponential backoff + jitter (max 3 attempts by default).
 * Only retries transient rate-limit (429 / resource exhausted) errors.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
  signal?: AbortSignal
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const retryIf = options?.retryIf ?? isRateLimitError;
  const sleepFn = options?.sleep ?? defaultSleep;

  let attempt = 0;
  while (true) {
    attempt++;
    try {
      if (signal?.aborted) {
        throw new DOMException('The operation was aborted', 'AbortError');
      }
      return await fn();
    } catch (error) {
      if (signal?.aborted || attempt >= maxAttempts || !retryIf(error)) {
        throw error;
      }
      const delay = calculateBackoffDelay(attempt, options);
      await sleepFn(delay, signal);
    }
  }
}

/**
 * Wraps an LLMAdapter with automatic exponential backoff retry for transient rate limits.
 * For streams, retry is applied strictly to the initial connection/request before chunks are emitted.
 */
export function withRetry<T extends LLMAdapter>(
  adapter: T,
  options?: RetryOptions
): T {
  const maxAttempts = options?.maxAttempts ?? 3;
  const retryIf = options?.retryIf ?? isRateLimitError;
  const sleepFn = options?.sleep ?? defaultSleep;

  const wrappedSend = (request: LLMRequest): Promise<LLMResponse> => {
    return retryWithBackoff(() => adapter.send(request), options, request.signal);
  };

  const wrappedCountTokens = (request: LLMRequest): Promise<number> => {
    return retryWithBackoff(() => adapter.countTokens(request), options, request.signal);
  };

  const wrappedStream = async function* (
    request: LLMRequest
  ): AsyncGenerator<LLMStreamYield, void, unknown> {
    let attempt = 0;
    let currentGen: AsyncGenerator<LLMStreamYield, void, unknown> | undefined;
    let firstItem: IteratorResult<LLMStreamYield, void> | undefined;

    // Retry only around the initial request/connection before yielding any chunk
    while (true) {
      attempt++;
      try {
        if (request.signal?.aborted) {
          throw new DOMException('The operation was aborted', 'AbortError');
        }
        currentGen = adapter.stream(request);
        firstItem = await currentGen.next();
        break;
      } catch (error) {
        if (request.signal?.aborted || attempt >= maxAttempts || !retryIf(error)) {
          throw error;
        }
        const delay = calculateBackoffDelay(attempt, options);
        await sleepFn(delay, request.signal);
      }
    }

    if (!firstItem || !currentGen) {
      return;
    }

    if (firstItem.done) {
      return;
    }

    // Emit first yielded item
    yield firstItem.value;

    // Subsequent stream chunks are yielded directly WITHOUT retry
    for await (const chunk of currentGen) {
      yield chunk;
    }
  };

  return new Proxy(adapter, {
    get(target, prop, receiver) {
      if (prop === 'send') return wrappedSend;
      if (prop === 'stream') return wrappedStream;
      if (prop === 'countTokens') return wrappedCountTokens;
      return Reflect.get(target, prop, receiver);
    }
  });
}


