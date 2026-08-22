import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { runAgentLoop } from './agentLoop';
import { useAppStore } from '../../store';
import { db } from '../../db';
import { listFiles } from '../fs/vfs';
import type { LLMAdapter, LLMRequest, LLMStreamYield } from '../llm/llmAdapter';

describe('agentLoop', () => {
  const projectId = 'test-proj-agent-loop';

  beforeEach(async () => {
    await db.files.clear();
    await db.projects.clear();
    useAppStore.getState().clearPendingPatches();
    vi.restoreAllMocks();
  });

  it('intercepts write_file into pendingPatches and NEVER touches VFS directly', async () => {
    // Initial file in VFS
    await db.files.add({
      id: 'f1',
      projectId,
      path: '/src/App.tsx',
      content: 'original content',
      updatedAt: Date.now()
    });

    let callCount = 0;
    const mockAdapter: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(_req: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown> {
        callCount++;
        if (callCount === 1) {
          // Assistant proposes write_file patch
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call_write_1',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/App.tsx',
                type: 'replace',
                oldContent: 'original content',
                newContent: 'new modified content that requires user review',
                rationale: 'Fix component layout'
              })
            }
          };
        } else {
          // Assistant wraps up after tool output
          yield { type: 'text', text: 'I have queued the patch for your review.' };
        }
      }
    };

    const finalMessages = await runAgentLoop(
      'Update App.tsx please',
      [],
      mockAdapter,
      projectId
    );

    // 1. Pending patch must be queued in store
    const pendingPatches = useAppStore.getState().pendingPatches;
    expect(pendingPatches).toHaveLength(1);
    expect(pendingPatches[0].path).toBe('/src/App.tsx');
    expect(pendingPatches[0].newContent).toBe('new modified content that requires user review');

    // 2. VFS / database must NOT have been changed directly!
    const vfsFiles = await listFiles(projectId);
    expect(vfsFiles).toHaveLength(1);
    expect(vfsFiles[0].content).toBe('original content'); // Untouched!

    // 3. Messages log should have user, assistant tool_call, tool response, and final assistant message
    expect(finalMessages.length).toBe(4);
    expect(finalMessages[1].role).toBe('assistant');
    expect(finalMessages[1].toolCalls?.[0].name).toBe('write_file');
    expect(finalMessages[2].role).toBe('tool');
    expect(finalMessages[2].content).toContain('Successfully queued patch');
    expect(finalMessages[3].content).toBe('I have queued the patch for your review.');
  });

  it('handles abort signal mid-stream cleanly without executing pending tool calls', async () => {
    const abortController = new AbortController();

    const mockAdapter: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(_req: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown> {
        yield { type: 'text', text: 'Beginning reasoning...' };
        
        // Trigger abort mid-stream
        abortController.abort();

        // Further items yielded after abort
        yield {
          type: 'tool_call',
          toolCall: {
            id: 'call_aborted_tool',
            name: 'write_file',
            args: JSON.stringify({
              path: '/src/Hacked.tsx',
              type: 'create',
              newContent: 'should not be applied',
              rationale: 'abort test'
            })
          }
        };
      }
    };

    const messages = await runAgentLoop(
      'Test abort',
      [],
      mockAdapter,
      projectId,
      undefined,
      undefined,
      abortController.signal
    );

    // Patch should not have been executed because loop aborted
    expect(useAppStore.getState().pendingPatches).toHaveLength(0);
    // Assistant message contains the partial text yielded prior to/at abort
    expect(messages.some(m => m.role === 'user' && m.content === 'Test abort')).toBe(true);
  });

  it('caps the number of tool-call iterations with "Agent stopped after N steps" message', async () => {
    let callCount = 0;
    const mockAdapter: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(_req: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown> {
        callCount++;
        // Continuous tool calls
        yield {
          type: 'tool_call',
          toolCall: {
            id: `call_loop_${callCount}`,
            name: 'list_directory',
            args: JSON.stringify({ path: '/' })
          }
        };
      }
    };

    // Run with maxSteps = 3
    const maxSteps = 3;
    const messages = await runAgentLoop(
      'Infinite search loop',
      [],
      mockAdapter,
      projectId,
      undefined,
      undefined,
      undefined,
      maxSteps
    );

    // Verify adapter stream was called exactly 3 times (the maxSteps limit)
    expect(callCount).toBe(maxSteps);

    // Verify the final assistant message informs the user that the agent stopped
    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.role).toBe('assistant');
    expect(lastMsg.content).toBe(`Agent stopped after ${maxSteps} steps.`);
  });

  it('threads temperature and maxTokens options into adapter.stream call', async () => {
    let capturedReq: LLMRequest | null = null;
    const mockAdapter: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(req: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown> {
        capturedReq = req;
        yield { type: 'text', text: 'Hello!' };
      }
    };

    await runAgentLoop(
      'Hi',
      [],
      mockAdapter,
      projectId,
      'Custom system prompt',
      undefined,
      undefined,
      25,
      {
        temperature: 0.7,
        maxTokens: 2048
      }
    );

    expect(capturedReq).not.toBeNull();
    expect(capturedReq?.temperature).toBe(0.7);
    expect(capturedReq?.maxTokens).toBe(2048);
  });

  it('passes vision screenshot content block to adapter.stream alongside user message', async () => {
    let capturedReq: LLMRequest | null = null;
    const mockAdapter: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(req: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown> {
        capturedReq = req;
        yield { type: 'text', text: 'I reviewed your screenshot and preview.' };
      }
    };

    const finalMessages = await runAgentLoop(
      'Fix alignment of this button',
      [],
      mockAdapter,
      projectId,
      undefined,
      undefined,
      undefined,
      25,
      {
        screenshot: {
          mediaType: 'image/png',
          data: 'iVBORw0KGgoAAAANSUhEUg=='
        }
      }
    );

    expect(capturedReq).not.toBeNull();
    const userMsg = capturedReq?.messages[0];
    expect(userMsg).toBeDefined();
    expect(userMsg?.role).toBe('user');
    expect(Array.isArray(userMsg?.content)).toBe(true);
    expect(userMsg?.content).toEqual([
      { type: 'text', text: 'Fix alignment of this button' },
      {
        type: 'image',
        mediaType: 'image/png',
        data: 'iVBORw0KGgoAAAANSUhEUg=='
      }
    ]);

    expect(finalMessages[0].content).toEqual([
      { type: 'text', text: 'Fix alignment of this button' },
      {
        type: 'image',
        mediaType: 'image/png',
        data: 'iVBORw0KGgoAAAANSUhEUg=='
      }
    ]);
  });
});
