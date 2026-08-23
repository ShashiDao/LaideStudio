import { describe, it, expect, beforeEach } from 'vitest';
import type { ProvenanceEntry, ProvenanceTestResult } from '../../db';
import { 
  computeFileAiBlame, 
  getFileAiBlameCached, 
  clearBlameCache 
} from './blame';

describe('AI Blame computation & caching service', () => {
  beforeEach(() => {
    clearBlameCache();
  });

  const sampleTestResult: ProvenanceTestResult = {
    passed: 4,
    failed: 0,
    total: 4,
    status: 'passed',
    output: 'Tests run: 4, Passed: 4, Failed: 0'
  };

  const failingTestResult: ProvenanceTestResult = {
    passed: 3,
    failed: 1,
    total: 4,
    failedTests: ['subtract handles negative numbers'],
    status: 'failed',
    output: 'Tests run: 4, Passed: 3, Failed: 1'
  };

  it('returns empty blame when no entries exist', () => {
    const content = 'line 1\nline 2\nline 3';
    const result = computeFileAiBlame([], content);

    expect(result.blameMap.size).toBe(0);
    expect(result.lines.length).toBe(3);
    expect(result.lines[0].entry).toBeNull();
    expect(result.hasAiHistory).toBe(false);
  });

  it('blames all lines of newly created file to the creating AI entry', () => {
    const content = 'export function add(a: number, b: number) {\n  return a + b;\n}\n';
    const entry: ProvenanceEntry = {
      id: 'prov-1',
      projectId: 'proj-1',
      filePath: '/src/math.ts',
      beforeHash: '',
      afterHash: 'hash-1',
      model: 'claude-3-5-sonnet',
      provider: 'anthropic',
      rationale: 'Create math utility functions',
      timestamp: 1700000000000,
      prevEntryHash: '0'.repeat(64),
      entryHash: 'entry-hash-1',
      afterContent: content,
      testResult: sampleTestResult
    };

    const result = computeFileAiBlame([entry], content);

    expect(result.hasAiHistory).toBe(true);
    expect(result.blameMap.size).toBe(4);
    expect(result.blameMap.get(1)?.model).toBe('claude-3-5-sonnet');
    expect(result.blameMap.get(2)?.model).toBe('claude-3-5-sonnet');
    expect(result.blameMap.get(1)?.testResult?.status).toBe('passed');
  });

  it('accurately attributes lines across multiple sequential patches', () => {
    const v1Content = 'line 1: init\nline 2: init\nline 3: init';
    const v2Content = 'line 1: init\nline 2: modified by gpt4\nline 3: init';

    const entry1: ProvenanceEntry = {
      id: 'prov-1',
      projectId: 'proj-1',
      filePath: '/src/file.txt',
      beforeHash: '',
      afterHash: 'h1',
      model: 'claude-3-5-sonnet',
      provider: 'anthropic',
      rationale: 'Init file',
      timestamp: 1000,
      prevEntryHash: '0'.repeat(64),
      entryHash: 'eh1',
      beforeContent: '',
      afterContent: v1Content,
      testResult: sampleTestResult
    };

    const entry2: ProvenanceEntry = {
      id: 'prov-2',
      projectId: 'proj-1',
      filePath: '/src/file.txt',
      beforeHash: 'h1',
      afterHash: 'h2',
      model: 'gpt-4o',
      provider: 'openai',
      rationale: 'Update second line',
      timestamp: 2000,
      prevEntryHash: 'eh1',
      entryHash: 'eh2',
      beforeContent: v1Content,
      afterContent: v2Content,
      testResult: failingTestResult
    };

    const result = computeFileAiBlame([entry1, entry2], v2Content);

    expect(result.blameMap.size).toBe(3);
    // Line 1 unmodified from entry1
    expect(result.blameMap.get(1)?.id).toBe('prov-1');
    expect(result.blameMap.get(1)?.model).toBe('claude-3-5-sonnet');

    // Line 2 modified in entry2
    expect(result.blameMap.get(2)?.id).toBe('prov-2');
    expect(result.blameMap.get(2)?.model).toBe('gpt-4o');
    expect(result.blameMap.get(2)?.testResult?.status).toBe('failed');

    // Line 3 unmodified from entry1
    expect(result.blameMap.get(3)?.id).toBe('prov-1');
  });

  it('handles user typing manual lines after an AI patch without attributing them to AI', () => {
    const aiContent = 'line 1\nline 2\nline 3';
    const userEditedContent = 'line 1\nline 2\nuser manually typed this\nline 3';

    const entry: ProvenanceEntry = {
      id: 'prov-1',
      projectId: 'proj-1',
      filePath: '/src/demo.txt',
      beforeHash: '',
      afterHash: 'h1',
      model: 'gemini-1.5-pro',
      provider: 'google',
      rationale: 'Initial scaffold',
      timestamp: 1000,
      prevEntryHash: '0'.repeat(64),
      entryHash: 'eh1',
      afterContent: aiContent
    };

    const result = computeFileAiBlame([entry], userEditedContent);

    expect(result.blameMap.get(1)?.id).toBe('prov-1');
    expect(result.blameMap.get(2)?.id).toBe('prov-1');
    // Line 3 is user-typed, so should not have an AI entry in blameMap
    expect(result.blameMap.get(3)).toBeUndefined();
    // Line 4 is the original line 3
    expect(result.blameMap.get(4)?.id).toBe('prov-1');
  });

  it('memoizes calculation with getFileAiBlameCached for high performance', () => {
    const content = 'console.log("hello");\n';
    const entry: ProvenanceEntry = {
      id: 'prov-1',
      projectId: 'proj-1',
      filePath: '/src/main.ts',
      beforeHash: '',
      afterHash: 'h1',
      model: 'claude-3-5-sonnet',
      timestamp: 1000,
      prevEntryHash: '0'.repeat(64),
      entryHash: 'eh1',
      afterContent: content
    };

    const res1 = getFileAiBlameCached('/src/main.ts', [entry], content);
    const res2 = getFileAiBlameCached('/src/main.ts', [entry], content);

    // Same cached object reference returned
    expect(res1).toBe(res2);
    expect(res1.blameMap.get(1)?.id).toBe('prov-1');
  });
});
