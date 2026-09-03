import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { runAgentLoop, type AgentLoopMessages } from '../agentLoop';
import { useAppStore } from '../../../store';
import { db } from '../../../db';
import { listFiles } from '../../fs/vfs';
import type { LLMAdapter, LLMRequest, LLMStreamYield } from '../../llm/llmAdapter';
import type { CandidateVerificationResult } from './candidateVerifier';
import type { WorkspaceOverlay } from './overlay';

describe('Autonomous Repair Loop in AgentWorkspaceOverlay', () => {
  const projectId = 'test-proj-repair-loop';

  beforeEach(async () => {
    await db.files.clear();
    await db.projects.clear();
    useAppStore.getState().clearPendingPatches();
    vi.restoreAllMocks();
  });

  it('finishes with verified candidate on first pass if verification passes immediately (0 repairs)', async () => {
    await db.files.add({
      id: 'f1',
      projectId,
      path: '/src/Math.ts',
      content: 'export function add(a: number, b: number) { return a + b; }',
      updatedAt: 1000
    });

    let callCount = 0;
    const mockAdapter: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(_req: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown> {
        callCount++;
        if (callCount === 1) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call_edit_1',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/Math.ts',
                type: 'replace',
                oldContent: 'export function add(a: number, b: number) { return a + b; }',
                newContent: 'export function add(a: number, b: number) { return a + b; }\nexport function sub(a: number, b: number) { return a - b; }',
                rationale: 'Add subtraction'
              })
            }
          };
        } else {
          yield { type: 'text', text: 'Added subtract function successfully.' };
        }
      }
    };

    let verifierCalls = 0;
    const mockVerifier = async (): Promise<CandidateVerificationResult> => {
      verifierCalls++;
      return {
        success: true,
        output: 'All tests passed: 1 suite, 2 tests.'
      };
    };

    const messages = await runAgentLoop(
      'Add subtraction',
      [],
      mockAdapter,
      projectId,
      undefined,
      undefined,
      undefined,
      10,
      { verifier: mockVerifier }
    );

    // Verifier was called exactly once
    expect(verifierCalls).toBe(1);

    // 0 repair attempts occurred
    expect(messages.repairAttempts).toBe(0);
    expect(messages.verified).toBe(true);
    expect(messages.verificationResult?.success).toBe(true);

    // Candidate diff was published to pendingPatches
    const pending = useAppStore.getState().pendingPatches;
    expect(pending).toHaveLength(1);
    expect(pending[0].path).toBe('/src/Math.ts');
    expect(pending[0].newContent).toContain('sub(a: number, b: number)');

    // Canonical VFS was NEVER mutated
    const canonical = await listFiles(projectId);
    expect(canonical).toHaveLength(1);
    expect(canonical[0].content).not.toContain('sub(');
  });

  it('executes bounded repair loop on failure: passes error evidence, repairs in SAME overlay, and finishes verified', async () => {
    await db.files.add({
      id: 'f1',
      projectId,
      path: '/src/Calculator.ts',
      content: 'export const version = "1.0.0";',
      updatedAt: 1000
    });

    let streamInvocations = 0;
    let receivedFailureEvidence = false;

    const mockAdapter: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(req: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown> {
        streamInvocations++;

        // Inspect incoming messages in stream
        const lastMsg = req.messages[req.messages.length - 1];
        if (typeof lastMsg?.content === 'string' && lastMsg.content.includes('[Verification Failure - Automatic Repair Attempt 1 of 1]')) {
          receivedFailureEvidence = true;
          expect(lastMsg.content).toContain('SyntaxError: Unexpected token in Calculator.ts:2');

          // Second pass: Agent repairs the broken syntax in the candidate overlay
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call_repair_1',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/Calculator.ts',
                type: 'replace',
                oldContent: 'export const version = "1.0.0";\nconst broken = ;;;',
                newContent: 'export const version = "1.0.0";\nexport const multiply = (a: number, b: number) => a * b;',
                rationale: 'Repair broken syntax'
              })
            }
          };
          return;
        }

        // Check if previous message was tool result for repair
        const toolResultMsg = req.messages[req.messages.length - 1];
        if (toolResultMsg?.role === 'tool' && toolResultMsg.toolCallId === 'call_repair_1') {
          yield { type: 'text', text: 'I have repaired the syntax error.' };
          return;
        }

        // First pass: Agent introduces buggy/broken syntax
        if (streamInvocations === 1) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call_initial_bug',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/Calculator.ts',
                type: 'replace',
                oldContent: 'export const version = "1.0.0";',
                newContent: 'export const version = "1.0.0";\nconst broken = ;;;',
                rationale: 'Introduce feature with bug'
              })
            }
          };
        } else {
          yield { type: 'text', text: 'Changes applied.' };
        }
      }
    };

    let verifierAttempts = 0;
    const mockVerifier = async (overlay: WorkspaceOverlay): Promise<CandidateVerificationResult> => {
      verifierAttempts++;
      const materialized = await overlay.materialize();
      const calcFile = materialized.find((f) => f.path === '/src/Calculator.ts');

      // First verification attempt: fails because of broken syntax
      if (verifierAttempts === 1) {
        expect(calcFile?.content).toContain('const broken = ;;;');
        return {
          success: false,
          error: 'SyntaxError: Unexpected token in Calculator.ts:2',
          output: 'Verification failed with syntax error.'
        };
      }

      // Second verification attempt: succeeds because repair was applied in SAME overlay
      expect(calcFile?.content).toContain('multiply = (a: number, b: number)');
      return {
        success: true,
        output: 'Candidate verification succeeded after repair.'
      };
    };

    const repairAttemptsReported: number[] = [];
    const messages: AgentLoopMessages = await runAgentLoop(
      'Add multiply feature',
      [],
      mockAdapter,
      projectId,
      undefined,
      undefined,
      undefined,
      10,
      {
        verifier: mockVerifier,
        onRepairAttempt: (attempt) => {
          repairAttemptsReported.push(attempt);
        }
      }
    );

    // 1. Verifier called exactly 2 times (initial fail, second pass)
    expect(verifierAttempts).toBe(2);

    // 2. Exactly 1 repair attempt was executed
    expect(messages.repairAttempts).toBe(1);
    expect(repairAttemptsReported).toEqual([1]);
    expect(receivedFailureEvidence).toBe(true);
    expect(messages.verified).toBe(true);
    expect(messages.verificationResult?.success).toBe(true);

    // 3. Final candidate diff has the repaired content
    const pending = useAppStore.getState().pendingPatches;
    expect(pending).toHaveLength(1);
    expect(pending[0].path).toBe('/src/Calculator.ts');
    expect(pending[0].newContent).toContain('multiply = (a: number, b: number)');

    // 4. Canonical VFS remained completely isolated and untouched
    const canonical = await listFiles(projectId);
    expect(canonical[0].content).toBe('export const version = "1.0.0";');
  });

  it('stops with failure and never loops infinitely when the single repair attempt fails', async () => {
    await db.files.add({
      id: 'f1',
      projectId,
      path: '/src/Broken.ts',
      content: 'export const ready = true;',
      updatedAt: 1000
    });

    let adapterStreamCalls = 0;

    const mockAdapter: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(req: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown> {
        adapterStreamCalls++;

        const lastMsg = req.messages[req.messages.length - 1];
        if (typeof lastMsg?.content === 'string' && lastMsg.content.includes('[Verification Failure - Automatic Repair Attempt 1 of 1]')) {
          // Attempt repair, but repair also fails
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call_repair_still_broken',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/Broken.ts',
                type: 'replace',
                oldContent: 'export const ready = true;',
                newContent: 'export const stillBroken = undefined.foo;',
                rationale: 'Failed repair attempt'
              })
            }
          };
          return;
        }

        if (lastMsg?.role === 'tool' && lastMsg.toolCallId === 'call_repair_still_broken') {
          yield { type: 'text', text: 'Repair patch sent.' };
          return;
        }

        // Initial edit
        if (adapterStreamCalls === 1) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call_init',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/Broken.ts',
                type: 'replace',
                oldContent: 'export const ready = true;',
                newContent: 'export const initialError = undefined.bar;',
                rationale: 'Initial edit'
              })
            }
          };
        } else {
          yield { type: 'text', text: 'Initial patch sent.' };
        }
      }
    };

    let verifierAttempts = 0;
    const mockVerifier = async (): Promise<CandidateVerificationResult> => {
      verifierAttempts++;
      return {
        success: false,
        error: `TypeError: Cannot read properties of undefined (attempt ${verifierAttempts})`,
        output: 'Verification failed'
      };
    };

    const messages = await runAgentLoop(
      'Modify Broken.ts',
      [],
      mockAdapter,
      projectId,
      undefined,
      undefined,
      undefined,
      10,
      { verifier: mockVerifier }
    );

    // Verifier called exactly twice: once on initial candidate, once after repair attempt 1
    expect(verifierAttempts).toBe(2);

    // Repair attempts bounded to 1
    expect(messages.repairAttempts).toBe(1);
    expect(messages.verified).toBe(false);
    expect(messages.verificationResult?.success).toBe(false);

    // Candidate diff must NOT be published as verified
    const pending = useAppStore.getState().pendingPatches;
    expect(pending).toHaveLength(0);

    // Messages must contain the failure warning
    const failureMsg = messages.find(m =>
      m.role === 'assistant' &&
      typeof m.content === 'string' &&
      m.content.includes('Automatic repair failed')
    );
    expect(failureMsg).toBeDefined();

    // Canonical VFS remains pristine
    const canonical = await listFiles(projectId);
    expect(canonical[0].content).toBe('export const ready = true;');
  });

  it('cleanly aborts mid-repair without verifying or publishing patches', async () => {
    await db.files.add({
      id: 'f1',
      projectId,
      path: '/src/Index.ts',
      content: 'console.log("hello");',
      updatedAt: 1000
    });

    const abortController = new AbortController();
    let streamCount = 0;

    const mockAdapter: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(req: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown> {
        streamCount++;

        const lastMsg = req.messages[req.messages.length - 1];
        if (typeof lastMsg?.content === 'string' && lastMsg.content.includes('[Verification Failure - Automatic Repair Attempt 1 of 1]')) {
          yield { type: 'text', text: 'Starting repair...' };
          // Abort during repair stream
          abortController.abort();
          return;
        }

        if (streamCount === 1) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call_init',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/Index.ts',
                type: 'replace',
                oldContent: 'console.log("hello");',
                newContent: 'console.log("broken");',
                rationale: 'Init'
              })
            }
          };
        } else {
          yield { type: 'text', text: 'First edit done.' };
        }
      }
    };

    let verifierCalls = 0;
    const mockVerifier = async (): Promise<CandidateVerificationResult> => {
      verifierCalls++;
      return {
        success: false,
        error: 'Initial error',
        output: 'Failed'
      };
    };

    const messages = await runAgentLoop(
      'Test abort during repair',
      [],
      mockAdapter,
      projectId,
      undefined,
      undefined,
      abortController.signal,
      10,
      { verifier: mockVerifier }
    );

    // Initial verifier ran once, then repair was triggered and aborted
    expect(verifierCalls).toBe(1);
    expect(useAppStore.getState().pendingPatches).toHaveLength(0);
    expect(messages.some(m => m.role === 'user' && typeof m.content === 'string' && m.content.includes('Test abort during repair'))).toBe(true);
  });

  it('accumulates sequential multi-file edits across initial phase and repair phase within the SAME overlay while keeping canonical VFS untouched', async () => {
    await db.files.bulkAdd([
      {
        id: 'f1',
        projectId,
        path: '/src/Config.ts',
        content: 'export const CONFIG = { debug: false };',
        updatedAt: 1000
      },
      {
        id: 'f2',
        projectId,
        path: '/src/Logger.ts',
        content: 'export function log(msg: string) { console.log(msg); }',
        updatedAt: 1000
      }
    ]);

    let step = 0;
    const mockAdapter: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(req: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown> {
        step++;

        const failureMsg = req.messages.find(m =>
          typeof m.content === 'string' &&
          m.content.includes('[Verification Failure - Automatic Repair Attempt 1 of 1]')
        );

        if (failureMsg) {
          // Repair phase: edit Logger.ts AND re-edit Config.ts to fix the issue
          if (step === 3) {
            yield {
              type: 'tool_call',
              toolCall: {
                id: 'call_repair_logger',
                name: 'write_file',
                args: JSON.stringify({
                  path: '/src/Logger.ts',
                  type: 'replace',
                  oldContent: 'export function log(msg: string) { console.log(msg); }',
                  newContent: 'export function log(msg: string) { if (CONFIG.debug) console.log("[DEBUG]", msg); }',
                  rationale: 'Add debug check'
                })
              }
            };
          } else {
            yield { type: 'text', text: 'Repaired Logger.ts and Config.ts.' };
          }
          return;
        }

        // Initial phase: agent edits Config.ts but forgets to export debug properly
        if (step === 1) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call_edit_config',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/Config.ts',
                type: 'replace',
                oldContent: 'export const CONFIG = { debug: false };',
                newContent: 'export const CONFIG = { debug: true, broken: true };',
                rationale: 'Enable debug'
              })
            }
          };
        } else {
          yield { type: 'text', text: 'Config updated.' };
        }
      }
    };

    let verifyCount = 0;
    const mockVerifier = async (overlay: WorkspaceOverlay): Promise<CandidateVerificationResult> => {
      verifyCount++;
      const files = await overlay.materialize();
      const config = files.find((f) => f.path === '/src/Config.ts');
      const logger = files.find((f) => f.path === '/src/Logger.ts');

      if (verifyCount === 1) {
        expect(config?.content).toContain('broken: true');
        expect(logger?.content).toBe('export function log(msg: string) { console.log(msg); }');
        return {
          success: false,
          error: 'Config has broken property; Logger not updated to reference debug.',
          output: 'Verification check failed.'
        };
      }

      // In second verification attempt: BOTH Config.ts (from step 1) AND Logger.ts (from repair step) exist in SAME overlay!
      expect(config.content).toContain('broken: true');
      expect(logger.content).toContain('[DEBUG]');

      return {
        success: true,
        output: 'All multi-file edits verified.'
      };
    };

    const messages = await runAgentLoop(
      'Update config and logger',
      [],
      mockAdapter,
      projectId,
      undefined,
      undefined,
      undefined,
      10,
      { verifier: mockVerifier }
    );

    expect(verifyCount).toBe(2);
    expect(messages.repairAttempts).toBe(1);
    expect(messages.verified).toBe(true);

    // Diff in pendingPatches includes BOTH modified files
    const pending = useAppStore.getState().pendingPatches;
    expect(pending).toHaveLength(2);
    expect(pending.some(p => p.path === '/src/Config.ts')).toBe(true);
    expect(pending.some(p => p.path === '/src/Logger.ts')).toBe(true);

    // Canonical VFS untouched
    const canonical = await listFiles(projectId);
    const origConfig = canonical.find(f => f.path === '/src/Config.ts');
    const origLogger = canonical.find(f => f.path === '/src/Logger.ts');
    expect(origConfig?.content).toBe('export const CONFIG = { debug: false };');
    expect(origLogger?.content).toBe('export function log(msg: string) { console.log(msg); }');
  });
});
