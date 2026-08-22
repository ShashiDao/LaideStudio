import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicProvider } from './anthropic';
import type { LLMRequest } from '../llmAdapter';

function createMockReadableStream(chunks: string[], errorAfterIndex?: number) {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (errorAfterIndex !== undefined && index >= errorAfterIndex) {
        controller.error(new Error('Simulated Anthropic mid-stream network disconnect'));
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

describe('AnthropicProvider', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const provider = new AnthropicProvider('test-anthropic-key', 'claude-3-7-sonnet-20250219');
  const baseReq: LLMRequest = {
    messages: [{ role: 'user', content: 'Hello Claude' }]
  };

  it('send(): handles normal text response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Hello! How can I assist you today?' }],
        usage: { input_tokens: 14, output_tokens: 8, cache_read_input_tokens: 0 }
      })
    });

    const res = await provider.send(baseReq);
    expect(res.text).toBe('Hello! How can I assist you today?');
    expect(res.toolCalls).toBeUndefined();
    expect(res.usage).toEqual({
      inputTokens: 14,
      outputTokens: 8,
      cachedTokens: 0
    });
  });

  it('send(): handles tool_use response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          { type: 'text', text: 'Let me list the directory.' },
          { 
            type: 'tool_use', 
            id: 'toolu_01ABC', 
            name: 'list_directory', 
            input: { path: '/' } 
          }
        ],
        usage: { input_tokens: 35, output_tokens: 20 }
      })
    });

    const res = await provider.send(baseReq);
    expect(res.text).toBe('Let me list the directory.');
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls?.[0]).toEqual({
      id: 'toolu_01ABC',
      name: 'list_directory',
      args: '{"path":"/"}'
    });
  });

  it('stream(): yields normal text stream and usage', async () => {
    const sseChunks = [
      'data: {"type":"message_start","message":{"usage":{"input_tokens":12,"cache_read_input_tokens":4}}}\n\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Streaming "}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"response."}}\n\n',
      'data: {"type":"content_block_stop","index":0}\n\n',
      'data: {"type":"message_delta","usage":{"output_tokens":7}}\n\n',
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
      { type: 'text', text: 'Streaming ' },
      { type: 'text', text: 'response.' },
      { 
        type: 'usage', 
        usage: { inputTokens: 12, outputTokens: 7, cachedTokens: 4 } 
      }
    ]);
  });

  it('stream(): yields tool_call event with accumulated json deltas', async () => {
    const sseChunks = [
      'data: {"type":"message_start","message":{"usage":{"input_tokens":20}}}\n\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call_claude_1","name":"read_file"}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\": "}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"/src/index.ts\\"}"}}\n\n',
      'data: {"type":"content_block_stop","index":0}\n\n',
      'data: {"type":"message_delta","usage":{"output_tokens":15}}\n\n'
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
        id: 'call_claude_1',
        name: 'read_file',
        args: '{"path": "/src/index.ts"}'
      }
    });
    expect(yields[1].type).toBe('usage');
  });

  it('stream(): throws on mid-stream network error', async () => {
    const sseChunks = [
      'data: {"type":"message_start","message":{"usage":{"input_tokens":10}}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Start..."}}\n\n'
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createMockReadableStream(sseChunks, 2)
    });

    const stream = provider.stream(baseReq);
    const first = await stream.next();
    expect(first.value).toEqual({ type: 'text', text: 'Start...' });

    await expect(stream.next()).rejects.toThrow('Simulated Anthropic mid-stream network disconnect');
  });

  it('stream(): gracefully ignores malformed or truncated SSE chunks', async () => {
    const sseChunks = [
      'data: {corrupted-json-truncated\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Recovered!"}}\n\n',
      'random_invalid_non_sse_line\n\n',
      'data: {"type":"message_delta","usage":{"output_tokens":4}}\n\n'
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
      { type: 'text', text: 'Recovered!' },
      { type: 'usage', usage: { inputTokens: 0, outputTokens: 4, cachedTokens: 0 } }
    ]);
  });

  it('send(): formats image content blocks with base64 source correctly', async () => {
    let capturedBody: any = null;
    globalThis.fetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'I can see the preview screenshot.' }],
          usage: { input_tokens: 120, output_tokens: 15 }
        })
      };
    });

    const visionReq: LLMRequest = {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Check this UI' },
            { type: 'image', mediaType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUg==' }
          ]
        }
      ]
    };

    const res = await provider.send(visionReq);
    expect(res.text).toBe('I can see the preview screenshot.');
    expect(capturedBody).toBeDefined();
    expect(capturedBody.messages[0].content).toEqual([
      { type: 'text', text: 'Check this UI' },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'iVBORw0KGgoAAAANSUhEUg=='
        }
      }
    ]);
  });
});
