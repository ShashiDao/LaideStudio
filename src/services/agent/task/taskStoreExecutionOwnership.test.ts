import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../db';
import { taskStore } from './taskStore';

describe('TaskStore execution ownership', () => {
  const projectId = 'execution-ownership-regression';

  beforeEach(async () => {
    await db.tasks.clear();
    await db.taskRuns.clear();
    await db.patchSets.clear();
  });

  it('rejects an unowned stale run after the task acquires a new execution token', async () => {
    const task = await taskStore.createTask(projectId, 'ownership regression');
    const run = await taskStore.createRun(task.id, 1, 'model', 'provider');

    await db.tasks.update(task.id, { executionToken: 'new-owner-token' });

    await expect(taskStore.finishRun(run.id, 'completed')).rejects.toThrow(
      /Stale run finish: execution token mismatch/
    );

    const persistedRun = await db.taskRuns.get(run.id);
    const persistedTask = await taskStore.getTask(task.id);

    expect(persistedRun?.status).toBe('running');
    expect(persistedRun?.finishedAt).toBeUndefined();
    expect(persistedTask?.executionToken).toBe('new-owner-token');
    expect(persistedTask?.activeRunId).toBe(run.id);
  });
});
