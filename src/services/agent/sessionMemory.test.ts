// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../db';
import {
  recordSessionMemory,
  getSessionMemories,
  pruneSessionMemories,
  formatSessionMemoryForPrompt,
  recordTaskCompletionMemory,
  clearSessionMemories,
  deleteSessionMemory,
  deriveInsightFromTask
} from './sessionMemory';
import { taskStore } from './task/taskStore';
import { listFiles, createFile } from '../fs/vfs';
import { isExcludedFromZipExport } from '../fs/zipExport';

describe('Session Memory', () => {
  beforeEach(async () => {
    await db.sessionMemory.clear();
    await db.tasks.clear();
    await db.taskRuns.clear();
    await db.files.clear();
  });

  describe('recordSessionMemory and getSessionMemories', () => {
    it('persists a learned insight with generated id and timestamp', async () => {
      const item = await recordSessionMemory(
        'proj-alpha',
        'Project uses pnpm not npm',
        { key: 'package_manager' }
      );

      expect(item.id).toBeDefined();
      expect(item.projectId).toBe('proj-alpha');
      expect(item.insight).toBe('Project uses pnpm not npm');
      expect(item.key).toBe('package_manager');
      expect(item.timestamp).toBeGreaterThan(0);

      const retrieved = await getSessionMemories('proj-alpha');
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].insight).toBe('Project uses pnpm not npm');
    });

    it('scopes session memories strictly by projectId', async () => {
      await recordSessionMemory('proj-1', 'Insight for project 1');
      await recordSessionMemory('proj-2', 'Insight for project 2');

      const proj1Memories = await getSessionMemories('proj-1');
      const proj2Memories = await getSessionMemories('proj-2');

      expect(proj1Memories).toHaveLength(1);
      expect(proj1Memories[0].insight).toBe('Insight for project 1');

      expect(proj2Memories).toHaveLength(1);
      expect(proj2Memories[0].insight).toBe('Insight for project 2');
    });

    it('orders memories chronologically', async () => {
      const item1 = await recordSessionMemory('proj-order', 'First insight');
      // Ensure separate timestamp
      await new Promise(r => setTimeout(r, 10));
      const item2 = await recordSessionMemory('proj-order', 'Second insight');

      const list = await getSessionMemories('proj-order');
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe(item1.id);
      expect(list[1].id).toBe(item2.id);
    });

    it('respects the limit argument', async () => {
      for (let i = 1; i <= 5; i++) {
        await recordSessionMemory('proj-limit', `Insight ${i}`);
        await new Promise(r => setTimeout(r, 5));
      }

      const latestTwo = await getSessionMemories('proj-limit', 2);
      expect(latestTwo).toHaveLength(2);
      expect(latestTwo[0].insight).toBe('Insight 4');
      expect(latestTwo[1].insight).toBe('Insight 5');
    });

    it('rejects recording with empty projectId or empty insight', async () => {
      await expect(recordSessionMemory('', 'some insight')).rejects.toThrow('projectId is required');
      await expect(recordSessionMemory('proj', '   ')).rejects.toThrow('insight must not be empty');
    });
  });

  describe('Bounded rotation & pruneSessionMemories', () => {
    it('automatically prunes oldest entries when exceeding maxItems', async () => {
      // Record 5 items with maxItems = 3
      for (let i = 1; i <= 5; i++) {
        await recordSessionMemory('proj-bound', `Insight #${i}`, { maxItems: 3 });
        await new Promise(r => setTimeout(r, 10));
      }

      const remaining = await getSessionMemories('proj-bound');
      expect(remaining).toHaveLength(3);
      expect(remaining.map(m => m.insight)).toEqual([
        'Insight #3',
        'Insight #4',
        'Insight #5'
      ]);
    });

    it('pruneSessionMemories removes exact excess count', async () => {
      for (let i = 1; i <= 4; i++) {
        await recordSessionMemory('proj-prune', `Entry ${i}`);
        await new Promise(r => setTimeout(r, 5));
      }

      const pruned = await pruneSessionMemories('proj-prune', 2);
      expect(pruned).toBe(2);

      const items = await getSessionMemories('proj-prune');
      expect(items).toHaveLength(2);
      expect(items[0].insight).toBe('Entry 3');
      expect(items[1].insight).toBe('Entry 4');
    });
  });

  describe('formatSessionMemoryForPrompt', () => {
    it('formats memories into markdown bullet list', () => {
      const formatted = formatSessionMemoryForPrompt([
        { id: '1', projectId: 'p', insight: 'Port 3000 is occupied by vite', timestamp: 1 },
        { id: '2', projectId: 'p', insight: 'Auth is in src/services/auth.ts', timestamp: 2 }
      ]);

      expect(formatted).toBe(
        '- Port 3000 is occupied by vite\n- Auth is in src/services/auth.ts'
      );
    });

    it('returns empty string for empty array', () => {
      expect(formatSessionMemoryForPrompt([])).toBe('');
    });
  });

  describe('recordTaskCompletionMemory and Task Lifecycle Hooks', () => {
    it('derives concise insight from task request', () => {
      const insight = deriveInsightFromTask({
        id: 'task-1',
        projectId: 'p',
        userRequest: 'Refactor database migration schema',
        state: 'verified',
        risk: 'low',
        acceptanceCriteria: [],
        createdAt: 1000,
        updatedAt: 1000
      });
      expect(insight).toBe('Task completed: Refactor database migration schema');
    });

    it('deduplicates memory writes for the same taskId', async () => {
      const task = await taskStore.createTask('proj-dedup', 'Configure tailwind theme');

      const first = await recordTaskCompletionMemory(task);
      expect(first).not.toBeNull();

      const second = await recordTaskCompletionMemory(task);
      expect(second?.id).toBe(first?.id);

      const memories = await getSessionMemories('proj-dedup');
      expect(memories).toHaveLength(1);
    });

    it('automatically records memory when task reaches verified state via updateTaskState', async () => {
      const task = await taskStore.createTask('proj-hook', 'Set up Vitest test runner');
      await taskStore.updateTaskState(task.id, 'running');
      await taskStore.updateTaskState(task.id, 'verifying');
      await taskStore.updateTaskState(task.id, 'verified');

      // Wait brief tick for async catch promise
      await new Promise(r => setTimeout(r, 20));

      const memories = await getSessionMemories('proj-hook');
      expect(memories).toHaveLength(1);
      expect(memories[0].insight).toContain('Set up Vitest test runner');
      expect(memories[0].sourceTaskId).toBe(task.id);
    });

    it('automatically records memory when task run finishes with completed status', async () => {
      const task = await taskStore.createTask('proj-run-hook', 'Add authentication middleware');
      const run = await taskStore.createRun(task.id, 1, 'gemini-1.5-pro', 'google');
      await taskStore.finishRun(run.id, 'completed');

      // Wait brief tick for async catch promise
      await new Promise(r => setTimeout(r, 20));

      const memories = await getSessionMemories('proj-run-hook');
      expect(memories).toHaveLength(1);
      expect(memories[0].insight).toContain('Add authentication middleware');
    });
  });

  describe('Deletion & Cleansing', () => {
    it('deletes specific memory item by id', async () => {
      const item = await recordSessionMemory('proj-del', 'Temp insight');
      expect(await getSessionMemories('proj-del')).toHaveLength(1);

      await deleteSessionMemory(item.id);
      expect(await getSessionMemories('proj-del')).toHaveLength(0);
    });

    it('clears all session memories for a project', async () => {
      await recordSessionMemory('proj-clear', 'Insight 1');
      await recordSessionMemory('proj-clear', 'Insight 2');
      await recordSessionMemory('proj-other', 'Other insight');

      await clearSessionMemories('proj-clear');

      expect(await getSessionMemories('proj-clear')).toHaveLength(0);
      expect(await getSessionMemories('proj-other')).toHaveLength(1);
    });
  });

  describe('Private Table Invariant (No VFS or ZIP leakage)', () => {
    it('sessionMemory items never appear in VFS listFiles or file tree', async () => {
      await recordSessionMemory('proj-leak', 'Sensitive project config insight');
      await createFile('proj-leak', '/src/index.ts', 'console.log("ok");');

      const vfsFiles = await listFiles('proj-leak');
      expect(vfsFiles).toHaveLength(1);
      expect(vfsFiles[0].path).toBe('/src/index.ts');

      // Private table does not touch files table
      const filePaths = vfsFiles.map(f => f.path.toLowerCase());
      expect(filePaths.some(p => p.includes('sessionmemory'))).toBe(false);
      expect(filePaths.some(p => p.includes('insight'))).toBe(false);
    });

    it('isExcludedFromZipExport protects changelog and lockfiles', () => {
      expect(isExcludedFromZipExport('ai_changelog.md')).toBe(true);
      expect(isExcludedFromZipExport('package-lock.json')).toBe(true);
    });
  });
});
