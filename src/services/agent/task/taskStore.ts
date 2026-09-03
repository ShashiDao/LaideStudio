import { db } from '../../../db';
import type { AgentTask, AgentRun, PatchSet, TaskState } from './taskTypes';
import { TaskStateMachine } from './taskStateMachine';

export class TaskStore {
  async createTask(projectId: string, userRequest: string, risk: AgentTask['risk'] = 'low'): Promise<AgentTask> {
    const task: AgentTask = {
      id: crypto.randomUUID(),
      projectId,
      userRequest,
      state: 'queued',
      risk,
      acceptanceCriteria: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    await db.tasks.add(task);
    return task;
  }

  async getTask(id: string): Promise<AgentTask | undefined> {
    return db.tasks.get(id);
  }

  async updateTaskState(id: string, newState: TaskState): Promise<AgentTask> {
    const task = await this.getTask(id);
    if (!task) throw new Error(`Task ${id} not found`);

    const sm = new TaskStateMachine(task.state);
    if (!sm.transitionTo(newState)) {
      throw new Error(`Invalid state transition from ${task.state} to ${newState}`);
    }

    const updatedTask = {
      ...task,
      state: newState,
      updatedAt: Date.now()
    };

    await db.tasks.put(updatedTask);
    return updatedTask;
  }

  async createRun(taskId: string, attempt: number, model: string, provider: string): Promise<AgentRun> {
    const run: AgentRun = {
      id: crypto.randomUUID(),
      taskId,
      attempt,
      model,
      provider,
      startedAt: Date.now()
    };
    
    await db.taskRuns.add(run);
    return run;
  }

  async finishRun(runId: string): Promise<AgentRun> {
    const run = await db.taskRuns.get(runId);
    if (!run) throw new Error(`Run ${runId} not found`);

    const updatedRun = {
      ...run,
      finishedAt: Date.now()
    };

    await db.taskRuns.put(updatedRun);
    return updatedRun;
  }

  async createPatchSet(runId: string, taskId: string, projectId: string, baseRevision: string, patches: PatchSet['patches']): Promise<PatchSet> {
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
