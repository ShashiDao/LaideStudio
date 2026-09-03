import { db } from '../../../db';
import type { AgentTask, AgentRun, PatchSet, TaskState } from './taskTypes';
import { TaskStateMachine } from './taskStateMachine';

export interface CreateTaskOptions {
  risk?: AgentTask['risk'];
  initialState?: TaskState;
  baseRevision?: string;
  executionToken?: string;
  acceptanceCriteria?: AgentTask['acceptanceCriteria'];
}

export interface UpdateTaskStateOptions {
  executionToken?: string;
  repairAttempts?: number;
  verificationStatus?: 'passed' | 'failed' | 'unavailable';
  failureSummary?: string;
  baseRevision?: string;
  activeRunId?: string;
  abortedAt?: number;
  completedAt?: number;
  force?: boolean;
}

export class TaskStore {
  async createTask(
    projectId: string,
    userRequest: string,
    optionsOrRisk: AgentTask['risk'] | CreateTaskOptions = 'low'
  ): Promise<AgentTask> {
    const options: CreateTaskOptions =
      typeof optionsOrRisk === 'string'
        ? { risk: optionsOrRisk, initialState: 'created' }
        : { initialState: 'created', risk: 'low', ...optionsOrRisk };

    const task: AgentTask = {
      id: crypto.randomUUID(),
      projectId,
      userRequest,
      state: options.initialState || 'created',
      risk: options.risk || 'low',
      acceptanceCriteria: options.acceptanceCriteria || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...(options.baseRevision ? { baseRevision: options.baseRevision } : {}),
      ...(options.executionToken ? { executionToken: options.executionToken } : {})
    };

    await db.transaction('rw', db.tasks, async () => {
      await db.tasks.add(task);
    });

    return task;
  }

  async getTask(id: string): Promise<AgentTask | undefined> {
    return db.tasks.get(id);
  }

  async listTasks(projectId?: string): Promise<AgentTask[]> {
    if (projectId) {
      return db.tasks.where('projectId').equals(projectId).toArray();
    }
    return db.tasks.toArray();
  }

  async updateTaskState(
    id: string,
    newState: TaskState,
    options?: UpdateTaskStateOptions
  ): Promise<AgentTask> {
    return await db.transaction('rw', db.tasks, async () => {
      const task = await db.tasks.get(id);
      if (!task) throw new Error(`Task ${id} not found`);

      // Stale task update / duplicate run protection
      if (
        task.executionToken &&
        (!options?.executionToken || task.executionToken !== options.executionToken) &&
        !options?.force
      ) {
        throw new Error(
          `Stale task update: execution token mismatch for task ${id} (expected ${task.executionToken}, got ${options?.executionToken || 'undefined'})`
        );
      }

      // Valid state transition check
      if (!options?.force) {
        const sm = new TaskStateMachine(task.state);
        if (!sm.transitionTo(newState)) {
          throw new Error(`Invalid state transition from ${task.state} to ${newState}`);
        }
      }

      const updatedTask: AgentTask = {
        ...task,
        state: newState,
        updatedAt: Date.now(),
        ...(options?.repairAttempts !== undefined ? { repairAttempts: options.repairAttempts } : {}),
        ...(options?.verificationStatus !== undefined ? { verificationStatus: options.verificationStatus } : {}),
        ...(options?.failureSummary !== undefined ? { failureSummary: options.failureSummary } : {}),
        ...(options?.baseRevision !== undefined ? { baseRevision: options.baseRevision } : {}),
        ...(options?.activeRunId !== undefined ? { activeRunId: options.activeRunId } : {}),
        ...(options?.executionToken !== undefined ? { executionToken: options.executionToken } : {}),
        ...(options?.abortedAt !== undefined ? { abortedAt: options.abortedAt } : {}),
        ...(options?.completedAt !== undefined ? { completedAt: options.completedAt } : {})
      };

      await db.tasks.put(updatedTask);
      return updatedTask;
    });
  }

  /**
   * Idempotent boot/startup recovery transition for active tasks.
   * Conceptually executes recover(activeState) -> interrupted for any in-flight task
   * that was left in 'running', 'verifying', or 'repairing' state when the browser/app was terminated.
   *
   * Invariants:
   * - Never converts to 'verified'
   * - Never executes repair
   * - Never mutates canonical VFS
   * - Preserves existing task metadata
   * - Idempotent across multiple restarts
   */
  async recoverInterruptedTasks(): Promise<AgentTask[]> {
    return await db.transaction('rw', db.tasks, async () => {
      const allTasks = await db.tasks.toArray();
      const activeTasks = allTasks.filter((t) => TaskStateMachine.canRecover(t.state));
      const recovered: AgentTask[] = [];

      for (const task of activeTasks) {
        const sm = new TaskStateMachine(task.state);
        if (!sm.recoverToInterrupted()) {
          continue;
        }

        const updated: AgentTask = {
          ...task,
          state: 'interrupted',
          failureSummary: task.failureSummary
            ? `${task.failureSummary} (interrupted)`
            : 'Execution interrupted by application shutdown, reload, or crash.',
          updatedAt: Date.now()
        };
        await db.tasks.put(updated);
        recovered.push(updated);
      }

      return recovered;
    });
  }

  /**
   * Creates an informational execution run record associated with an AgentTask.
   * Enforces execution token ownership and prevents creating runs on terminal or interrupted tasks.
   */
  async createRun(
    taskId: string,
    attempt: number,
    model: string,
    provider: string,
    executionToken?: string
  ): Promise<AgentRun> {
    return await db.transaction('rw', [db.tasks, db.taskRuns], async () => {
      const task = await db.tasks.get(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Terminal and interrupted tasks cannot start new runs
      if (TaskStateMachine.isTerminal(task.state) || task.state === 'interrupted') {
        throw new Error(`Cannot create run: task ${taskId} is in terminal or interrupted state '${task.state}'`);
      }

      // If task has an active execution token, caller must provide a matching token
      if (task.executionToken && (!executionToken || task.executionToken !== executionToken)) {
        throw new Error(
          `Stale run creation: execution token mismatch for task ${taskId} (expected ${task.executionToken}, got ${executionToken || 'undefined'})`
        );
      }

      const run: AgentRun = {
        id: crypto.randomUUID(),
        taskId,
        attempt,
        model,
        provider,
        startedAt: Date.now(),
        status: 'running',
        ...(executionToken ? { executionToken } : {})
      };

      await db.taskRuns.add(run);

      // Link run to task as activeRunId without mutating unrelated fields
      await db.tasks.update(taskId, {
        activeRunId: run.id,
        ...(executionToken && !task.executionToken ? { executionToken } : {}),
        updatedAt: Date.now()
      });

      return run;
    });
  }

  /**
   * Marks an AgentRun as finished (completed, failed, aborted, or interrupted).
   * Validates execution token ownership to prevent stale runs from finishing or overwriting newer executions.
   */
  async finishRun(
    runId: string,
    status: AgentRun['status'] = 'completed',
    options?: { executionToken?: string }
  ): Promise<AgentRun> {
    return await db.transaction('rw', [db.tasks, db.taskRuns], async () => {
      const run = await db.taskRuns.get(runId);
      if (!run) throw new Error(`Run ${runId} not found`);

      const task = await db.tasks.get(run.taskId);

      // If the task currently has an execution owner, finishing is fail-closed.
      // A caller cannot finish a run without proving ownership of the current token.
      if (task?.executionToken) {
        const suppliedToken = options?.executionToken ?? run.executionToken;
        if (!suppliedToken || suppliedToken !== task.executionToken) {
          throw new Error(
            `Stale run finish: execution token mismatch for task ${task.id} (expected ${task.executionToken}, got ${suppliedToken || 'undefined'})`
          );
        }
      }

      // Caller passed explicit executionToken -> check against run as well
      if (options?.executionToken && run.executionToken && run.executionToken !== options.executionToken) {
        throw new Error(
          `Stale run finish: execution token mismatch for run ${runId} (expected ${run.executionToken}, got ${options.executionToken})`
        );
      }

      // Run has an older token than the task's current token
      if (!options?.executionToken && run.executionToken && task && task.executionToken && run.executionToken !== task.executionToken) {
        throw new Error(
          `Stale run finish: run was created under execution token ${run.executionToken} but task ${task.id} is owned by newer execution token ${task.executionToken}`
        );
      }

      const updatedRun: AgentRun = {
        ...run,
        status,
        finishedAt: Date.now()
      };

      await db.taskRuns.put(updatedRun);

      // Only clear activeRunId if it still points to this specific run; never corrupt newer run IDs
      if (task && task.activeRunId === runId) {
        await db.tasks.update(task.id, {
          activeRunId: undefined,
          updatedAt: Date.now()
        });
      }

      return updatedRun;
    });
  }

  async createPatchSet(
    runId: string,
    taskId: string,
    projectId: string,
    baseRevision: string,
    patches: PatchSet['patches']
  ): Promise<PatchSet> {
    const patchSet: PatchSet = {
      id: crypto.randomUUID(),
      runId,
      taskId,
      projectId,
      baseRevision,
      patches,
      createdAt: Date.now()
    };

    await db.patchSets.add(patchSet);
    return patchSet;
  }
}

export const taskStore = new TaskStore();
