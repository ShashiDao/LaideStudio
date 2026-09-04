import { db, type SessionMemoryItem } from '../../db';
import type { AgentTask } from './task/taskTypes';

export { type SessionMemoryItem };

export const DEFAULT_MAX_SESSION_MEMORIES = 30;

/**
 * Retrieves all stored session memories for a given project,
 * ordered chronologically by timestamp (oldest first).
 */
export async function getSessionMemories(
  projectId: string,
  limit?: number
): Promise<SessionMemoryItem[]> {
  if (!projectId) return [];
  const items = await db.sessionMemory
    .where('projectId')
    .equals(projectId)
    .sortBy('timestamp');

  if (typeof limit === 'number' && limit > 0 && items.length > limit) {
    // Return the most recent `limit` items while preserving chronological order
    return items.slice(items.length - limit);
  }

  return items;
}

/**
 * Formats an array of session memory items for injection into the system prompt.
 */
export function formatSessionMemoryForPrompt(memories: SessionMemoryItem[]): string {
  if (!memories || memories.length === 0) return '';
  return memories
    .map(m => `- ${m.insight.trim()}`)
    .filter(line => line.length > 2)
    .join('\n');
}

/**
 * Prunes session memories for a project to enforce the bounded size invariant.
 * Removes the oldest items when count exceeds maxItems.
 */
export async function pruneSessionMemories(
  projectId: string,
  maxItems: number = DEFAULT_MAX_SESSION_MEMORIES
): Promise<number> {
  if (!projectId || maxItems <= 0) return 0;
  const items = await db.sessionMemory
    .where('projectId')
    .equals(projectId)
    .sortBy('timestamp');

  if (items.length <= maxItems) return 0;

  const excessCount = items.length - maxItems;
  const toDelete = items.slice(0, excessCount);
  const idsToDelete = toDelete.map(item => item.id);

  await db.sessionMemory.bulkDelete(idsToDelete);
  return excessCount;
}

/**
 * Persists a learned insight into the private sessionMemory Dexie table.
 * Automatically enforces the bounded table constraint by rotating oldest entries.
 */
export async function recordSessionMemory(
  projectId: string,
  insight: string,
  options?: {
    key?: string;
    sourceTaskId?: string;
    sourceTaskPrompt?: string;
    maxItems?: number;
  }
): Promise<SessionMemoryItem> {
  const trimmedInsight = insight.trim();
  if (!projectId) throw new Error('Cannot record session memory: projectId is required');
  if (!trimmedInsight) throw new Error('Cannot record session memory: insight must not be empty');

  const item: SessionMemoryItem = {
    id: crypto.randomUUID(),
    projectId,
    insight: trimmedInsight,
    ...(options?.key ? { key: options.key.trim() } : {}),
    ...(options?.sourceTaskId ? { sourceTaskId: options.sourceTaskId } : {}),
    ...(options?.sourceTaskPrompt ? { sourceTaskPrompt: options.sourceTaskPrompt.trim() } : {}),
    timestamp: Date.now()
  };

  await db.sessionMemory.put(item);
  await pruneSessionMemories(projectId, options?.maxItems ?? DEFAULT_MAX_SESSION_MEMORIES);

  return item;
}

/**
 * Hooks into the durable task lifecycle completion point to record a persistent learned insight.
 * Deduplicates by sourceTaskId to prevent redundant writes if multiple lifecycle transition events fire.
 */
export async function recordTaskCompletionMemory(
  task: AgentTask,
  customInsight?: string
): Promise<SessionMemoryItem | null> {
  if (!task || !task.projectId || !task.id) return null;

  // Check if a memory item has already been recorded for this specific task
  const existing = await db.sessionMemory
    .where('projectId')
    .equals(task.projectId)
    .filter(item => item.sourceTaskId === task.id)
    .first();

  if (existing) {
    return existing;
  }

  const insight = customInsight?.trim() || deriveInsightFromTask(task);
  if (!insight) return null;

  return await recordSessionMemory(task.projectId, insight, {
    sourceTaskId: task.id,
    sourceTaskPrompt: task.userRequest
  });
}

/**
 * Derives a concise, persistent learned insight from an executed task request.
 */
export function deriveInsightFromTask(task: AgentTask): string {
  const req = (task.userRequest || '').trim();
  if (!req) return 'Completed agent task';

  // Extract concise learned insight summary
  const oneLine = req.replace(/\s+/g, ' ');
  return oneLine.length > 120 ? `Task completed: ${oneLine.slice(0, 117)}...` : `Task completed: ${oneLine}`;
}

/**
 * Clears all session memories for a specific project.
 */
export async function clearSessionMemories(projectId: string): Promise<void> {
  if (!projectId) return;
  const items = await db.sessionMemory.where('projectId').equals(projectId).toArray();
  const ids = items.map(i => i.id);
  await db.sessionMemory.bulkDelete(ids);
}

/**
 * Deletes a single session memory item by ID.
 */
export async function deleteSessionMemory(id: string): Promise<void> {
  if (!id) return;
  await db.sessionMemory.delete(id);
}
