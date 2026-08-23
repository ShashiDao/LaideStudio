import { describe, it, expect } from 'vitest';
import type { LLMAdapter, LLMRequest, LLMStreamYield } from '../llm/llmAdapter';
import type { FileItem, ProvenanceTestResult } from '../../db';
import { 
  runSimulatedAgentCandidate, 
  evaluateCandidatePatches, 
  runEnsembleDualEvaluation,
  type EnsembleCandidateProfile 
} from './ensemble';

describe('Ensemble Dual-Provider Service', () => {
  const baseFiles: FileItem[] = [
    {
      id: 'f1',
      projectId: 'p1',
      path: '/src/math.ts',
      content: 'export function add(a: number, b: number) {\n  return a + b;\n}\n',
      updatedAt: 1000
    },
    {
      id: 'f2',
      projectId: 'p1',
      path: '/src/math.test.ts',
      content: `
import { describe, it, expect } from 'vitest';
import { add } from './math';

describe('math', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
});
`,
      updatedAt: 1000
    }
  ];

  const mockTestRunner = async (files: FileItem[]): Promise<ProvenanceTestResult> => {
    const mathFile = files.find(f => f.path === '/src/math.ts');
    const content = mathFile?.content || '';
    if (content.includes('999') || content.includes('return 0;')) {
      return {
        passed: 0,
        failed: 1,
        total: 1,
        status: 'failed',
        failedTests: ['math > adds two numbers'],
        output: '❌ math > adds two numbers\n   Expected 5 but got 999'
      };
    }
    return {
      passed: 1,
      failed: 0,
      total: 1,
      status: 'passed',
      output: '✅ math > adds two numbers'
    };
  };

  const createMockAdapter = (proposedPatchContent: string, rationale: string): LLMAdapter => {
    let callCount = 0;
    return {
      countTokens: async () => 10,
      send: async () => ({ text: 'done', usage: { inputTokens: 10, outputTokens: 10 } }),
      async *stream(_req: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown> {
        callCount++;
        if (callCount === 1) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: `tc_${Math.random()}`,
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/math.ts',
                type: 'replace',
                newContent: proposedPatchContent,
                rationale
              })
            }
          };
        } else {
          yield { type: 'text', text: 'Proposed patch to math.ts' };
        }
      }
    };
  };

  it('runs candidate in simulated sandbox without mutating baseFiles array', async () => {
    const profile: EnsembleCandidateProfile = {
      id: 'prof-1',
      label: 'Model Alpha',
      provider: 'anthropic',
      model: 'claude-3-7-sonnet',
      adapter: createMockAdapter('export function add(a: number, b: number) { return a + b + 0; }', 'Cleaned up add')
    };

    const originalContent = baseFiles[0].content;
    const res = await runSimulatedAgentCandidate(
      'Fix math.ts',
      [],
      profile,
      'p1',
      'System prompt',
      baseFiles
    );

    expect(res.patches).toHaveLength(1);
    expect(res.patches[0].path).toBe('/src/math.ts');
    expect(res.patches[0].newContent).toBe('export function add(a: number, b: number) { return a + b + 0; }');
    // baseFiles must remain untouched
    expect(baseFiles[0].content).toBe(originalContent);
  });

  it('evaluates candidate patches against sandboxed test runner correctly', async () => {
    // Valid patch (passes test)
    const validPatch = [{
      path: '/src/math.ts',
      type: 'replace' as const,
      newContent: 'export function add(a: number, b: number) {\n  return a + b;\n}\n',
      rationale: 'Keep passing test'
    }];
    const testPass = await evaluateCandidatePatches(baseFiles, validPatch, mockTestRunner);
    expect(testPass.status).toBe('passed');
    expect(testPass.failed).toBe(0);

    // Broken patch (fails test)
    const brokenPatch = [{
      path: '/src/math.ts',
      type: 'replace' as const,
      newContent: 'export function add(a: number, b: number) {\n  return 999;\n}\n',
      rationale: 'Broken sum'
    }];
    const testFail = await evaluateCandidatePatches(baseFiles, brokenPatch, mockTestRunner);
    expect(testFail.status).toBe('failed');
    expect(testFail.failed).toBeGreaterThan(0);
  });

  it('auto-selects Candidate A when only Candidate A passes sandboxed tests', async () => {
    const profileA: EnsembleCandidateProfile = {
      id: 'p-a',
      label: 'Claude 3.7',
      provider: 'anthropic',
      model: 'claude-3-7-sonnet',
      adapter: createMockAdapter('export function add(a: number, b: number) {\n  return a + b; // passing\n}\n', 'Correct fix')
    };

    const profileB: EnsembleCandidateProfile = {
      id: 'p-b',
      label: 'GPT-4o',
      provider: 'openai',
      model: 'gpt-4o',
      adapter: createMockAdapter('export function add(a: number, b: number) {\n  return 0; // buggy\n}\n', 'Buggy fix')
    };

    const result = await runEnsembleDualEvaluation(
      'Fix math.ts',
      [],
      profileA,
      profileB,
      'p1',
      'System prompt',
      baseFiles,
      undefined,
      undefined,
      undefined,
      mockTestRunner
    );

    expect(result.candidateA.status).toBe('passed');
    expect(result.candidateB.status).toBe('failed');
    expect(result.passedCandidates).toHaveLength(1);
    expect(result.chosenCandidate?.candidateId).toBe('A');
    expect(result.requiresUserSelection).toBe(false);
    expect(result.summary).toContain('Ensemble auto-selected candidate Claude 3.7');
  });

  it('requires user selection when both candidates pass tests', async () => {
    const profileA: EnsembleCandidateProfile = {
      id: 'p-a',
      label: 'Claude 3.7',
      provider: 'anthropic',
      model: 'claude-3-7-sonnet',
      adapter: createMockAdapter('export function add(a: number, b: number) {\n  return a + b;\n}\n', 'Solution A')
    };

    const profileB: EnsembleCandidateProfile = {
      id: 'p-b',
      label: 'Gemini 1.5 Pro',
      provider: 'google',
      model: 'gemini-1.5-pro',
      adapter: createMockAdapter('export function add(a: number, b: number) {\n  const res = a + b;\n  return res;\n}\n', 'Solution B')
    };

    const result = await runEnsembleDualEvaluation(
      'Fix math.ts',
      [],
      profileA,
      profileB,
      'p1',
      'System prompt',
      baseFiles,
      undefined,
      undefined,
      undefined,
      mockTestRunner
    );

    expect(result.candidateA.status).toBe('passed');
    expect(result.candidateB.status).toBe('passed');
    expect(result.passedCandidates).toHaveLength(2);
    expect(result.requiresUserSelection).toBe(true);
    expect(result.summary).toContain('Both candidates');
  });
});
