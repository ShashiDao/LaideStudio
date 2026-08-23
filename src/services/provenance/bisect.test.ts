import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, type FileItem, type ProvenanceEntry, type ProvenanceTestResult } from '../../db';
import { 
  bisectBrokenTest, 
  reconstructHistoricalFiles, 
  isTestFailing, 
  formatEntryDiff 
} from './bisect';

describe('Bisect Provenance Service', () => {
  const projectId = 'test-bisect-project';

  beforeEach(async () => {
    await db.provenanceEntries.clear();
    await db.files.clear();
    await db.snapshots.clear();
  });

  describe('isTestFailing', () => {
    it('detects failure when status is error', () => {
      const res: ProvenanceTestResult = { passed: 0, failed: 0, total: 0, status: 'error', error: 'Syntax error' };
      expect(isTestFailing(res)).toBe(true);
    });

    it('detects failure when specific test name is in failedTests array', () => {
      const res: ProvenanceTestResult = { 
        passed: 2, 
        failed: 1, 
        total: 3, 
        status: 'failed', 
        failedTests: ['math > adds positive numbers', 'auth > handles token'] 
      };
      expect(isTestFailing(res, 'auth > handles token')).toBe(true);
      expect(isTestFailing(res, 'math > adds positive numbers')).toBe(true);
      expect(isTestFailing(res, 'unrelated test')).toBe(false);
    });

    it('detects failure from output string when specific test is named', () => {
      const res: ProvenanceTestResult = {
        passed: 1,
        failed: 1,
        total: 2,
        status: 'failed',
        output: '✅ sum test\n❌ parseToken > rejects expired token\n   Expected null'
      };
      expect(isTestFailing(res, 'parseToken > rejects expired token')).toBe(true);
      expect(isTestFailing(res, 'sum test')).toBe(false);
    });

    it('returns false for passed status', () => {
      const res: ProvenanceTestResult = { passed: 5, failed: 0, total: 5, status: 'passed' };
      expect(isTestFailing(res, 'any test')).toBe(false);
    });
  });

  describe('reconstructHistoricalFiles', () => {
    it('correctly rewinds file content in memory without altering live files', () => {
      const currentFiles: FileItem[] = [
        { id: '1', projectId, path: '/src/main.ts', content: 'const v = 3;', updatedAt: 300 },
        { id: '2', projectId, path: '/src/helper.ts', content: 'export const h = "new";', updatedAt: 300 }
      ];

      const entries: ProvenanceEntry[] = [
        {
          id: 'e1',
          projectId,
          filePath: '/src/main.ts',
          beforeContent: 'const v = 1;',
          afterContent: 'const v = 2;',
          beforeHash: 'h1',
          afterHash: 'h2',
          prevEntryHash: 'genesis',
          entryHash: 'entry1',
          timestamp: 100
        },
        {
          id: 'e2',
          projectId,
          filePath: '/src/main.ts',
          beforeContent: 'const v = 2;',
          afterContent: 'const v = 3;',
          beforeHash: 'h2',
          afterHash: 'h3',
          prevEntryHash: 'entry1',
          entryHash: 'entry2',
          timestamp: 200
        },
        {
          id: 'e3',
          projectId,
          filePath: '/src/helper.ts',
          beforeContent: '',
          afterContent: 'export const h = "new";',
          beforeHash: 'h0',
          afterHash: 'h4',
          prevEntryHash: 'entry2',
          entryHash: 'entry3',
          timestamp: 300
        }
      ];

      // After entry index 1 (e2): /src/main.ts should be 'const v = 3;', /src/helper.ts should NOT exist (reverted e3 creation)
      const stateAfterE2 = reconstructHistoricalFiles(currentFiles, entries, 1);
      expect(stateAfterE2.find(f => f.path === '/src/main.ts')?.content).toBe('const v = 3;');
      expect(stateAfterE2.find(f => f.path === '/src/helper.ts')).toBeUndefined();

      // After entry index 0 (e1): /src/main.ts should be 'const v = 2;'
      const stateAfterE1 = reconstructHistoricalFiles(currentFiles, entries, 0);
      expect(stateAfterE1.find(f => f.path === '/src/main.ts')?.content).toBe('const v = 2;');
      expect(stateAfterE1.find(f => f.path === '/src/helper.ts')).toBeUndefined();

      // Before genesis (targetIndex = -1): /src/main.ts should be 'const v = 1;'
      const stateBeforeGenesis = reconstructHistoricalFiles(currentFiles, entries, -1);
      expect(stateBeforeGenesis.find(f => f.path === '/src/main.ts')?.content).toBe('const v = 1;');
      expect(stateBeforeGenesis.find(f => f.path === '/src/helper.ts')).toBeUndefined();

      // Ensure original currentFiles array was not modified
      expect(currentFiles.find(f => f.path === '/src/main.ts')?.content).toBe('const v = 3;');
      expect(currentFiles.find(f => f.path === '/src/helper.ts')).toBeDefined();
    });
  });

  describe('formatEntryDiff', () => {
    it('produces standard unified diff lines', () => {
      const entry: ProvenanceEntry = {
        id: 'e-diff',
        projectId,
        filePath: '/src/calc.ts',
        beforeContent: 'export function add(a: number, b: number) {\n  return a + b;\n}',
        afterContent: 'export function add(a: number, b: number) {\n  return a - b; // BUG!\n}',
        beforeHash: 'b',
        afterHash: 'a',
        prevEntryHash: 'p',
        entryHash: 'e',
        timestamp: 100
      };

      const diff = formatEntryDiff(entry);
      expect(diff).toContain('--- /src/calc.ts');
      expect(diff).toContain('+++ /src/calc.ts');
      expect(diff).toContain('-  return a + b;');
      expect(diff).toContain('+  return a - b; // BUG!');
    });
  });

  describe('bisectBrokenTest Binary Search Algorithm', () => {
    it('binary searches and identifies the exact offending patch in synthetic history in O(log N) runs', async () => {
      // Create a sequence of 7 patches (indices 0 through 6).
      // Suppose patch index 3 (4th patch) introduces a breaking bug into /src/math.ts.
      // Patches 0, 1, 2 pass tests.
      // Patches 3, 4, 5, 6 fail tests.

      const entries: ProvenanceEntry[] = [];
      for (let i = 0; i < 7; i++) {
        const isBuggy = i >= 3;
        const beforeVal = i;
        const afterVal = i + 1;
        entries.push({
          id: `entry-${i}`,
          projectId,
          filePath: '/src/math.ts',
          beforeContent: `export const version = ${beforeVal}; // buggy: ${i >= 4}`,
          afterContent: `export const version = ${afterVal}; // buggy: ${isBuggy}`,
          beforeHash: `hash-before-${i}`,
          afterHash: `hash-after-${i}`,
          prevEntryHash: i === 0 ? 'genesis' : `hash-after-${i - 1}`,
          entryHash: `entry-hash-${i}`,
          model: i === 3 ? 'gemini-1.5-pro' : 'claude-3-5-sonnet',
          provider: i === 3 ? 'google' : 'anthropic',
          rationale: i === 3 ? 'Refactored math computation and changed operator' : `Routine update #${i}`,
          timestamp: 1000 + i * 60000
        });
      }

      await db.provenanceEntries.bulkAdd(entries);

      // Current live files reflect state after all 7 patches
      const currentLiveFiles: FileItem[] = [
        {
          id: 'live-file-1',
          projectId,
          path: '/src/math.ts',
          content: 'export const version = 7; // buggy: true',
          updatedAt: 1420
        },
        {
          id: 'live-file-2',
          projectId,
          path: '/src/math.test.ts',
          content: 'test suite file',
          updatedAt: 1000
        }
      ];

      await db.files.bulkAdd(currentLiveFiles);

      // Synthetic test runner: returns failure if file content contains "buggy: true"
      const testedStates: string[] = [];
      const mockTestRunner = async (files: FileItem[]): Promise<ProvenanceTestResult> => {
        const mathFile = files.find(f => f.path === '/src/math.ts');
        const content = mathFile?.content || '';
        testedStates.push(content);

        const hasBug = content.includes('buggy: true');
        if (hasBug) {
          return {
            passed: 0,
            failed: 1,
            total: 1,
            status: 'failed',
            failedTests: ['math > calculates sum correctly'],
            output: '❌ math > calculates sum correctly\n   Expected 10 but got 5'
          };
        }
        return {
          passed: 1,
          failed: 0,
          total: 1,
          status: 'passed',
          output: '✅ math > calculates sum correctly'
        };
      };

      const progressSteps: any[] = [];
      const result = await bisectBrokenTest({
        projectId,
        testName: 'math > calculates sum correctly',
        testRunner: mockTestRunner,
        onProgress: (p) => progressSteps.push(p)
      });

      expect(result.found).toBe(true);
      expect(result.offendingIndex).toBe(3); // Exact index 3!
      expect(result.offendingEntry?.id).toBe('entry-3');
      expect(result.offendingEntry?.model).toBe('gemini-1.5-pro');
      expect(result.offendingEntry?.provider).toBe('google');
      expect(result.offendingEntry?.rationale).toBe('Refactored math computation and changed operator');
      expect(result.diff).toContain('-export const version = 3;');
      expect(result.diff).toContain('+export const version = 4;');
      expect(result.failedPriorToHistory).toBe(false);

      // Verify that binary search tested <= 5 points (ceil(log2(7)) + 1 = 4 to 5 runs), NOT all 7 sequentially
      expect(result.totalStepsRun).toBeLessThanOrEqual(5);
      expect(progressSteps.length).toBeGreaterThan(0);
    });

    it('aborts cleanly when AbortSignal is triggered', async () => {
      const entries: ProvenanceEntry[] = [
        {
          id: 'e1',
          projectId,
          filePath: '/src/a.ts',
          beforeContent: 'a',
          afterContent: 'b',
          beforeHash: '1',
          afterHash: '2',
          prevEntryHash: 'g',
          entryHash: 'e1',
          timestamp: 100
        },
        {
          id: 'e2',
          projectId,
          filePath: '/src/a.ts',
          beforeContent: 'b',
          afterContent: 'c',
          beforeHash: '2',
          afterHash: '3',
          prevEntryHash: 'e1',
          entryHash: 'e2',
          timestamp: 200
        }
      ];
      await db.provenanceEntries.bulkAdd(entries);
      await db.files.add({
        id: 'f1',
        projectId,
        path: '/src/a.ts',
        content: 'c',
        updatedAt: 200
      });

      const controller = new AbortController();
      controller.abort();

      await expect(bisectBrokenTest({
        projectId,
        signal: controller.signal
      })).rejects.toThrow();
    });

    it('returns found: false when test is currently passing', async () => {
      await db.provenanceEntries.add({
        id: 'e1',
        projectId,
        filePath: '/src/a.ts',
        beforeContent: 'a',
        afterContent: 'b',
        beforeHash: '1',
        afterHash: '2',
        prevEntryHash: 'g',
        entryHash: 'e1',
        timestamp: 100
      });
      await db.files.add({
        id: 'f1',
        projectId,
        path: '/src/a.ts',
        content: 'b',
        updatedAt: 100
      });

      const passingRunner = async (): Promise<ProvenanceTestResult> => ({
        passed: 1,
        failed: 0,
        total: 1,
        status: 'passed',
        output: 'All tests pass.'
      });

      const res = await bisectBrokenTest({
        projectId,
        testRunner: passingRunner
      });

      expect(res.found).toBe(false);
      expect(res.reason).toContain('passing in the live codebase');
    });
  });
});
