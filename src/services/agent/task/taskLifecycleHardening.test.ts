// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../../db';
import { taskStore } from './taskStore';
import { TaskStateMachine, isDurableTaskState, isLegacyTaskState } from './taskStateMachine';
import { runAgentLoop } from '../agentLoop';
import { useAppStore } from '../../../store';
import type { LLMAdapter, LLMRequest, LLMStreamYield } from '../../llm/llmAdapter';
import type { CandidateVerificationResult } from '../workspace/candidateVerifier';

describe('Task Lifecycle & Recovery Hardening (Prompt 5.1 Requirements A-T)', () => {
  const projectId = 'test-proj-hardening';

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
        yield {
          type: 'tool_call',
          toolCall: {
            id: `call_${call}`,
            name: 'write_file',
            args: JSON.stringify({
              path: '/src/code.ts',
              content: `export const version = ${call};`
            })
          }
        };
        yield { type: 'text', text: 'done' };
      }
    };
  };

  // Requirement A: recoverInterruptedTasks transitions running -> interrupted
  it('A: recoverInterruptedTasks transitions running -> interrupted', async () => {
    const task = await taskStore.createTask(projectId, 'Running task');
    await taskStore.updateTaskState(task.id, 'running');

    const recovered = await taskStore.recoverInterruptedTasks();
    expect(recovered.some((t) => t.id === task.id)).toBe(true);

    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.state).toBe('interrupted');
    expect(persisted?.failureSummary).toContain('interrupted');
  });

  // Requirement B: recoverInterruptedTasks transitions verifying -> interrupted
  it('B: recoverInterruptedTasks transitions verifying -> interrupted', async () => {
    const task = await taskStore.createTask(projectId, 'Verifying task');
    await taskStore.updateTaskState(task.id, 'running');
    await taskStore.updateTaskState(task.id, 'verifying');

    const recovered = await taskStore.recoverInterruptedTasks();
    expect(recovered.some((t) => t.id === task.id)).toBe(true);

    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.state).toBe('interrupted');
  });

  // Requirement C: recoverInterruptedTasks transitions repairing -> interrupted
  it('C: recoverInterruptedTasks transitions repairing -> interrupted', async () => {
    const task = await taskStore.createTask(projectId, 'Repairing task');
    await taskStore.updateTaskState(task.id, 'running');
    await taskStore.updateTaskState(task.id, 'verifying');
    await taskStore.updateTaskState(task.id, 'repairing');

    const recovered = await taskStore.recoverInterruptedTasks();
    expect(recovered.some((t) => t.id === task.id)).toBe(true);

    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.state).toBe('interrupted');
  });

  // Requirement D: recoverInterruptedTasks leaves terminal states untouched
  it('D: recoverInterruptedTasks leaves terminal states untouched', async () => {
    const taskVerified = await taskStore.createTask(projectId, 'Verified task');
    await taskStore.updateTaskState(taskVerified.id, 'running');
    await taskStore.updateTaskState(taskVerified.id, 'verifying');
    await taskStore.updateTaskState(taskVerified.id, 'verified');

    const taskFailed = await taskStore.createTask(projectId, 'Failed task');
    await taskStore.updateTaskState(taskFailed.id, 'failed');

    const taskAborted = await taskStore.createTask(projectId, 'Aborted task');
    await taskStore.updateTaskState(taskAborted.id, 'aborted');

    const recovered = await taskStore.recoverInterruptedTasks();
    expect(recovered.length).toBe(0);

    const pVerified = await taskStore.getTask(taskVerified.id);
    const pFailed = await taskStore.getTask(taskFailed.id);
    const pAborted = await taskStore.getTask(taskAborted.id);

    expect(pVerified?.state).toBe('verified');
    expect(pFailed?.state).toBe('failed');
    expect(pAborted?.state).toBe('aborted');
  });

  // Requirement E: recoverInterruptedTasks leaves already-interrupted tasks untouched
  it('E: recoverInterruptedTasks leaves already-interrupted tasks untouched', async () => {
    const task = await taskStore.createTask(projectId, 'Already interrupted task');
    await taskStore.updateTaskState(task.id, 'interrupted', {
      failureSummary: 'Existing custom interrupt reason'
    });

    const recovered = await taskStore.recoverInterruptedTasks();
    expect(recovered.length).toBe(0);

    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.state).toBe('interrupted');
    expect(persisted?.failureSummary).toBe('Existing custom interrupt reason');
  });

  // Requirement F: recoverInterruptedTasks is idempotent across multiple calls
  it('F: recoverInterruptedTasks is idempotent across multiple calls', async () => {
    const task1 = await taskStore.createTask(projectId, 'Active task 1');
    const task2 = await taskStore.createTask(projectId, 'Active task 2');
    await taskStore.updateTaskState(task1.id, 'running');
    await taskStore.updateTaskState(task2.id, 'running');
    await taskStore.updateTaskState(task2.id, 'verifying');

    // First call: recovers both tasks
    const firstRun = await taskStore.recoverInterruptedTasks();
    expect(firstRun.length).toBe(2);

    // Second call: no active tasks remaining
    const secondRun = await taskStore.recoverInterruptedTasks();
    expect(secondRun.length).toBe(0);

    // Third call: still zero
    const thirdRun = await taskStore.recoverInterruptedTasks();
    expect(thirdRun.length).toBe(0);

    const p1 = await taskStore.getTask(task1.id);
    const p2 = await taskStore.getTask(task2.id);
    expect(p1?.state).toBe('interrupted');
    expect(p2?.state).toBe('interrupted');
  });

  // Requirement G: recoverInterruptedTasks does NOT execute repair
  it('G: recoverInterruptedTasks does NOT execute repair', async () => {
    const task = await taskStore.createTask(projectId, 'Task in repairing state');
    await taskStore.updateTaskState(task.id, 'running');
    await taskStore.updateTaskState(task.id, 'verifying');
    await taskStore.updateTaskState(task.id, 'repairing', { repairAttempts: 1 });

    const initialRepairAttempts = (await taskStore.getTask(task.id))?.repairAttempts;

    const recovered = await taskStore.recoverInterruptedTasks();
    expect(recovered.length).toBe(1);

    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.state).toBe('interrupted');
    expect(persisted?.repairAttempts).toBe(initialRepairAttempts);
  });

  // Requirement H: recoverInterruptedTasks does NOT mutate canonical VFS
  it('H: recoverInterruptedTasks does NOT mutate canonical VFS', async () => {
    await db.files.add({
      id: 'f-canonical',
      projectId,
      path: '/src/canonical.ts',
      content: 'canonical content uncorrupted',
      updatedAt: 100
    });

    const task = await taskStore.createTask(projectId, 'Active task');
    await taskStore.updateTaskState(task.id, 'running');

    await taskStore.recoverInterruptedTasks();

    const file = await db.files.where({ projectId, path: '/src/canonical.ts' }).first();
    expect(file?.content).toBe('canonical content uncorrupted');
    expect(file?.updatedAt).toBe(100);
  });

  // Requirement I: recoverInterruptedTasks preserves task metadata
  it('I: recoverInterruptedTasks preserves task metadata', async () => {
    const task = await taskStore.createTask(projectId, 'Feature XYZ user request', {
      risk: 'high',
      acceptanceCriteria: [
        { id: 'ac-1', description: 'Pass build', status: 'pending' },
        { id: 'ac-2', description: 'Pass tests', status: 'pass' }
      ],
      baseRevision: 'git-commit-hash-abc',
      executionToken: 'token-preserved-123'
    });
    await taskStore.updateTaskState(task.id, 'running', {
      executionToken: 'token-preserved-123'
    });

    await taskStore.recoverInterruptedTasks();

    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.state).toBe('interrupted');
    expect(persisted?.userRequest).toBe('Feature XYZ user request');
    expect(persisted?.risk).toBe('high');
    expect(persisted?.acceptanceCriteria).toHaveLength(2);
    expect(persisted?.acceptanceCriteria[0].id).toBe('ac-1');
    expect(persisted?.acceptanceCriteria[1].status).toBe('pass');
    expect(persisted?.baseRevision).toBe('git-commit-hash-abc');
    expect(persisted?.executionToken).toBe('token-preserved-123');
  });

  // Requirement J: recoverInterruptedTasks never converts active task to verified
  it('J: recoverInterruptedTasks never converts active task to verified', async () => {
    const states: ('running' | 'verifying' | 'repairing')[] = ['running', 'verifying', 'repairing'];

    for (const state of states) {
      const task = await taskStore.createTask(projectId, `Task in ${state}`);
      if (state === 'running') {
        await taskStore.updateTaskState(task.id, 'running');
      } else if (state === 'verifying') {
        await taskStore.updateTaskState(task.id, 'running');
        await taskStore.updateTaskState(task.id, 'verifying');
      } else if (state === 'repairing') {
        await taskStore.updateTaskState(task.id, 'running');
        await taskStore.updateTaskState(task.id, 'verifying');
        await taskStore.updateTaskState(task.id, 'repairing');
      }

      await taskStore.recoverInterruptedTasks();
      const persisted = await taskStore.getTask(task.id);
      expect(persisted?.state).not.toBe('verified');
      expect(persisted?.state).toBe('interrupted');
    }
  });

  // Requirement K: current execution token can update its task
  it('K: current execution token can update its task', async () => {
    const token = 'token-authoritative-1';
    const task = await taskStore.createTask(projectId, 'Task K', { executionToken: token });

    await expect(
      taskStore.updateTaskState(task.id, 'running', { executionToken: token })
    ).resolves.toBeDefined();

    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.state).toBe('running');
  });

  // Requirement L: stale execution token cannot update task state
  it('L: stale execution token cannot update task state', async () => {
    const token = 'token-authoritative-1';
    const task = await taskStore.createTask(projectId, 'Task L', { executionToken: token });
    await taskStore.updateTaskState(task.id, 'running', { executionToken: token });

    // Update with wrong token must reject
    await expect(
      taskStore.updateTaskState(task.id, 'verifying', { executionToken: 'stale-token' })
    ).rejects.toThrow(/Stale task update: execution token mismatch/);

    // Update with undefined token on an owned task must reject
    await expect(
      taskStore.updateTaskState(task.id, 'verifying')
    ).rejects.toThrow(/Stale task update: execution token mismatch/);

    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.state).toBe('running');
  });

  // Requirement M: current execution token can finish its run
  it('M: current execution token can finish its run', async () => {
    const token = 'token-m-1';
    const task = await taskStore.createTask(projectId, 'Task M', { executionToken: token });
    const run = await taskStore.createRun(task.id, 1, 'gemini-2.5-flash', 'google', token);

    const finished = await taskStore.finishRun(run.id, 'completed', { executionToken: token });
    expect(finished.status).toBe('completed');
    expect(finished.finishedAt).toBeDefined();

    const persistedTask = await taskStore.getTask(task.id);
    expect(persistedTask?.activeRunId).toBeUndefined();
  });

  // Requirement N: stale execution cannot finish/overwrite a newer run
  it('N: stale execution cannot finish/overwrite a newer run', async () => {
    const token = 'token-n-current';
    const task = await taskStore.createTask(projectId, 'Task N', { executionToken: token });
    const run = await taskStore.createRun(task.id, 1, 'gemini-2.5-flash', 'google', token);

    // Stale token attempting to finish run must reject
    await expect(
      taskStore.finishRun(run.id, 'completed', { executionToken: 'token-stale' })
    ).rejects.toThrow(/Stale run finish: execution token mismatch/);

    const runInDb = await db.taskRuns.get(run.id);
    expect(runInDb?.status).toBe('running');
  });

  // Requirement O: newer execution token remains authoritative
  it('O: newer execution token remains authoritative', async () => {
    const oldToken = 'token-old';
    const newToken = 'token-new';

    const task = await taskStore.createTask(projectId, 'Task O', { executionToken: oldToken });
    const oldRun = await taskStore.createRun(task.id, 1, 'model-1', 'provider-1', oldToken);

    // Task ownership moves to newToken
    await db.tasks.update(task.id, { executionToken: newToken });

    // Old execution cannot create a run
    await expect(
      taskStore.createRun(task.id, 2, 'model-1', 'provider-1', oldToken)
    ).rejects.toThrow(/Stale run creation: execution token mismatch/);

    // Old run cannot finish against task owned by new token
    await expect(
      taskStore.finishRun(oldRun.id, 'completed', { executionToken: oldToken })
    ).rejects.toThrow(/Stale run finish/);

    // Newer execution CAN create a run
    const newRun = await taskStore.createRun(task.id, 2, 'model-2', 'provider-2', newToken);
    expect(newRun.id).toBeDefined();

    // Newer execution CAN finish its run
    await expect(
      taskStore.finishRun(newRun.id, 'completed', { executionToken: newToken })
    ).resolves.toBeDefined();
  });

  // Requirement P: creating/finishing runs does not corrupt activeRunId
  it('P: creating/finishing runs does not corrupt activeRunId', async () => {
    const task = await taskStore.createTask(projectId, 'Task P');
    const run1 = await taskStore.createRun(task.id, 1, 'm1', 'p1');

    let pTask = await taskStore.getTask(task.id);
    expect(pTask?.activeRunId).toBe(run1.id);

    const run2 = await taskStore.createRun(task.id, 2, 'm2', 'p2');
    pTask = await taskStore.getTask(task.id);
    expect(pTask?.activeRunId).toBe(run2.id);

    // Finishing run1 should NOT clear activeRunId because activeRunId is run2.id
    await taskStore.finishRun(run1.id, 'completed');
    pTask = await taskStore.getTask(task.id);
    expect(pTask?.activeRunId).toBe(run2.id);

    // Finishing run2 clears activeRunId
    await taskStore.finishRun(run2.id, 'completed');
    pTask = await taskStore.getTask(task.id);
    expect(pTask?.activeRunId).toBeUndefined();
  });

  // Requirement Q: terminal task state cannot be resurrected by a stale run
  it('Q: terminal task state cannot be resurrected by a stale run', async () => {
    const task = await taskStore.createTask(projectId, 'Task Q');
    await taskStore.updateTaskState(task.id, 'failed');

    // Attempting to create a run on a terminal task must reject
    await expect(
      taskStore.createRun(task.id, 1, 'm1', 'p1')
    ).rejects.toThrow(/Cannot create run: task .* is in terminal/);

    // Attempting to transition terminal task back to running must reject
    await expect(
      taskStore.updateTaskState(task.id, 'running')
    ).rejects.toThrow(/Invalid state transition/);

    const pTask = await taskStore.getTask(task.id);
    expect(pTask?.state).toBe('failed');
  });

  // Requirement R: stale run operations do not mutate unrelated task state
  it('R: stale run operations do not mutate unrelated task state', async () => {
    const task = await taskStore.createTask(projectId, 'Task R user request', {
      risk: 'medium',
      acceptanceCriteria: [{ id: 'ac-1', description: 'Rule 1', status: 'pending' }]
    });
    const run = await taskStore.createRun(task.id, 1, 'm1', 'p1');

    await taskStore.finishRun(run.id, 'completed');

    const pTask = await taskStore.getTask(task.id);
    expect(pTask?.userRequest).toBe('Task R user request');
    expect(pTask?.risk).toBe('medium');
    expect(pTask?.acceptanceCriteria).toHaveLength(1);
    expect(pTask?.state).toBe('created');
  });

  // Requirement S: legacy states are rejected by strict transition guards
  it('S: legacy states are rejected by strict transition guards or cleanly isolated', () => {
    expect(isDurableTaskState('created')).toBe(true);
    expect(isDurableTaskState('running')).toBe(true);
    expect(isDurableTaskState('verifying')).toBe(true);
    expect(isDurableTaskState('repairing')).toBe(true);
    expect(isDurableTaskState('verified')).toBe(true);
    expect(isDurableTaskState('failed')).toBe(true);
    expect(isDurableTaskState('aborted')).toBe(true);
    expect(isDurableTaskState('interrupted')).toBe(true);

    expect(isDurableTaskState('planning')).toBe(false);
    expect(isDurableTaskState('analyzing')).toBe(false);
    expect(isDurableTaskState('completed')).toBe(false);

    expect(isLegacyTaskState('planning')).toBe(true);
    expect(isLegacyTaskState('completed')).toBe(true);
    expect(isLegacyTaskState('running')).toBe(false);

    const sm = new TaskStateMachine('created');
    // Cannot transition directly from created to legacy planning or completed
    expect(sm.canTransitionTo('planning')).toBe(false);
    expect(sm.canTransitionTo('completed')).toBe(false);
    expect(sm.transitionTo('planning')).toBe(false);
  });

  // Requirement T: repair bound remains strictly <= 1
  it('T: repair bound remains strictly <= 1 in agentLoop', async () => {
    let verificationCalls = 0;
    const mockVerifier = async (): Promise<CandidateVerificationResult> => {
      verificationCalls++;
      return {
        success: false,
        status: 'failed',
        error: `Verification failure attempt ${verificationCalls}`
      };
    };

    const adapter = createSimpleMockAdapter();
    const task = await taskStore.createTask(projectId, 'Task T bound test');

    const result = await runAgentLoop(
      'Do something failing',
      [],
      adapter,
      projectId,
      undefined,
      undefined,
      undefined,
      25,
      {
        taskId: task.id,
        verifier: mockVerifier
      }
    );

    // Initial verification (1) + repair verification (2) = max 2 verification calls
    expect(verificationCalls).toBe(2);
    expect(result.repairAttempts).toBe(1);
    expect(result.verified).toBe(false);

    const persisted = await taskStore.getTask(task.id);
    expect(persisted?.repairAttempts).toBe(1);
    expect(persisted?.state).toBe('failed');
  });
});
