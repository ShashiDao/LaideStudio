import { db } from '../../../db';
import type { AgentTask, AgentRun, PatchSet, TaskState } from './taskTypes';
import { TaskStateMachine } from './taskStateMachine';

export interface CreateTaskOptions {
  risk?: AgentTask['risk'];
  initialState?: TaskState;
  baseRevision?: string;
  executionToken?: string;
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
      acceptanceCriteria: [],
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
        options?.executionToken &&
        task.executionToken &&
        task.executionToken !== options.executionToken
      ) {
        throw new Error(
          `Stale task update: execution token mismatch for task ${id} (expected ${task.executionToken}, got ${options.executionToken})`
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

  async recoverInterruptedTasks(): Promise<AgentTask[]> {
    return await db.transaction('rw', db.tasks, async () => {
      const allTasks = await db.tasks.toArray();
      const activeTasks = allTasks.filter((t) => TaskStateMachine.isActive(t.state));
      const recovered: AgentTask[] = [];

      for (const task of activeTasks) {
        const updated: AgentTask = {
          ...task,
          state: 'interrupted',
          failureSummary: 'Execution interrupted by application shutdown, reload, or crash.',
          updatedAt: Date.now()
        };
        await db.tasks.put(updated);
        recovered.push(updated);
      }

      return recovered;
    });
  }

  async createRun(
    taskId: string,
    attempt: number,
    model: string,
    provider: string,
    executionToken?: string
  ): Promise<AgentRun> {
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
    return run;
  }

  async finishRun(runId: string, status: AgentRun['status'] = 'completed'): Promise<AgentRun> {
    return await db.transaction('rw', db.taskRuns, async () => {
      const run = await db.taskRuns.get(runId);
      if (!run) throw new Error(`Run ${runId} not found`);

      const updatedRun: AgentRun = {
        ...run,
        status,
        finishedAt: Date.now()
      };

      await db.taskRuns.put(updatedRun);
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
