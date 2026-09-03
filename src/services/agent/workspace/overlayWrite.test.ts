import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../../db';
import { useAppStore } from '../../../store';
import { executeAgentTool } from '../tools';
import { AgentWorkspaceOverlay } from './overlay';
import { runAgentLoop } from '../agentLoop';
import type { LLMAdapter, LLMMessage, LLMStreamYield } from '../../llm/llmAdapter';

describe('WorkspaceOverlay Write Isolation & Accumulation', () => {
  const projectId = 'test-proj-overlay-write';

  beforeEach(async () => {
    await db.files.clear();
    await db.projects.clear();
    useAppStore.getState().clearPendingPatches();
  });

  it('proves agent write changes overlay while canonical VFS remains unchanged', async () => {
    const baseFile = {
      id: 'f-base-1',
      projectId,
      path: '/src/app.ts',
      content: 'export const status = "base";',
      updatedAt: Date.now()
    };
    await db.files.add(baseFile);

    const overlay = new AgentWorkspaceOverlay(projectId, [baseFile]);

    const toolArgs = JSON.stringify({
      path: '/src/app.ts',
      type: 'replace',
      newContent: 'export const status = "overlay-updated";',
      rationale: 'Update status'
    });

    const result = await executeAgentTool('write_file', toolArgs, projectId, { overlay });
    expect(result).toContain('Successfully queued patch for /src/app.ts');

    // 1. Overlay reflects the change
    expect(await overlay.read('/src/app.ts')).toBe('export const status = "overlay-updated";');

    // 2. Canonical VFS is completely untouched
    const vfsFile = await db.files.get('f-base-1');
    expect(vfsFile?.content).toBe('export const status = "base";');

    // 3. Diff correctly reflects replacement
    const diff = overlay.diff();
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({
      path: '/src/app.ts',
      type: 'replace',
      oldContent: 'export const status = "base";',
      newContent: 'export const status = "overlay-updated";',
      rationale: 'Update status'
    });
  });

  it('proves multiple writes to the same file accumulate correctly', async () => {
    const overlay = new AgentWorkspaceOverlay(projectId, []);

    // First write: create file
    await executeAgentTool('write_file', JSON.stringify({
      path: '/src/log.txt',
      type: 'create',
      newContent: 'Line 1',
      rationale: 'Create log'
    }), projectId, { overlay });

    expect(await overlay.read('/src/log.txt')).toBe('Line 1');

    // Second write: append to file
    await executeAgentTool('write_file', JSON.stringify({
      path: '/src/log.txt',
      type: 'append',
      newContent: 'Line 2',
      rationale: 'Append line 2'
    }), projectId, { overlay });

    expect(await overlay.read('/src/log.txt')).toBe('Line 1\nLine 2');

    // Third write: append to file again
    await executeAgentTool('write_file', JSON.stringify({
      path: '/src/log.txt',
      type: 'append',
      newContent: 'Line 3',
      rationale: 'Append line 3'
    }), projectId, { overlay });

    expect(await overlay.read('/src/log.txt')).toBe('Line 1\nLine 2\nLine 3');

    // Canonical VFS still does NOT have the file
    const vfsFiles = await db.files.where({ projectId }).toArray();
    expect(vfsFiles).toHaveLength(0);

    // Diff yields a single combined create patch
    const diff = overlay.diff();
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({
      path: '/src/log.txt',
      type: 'create',
      newContent: 'Line 1\nLine 2\nLine 3'
    });
  });

  it('proves multiple replace writes to existing file operate on latest overlay content and diff accurately against base', async () => {
    const baseFile = {
      id: 'f-code-1',
      projectId,
      path: '/src/code.ts',
      content: 'const v = 1;',
      updatedAt: Date.now()
    };
    await db.files.add(baseFile);

    const overlay = new AgentWorkspaceOverlay(projectId, [baseFile]);

    // First replace
    await executeAgentTool('write_file', JSON.stringify({
      path: '/src/code.ts',
      type: 'replace',
      newContent: 'const v = 2;',
      rationale: 'Bump to 2'
    }), projectId, { overlay });

    expect(await overlay.read('/src/code.ts')).toBe('const v = 2;');

    // Second replace
    await executeAgentTool('write_file', JSON.stringify({
      path: '/src/code.ts',
      type: 'replace',
      newContent: 'const v = 3;',
      rationale: 'Bump to 3'
    }), projectId, { overlay });

    expect(await overlay.read('/src/code.ts')).toBe('const v = 3;');

    // Canonical VFS remains at initial state
    const canonical = await db.files.get('f-code-1');
    expect(canonical?.content).toBe('const v = 1;');

    // Diff compares initial base against latest overlay
    const diff = overlay.diff();
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({
      path: '/src/code.ts',
      type: 'replace',
      oldContent: 'const v = 1;',
      newContent: 'const v = 3;',
      rationale: 'Bump to 3'
    });
  });

  it('proves creating then deleting a file in the overlay results in zero patches and leaves VFS clean', async () => {
    const overlay = new AgentWorkspaceOverlay(projectId, []);

    // Create
    await executeAgentTool('write_file', JSON.stringify({
      path: '/src/scratchpad.ts',
      type: 'create',
      newContent: 'temporary scratchpad',
      rationale: 'Create temp'
    }), projectId, { overlay });

    expect(await overlay.read('/src/scratchpad.ts')).toBe('temporary scratchpad');

    // Delete
    await executeAgentTool('write_file', JSON.stringify({
      path: '/src/scratchpad.ts',
      type: 'delete',
      newContent: '',
      rationale: 'Clean up temp'
    }), projectId, { overlay });

    expect(await overlay.read('/src/scratchpad.ts')).toBeNull();

    // Zero patches generated because it never existed in base
    const diff = overlay.diff();
    expect(diff).toHaveLength(0);

    // Canonical VFS is clean
    const vfsFiles = await db.files.where({ projectId }).toArray();
    expect(vfsFiles).toHaveLength(0);
  });

  it('proves deleting a base file creates a delete patch while keeping canonical VFS intact', async () => {
    const baseFile = {
      id: 'f-del-target',
      projectId,
      path: '/src/deprecated.ts',
      content: 'export const legacy = true;',
      updatedAt: Date.now()
    };
    await db.files.add(baseFile);

    const overlay = new AgentWorkspaceOverlay(projectId, [baseFile]);

    await executeAgentTool('write_file', JSON.stringify({
      path: '/src/deprecated.ts',
      type: 'delete',
      newContent: '',
      rationale: 'Remove legacy code'
    }), projectId, { overlay });

    // Overlay reflects deletion
    expect(await overlay.read('/src/deprecated.ts')).toBeNull();
    const list = await overlay.list('/');
    expect(list).not.toContain('/src/deprecated.ts');

    // Canonical VFS still has the file untouched!
    const vfsFile = await db.files.get('f-del-target');
    expect(vfsFile?.content).toBe('export const legacy = true;');

    // Diff has delete patch with oldContent
    const diff = overlay.diff();
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({
      path: '/src/deprecated.ts',
      type: 'delete',
      oldContent: 'export const legacy = true;',
      newContent: '',
      rationale: 'Remove legacy code'
    });
  });

  it('proves agent reads and searches see overlay state during multi-step execution', async () => {
    const overlay = new AgentWorkspaceOverlay(projectId, []);

    // Agent writes new file into overlay
    await executeAgentTool('write_file', JSON.stringify({
      path: '/src/utils.ts',
      type: 'create',
      newContent: 'export function add(a: number, b: number) { return a + b; }',
      rationale: 'Math utility'
    }), projectId, { overlay });

    // Agent reads the staged file via read_file tool
    const readResult = await executeAgentTool('read_file', JSON.stringify({
      path: '/src/utils.ts'
    }), projectId, { overlay });
    expect(readResult).toContain('export function add');

    // Agent searches code via search_code tool and finds staged content
    const searchResult = await executeAgentTool('search_code', JSON.stringify({
      query: 'add(a: number'
    }), projectId, { overlay });
    expect(searchResult).toContain('/src/utils.ts:1: export function add(a: number, b: number) { return a + b; }');

    // Canonical VFS still empty
    const vfsFiles = await db.files.where({ projectId }).toArray();
    expect(vfsFiles).toHaveLength(0);
  });

  it('proves runAgentLoop uses overlay and only produces final diff in pendingPatches upon completion', async () => {
    const baseFile = {
      id: 'f-loop-1',
      projectId,
      path: '/src/Counter.tsx',
      content: 'export const Counter = () => 0;',
      updatedAt: Date.now()
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
              id: 'call_1',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/Counter.tsx',
                type: 'replace',
                newContent: 'export const Counter = () => 1;',
                rationale: 'Increment counter start'
              })
            }
          };
        } else {
          yield {
            type: 'text',
            text: 'Counter updated in overlay.'
          };
        }
      }
    };

    const initialMessages: LLMMessage[] = [
      { role: 'user', content: 'Update counter to 1' }
    ];

    await runAgentLoop(
      'Update counter to 1',
      initialMessages,
      mockAdapter,
      projectId,
      undefined,
      undefined,
      undefined,
      10,
      { verifier: async () => ({ success: true, status: 'passed' }) }
    );

    // 1. Canonical VFS remained untouched throughout
    const canonical = await db.files.get('f-loop-1');
    expect(canonical?.content).toBe('export const Counter = () => 0;');

    // 2. Pending patches were staged on run completion
    const pendingPatches = useAppStore.getState().pendingPatches;
    expect(pendingPatches).toHaveLength(1);
    expect(pendingPatches[0]).toMatchObject({
      path: '/src/Counter.tsx',
      type: 'replace',
      oldContent: 'export const Counter = () => 0;',
      newContent: 'export const Counter = () => 1;',
      rationale: 'Increment counter start'
    });
  });
});
