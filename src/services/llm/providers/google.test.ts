import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleProvider } from './google';
import type { LLMRequest } from '../llmAdapter';

function createMockReadableStream(chunks: string[], errorAfterIndex?: number) {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (errorAfterIndex !== undefined && index >= errorAfterIndex) {
        controller.error(new Error('Simulated Google Gemini mid-stream network drop'));
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

describe('GoogleProvider', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const provider = new GoogleProvider('test-google-key-123', 'gemini-1.5-pro');
  const baseReq: LLMRequest = {
    messages: [{ role: 'user', content: 'Explain quantum computing' }]
  };

  it('send(): handles normal text response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Quantum computing harnesses quantum mechanics.' }]
            }
          }
        ],
        usageMetadata: {
          promptTokenCount: 15,
          candidatesTokenCount: 9
        }
      })
    });

    const res = await provider.send(baseReq);
    expect(res.text).toBe('Quantum computing harnesses quantum mechanics.');
    expect(res.toolCalls).toBeUndefined();
    expect(res.usage).toEqual({ inputTokens: 15, outputTokens: 9 });
  });

  it('send(): handles functionCall response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'read_file',
                    args: { path: '/package.json' }
                  }
                }
              ]
            }
          }
        ],
        usageMetadata: {
          promptTokenCount: 30,
          candidatesTokenCount: 12
        }
      })
    });

    const res = await provider.send(baseReq);
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls?.[0].name).toBe('read_file');
    expect(res.toolCalls?.[0].args).toBe('{"path":"/package.json"}');
  });

  it('stream(): yields normal text stream and usageMetadata', async () => {
    const sseChunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Quantum "}]}}],"usageMetadata":{"promptTokenCount":12,"candidatesTokenCount":2}}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"bits (qubits)."}]}}],"usageMetadata":{"promptTokenCount":12,"candidatesTokenCount":6}}\n\n',
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
      { type: 'text', text: 'Quantum ' },
      { type: 'text', text: 'bits (qubits).' },
      { type: 'usage', usage: { inputTokens: 12, outputTokens: 6 } }
    ]);
  });

  it('stream(): yields tool_call event for functionCall part', async () => {
    const sseChunks = [
      'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"list_directory","args":{"path":"/src"}}}]}}],"usageMetadata":{"promptTokenCount":20,"candidatesTokenCount":10}}\n\n'
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
    expect(yields[0].type).toBe('tool_call');
    if (yields[0].type === 'tool_call') {
      expect(yields[0].toolCall.name).toBe('list_directory');
      expect(yields[0].toolCall.args).toBe('{"path":"/src"}');
    }
    expect(yields[1]).toEqual({
      type: 'usage',
      usage: { inputTokens: 20, outputTokens: 10 }
    });
  });

  it('stream(): throws error on mid-stream network drop', async () => {
    const sseChunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"First part"}]}}]}\n\n'
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream(sseChunks, 1)
    });

    const stream = provider.stream(baseReq);
    const first = await stream.next();
    expect(first.value).toEqual({ type: 'text', text: 'First part' });
    await expect(stream.next()).rejects.toThrow('Simulated Google Gemini mid-stream network drop');
  });

  it('stream(): gracefully skips malformed or truncated SSE chunks', async () => {
    const sseChunks = [
      'data: {"candidates": [broken json\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"Valid Gemini text"}]}}]}\n\n',
      'non-sse random text\n\n'
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
      { type: 'text', text: 'Valid Gemini text' },
      { type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } }
    ]);
  });

  it('send(): formats image content blocks with inlineData correctly', async () => {
    let capturedBody: any = null;
    globalThis.fetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'I see the preview UI buttons and layout.' }]
              }
            }
          ],
          usageMetadata: {
            promptTokenCount: 150,
            candidatesTokenCount: 20
          }
        })
      };
    });

    const visionReq: LLMRequest = {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Review this interface' },
            { type: 'image', mediaType: 'image/png', data: 'AQIDBAUG' }
          ]
        }
      ]
    };

    const res = await provider.send(visionReq);
    expect(res.text).toBe('I see the preview UI buttons and layout.');
    expect(capturedBody).toBeDefined();
    expect(capturedBody.contents[0].parts).toEqual([
      { text: 'Review this interface' },
      {
        inlineData: {
          mimeType: 'image/png',
          data: 'AQIDBAUG'
        }
      }
    ]);
  });
});
