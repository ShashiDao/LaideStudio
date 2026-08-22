import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleProvider } from './openaiCompatible';
import type { LLMRequest } from '../llmAdapter';

function createMockReadableStream(chunks: string[], errorAfterIndex?: number) {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (errorAfterIndex !== undefined && index >= errorAfterIndex) {
        controller.error(new Error('Simulated OpenAI mid-stream network disconnect'));
        return;
      }
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    }
  });
}

describe('OpenAICompatibleProvider', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const provider = new OpenAICompatibleProvider('https://api.openai.com/v1', 'test-openai-key', 'gpt-4o');
  const baseReq: LLMRequest = {
    messages: [{ role: 'user', content: 'Hello OpenAI' }]
  };

  it('send(): handles normal text response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { role: 'assistant', content: 'Hello there! How may I help?' },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 6 }
      })
    });

    const res = await provider.send(baseReq);
    expect(res.text).toBe('Hello there! How may I help?');
    expect(res.toolCalls).toBeUndefined();
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 6 });
  });

  it('send(): handles tool_calls response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_999',
                  type: 'function',
                  function: {
                    name: 'write_file',
                    arguments: '{"path":"/src/main.ts","newContent":"console.log(1)"}'
                  }
                }
              ]
            }
          }
        ],
        usage: { prompt_tokens: 25, completion_tokens: 15 }
      })
    });

    const res = await provider.send(baseReq);
    expect(res.text).toBe('');
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls?.[0]).toEqual({
      id: 'call_999',
      name: 'write_file',
      args: '{"path":"/src/main.ts","newContent":"console.log(1)"}'
    });
  });

  it('stream(): yields normal text chunks and usage info', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Hi "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"user!"}}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":8,"completion_tokens":4}}\n\n',
      'data: [DONE]\n\n'
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream(sseChunks)
    });

    const yields = [];
    for await (const y of provider.stream(baseReq)) {
      yields.push(y);
    }

    expect(yields).toEqual([
      { type: 'text', text: 'Hi ' },
      { type: 'text', text: 'user!' },
      { type: 'usage', usage: { inputTokens: 8, outputTokens: 4 } }
    ]);
  });

  it('stream(): streams and assembles tool_calls correctly', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_oa_1","function":{"name":"search_code","arguments":""}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"query\\": "}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"test\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":15,"completion_tokens":10}}\n\n',
      'data: [DONE]\n\n'
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream(sseChunks)
    });

    const yields = [];
    for await (const y of provider.stream(baseReq)) {
      yields.push(y);
    }

    expect(yields).toHaveLength(2);
    expect(yields[0]).toEqual({
      type: 'tool_call',
      toolCall: {
        id: 'call_oa_1',
        name: 'search_code',
        args: '{"query": "test"}'
      }
    });
    expect(yields[1]).toEqual({
      type: 'usage',
      usage: { inputTokens: 15, outputTokens: 10 }
    });
  });

  it('stream(): throws error on mid-stream connection loss', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Starting..."}}]}\n\n'
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream(sseChunks, 1)
    });

    const stream = provider.stream(baseReq);
    const first = await stream.next();
    expect(first.value).toEqual({ type: 'text', text: 'Starting...' });

    await expect(stream.next()).rejects.toThrow('Simulated OpenAI mid-stream network disconnect');
  });

  it('stream(): survives malformed/truncated SSE frames', async () => {
    const sseChunks = [
      'data: {broken json payload\n\n',
      'data: {"choices":[{"delta":{"content":"Valid chunk"}}]}\n\n',
      ': keep-alive comment\n\n',
      'data: [DONE]\n\n'
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream(sseChunks)
    });

    const yields = [];
    for await (const y of provider.stream(baseReq)) {
      yields.push(y);
    }

    expect(yields).toEqual([
      { type: 'text', text: 'Valid chunk' },
      { type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } }
    ]);
  });
});
