// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { taskStore } from './taskStore';
import { db } from '../../../db';

describe('TaskStore', () => {
  beforeEach(async () => {
    await db.tasks.clear();
    await db.taskRuns.clear();
    await db.patchSets.clear();
  });

  it('creates a task', async () => {
    const task = await taskStore.createTask('p1', 'build an app');
    expect(task.id).toBeDefined();
    expect(task.projectId).toBe('p1');
    expect(task.state).toBe('created');
    expect(task.userRequest).toBe('build an app');
  });

  it('updates task state', async () => {
    const task = await taskStore.createTask('p1', 'build an app');
    const updated = await taskStore.updateTaskState(task.id, 'running');
    
    expect(updated.state).toBe('running');
    
    const fetched = await taskStore.getTask(task.id);
    expect(fetched?.state).toBe('running');
  });

  it('prevents invalid task state transitions', async () => {
    const task = await taskStore.createTask('p1', 'build an app');
    
    await expect(taskStore.updateTaskState(task.id, 'verified')).rejects.toThrow();
  });

  it('creates and finishes a run', async () => {
    const task = await taskStore.createTask('p1', 'build an app');
    const run = await taskStore.createRun(task.id, 1, 'gpt-4', 'openai');
    
    expect(run.id).toBeDefined();
    expect(run.startedAt).toBeDefined();
    expect(run.finishedAt).toBeUndefined();
    
    const finishedRun = await taskStore.finishRun(run.id);
    expect(finishedRun.finishedAt).toBeDefined();
  });

  it('creates a patch set', async () => {
    const task = await taskStore.createTask('p1', 'build an app');
    const run = await taskStore.createRun(task.id, 1, 'gpt-4', 'openai');
    
    const patchSet = await taskStore.createPatchSet(run.id, task.id, 'p1', 'base-rev', [
      { type: 'create', path: '/index.ts', newContent: 'new', rationale: 'test' }
    ]);
    
    expect(patchSet.id).toBeDefined();
    expect(patchSet.patches).toHaveLength(1);
    expect(patchSet.patches[0].path).toBe('/index.ts');
  });
});
