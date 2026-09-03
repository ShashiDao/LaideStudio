// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../../db';
import { taskStore } from './taskStore';
import { runAgentLoop, type RunAgentLoopOptions } from '../agentLoop';
import { useAppStore } from '../../../store';
import { AgentWorkspaceOverlay } from '../workspace/overlay';
import type { LLMAdapter, LLMRequest, LLMStreamYield } from '../../llm/llmAdapter';
import type { CandidateVerificationResult } from '../workspace/candidateVerifier';

describe('Task Lifecycle & Durable Persistence (Prompt 5)', () => {
  const projectId = 'test-proj-lifecycle';

  beforeEach(async () => {
    await db.tasks.clear();
    await db.taskRuns.clear();
    await db.patchSets.clear();
    await db.files.clear();
    await db.projects.clear();
    useAppStore.getState().clearPendingPatches();
    vi.restoreAllMocks();
  });

  const createSimpleMockAdapter = (): LLMAdapter => {
    let call = 0;
    return {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream(_req: LLMRequest): AsyncGenerator<LLMStreamYield, void, unknown> {
        call++;
        if (call === 1) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call_1',
              name: 'write_file',
              args: JSON.stringify({
                path: '/src/main.ts',
                content: 'export const hello = "world";'
              })
            }
          };
        } else {
          yield {
            type: 'text',
            text: 'Finished applying edits.'
          };
        }
      }
    };
  };

  const invokeAgentLoop = async (
    userMsg: string,
    adapter: LLMAdapter,
    options?: RunAgentLoopOptions,
    signal?: AbortSignal
  ) => {
    return runAgentLoop(
      userMsg,
      [],
      adapter,
      projectId,
      undefined,
      undefined,
      signal,
      25,
      options
    );
  };

  it('A: New task persists CREATED state', async () => {
    const task = await taskStore.createTask(projectId, 'Implement feature A');
    expect(task.id).toBeDefined();
    expect(task.state).toBe('created');

    const persisted = await taskStore.getTask(task.id);
    expect(persisted).toBeDefined();
    expect(persisted?.state).toBe('created');
  });

  it('B: Task transitions CREATED → RUNNING', async () => {
    const task = await taskStore.createTask(projectId, 'Task B');
    expect(task.state).toBe('created');

    const updated = await taskStore.updateTaskState(task.id, 'running');
    expect(updated.state).toBe('running');

    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.state).toBe('running');
  });

  it('C: RUNNING state persists', async () => {
    const task = await taskStore.createTask(projectId, 'Task C');
    await taskStore.updateTaskState(task.id, 'running', { baseRevision: 'rev-c-1' });

    const persisted = await db.tasks.get(task.id);
    expect(persisted?.state).toBe('running');
    expect(persisted?.baseRevision).toBe('rev-c-1');
  });

  it('D: RUNNING → VERIFYING persists correctly', async () => {
    const task = await taskStore.createTask(projectId, 'Task D');
    await taskStore.updateTaskState(task.id, 'running');
    await taskStore.updateTaskState(task.id, 'verifying');

    const persisted = await db.tasks.get(task.id);
    expect(persisted?.state).toBe('verifying');
  });

  it('E: Successful verification produces VERIFIED', async () => {
    const task = await taskStore.createTask(projectId, 'Task E');

    const adapter = createSimpleMockAdapter();
    const verifier = vi.fn().mockResolvedValue({
      success: true,
      status: 'passed'
    } as CandidateVerificationResult);

    const result = await invokeAgentLoop('Create hello world', adapter, {
      taskId: task.id,
      verifier
    });

    expect(result.verified).toBe(true);
    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.state).toBe('verified');
    expect(persisted?.verificationStatus).toBe('passed');
  });

  it('F: Initial verification failure enters REPAIRING', async () => {
    const task = await taskStore.createTask(projectId, 'Task F');

    let verifierCalls = 0;
    const observedStates: string[] = [];

    const verifier = vi.fn().mockImplementation(async () => {
      verifierCalls++;
      const current = await taskStore.getTask(task.id);
      if (current) observedStates.push(current.state);

      if (verifierCalls === 1) {
        return {
          success: false,
          status: 'failed',
          error: 'SyntaxError on line 5'
        } as CandidateVerificationResult;
      }
      return {
        success: true,
        status: 'passed'
      } as CandidateVerificationResult;
    });

    let repairHookAttempt = 0;
    const onRepairAttempt = vi.fn().mockImplementation((attempt: number) => {
      repairHookAttempt = attempt;
    });

    await invokeAgentLoop('Create with initial failure', createSimpleMockAdapter(), {
      taskId: task.id,
      verifier,
      onRepairAttempt
    });

    expect(onRepairAttempt).toHaveBeenCalledWith(1, expect.stringContaining('SyntaxError'));
    expect(repairHookAttempt).toBe(1);
    expect(observedStates).toContain('verifying');
  });

  it('G: Repair returns to VERIFYING', async () => {
    const task = await taskStore.createTask(projectId, 'Task G');

    let verifierCalls = 0;
    const statesAtVerification: string[] = [];

    const verifier = vi.fn().mockImplementation(async () => {
      verifierCalls++;
      const current = await taskStore.getTask(task.id);
      if (current) statesAtVerification.push(current.state);

      if (verifierCalls === 1) {
        return {
          success: false,
          status: 'failed',
          error: 'Type error'
        } as CandidateVerificationResult;
      }
      return {
        success: true,
        status: 'passed'
      } as CandidateVerificationResult;
    });

    await invokeAgentLoop('Repair flow', createSimpleMockAdapter(), {
      taskId: task.id,
      verifier
    });

    expect(verifierCalls).toBe(2);
    // Both initial and second verification must occur while task is in 'verifying' state
    expect(statesAtVerification).toEqual(['verifying', 'verifying']);
  });

  it('H: Successful second verification produces VERIFIED', async () => {
    const task = await taskStore.createTask(projectId, 'Task H');

    let verifierCalls = 0;
    const verifier = vi.fn().mockImplementation(async () => {
      verifierCalls++;
      if (verifierCalls === 1) {
        return {
          success: false,
          status: 'failed',
          error: 'Failed test 1'
        } as CandidateVerificationResult;
      }
      return {
        success: true,
        status: 'passed'
      } as CandidateVerificationResult;
    });

    const result = await invokeAgentLoop('Task H repair success', createSimpleMockAdapter(), {
      taskId: task.id,
      verifier
    });

    expect(result.verified).toBe(true);
    expect(result.repairAttempts).toBe(1);

    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.state).toBe('verified');
    expect(persisted?.verificationStatus).toBe('passed');
    expect(persisted?.repairAttempts).toBe(1);
  });

  it('I: Second verification failure produces FAILED', async () => {
    const task = await taskStore.createTask(projectId, 'Task I');

    const verifier = vi.fn().mockResolvedValue({
      success: false,
      status: 'failed',
      error: 'Persistent compilation error'
    } as CandidateVerificationResult);

    const result = await invokeAgentLoop('Task I persistent failure', createSimpleMockAdapter(), {
      taskId: task.id,
      verifier
    });

    expect(result.verified).toBe(false);
    expect(result.repairAttempts).toBe(1);

    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.state).toBe('failed');
    expect(persisted?.verificationStatus).toBe('failed');
    expect(persisted?.repairAttempts).toBe(1);
    expect(persisted?.failureSummary).toContain('Persistent compilation error');
  });

  it('J: repairAttempts never exceeds 1', async () => {
    const task = await taskStore.createTask(projectId, 'Task J');

    let verifierCalls = 0;
    const verifier = vi.fn().mockImplementation(async () => {
      verifierCalls++;
      return {
        success: false,
        status: 'failed',
        error: `Failure #${verifierCalls}`
      } as CandidateVerificationResult;
    });

    const result = await invokeAgentLoop('Task J bounded repair', createSimpleMockAdapter(), {
      taskId: task.id,
      verifier
    });

    // Verifier was called once for candidate and once for repair = 2 calls total
    expect(verifierCalls).toBe(2);
    expect(result.repairAttempts).toBe(1);

    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.repairAttempts).toBe(1);
    expect(persisted?.state).toBe('failed');
  });

  it('K: Initial verification success never enters REPAIRING', async () => {
    const task = await taskStore.createTask(projectId, 'Task K');

    const verifier = vi.fn().mockResolvedValue({
      success: true,
      status: 'passed'
    } as CandidateVerificationResult);

    const onRepairAttempt = vi.fn();

    const result = await invokeAgentLoop('Task K first pass success', createSimpleMockAdapter(), {
      taskId: task.id,
      verifier,
      onRepairAttempt
    });

    expect(result.verified).toBe(true);
    expect(result.repairAttempts).toBe(0);
    expect(onRepairAttempt).not.toHaveBeenCalled();

    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.state).toBe('verified');
    expect(persisted?.repairAttempts).toBeUndefined();
  });

  it('L: Verification UNAVAILABLE never produces VERIFIED', async () => {
    const task = await taskStore.createTask(projectId, 'Task L');

    const verifier = vi.fn().mockResolvedValue({
      success: false,
      status: 'unavailable',
      error: 'Web Worker not supported in this environment'
    } as CandidateVerificationResult);

    const result = await invokeAgentLoop('Task L unavailable', createSimpleMockAdapter(), {
      taskId: task.id,
      verifier
    });

    expect(result.verified).toBe(false);

    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.state).toBe('failed');
    expect(persisted?.verificationStatus).toBe('unavailable');
    expect(persisted?.state).not.toBe('verified');
  });

  it('M: UNAVAILABLE does not trigger automatic repair', async () => {
    const task = await taskStore.createTask(projectId, 'Task M');

    let verifierCalls = 0;
    const verifier = vi.fn().mockImplementation(async () => {
      verifierCalls++;
      return {
        success: false,
        status: 'unavailable',
        error: 'Build worker crash'
      } as CandidateVerificationResult;
    });

    const onRepairAttempt = vi.fn();

    const result = await invokeAgentLoop('Task M unavailable no repair', createSimpleMockAdapter(), {
      taskId: task.id,
      verifier,
      onRepairAttempt
    });

    expect(verifierCalls).toBe(1); // Never called a second time
    expect(onRepairAttempt).not.toHaveBeenCalled();
    expect(result.repairAttempts).toBe(0);

    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.state).toBe('failed');
    expect(persisted?.verificationStatus).toBe('unavailable');
  });

  it('N: Abort during RUNNING produces ABORTED', async () => {
    const task = await taskStore.createTask(projectId, 'Task N');
    const controller = new AbortController();

    const adapter: LLMAdapter = {
      countTokens: async () => 10,
      send: async () => ({ text: 'ok', usage: { inputTokens: 10, outputTokens: 5 } }),
      async *stream() {
        // Trigger abort while running
        controller.abort();
        yield { type: 'text', text: 'starting...' };
      }
    };

    const result = await invokeAgentLoop(
      'Task N abort',
      adapter,
      { taskId: task.id },
      controller.signal
    );

    expect(result.verified).toBe(false);

    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.state).toBe('aborted');
  });

  it('O: Abort prevents repair', async () => {
    const task = await taskStore.createTask(projectId, 'Task O');
    const controller = new AbortController();

    const onRepairAttempt = vi.fn();
    const verifier = vi.fn().mockImplementation(async () => {
      // Abort during verification
      controller.abort();
      return {
        success: false,
        status: 'failed',
        error: 'Broken'
      } as CandidateVerificationResult;
    });

    await invokeAgentLoop(
      'Task O abort during verify',
      createSimpleMockAdapter(),
      {
        taskId: task.id,
        verifier,
        onRepairAttempt
      },
      controller.signal
    );

    expect(onRepairAttempt).not.toHaveBeenCalled();
    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.state).toBe('aborted');
  });

  it('P: Abort never produces VERIFIED', async () => {
    const task = await taskStore.createTask(projectId, 'Task P');
    const controller = new AbortController();

    // Verifier succeeds, but signal was aborted
    const verifier = vi.fn().mockImplementation(async () => {
      controller.abort();
      return {
        success: true,
        status: 'passed'
      } as CandidateVerificationResult;
    });

    const result = await invokeAgentLoop(
      'Task P abort vs verified',
      createSimpleMockAdapter(),
      {
        taskId: task.id,
        verifier
      },
      controller.signal
    );

    expect(result.verified).toBe(false);

    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.state).toBe('aborted');
    expect(persisted?.state).not.toBe('verified');
  });

  it('Q: Canonical VFS remains unchanged throughout the task', async () => {
    // Initial file in canonical VFS
    await db.files.add({
      id: 'f-vfs-1',
      projectId,
      path: '/src/main.ts',
      content: 'canonical content',
      updatedAt: 1000
    });

    const task = await taskStore.createTask(projectId, 'Task Q VFS invariant');

    await invokeAgentLoop('Write candidate changes', createSimpleMockAdapter(), {
      taskId: task.id,
      verifier: async () => ({ success: true, status: 'passed' })
    });

    const vfsFile = await db.files.where({ projectId, path: '/src/main.ts' }).first();
    expect(vfsFile?.content).toBe('canonical content');
  });

  it('R: WorkspaceOverlay remains separate from canonical VFS', async () => {
    const overlay = new AgentWorkspaceOverlay(projectId, [], 'rev-base-1');
    await overlay.write('/src/new.ts', 'candidate content');

    expect(await overlay.read('/src/new.ts')).toBe('candidate content');

    const vfsCheck = await db.files.where({ projectId, path: '/src/new.ts' }).first();
    expect(vfsCheck).toBeUndefined();
  });

  it('S: Persisted task state survives reload/reinitialization using the existing persistence layer', async () => {
    const task = await taskStore.createTask(projectId, 'Task S persistence');
    await taskStore.updateTaskState(task.id, 'running');
    await taskStore.updateTaskState(task.id, 'verifying');
    await taskStore.updateTaskState(task.id, 'verified', {
      verificationStatus: 'passed',
      completedAt: Date.now()
    });

    // Simulate reload by reading cleanly from DB directly
    const reloaded = await db.tasks.get(task.id);
    expect(reloaded).toBeDefined();
    expect(reloaded?.id).toBe(task.id);
    expect(reloaded?.state).toBe('verified');
    expect(reloaded?.verificationStatus).toBe('passed');
  });

  it('T: Previously active execution state is not falsely treated as successful after reinitialization', async () => {
    const task = await taskStore.createTask(projectId, 'Task T interrupted execution');
    await taskStore.updateTaskState(task.id, 'running');

    // Simulate browser interruption / shutdown: recoverInterruptedTasks runs on app startup
    const recovered = await taskStore.recoverInterruptedTasks();
    expect(recovered.map(t => t.id)).toContain(task.id);

    const reloaded = await db.tasks.get(task.id);
    expect(reloaded?.state).not.toBe('verified');
    expect(reloaded?.state).toBe('interrupted');
    expect(reloaded?.failureSummary).toContain('interrupted');
  });

  it('U: Invalid lifecycle transitions are rejected', async () => {
    const task = await taskStore.createTask(projectId, 'Task U state machine');

    // created -> verified is invalid (must go through running -> verifying)
    await expect(taskStore.updateTaskState(task.id, 'verified')).rejects.toThrow(
      /Invalid state transition from created to verified/
    );

    // created -> repairing is invalid
    await expect(taskStore.updateTaskState(task.id, 'repairing')).rejects.toThrow(
      /Invalid state transition from created to repairing/
    );

    // verified is terminal
    await taskStore.updateTaskState(task.id, 'running');
    await taskStore.updateTaskState(task.id, 'verifying');
    await taskStore.updateTaskState(task.id, 'verified');

    await expect(taskStore.updateTaskState(task.id, 'running')).rejects.toThrow(
      /Invalid state transition from verified to running/
    );
  });

  it('V: Failure evidence stored in task state remains bounded', async () => {
    const task = await taskStore.createTask(projectId, 'Task V bounded evidence');

    // Simulate a massive 100kb failure message
    const hugeLog = 'Error: Stack trace line\n'.repeat(5000);
    const verifier = vi.fn().mockResolvedValue({
      success: false,
      status: 'failed',
      error: hugeLog
    } as CandidateVerificationResult);

    await invokeAgentLoop('Trigger failure with huge log', createSimpleMockAdapter(), {
      taskId: task.id,
      verifier
    });

    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.state).toBe('failed');
    expect(persisted?.failureSummary).toBeDefined();
    // Prompt 4 & 5 bounded limit: 1200 characters max
    expect(persisted!.failureSummary!.length).toBeLessThanOrEqual(1200);
  });

  it('W: Task state updates preserve task identity', async () => {
    const task = await taskStore.createTask(projectId, 'Task W identity');
    const originalId = task.id;

    const s1 = await taskStore.updateTaskState(originalId, 'running');
    expect(s1.id).toBe(originalId);

    const s2 = await taskStore.updateTaskState(originalId, 'verifying');
    expect(s2.id).toBe(originalId);

    const s3 = await taskStore.updateTaskState(originalId, 'verified');
    expect(s3.id).toBe(originalId);

    const persisted = await taskStore.getTask(originalId);
    expect(persisted?.id).toBe(originalId);
  });

  it('X: Multiple task records do not overwrite each other', async () => {
    const task1 = await taskStore.createTask(projectId, 'Task 1');
    const task2 = await taskStore.createTask(projectId, 'Task 2');

    await taskStore.updateTaskState(task1.id, 'running');
    await taskStore.updateTaskState(task2.id, 'aborted');

    const p1 = await taskStore.getTask(task1.id);
    const p2 = await taskStore.getTask(task2.id);

    expect(p1?.id).toBe(task1.id);
    expect(p1?.state).toBe('running');

    expect(p2?.id).toBe(task2.id);
    expect(p2?.state).toBe('aborted');
  });

  it('Y: Stale execution updates cannot overwrite a newer task state', async () => {
    const task = await taskStore.createTask(projectId, 'Task Y stale run protection', {
      executionToken: 'token-active'
    });

    await taskStore.updateTaskState(task.id, 'running', { executionToken: 'token-active' });

    // A stale run with an outdated execution token attempts to update state
    await expect(
      taskStore.updateTaskState(task.id, 'verifying', { executionToken: 'token-stale' })
    ).rejects.toThrow(/Stale task update: execution token mismatch/);

    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.state).toBe('running');
  });

  it('Section 14 Recovery Test: Task persisted as REPAIRING recovers safely on startup', async () => {
    // Initial file in canonical VFS
    await db.files.add({
      id: 'f-recovery-1',
      projectId,
      path: '/src/index.ts',
      content: 'original index',
      updatedAt: 500
    });

    // 1. Task persisted as REPAIRING
    const task = await taskStore.createTask(projectId, 'Task in repairing state');
    await taskStore.updateTaskState(task.id, 'running');
    await taskStore.updateTaskState(task.id, 'verifying');
    await taskStore.updateTaskState(task.id, 'repairing', {
      repairAttempts: 1,
      failureSummary: 'Initial build error'
    });

    const persistedBeforeCrash = await taskStore.getTask(task.id);
    expect(persistedBeforeCrash?.state).toBe('repairing');

    // 2. Application/process disappears & application initializes again:
    // Startup recovery executes (as wired in main.tsx)
    const recoveredTasks = await taskStore.recoverInterruptedTasks();
    expect(recoveredTasks.map((t) => t.id)).toContain(task.id);

    // 3. Verifications:
    const persistedAfterRecovery = await taskStore.getTask(task.id);

    // - task is NOT VERIFIED
    expect(persistedAfterRecovery?.state).not.toBe('verified');
    // - task is represented as interrupted/recoverable/failed according to chosen minimal design
    expect(persistedAfterRecovery?.state).toBe('interrupted');
    expect(persistedAfterRecovery?.failureSummary).toContain('interrupted');

    // - canonical VFS remains unchanged
    const vfsFile = await db.files.where({ projectId, path: '/src/index.ts' }).first();
    expect(vfsFile?.content).toBe('original index');
  });
});
