import { describe, it, expect, vi } from 'vitest';
import {
  LLMAdapter,
  LLMRequest,
  LLMResponse,
  LLMStreamYield,
  withRetry,
  retryWithBackoff,
  calculateBackoffDelay
} from './llmAdapter';
import { isRateLimitError } from './friendlyError';

describe('isRateLimitError', () => {
  it('identifies 429 and rate limit error strings as retryable', () => {
    expect(isRateLimitError('Anthropic request failed: 429 rate_limit_exceeded')).toBe(true);
    expect(isRateLimitError('Google stream failed: 429 Too Many Requests')).toBe(true);
    expect(isRateLimitError('ResourceExhausted: Quota exceeded for aiplatform.googleapis.com')).toBe(true);
    expect(isRateLimitError('429 - {"error":{"message":"You exceeded your current quota"}}')).toBe(true);
    expect(isRateLimitError({ status: 429, message: 'Too Many Requests' })).toBe(true);
    expect(isRateLimitError({ statusCode: 429 })).toBe(true);
    expect(isRateLimitError({ code: 'RESOURCE_EXHAUSTED' })).toBe(true);
  });

  it('identifies non-transient errors (401, 403, 404, etc.) as non-retryable', () => {
    expect(isRateLimitError('Anthropic request failed: 401 - invalid x-api-key')).toBe(false);
    expect(isRateLimitError('401 Unauthorized - API key not valid')).toBe(false);
    expect(isRateLimitError('403 Forbidden - PermissionDenied')).toBe(false);
    expect(isRateLimitError('404 NOT_FOUND - model does not exist')).toBe(false);
    expect(isRateLimitError('TypeError: Cannot read properties of undefined')).toBe(false);
    expect(isRateLimitError({ status: 401, message: 'Unauthorized' })).toBe(false);
  });
});

describe('calculateBackoffDelay', () => {
  it('calculates exponential backoff with jitter within expected bounds', () => {
    const delay1 = calculateBackoffDelay(1, { initialDelayMs: 100, maxDelayMs: 1000, jitter: false });
    expect(delay1).toBe(100);

    const delay2 = calculateBackoffDelay(2, { initialDelayMs: 100, maxDelayMs: 1000, jitter: false });
    expect(delay2).toBe(200);

    const delay3 = calculateBackoffDelay(3, { initialDelayMs: 100, maxDelayMs: 1000, jitter: false });
    expect(delay3).toBe(400);

    const delayJitter = calculateBackoffDelay(1, { initialDelayMs: 100, maxDelayMs: 1000, jitter: true });
    expect(delayJitter).toBeGreaterThanOrEqual(100);
    expect(delayJitter).toBeLessThanOrEqual(130);
  });
});

describe('retryWithBackoff & withRetry for send()', () => {
  it('retries on 429 rate-limit error and ultimately succeeds', async () => {
    const mockSend = vi.fn();
    const sleepCalls: number[] = [];
    const mockSleep = vi.fn(async (ms: number) => {
      sleepCalls.push(ms);
    });

    // Attempt 1: 429 error, Attempt 2: 429 error, Attempt 3: success
    mockSend
      .mockRejectedValueOnce(new Error('Google request failed: 429 Too Many Requests'))
      .mockRejectedValueOnce(new Error('OpenAI request failed: 429 rate limit exceeded'))
      .mockResolvedValueOnce({
        text: 'Hello from LLM',
        usage: { inputTokens: 10, outputTokens: 5 }
      } as LLMResponse);

    const mockAdapter: LLMAdapter = {
      send: mockSend,
      stream: vi.fn(),
      countTokens: vi.fn()
    };

    const adapter = withRetry(mockAdapter, {
      initialDelayMs: 100,
      jitter: false,
      sleep: mockSleep
    });

    const request: LLMRequest = {
      messages: [{ role: 'user', content: 'Hi' }]
    };

    const res = await adapter.send(request);

    expect(res.text).toBe('Hello from LLM');
    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(mockSleep).toHaveBeenCalledTimes(2);
    expect(sleepCalls).toEqual([100, 200]);
  });

  it('does NOT retry on terminal / non-transient error (e.g. 401 Unauthorized)', async () => {
    const mockSend = vi.fn();
    const mockSleep = vi.fn();

    mockSend.mockRejectedValueOnce(new Error('Anthropic request failed: 401 - invalid x-api-key'));

    const mockAdapter: LLMAdapter = {
      send: mockSend,
      stream: vi.fn(),
      countTokens: vi.fn()
    };

    const adapter = withRetry(mockAdapter, {
      initialDelayMs: 100,
      sleep: mockSleep
    });

    const request: LLMRequest = {
      messages: [{ role: 'user', content: 'Hi' }]
    };

    await expect(adapter.send(request)).rejects.toThrow('Anthropic request failed: 401 - invalid x-api-key');
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSleep).not.toHaveBeenCalled();
  });

  it('exhausts maximum attempts (3) when persistent 429 occurs and throws', async () => {
    const mockSend = vi.fn();
    const mockSleep = vi.fn();

    mockSend.mockRejectedValue(new Error('Rate limit exceeded: 429 Too Many Requests'));

    const mockAdapter: LLMAdapter = {
      send: mockSend,
      stream: vi.fn(),
      countTokens: vi.fn()
    };

    const adapter = withRetry(mockAdapter, {
      maxAttempts: 3,
      initialDelayMs: 50,
      jitter: false,
      sleep: mockSleep
    });

    const request: LLMRequest = {
      messages: [{ role: 'user', content: 'Hi' }]
    };

    await expect(adapter.send(request)).rejects.toThrow('Rate limit exceeded: 429 Too Many Requests');
    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(mockSleep).toHaveBeenCalledTimes(2);
  });

  it('directly retries a function with retryWithBackoff', async () => {
    let calls = 0;
    const mockSleep = vi.fn();
    const result = await retryWithBackoff(
      async () => {
        calls++;
        if (calls === 1) throw new Error('429 too many requests');
        return 'success';
      },
      { sleep: mockSleep }
    );
    expect(result).toBe('success');
    expect(calls).toBe(2);
    expect(mockSleep).toHaveBeenCalledTimes(1);
  });
});

describe('withRetry for stream()', () => {
  it('retries initial stream connection failure on 429 then successfully streams chunks', async () => {
    const mockSleep = vi.fn();
    let streamCallCount = 0;

    const mockAdapter: LLMAdapter = {
      send: vi.fn(),
      async *stream(_req: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown> {
        streamCallCount++;
        if (streamCallCount === 1) {
          throw new Error('Google stream failed: 429 ResourceExhausted');
        }
        yield { type: 'text', text: 'Chunk 1' };
        yield { type: 'text', text: 'Chunk 2' };
        yield { type: 'usage', usage: { inputTokens: 5, outputTokens: 10 } };
      },
      countTokens: vi.fn()
    };

    const adapter = withRetry(mockAdapter, {
      initialDelayMs: 100,
      jitter: false,
      sleep: mockSleep
    });

    const yields: LLMStreamYield[] = [];
    for await (const chunk of adapter.stream({ messages: [{ role: 'user', content: 'Stream test' }] })) {
      yields.push(chunk);
    }

    expect(streamCallCount).toBe(2);
    expect(mockSleep).toHaveBeenCalledTimes(1);
    expect(yields).toEqual([
      { type: 'text', text: 'Chunk 1' },
      { type: 'text', text: 'Chunk 2' },
      { type: 'usage', usage: { inputTokens: 5, outputTokens: 10 } }
    ]);
  });

  it('does NOT retry initial stream connection on 401 error', async () => {
    const mockSleep = vi.fn();
    let streamCallCount = 0;

    const mockAdapter: LLMAdapter = {
      send: vi.fn(),
      async *stream(_req: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown> {
        streamCallCount++;
        if (streamCallCount > 0) {
          throw new Error('401 Unauthorized');
        }
        yield { type: 'text', text: '' };
      },
      countTokens: vi.fn()
    };

    const adapter = withRetry(mockAdapter, {
      sleep: mockSleep
    });

    const stream = adapter.stream({ messages: [{ role: 'user', content: 'Test' }] });
    await expect(async () => {
      for await (const _ of stream) {
        // consume
      }
    }).rejects.toThrow('401 Unauthorized');

    expect(streamCallCount).toBe(1);
    expect(mockSleep).not.toHaveBeenCalled();
  });

  it('does NOT retry mid-stream after chunks have already started emitting', async () => {
    const mockSleep = vi.fn();
    let streamCallCount = 0;

    const mockAdapter: LLMAdapter = {
      send: vi.fn(),
      async *stream(_req: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown> {
        streamCallCount++;
        yield { type: 'text', text: 'Initial chunk emitted to UI' };
        // Midway network/rate limit error
        throw new Error('Anthropic stream failed: 429 rate_limit_exceeded');
      },
      countTokens: vi.fn()
    };

    const adapter = withRetry(mockAdapter, {
      sleep: mockSleep
    });

    const yieldedChunks: LLMStreamYield[] = [];
    const stream = adapter.stream({ messages: [{ role: 'user', content: 'Test' }] });

    await expect(async () => {
      for await (const chunk of stream) {
        yieldedChunks.push(chunk);
      }
    }).rejects.toThrow('Anthropic stream failed: 429 rate_limit_exceeded');

    // First chunk was received by the UI
    expect(yieldedChunks).toEqual([
      { type: 'text', text: 'Initial chunk emitted to UI' }
    ]);
    // It should NOT have attempted to restart the stream
    expect(streamCallCount).toBe(1);
    expect(mockSleep).not.toHaveBeenCalled();
  });
});
