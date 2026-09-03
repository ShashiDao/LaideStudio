import type { PatchDefinition } from '../patchSchema';

export type TaskState =
  | 'queued'
  | 'analyzing'
  | 'planning'
  | 'implementing'
  | 'verifying'
  | 'repairing'
  | 'reviewing'
  | 'awaiting_approval'
  | 'applying'
  | 'learning'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TaskRisk = 'low' | 'medium' | 'high';

export interface AcceptanceCriterion {
  id: string;
  description: string;
  status: 'pending' | 'pass' | 'fail';
}

export interface AgentTask {
  id: string;
  projectId: string;
  userRequest: string;
  state: TaskState;
  risk: TaskRisk;
  acceptanceCriteria: AcceptanceCriterion[];
  createdAt: number;
  updatedAt: number;
}

export interface AgentRun {
  id: string;
  taskId: string;
  attempt: number;
  model: string;
  provider: string;
  startedAt: number;
  finishedAt?: number;
}

export interface PatchSet {
  id: string;
  runId: string;
  taskId: string;
  projectId: string;
  baseRevision: string;
  patches: PatchDefinition[];
  createdAt: number;
}
