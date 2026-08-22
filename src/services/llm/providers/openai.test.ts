import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIProvider } from './openai';
import type { LLMRequest } from '../llmAdapter';

function createMockReadableStream(chunks: string[], errorAfterIndex?: number) {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (errorAfterIndex !== undefined && index >= errorAfterIndex) {
        controller.error(new Error('OpenAI mid-stream network drop'));
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

describe('OpenAIProvider', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const provider = new OpenAIProvider('sk-test-key-123', 'gpt-4o');
  const baseReq: LLMRequest = {
    messages: [{ role: 'user', content: 'Generate code' }]
  };

  it('send(): sends request to standard OpenAI endpoint and parses text response', async () => {
    let capturedUrl = '';
    let capturedHeaders: any = {};
    
    globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
      capturedUrl = url.toString();
      capturedHeaders = init?.headers;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'const a = 1;' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 }
        })
      };
    });

    const res = await provider.send(baseReq);
    expect(capturedUrl).toBe('https://api.openai.com/v1/chat/completions');
    expect(capturedHeaders['Authorization']).toBe('Bearer sk-test-key-123');
    expect(res.text).toBe('const a = 1;');
    expect(res.usage?.inputTokens).toBe(10);
  });

  it('send(): handles tool_call response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_openai_tool',
                  function: { name: 'list_directory', arguments: '{"path":"/src"}' }
                }
              ]
            }
          }
        ],
        usage: { prompt_tokens: 20, completion_tokens: 10 }
      })
    });

    const res = await provider.send(baseReq);
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls?.[0].name).toBe('list_directory');
    expect(res.toolCalls?.[0].args).toBe('{"path":"/src"}');
  });

  it('stream(): handles text streaming with tool call and usage', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"export const x"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" = 42;"}}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":8}}\n\n',
      'data: [DONE]\n\n'
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream(sseChunks)
    });

    const results = [];
    for await (const chunk of provider.stream(baseReq)) {
      results.push(chunk);
    }

    expect(results).toEqual([
      { type: 'text', text: 'export const x' },
      { type: 'text', text: ' = 42;' },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 8 } }
    ]);
  });

  it('stream(): handles mid-stream network drop', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Chunk 1"}}]}\n\n'
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream(sseChunks, 1)
    });

    const stream = provider.stream(baseReq);
    const first = await stream.next();
    expect(first.value).toEqual({ type: 'text', text: 'Chunk 1' });
    await expect(stream.next()).rejects.toThrow('OpenAI mid-stream network drop');
  });

  it('stream(): ignores malformed SSE chunks', async () => {
    const sseChunks = [
      'data: {"invalid json\n\n',
      'data: {"choices":[{"delta":{"content":"Healthy"}}]}\n\n',
      'data: [DONE]\n\n'
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream(sseChunks)
    });

    const results = [];
    for await (const chunk of provider.stream(baseReq)) {
      results.push(chunk);
    }

    expect(results).toEqual([
      { type: 'text', text: 'Healthy' },
      { type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } }
    ]);
  });
});
