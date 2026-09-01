import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  WebLLMProvider, 
  checkWebGPUSupport, 
  loadOfflineModel, 
  unloadOfflineModel,
  isModelCachedInBrowser,
  deleteCachedModel,
  OFFLINE_MODELS,
  DEFAULT_OFFLINE_MODEL,
  type MLCEngineLike
} from './webllm';
import type { LLMRequest } from '../llmAdapter';

describe('WebLLM Offline Provider', () => {
  beforeEach(async () => {
    await unloadOfflineModel();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await unloadOfflineModel();
  });

  describe('Offline Models Metadata', () => {
    it('defines lightweight models under 2GB download target', () => {
      expect(OFFLINE_MODELS.length).toBeGreaterThanOrEqual(3);
      const defaultModel = OFFLINE_MODELS.find(m => m.id === DEFAULT_OFFLINE_MODEL);
      expect(defaultModel).toBeDefined();
      expect(defaultModel?.recommended).toBe(true);
      expect(defaultModel?.downloadSize).toContain('1.1 GB');
      expect(defaultModel?.contextWindow).toBeGreaterThanOrEqual(16384);
    });
  });

  describe('checkWebGPUSupport', () => {
    it('returns supported: false when navigator.gpu is absent', async () => {
      const originalGpu = (globalThis.navigator as any).gpu;
      delete (globalThis.navigator as any).gpu;

      const res = await checkWebGPUSupport();
      expect(res.supported).toBe(false);
      expect(res.reason).toContain('WebGPU is not supported');

      (globalThis.navigator as any).gpu = originalGpu;
    });

    it('returns supported: false when requestAdapter returns null', async () => {
      (globalThis.navigator as any).gpu = {
        requestAdapter: vi.fn().mockResolvedValue(null)
      };

      const res = await checkWebGPUSupport();
      expect(res.supported).toBe(false);
      expect(res.reason).toContain('WebGPU adapter could not be initialized');
    });

    it('returns supported: true when adapter is successfully acquired', async () => {
      (globalThis.navigator as any).gpu = {
        requestAdapter: vi.fn().mockResolvedValue({
          vendor: 'apple',
          architecture: 'metal',
          requestAdapterInfo: vi.fn().mockResolvedValue({
            vendor: 'Apple',
            architecture: 'arm64',
            description: 'Apple M2 Max'
          })
        })
      };

      const res = await checkWebGPUSupport();
      expect(res.supported).toBe(true);
      expect(res.adapterInfo?.vendor).toBe('Apple');
      expect(res.adapterInfo?.description).toBe('Apple M2 Max');
    });
  });

  describe('Provider Adapter & Inference', () => {
    it('throws friendly error if model is not loaded and no custom engine is provided', async () => {
      const provider = new WebLLMProvider('Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC');
      const req: LLMRequest = {
        messages: [{ role: 'user', content: 'hello' }]
      };

      await expect(provider.send(req)).rejects.toThrow(/Offline model .* is not loaded into memory yet/);
    });

    it('estimates tokens in countTokens', async () => {
      const provider = new WebLLMProvider();
      const req: LLMRequest = {
        systemPrompt: 'You are an offline assistant.',
        messages: [
          { role: 'user', content: 'Write a small function' }
        ]
      };

      const count = await provider.countTokens(req);
      expect(count).toBeGreaterThan(5);
    });

    it('executes send() with mock engine and handles tool calls', async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: 'I will patch the file.',
              tool_calls: [
                {
                  id: 'call_abc123',
                  function: {
                    name: 'patchFile',
                    arguments: JSON.stringify({ path: '/src/App.tsx', diff: '@@ -1 +1 @@\n-a\n+b' })
                  }
                }
              ]
            }
          }
        ],
        usage: {
          prompt_tokens: 45,
          completion_tokens: 20
        }
      });

      const mockEngine: MLCEngineLike = {
        chat: {
          completions: {
            create: mockCreate
          }
        }
      };

      const provider = new WebLLMProvider('Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC', mockEngine);
      const res = await provider.send({
        systemPrompt: 'System instruction',
        messages: [{ role: 'user', content: 'Please patch App.tsx' }],
        tools: [
          {
            name: 'patchFile',
            description: 'Apply diff patch',
            parameters: { type: 'object' }
          }
        ]
      });

      expect(res.text).toBe('I will patch the file.');
      expect(res.toolCalls).toBeDefined();
      expect(res.toolCalls?.length).toBe(1);
      expect(res.toolCalls?.[0].name).toBe('patchFile');
      expect(res.toolCalls?.[0].id).toBe('call_abc123');
      expect(res.usage.inputTokens).toBe(45);
      expect(res.usage.outputTokens).toBe(20);

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        temperature: 0.2,
        max_tokens: 2048,
        stream: false,
        tools: expect.arrayContaining([
          expect.objectContaining({
            type: 'function',
            function: expect.objectContaining({ name: 'patchFile' })
          })
        ])
      }));
    });

    it('falls back to extracting tool calls from text code blocks when structured tool_calls are absent', async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: 'Here is the tool call:\n```json\n{\n  "tool": "createFile",\n  "parameters": {\n    "path": "/src/utils.ts",\n    "content": "export const x = 1;"\n  }\n}\n```'
            }
          }
        ]
      });

      const mockEngine: MLCEngineLike = {
        chat: {
          completions: {
            create: mockCreate
          }
        }
      };

      const provider = new WebLLMProvider('Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC', mockEngine);
      const res = await provider.send({
        messages: [{ role: 'user', content: 'Create utils.ts' }]
      });

      expect(res.toolCalls?.length).toBe(1);
      expect(res.toolCalls?.[0].name).toBe('createFile');
      expect(res.toolCalls?.[0].args).toContain('/src/utils.ts');
    });

    it('streams text and tool calls with stream() generator', async () => {
      async function* mockStreamGenerator() {
        yield {
          choices: [
            { delta: { content: 'Analyzing ' } }
          ]
        };
        yield {
          choices: [
            { delta: { content: 'codebase...' } }
          ]
        };
        yield {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_xyz789',
                    function: {
                      name: 'readFile',
                      arguments: '{"path":'
                    }
                  }
                ]
              }
            }
          ]
        };
        yield {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: {
                      arguments: '"/package.json"}'
                    }
                  }
                ]
              },
              finish_reason: 'tool_calls'
            }
          ],
          usage: {
            prompt_tokens: 30,
            completion_tokens: 15
          }
        };
      }

      const mockEngine: MLCEngineLike = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockStreamGenerator())
          }
        }
      };

      const provider = new WebLLMProvider('Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC', mockEngine);
      const yields = [];
      for await (const chunk of provider.stream({
        messages: [{ role: 'user', content: 'Check package.json' }]
      })) {
        yields.push(chunk);
      }

      const textChunks = yields.filter(y => y.type === 'text');
      const toolCallChunks = yields.filter(y => y.type === 'tool_call');
      const usageChunks = yields.filter(y => y.type === 'usage');

      expect(textChunks.map(t => (t as any).text).join('')).toBe('Analyzing codebase...');
      expect(toolCallChunks.length).toBeGreaterThanOrEqual(1);
      const tc = (toolCallChunks[toolCallChunks.length - 1] as any).toolCall;
      expect(tc.name).toBe('readFile');
      expect(tc.args).toBe('{"path":"/package.json"}');
      expect(usageChunks.length).toBe(1);
      expect((usageChunks[0] as any).usage.prompt_tokens || (usageChunks[0] as any).usage.inputTokens).toBe(30);
    });
  });

  describe('Cache and loading operations', () => {
    it('reports cache status gracefully', async () => {
      const isCached = await isModelCachedInBrowser('Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC');
      expect(typeof isCached).toBe('boolean');
    });

    it('handles deleteCachedModel gracefully', async () => {
      const deleted = await deleteCachedModel('Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC');
      expect(deleted).toBe(true);
    });
  });
});
