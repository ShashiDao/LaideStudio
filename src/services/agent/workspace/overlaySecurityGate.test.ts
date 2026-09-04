import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { runAgentLoop } from '../agentLoop';
import { useAppStore } from '../../../store';
import { db } from '../../../db';
import type { LLMAdapter, LLMStreamYield } from '../../llm/llmAdapter';
import {
  verifyCandidateOverlay,
  normalizeVerificationEvidence,
  isSecurityFailure,
  type CandidateVerificationResult
} from './candidateVerifier';
import { AgentWorkspaceOverlay } from './overlay';

describe('Security Verification Gate (Phase 1)', () => {
  const projectId = 'test-proj-security-gate';

  beforeEach(async () => {
    await db.files.clear();
    await db.projects.clear();
    useAppStore.getState().clearPendingPatches();
    vi.restoreAllMocks();
  });

  // A: The security scan runs before, and independently of, the Worker-availability gate.
  it('A: verifyCandidateOverlay blocks a candidate containing an exposed secret, even when Worker is unavailable', async () => {
    const originalWorker = globalThis.Worker;
    try {
      // @ts-expect-error - simulating an environment without Worker to prove the
      // security check does not depend on build/test infrastructure being present.
      delete globalThis.Worker;

      const overlay = new AgentWorkspaceOverlay(projectId, [
        {
          id: 'f-config',
          projectId,
          path: '/src/config.ts',
          content: 'export const key = "AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ1234567";',
          updatedAt: 1000
        }
      ]);

      const result = await verifyCandidateOverlay(overlay);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.secretMatches?.length).toBeGreaterThan(0);
      expect(result.secretMatches?.[0].file).toBe('/src/config.ts');
      // Never reached build/test verification, so those fields stay unset.
      expect(result.buildResult).toBeUndefined();
      expect(result.testResult).toBeUndefined();
      expect(result.skippedWorkerVerification).toBeUndefined();
    } finally {
      globalThis.Worker = originalWorker;
    }
  });

  // B: A candidate with no secrets is unaffected by the new check (control case).
  it('B: verifyCandidateOverlay is a no-op for candidates with no secret patterns', async () => {
    const overlay = new AgentWorkspaceOverlay(projectId, [
      {
        id: 'f-plain',
        projectId,
        path: '/src/utils.ts',
        content: 'export const add = (a: number, b: number) => a + b;',
        updatedAt: 1000
      }
    ]);

    const result = await verifyCandidateOverlay(overlay);
    expect(result.secretMatches).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.status).toBe('passed');
  });

  // C: isSecurityFailure() distinguishes security failures from every other failure kind.
  it('C: isSecurityFailure correctly identifies security vs. non-security results', () => {
    const secretResult: CandidateVerificationResult = {
      success: false,
      status: 'failed',
      secretMatches: [{ file: '/src/a.ts', line: 3, pattern: 'GitHub token', preview: 'ghp_…abcd' }]
    };
    const buildFailure: CandidateVerificationResult = {
      success: false,
      status: 'failed',
      buildResult: { success: false, error: 'Build failed', output: 'Build failed' }
    };
    const passing: CandidateVerificationResult = { success: true, status: 'passed' };

    expect(isSecurityFailure(secretResult)).toBe(true);
    expect(isSecurityFailure(buildFailure)).toBe(false);
    expect(isSecurityFailure(passing)).toBe(false);
  });

  // D: normalizeVerificationEvidence classifies a secret match as kind 'security'.
  it("D: normalizeVerificationEvidence classifies secret matches as kind 'security'", () => {
    const result: CandidateVerificationResult = {
      success: false,
      status: 'failed',
      error: 'Candidate verification blocked: 2 potential secret(s) detected.',
      output: '• /src/config.ts:1 — Google API key (AIza…2345)\n• /.env — .env file (entire file)',
      secretMatches: [
        { file: '/src/config.ts', line: 1, pattern: 'Google API key', preview: 'AIza…2345' },
        { file: '/.env', line: 0, pattern: '.env file', preview: '(entire file)' }
      ]
    };

    const { evidence, formattedText } = normalizeVerificationEvidence(result);
    expect(evidence.kind).toBe('security');
    expect(evidence.summary).toContain('2 potential secrets');
    expect(evidence.affectedFiles).toEqual(['/src/config.ts', '/.env']);
    expect(formattedText).toContain('Verification Kind: security');
  });

  // E: runAgentLoop routes a security-blocked verification straight to failure —
  // it must NOT consume the one bounded automatic repair attempt.
  it('E: agentLoop treats a security failure as terminal and never enters the repair loop', async () => {
    await db.files.add({
      id: 'f1',
      projectId,
      path: '/src/config.ts',
      content: 'export const key = "placeholder";',
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
              path: '/src/config.ts',
              type: 'replace',
              oldContent: 'export const key = "placeholder";',
              newContent: 'export const key = "AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ1234567";',
              rationale: 'Wire up the API key'
            })
          }
        };
      }
    };

    let verifierCalls = 0;
    const securityBlockingVerifier = async (): Promise<CandidateVerificationResult> => {
      verifierCalls++;
      return {
        success: false,
        status: 'failed',
        error: 'Candidate verification blocked: 1 potential secret(s) detected.',
        output: '• /src/config.ts:1 — Google API key (AIza…2345)',
        secretMatches: [{ file: '/src/config.ts', line: 1, pattern: 'Google API key', preview: 'AIza…2345' }]
      };
    };

    const messages = await runAgentLoop(
      'Wire up the API key',
      [],
      mockAdapter,
      projectId,
      undefined,
      undefined,
      undefined,
      5,
      { verifier: securityBlockingVerifier }
    );

    // Verifier ran exactly once: no repair attempt was spent on a security block.
    expect(verifierCalls).toBe(1);
    expect(messages.repairAttempts).toBe(0);
    expect(messages.verified).toBe(false);
    expect(useAppStore.getState().pendingPatches).toHaveLength(0);

    const blockedMsg = messages.find(
      (m) => m.role === 'assistant' && typeof m.content === 'string' && m.content.includes('🔒 Blocked')
    );
    expect(blockedMsg).toBeDefined();

    // Canonical VFS untouched.
    const canonical = await db.files.where({ projectId }).toArray();
    expect(canonical[0].content).toBe('export const key = "placeholder";');
  });
});
