import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { runAgentLoop } from '../agentLoop';
import { useAppStore } from '../../../store';
import { db } from '../../../db';
import { listFiles } from '../../fs/vfs';
import type { LLMAdapter, LLMRequest, LLMStreamYield } from '../../llm/llmAdapter';
import {
  verifyCandidateOverlay,
  normalizeVerificationEvidence,
  type CandidateVerificationResult
} from './candidateVerifier';
import { AgentWorkspaceOverlay, type WorkspaceOverlay } from './overlay';

describe('Autonomous Repair Loop Hardening & Fail-Closed Regression', () => {
  const projectId = 'test-proj-repair-hardening';

  beforeEach(async () => {
    await db.files.clear();
    await db.projects.clear();
    useAppStore.getState().clearPendingPatches();
    vi.restoreAllMocks();
  });

  // Requirement A: Worker unavailable is NOT success
  it('A: verifyCandidateOverlay fails closed as unavailable when Worker is undefined', async () => {
    const originalWorker = globalThis.Worker;
    try {
      // @ts-expect-error - simulating environment without Worker
      delete globalThis.Worker;

      const overlay = new AgentWorkspaceOverlay(projectId, [
        {
          id: 'f-app',
          projectId,
          path: '/src/App.tsx',
          content: 'export const App = () => <div>Hello</div>;',
          updatedAt: 1000
        }
      ]);
      const result = await verifyCandidateOverlay(overlay);

      expect(result.success).toBe(false);
      expect(result.status).toBe('unavailable');
      expect(result.skippedWorkerVerification).toBe(true);
      expect(result.error).toContain('Web Worker is unavailable in this environment');
    } finally {
      globalThis.Worker = originalWorker;
    }
  });

  // Requirement B & C: Worker unavailable does NOT produce verified candidate and does not publish patches
  it('B & C: agentLoop with unavailable worker marks verified=false and publishes no patches', async () => {
    await db.files.add({
      id: 'f1',
      projectId,
      path: '/src/Index.ts',
      content: 'export const hello = "world";',
      updatedAt: 1000
    });

    const mockAdapter: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(): AsyncGenerator<LLMStreamYield, void, unknown> {
        yield {
          type: 'tool_call',
          toolCall: {
            id: 'call_edit',
            name: 'write_file',
            args: JSON.stringify({
              path: '/src/Index.ts',
              type: 'replace',
              oldContent: 'export const hello = "world";',
              newContent: 'export const hello = "universe";',
              rationale: 'Update greeting'
            })
          }
        };
      }
    };

    // Verifier simulates Worker unavailable
    const unavailableVerifier = async (): Promise<CandidateVerificationResult> => ({
      success: false,
      status: 'unavailable',
      skippedWorkerVerification: true,
      error: 'Candidate verification unavailable: Web Worker is unavailable in this environment.'
    });

    const messages = await runAgentLoop(
      'Update greeting',
      [],
      mockAdapter,
      projectId,
      undefined,
      undefined,
      undefined,
      5,
      { verifier: unavailableVerifier }
    );

    // Verified must be false
    expect(messages.verified).toBe(false);
    expect(messages.repairAttempts).toBe(0); // Infrastructure unavailability does not trigger code repair
    expect(messages.verificationResult?.status).toBe('unavailable');

    // No patches published to pendingPatches
    expect(useAppStore.getState().pendingPatches).toHaveLength(0);

    // Explanatory message provided to user
    const alertMsg = messages.find(
      (m) => m.role === 'assistant' && typeof m.content === 'string' && m.content.includes('Candidate verification was unavailable')
    );
    expect(alertMsg).toBeDefined();

    // Canonical VFS untouched
    const canonical = await listFiles(projectId);
    expect(canonical[0].content).toBe('export const hello = "world";');
  });

  // Requirement D & E: Hard bound of 1 repair attempt, ignores external config attempt counts
  it('D & E: exactly one repair remains the hard limit even if caller passes maxRepairAttempts > 1', async () => {
    await db.files.add({
      id: 'f1',
      projectId,
      path: '/src/Test.ts',
      content: 'export const x = 1;',
      updatedAt: 1000
    });

    let streamCalls = 0;
    const mockAdapter: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(): AsyncGenerator<LLMStreamYield, void, unknown> {
        streamCalls++;
        yield {
          type: 'tool_call',
          toolCall: {
            id: `call_${streamCalls}`,
            name: 'write_file',
            args: JSON.stringify({
              path: '/src/Test.ts',
              type: 'replace',
              oldContent: 'export const x = 1;',
              newContent: 'export const x = 2;',
              rationale: `Edit ${streamCalls}`
            })
          }
        };
      }
    };

    let verifierCalls = 0;
    const failingVerifier = async (): Promise<CandidateVerificationResult> => {
      verifierCalls++;
      return {
        success: false,
        status: 'failed',
        error: 'Persistent compiler error'
      };
    };

    // Caller attempts to pass maxRepairAttempts: 5 (via untyped or legacy option)
    const messages = await runAgentLoop(
      'Modify Test.ts',
      [],
      mockAdapter,
      projectId,
      undefined,
      undefined,
      undefined,
      10,
      {
        verifier: failingVerifier,
        // @ts-expect-error - testing boundary resilience against unauthorized config expansion
        maxRepairAttempts: 5
      }
    );

    // Verifier ran exactly twice (initial attempt + 1 repair attempt)
    expect(verifierCalls).toBe(2);
    expect(messages.repairAttempts).toBe(1);
    expect(messages.verified).toBe(false);
    expect(useAppStore.getState().pendingPatches).toHaveLength(0);
  });

  // Requirement F: Failure evidence is normalized and bounded
  it('F: normalizeVerificationEvidence classifies kind, extracts summary and strictly bounds output length', () => {
    // 1. Build failure
    const buildResult: CandidateVerificationResult = {
      success: false,
      status: 'failed',
      buildResult: {
        success: false,
        error: 'SyntaxError: Unexpected token (1:10)',
        output: 'SyntaxError: Unexpected token (1:10)',
        entryPoint: '/src/main.tsx'
      }
    };
    const normBuild = normalizeVerificationEvidence(buildResult);
    expect(normBuild.evidence.kind).toBe('build');
    expect(normBuild.evidence.summary).toContain('SyntaxError');
    expect(normBuild.evidence.affectedFiles).toContain('/src/main.tsx');
    expect(normBuild.formattedText).toContain('Verification Kind: build');

    // 2. Test failure
    const testResult: CandidateVerificationResult = {
      success: false,
      status: 'failed',
      testResult: {
        status: 'failed',
        total: 2,
        passed: 1,
        failed: 1,
        durationMs: 50,
        output: '1 test failed: src/math.test.ts > add function',
        failedTests: ['src/math.test.ts > add function']
      }
    };
    const normTest = normalizeVerificationEvidence(testResult);
    expect(normTest.evidence.kind).toBe('tests');
    expect(normTest.evidence.summary).toContain('1 test(s) failed');
    expect(normTest.evidence.affectedFiles).toContain('src/math.test.ts > add function');

    // 3. Mixed failure
    const mixedResult: CandidateVerificationResult = {
      success: false,
      status: 'failed',
      buildResult: { success: false, error: 'Build failed', output: 'Build failed' },
      testResult: { status: 'failed', total: 1, passed: 0, failed: 1, durationMs: 10, output: 'Test failed' }
    };
    const normMixed = normalizeVerificationEvidence(mixedResult);
    expect(normMixed.evidence.kind).toBe('mixed');

    // 4. Bounded length check
    const hugeDiagnostic = 'A'.repeat(5000);
    const hugeResult: CandidateVerificationResult = {
      success: false,
      status: 'failed',
      error: 'Massive failure output',
      output: hugeDiagnostic
    };
    const maxChars = 500;
    const bounded = normalizeVerificationEvidence(hugeResult, maxChars);
    expect(bounded.formattedText.length).toBeLessThanOrEqual(maxChars);
    expect(bounded.formattedText).toContain('... [Output truncated to preserve context bounds]');
  });

  // Requirements G, H, I, J, K:
  // G: Same WorkspaceOverlay object is used for initial and repair execution
  // H: Initial edits remain after repair
  // I: Repair edits accumulate on the same overlay
  // J: Second verification sees initial + repair edits
  // K: Canonical VFS remains unchanged
  it('G-K: proves WorkspaceOverlay instance identity, edit accumulation, and canonical VFS isolation', async () => {
    await db.files.bulkAdd([
      {
        id: 'f1',
        projectId,
        path: '/src/ModuleA.ts',
        content: 'export const a = 1;',
        updatedAt: 1000
      },
      {
        id: 'f2',
        projectId,
        path: '/src/ModuleB.ts',
        content: 'export const b = 2;',
        updatedAt: 1000
      }
    ]);

    let streamStep = 0;
    const mockAdapter: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(req: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown> {
        streamStep++;
        const isRepair = req.messages.some(
          (m) => typeof m.content === 'string' && m.content.includes('[Verification Failure - Automatic Repair Attempt 1 of 1]')
        );

        if (isRepair) {
          // Repair phase: edit ModuleB.ts
          if (streamStep === 3) {
            yield {
              type: 'tool_call',
              toolCall: {
                id: 'call_repair_b',
                name: 'write_file',
                args: JSON.stringify({
                  path: '/src/ModuleB.ts',
                  type: 'replace',
                  oldContent: 'export const b = 2;',
                  newContent: 'export const b = 200;',
                  rationale: 'Fix ModuleB'
                })
              }
            };
          } else {
            yield { type: 'text', text: 'Repair complete.' };
          }
          return;
        }

        // Initial phase: edit ModuleA.ts
        if (streamStep === 1) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call_init_a',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/ModuleA.ts',
                type: 'replace',
                oldContent: 'export const a = 1;',
                newContent: 'export const a = 100;',
                rationale: 'Initial edit ModuleA'
              })
            }
          };
        } else {
          yield { type: 'text', text: 'Initial edit done.' };
        }
      }
    };

    const overlaysSeenByVerifier: WorkspaceOverlay[] = [];

    const mockVerifier = async (overlay: WorkspaceOverlay): Promise<CandidateVerificationResult> => {
      overlaysSeenByVerifier.push(overlay);

      const files = await overlay.materialize();
      const modA = files.find((f) => f.path === '/src/ModuleA.ts');
      const modB = files.find((f) => f.path === '/src/ModuleB.ts');

      if (overlaysSeenByVerifier.length === 1) {
        // First verification: ModuleA is 100, ModuleB is still 2
        expect(modA?.content).toBe('export const a = 100;');
        expect(modB?.content).toBe('export const b = 2;');
        return {
          success: false,
          status: 'failed',
          error: 'ModuleB must also be updated to 200'
        };
      }

      // Second verification: BOTH ModuleA (100) AND ModuleB (200) exist in SAME overlay!
      expect(modA?.content).toBe('export const a = 100;');
      expect(modB?.content).toBe('export const b = 200;');

      return {
        success: true,
        status: 'passed',
        output: 'Both modules verified successfully.'
      };
    };

    const messages = await runAgentLoop(
      'Update both modules',
      [],
      mockAdapter,
      projectId,
      undefined,
      undefined,
      undefined,
      10,
      { verifier: mockVerifier }
    );

    // Requirement G: EXACT same WorkspaceOverlay instance used in both passes
    expect(overlaysSeenByVerifier).toHaveLength(2);
    expect(overlaysSeenByVerifier[1]).toBe(overlaysSeenByVerifier[0]);

    // Requirement H & I: Both initial edits and repair edits accumulate on candidate diff
    const pending = useAppStore.getState().pendingPatches;
    expect(pending).toHaveLength(2);
    const patchA = pending.find((p) => p.path === '/src/ModuleA.ts');
    const patchB = pending.find((p) => p.path === '/src/ModuleB.ts');
    expect(patchA?.newContent).toBe('export const a = 100;');
    expect(patchB?.newContent).toBe('export const b = 200;');

    // Requirement J: Verified candidate status
    expect(messages.verified).toBe(true);
    expect(messages.repairAttempts).toBe(1);

    // Requirement K: Canonical VFS in IndexedDB was NEVER touched
    const canonical = await listFiles(projectId);
    const canonA = canonical.find((f) => f.path === '/src/ModuleA.ts');
    const canonB = canonical.find((f) => f.path === '/src/ModuleB.ts');
    expect(canonA?.content).toBe('export const a = 1;');
    expect(canonB?.content).toBe('export const b = 2;');
  });
});
