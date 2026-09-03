import type { PatchDefinition } from '../patchSchema';

export type TaskState =
  | 'created'
  | 'running'
  | 'verifying'
  | 'repairing'
  | 'verified'
  | 'failed'
  | 'aborted'
  | 'interrupted'
  // Backward compatibility with legacy schema states
  | 'queued'
  | 'analyzing'
  | 'planning'
  | 'implementing'
  | 'reviewing'
  | 'awaiting_approval'
  | 'applying'
  | 'learning'
  | 'completed'
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

  // Prompt 5 minimal durable lifecycle persistence fields
  repairAttempts?: number;
  verificationStatus?: 'passed' | 'failed' | 'unavailable';
  failureSummary?: string;
  baseRevision?: string;
  activeRunId?: string;
  executionToken?: string;
  abortedAt?: number;
  completedAt?: number;
}

export interface AgentRun {
  id: string;
  taskId: string;
  attempt: number;
  model: string;
  provider: string;
  startedAt: number;
  finishedAt?: number;
  status?: 'running' | 'completed' | 'failed' | 'aborted' | 'interrupted';
  executionToken?: string;
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
