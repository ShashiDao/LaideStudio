import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../../db';
import { useAppStore } from '../../../store';
import * as toolsModule from '../tools';
import { AgentWorkspaceOverlay, type WorkspaceOverlay } from './overlay';
import * as testRunnerModule from '../../bundler/testRunner';
import { runAgentLoop } from '../agentLoop';
import type { LLMAdapter, LLMStreamYield } from '../../llm/llmAdapter';

describe('Run-Level WorkspaceOverlay Invariant (A-G)', () => {
  const projectId = 'test-proj-overlay-lifecycle';

  beforeEach(async () => {
    await db.files.clear();
    await db.projects.clear();
    useAppStore.getState().clearPendingPatches();
    vi.restoreAllMocks();
  });

  // A. Same overlay instance is reused across multiple tool calls
  it('A: guarantees the same overlay instance is passed to all tool calls during an agent run', async () => {
    const baseFile = {
      id: 'f-a-1',
      projectId,
      path: '/src/app.ts',
      content: 'export const app = 1;',
      updatedAt: 1000
    };
    await db.files.add(baseFile);

    const capturedOverlays: (WorkspaceOverlay | undefined)[] = [];
    const originalExecute = toolsModule.executeAgentTool;
    const spy = vi.spyOn(toolsModule, 'executeAgentTool').mockImplementation(async (name, args, pid, context) => {
      capturedOverlays.push(context?.overlay);
      return originalExecute(name, args, pid, context);
    });

    let step = 0;
    const mockAdapter: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(): AsyncGenerator<LLMStreamYield, void, unknown> {
        step++;
        if (step === 1) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call_1',
              name: 'list_directory',
              args: JSON.stringify({ path: '/' })
            }
          };
        } else if (step === 2) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call_2',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/app.ts',
                type: 'replace',
                newContent: 'export const app = 2;',
                rationale: 'Update app'
              })
            }
          };
        } else if (step === 3) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call_3',
              name: 'read_file',
              args: JSON.stringify({ path: '/src/app.ts' })
            }
          };
        } else if (step === 4) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call_4',
              name: 'search_code',
              args: JSON.stringify({ query: 'export const app' })
            }
          };
        } else {
          yield { type: 'text', text: 'All operations complete.' };
        }
      }
    };

    await runAgentLoop('Run task', [{ role: 'user', content: 'Run task' }], mockAdapter, projectId);

    expect(spy).toHaveBeenCalledTimes(4);
    expect(capturedOverlays.length).toBe(4);
    const firstOverlay = capturedOverlays[0];
    expect(firstOverlay).toBeDefined();
    expect(firstOverlay).toBeInstanceOf(AgentWorkspaceOverlay);

    // Every single tool call received the EXACT SAME instance
    for (let i = 1; i < capturedOverlays.length; i++) {
      expect(capturedOverlays[i]).toBe(firstOverlay);
    }
  });

  // B. write → read sees the modified content
  it('B: write followed by read within the same run sees the modified overlay content', async () => {
    const baseFile = {
      id: 'f-b-1',
      projectId,
      path: '/src/greeting.ts',
      content: 'export const greeting = "hello canonical";',
      updatedAt: 1000
    };
    await db.files.add(baseFile);

    let step = 0;
    const mockAdapter: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(): AsyncGenerator<LLMStreamYield, void, unknown> {
        step++;
        if (step === 1) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call_write',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/greeting.ts',
                type: 'replace',
                newContent: 'export const greeting = "hello overlay";',
                rationale: 'Update greeting'
              })
            }
          };
        } else if (step === 2) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call_read',
              name: 'read_file',
              args: JSON.stringify({ path: '/src/greeting.ts' })
            }
          };
        } else {
          yield { type: 'text', text: 'Done.' };
        }
      }
    };

    const finalMessages = await runAgentLoop(
      'Modify and check greeting',
      [{ role: 'user', content: 'Modify and check greeting' }],
      mockAdapter,
      projectId
    );

    // Find the tool response for read_file
    const readResponseMsg = finalMessages.find(
      m => m.role === 'tool' && m.toolCallId === 'call_read'
    );
    expect(readResponseMsg).toBeDefined();
    expect(readResponseMsg?.content).toBe('export const greeting = "hello overlay";');

    // Canonical VFS was NEVER mutated
    const canonical = await db.files.get('f-b-1');
    expect(canonical?.content).toBe('export const greeting = "hello canonical";');
  });

  // C. write → second write to the same file accumulates correctly
  it('C: sequential writes to the same file accumulate correctly in the overlay', async () => {
    const baseFile = {
      id: 'f-c-1',
      projectId,
      path: '/src/notes.txt',
      content: 'Initial Note',
      updatedAt: 1000
    };
    await db.files.add(baseFile);

    let step = 0;
    const mockAdapter: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(): AsyncGenerator<LLMStreamYield, void, unknown> {
        step++;
        if (step === 1) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'c_write_1',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/notes.txt',
                type: 'append',
                newContent: 'Note 2',
                rationale: 'Append 2'
              })
            }
          };
        } else if (step === 2) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'c_write_2',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/notes.txt',
                type: 'append',
                newContent: 'Note 3',
                rationale: 'Append 3'
              })
            }
          };
        } else if (step === 3) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'c_read',
              name: 'read_file',
              args: JSON.stringify({ path: '/src/notes.txt' })
            }
          };
        } else {
          yield { type: 'text', text: 'Notes accumulated.' };
        }
      }
    };

    const finalMessages = await runAgentLoop(
      'Append notes',
      [{ role: 'user', content: 'Append notes' }],
      mockAdapter,
      projectId
    );

    const readMsg = finalMessages.find(m => m.role === 'tool' && m.toolCallId === 'c_read');
    expect(readMsg?.content).toBe('Initial Note\nNote 2\nNote 3');

    // Canonical VFS still has only original
    const canonical = await db.files.get('f-c-1');
    expect(canonical?.content).toBe('Initial Note');

    // Pending patches stage the accumulated change
    const patches = useAppStore.getState().pendingPatches;
    expect(patches).toHaveLength(1);
    expect(patches[0].newContent).toBe('Initial Note\nNote 2\nNote 3');
  });

  // D. write → search_code finds the modified content
  it('D: write followed by search_code finds newly created overlay content', async () => {
    let step = 0;
    const mockAdapter: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(): AsyncGenerator<LLMStreamYield, void, unknown> {
        step++;
        if (step === 1) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'd_write',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/tokens.ts',
                type: 'create',
                newContent: 'export const SECRET = "UNIQUE_RUN_TOKEN_XYZ_987";',
                rationale: 'Add token'
              })
            }
          };
        } else if (step === 2) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'd_search',
              name: 'search_code',
              args: JSON.stringify({ query: 'UNIQUE_RUN_TOKEN_XYZ_987' })
            }
          };
        } else {
          yield { type: 'text', text: 'Search complete.' };
        }
      }
    };

    const finalMessages = await runAgentLoop(
      'Create and search token',
      [{ role: 'user', content: 'Create and search token' }],
      mockAdapter,
      projectId
    );

    const searchMsg = finalMessages.find(m => m.role === 'tool' && m.toolCallId === 'd_search');
    expect(searchMsg?.content).toContain('/src/tokens.ts:1: export const SECRET = "UNIQUE_RUN_TOKEN_XYZ_987";');

    // Canonical VFS has no such file
    const vfsFiles = await db.files.where({ projectId }).toArray();
    expect(vfsFiles).toHaveLength(0);
  });

  // E. write → run_tests verifies the modified materialized workspace
  it('E: write followed by run_tests executes against the materialized overlay', async () => {
    const runTestsSpy = vi.spyOn(testRunnerModule, 'runProjectTests').mockImplementation(async (files) => {
      const testFile = files.find(f => f.path === '/src/sample.test.ts');
      if (testFile) {
        return `All 1 tests passed! (executed: ${testFile.path})`;
      }
      return 'No test files found.';
    });

    let step = 0;
    const mockAdapter: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(): AsyncGenerator<LLMStreamYield, void, unknown> {
        step++;
        if (step === 1) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'e_write',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/sample.test.ts',
                type: 'create',
                newContent: `import { describe, it, expect } from 'vitest';
describe('sample math test', () => {
  it('adds numbers correctly in overlay', () => {
    expect(2 + 2).toBe(4);
  });
});`,
                rationale: 'Add unit test'
              })
            }
          };
        } else if (step === 2) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'e_test',
              name: 'run_tests',
              args: JSON.stringify({})
            }
          };
        } else {
          yield { type: 'text', text: 'Tests run.' };
        }
      }
    };

    const finalMessages = await runAgentLoop(
      'Write test and run tests',
      [{ role: 'user', content: 'Write test and run tests' }],
      mockAdapter,
      projectId
    );

    const testMsg = finalMessages.find(m => m.role === 'tool' && m.toolCallId === 'e_test');
    expect(testMsg?.content).toContain('All 1 tests passed! (executed: /src/sample.test.ts)');

    // Verify runProjectTests received materialized overlay file
    expect(runTestsSpy).toHaveBeenCalledTimes(1);
    const passedFiles = runTestsSpy.mock.calls[0][0];
    expect(passedFiles.some(f => f.path === '/src/sample.test.ts')).toBe(true);

    // Canonical VFS still has no test files!
    const vfsFiles = await db.files.where({ projectId }).toArray();
    expect(vfsFiles).toHaveLength(0);
  });

  // F. Multiple tool calls do not modify canonical VFS
  it('F: extensive multi-tool operations never mutate canonical VFS during the agent run', async () => {
    const fileA = {
      id: 'f-vfs-a',
      projectId,
      path: '/src/a.ts',
      content: 'canonical A',
      updatedAt: 1000
    };
    const fileB = {
      id: 'f-vfs-b',
      projectId,
      path: '/src/b.ts',
      content: 'canonical B',
      updatedAt: 1000
    };
    await db.files.bulkAdd([fileA, fileB]);

    let step = 0;
    const mockAdapter: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(): AsyncGenerator<LLMStreamYield, void, unknown> {
        step++;
        if (step === 1) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'f_w1',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/a.ts',
                type: 'replace',
                newContent: 'modified A in overlay',
                rationale: 'Replace A'
              })
            }
          };
        } else if (step === 2) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'f_w2',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/b.ts',
                type: 'delete',
                newContent: '',
                rationale: 'Delete B'
              })
            }
          };
        } else if (step === 3) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'f_w3',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/c.ts',
                type: 'create',
                newContent: 'created C in overlay',
                rationale: 'Create C'
              })
            }
          };
        } else if (step === 4) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'f_r',
              name: 'read_file',
              args: JSON.stringify({ path: '/src/c.ts' })
            }
          };
        } else if (step === 5) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'f_list',
              name: 'list_directory',
              args: JSON.stringify({ path: '/' })
            }
          };
        } else {
          yield { type: 'text', text: 'Multi-tool sequence finished.' };
        }
      }
    };

    await runAgentLoop(
      'Multi-tool run',
      [{ role: 'user', content: 'Multi-tool run' }],
      mockAdapter,
      projectId
    );

    // Canonical VFS inspection:
    const vfsA = await db.files.get('f-vfs-a');
    expect(vfsA?.content).toBe('canonical A');

    const vfsB = await db.files.get('f-vfs-b');
    expect(vfsB?.content).toBe('canonical B');

    const vfsC = await db.files.where({ projectId, path: '/src/c.ts' }).first();
    expect(vfsC).toBeUndefined();

    const allCanonical = await db.files.where({ projectId }).toArray();
    expect(allCanonical).toHaveLength(2);
  });

  // G. A second agent run gets a NEW overlay based on the then-current canonical state; overlays must not leak between runs
  it('G: a second agent run creates a fresh overlay from canonical state and does not leak prior uncommitted overlays', async () => {
    const baseFile = {
      id: 'f-g-1',
      projectId,
      path: '/src/config.json',
      content: '{"version": 1}',
      updatedAt: 1000
    };
    await db.files.add(baseFile);

    // RUN 1: Writes to config.json and creates temp.ts in overlay
    let step1 = 0;
    const adapter1: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(): AsyncGenerator<LLMStreamYield, void, unknown> {
        step1++;
        if (step1 === 1) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'run1_w1',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/config.json',
                type: 'replace',
                newContent: '{"version": 2}',
                rationale: 'Run 1 bump'
              })
            }
          };
        } else if (step1 === 2) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'run1_w2',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/temp.ts',
                type: 'create',
                newContent: 'temp from run 1',
                rationale: 'Run 1 temp file'
              })
            }
          };
        } else {
          yield { type: 'text', text: 'Run 1 completed.' };
        }
      }
    };

    await runAgentLoop(
      'Run 1',
      [{ role: 'user', content: 'Run 1' }],
      adapter1,
      projectId
    );

    // At the end of Run 1, pendingPatches has the 2 changes, but they have NOT been committed to canonical VFS!
    expect(useAppStore.getState().pendingPatches).toHaveLength(2);

    // RUN 2: Starts fresh on the same project
    let step2 = 0;
    const adapter2: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(): AsyncGenerator<LLMStreamYield, void, unknown> {
        step2++;
        if (step2 === 1) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'run2_r1',
              name: 'read_file',
              args: JSON.stringify({ path: '/src/config.json' })
            }
          };
        } else if (step2 === 2) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'run2_r2',
              name: 'read_file',
              args: JSON.stringify({ path: '/src/temp.ts' })
            }
          };
        } else {
          yield { type: 'text', text: 'Run 2 completed.' };
        }
      }
    };

    const finalMessagesRun2 = await runAgentLoop(
      'Run 2',
      [{ role: 'user', content: 'Run 2' }],
      adapter2,
      projectId
    );

    // In Run 2, config.json must be "{"version": 1}" (canonical state), NOT "{"version": 2}"
    const r1Msg = finalMessagesRun2.find(m => m.role === 'tool' && m.toolCallId === 'run2_r1');
    expect(r1Msg?.content).toBe('{"version": 1}');

    // In Run 2, /src/temp.ts must NOT exist
    const r2Msg = finalMessagesRun2.find(m => m.role === 'tool' && m.toolCallId === 'run2_r2');
    expect(r2Msg?.content).toBe('Error: File not found: /src/temp.ts');

    // Now simulate an explicit user commit to canonical VFS
    await db.files.where({ projectId, path: '/src/config.json' }).modify({ content: '{"version": 3}', updatedAt: 2000 });

    // RUN 3: Starts fresh on the updated canonical VFS
    let step3 = 0;
    const adapter3: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(): AsyncGenerator<LLMStreamYield, void, unknown> {
        step3++;
        if (step3 === 1) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'run3_r1',
              name: 'read_file',
              args: JSON.stringify({ path: '/src/config.json' })
            }
          };
        } else {
          yield { type: 'text', text: 'Run 3 completed.' };
        }
      }
    };

    const finalMessagesRun3 = await runAgentLoop(
      'Run 3',
      [{ role: 'user', content: 'Run 3' }],
      adapter3,
      projectId
    );

    const r3Msg = finalMessagesRun3.find(m => m.role === 'tool' && m.toolCallId === 'run3_r1');
    expect(r3Msg?.content).toBe('{"version": 3}');
  });
});
