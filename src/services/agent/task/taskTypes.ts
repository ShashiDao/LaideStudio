import type { PatchDefinition } from '../patchSchema';

/**
 * Current Prompt 5 durable execution lifecycle states:
 * created -> running -> verifying -> repairing -> verifying -> verified
 *
 * Terminal/failure paths:
 * failed, aborted, interrupted
 */
export type DurableTaskState =
  | 'created'
  | 'running'
  | 'verifying'
  | 'repairing'
  | 'verified'
  | 'failed'
  | 'aborted'
  | 'interrupted';

/**
 * Legacy/compatibility states preserved for older tasks or backward-compatible schema definitions.
 * Note: These are NOT part of the current Prompt 5 durable execution lifecycle.
 */
export type LegacyTaskState =
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

export type TaskState = DurableTaskState | LegacyTaskState;

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

/**
 * AgentRun is an informational / observational audit record representing an individual model invocation
 * or execution attempt under an AgentTask.
 *
 * NOTE: The AgentTask (and its TaskStateMachine) remains the sole authoritative state machine for task
 * execution lifecycle. AgentRun records start/finish timestamps, model/provider metadata, status,
 * and execution token ownership. It is not a secondary state machine.
 */
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
