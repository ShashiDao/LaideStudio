import type { DurableTaskState, LegacyTaskState, TaskState } from './taskTypes';

export const DURABLE_TASK_STATES: readonly DurableTaskState[] = [
  'created',
  'running',
  'verifying',
  'repairing',
  'verified',
  'failed',
  'aborted',
  'interrupted'
] as const;

export const LEGACY_TASK_STATES: readonly LegacyTaskState[] = [
  'queued',
  'analyzing',
  'planning',
  'implementing',
  'reviewing',
  'awaiting_approval',
  'applying',
  'learning',
  'completed',
  'cancelled'
] as const;

export function isDurableTaskState(state: TaskState): state is DurableTaskState {
  return (DURABLE_TASK_STATES as readonly string[]).includes(state);
}

export function isLegacyTaskState(state: TaskState): state is LegacyTaskState {
  return (LEGACY_TASK_STATES as readonly string[]).includes(state);
}

export class TaskStateMachine {
  private currentState: TaskState;

  // The valid transitions according to Prompt 5 minimal lifecycle & roadmap §6
  private static readonly transitions: Record<TaskState, TaskState[]> = {
    // Prompt 5 minimal task lifecycle transitions
    created: ['running', 'aborted', 'failed', 'interrupted'],
    running: ['verifying', 'aborted', 'failed', 'interrupted'],
    verifying: ['repairing', 'verified', 'failed', 'aborted', 'interrupted'],
    repairing: ['verifying', 'aborted', 'failed', 'interrupted'],
    verified: [],
    failed: [],
    aborted: [],
    interrupted: ['failed', 'aborted'],

    // Legacy transitions preserved for backward compatibility
    queued: ['running', 'analyzing', 'cancelled', 'aborted', 'failed', 'interrupted'],
    analyzing: ['planning', 'running', 'cancelled', 'aborted', 'failed', 'interrupted'],
    planning: ['implementing', 'running', 'cancelled', 'aborted', 'failed', 'interrupted'],
    implementing: ['verifying', 'cancelled', 'aborted', 'failed', 'interrupted'],
    reviewing: ['awaiting_approval', 'repairing', 'cancelled', 'aborted', 'failed', 'interrupted'],
    awaiting_approval: ['applying', 'cancelled', 'aborted', 'failed', 'interrupted'],
    applying: ['learning', 'cancelled', 'aborted', 'failed', 'interrupted'],
    learning: ['completed', 'cancelled', 'aborted', 'failed', 'interrupted'],
    completed: [],
    cancelled: []
  };

  constructor(initialState: TaskState = 'created') {
    this.currentState = initialState;
  }

  public getState(): TaskState {
    return this.currentState;
  }

  public transitionTo(newState: TaskState): boolean {
    const validNextStates = TaskStateMachine.transitions[this.currentState];
    if (validNextStates && validNextStates.includes(newState)) {
      this.currentState = newState;
      return true;
    }
    return false;
  }

  public canTransitionTo(newState: TaskState): boolean {
    const validNextStates = TaskStateMachine.transitions[this.currentState];
    return validNextStates ? validNextStates.includes(newState) : false;
  }

  /**
   * Returns true if the given state is terminal (no further transitions possible).
   * Verified, failed, aborted, completed, and cancelled are terminal.
   */
  public static isTerminal(state: TaskState): boolean {
    const next = TaskStateMachine.transitions[state];
    return !next || next.length === 0;
  }

  /**
   * Returns true if the task is actively executing in-flight work (running, verifying, repairing).
   */
  public static isActive(state: TaskState): boolean {
    return state === 'running' || state === 'verifying' || state === 'repairing';
  }

  /**
   * Returns true if the task is an active, non-terminal execution that can be recovered on startup.
   */
  public static canRecover(state: TaskState): boolean {
    return TaskStateMachine.isActive(state);
  }

  /**
   * Explicit recovery transition for active tasks interrupted by process shutdown / reload.
   * Conceptually: recover(activeState) -> interrupted
   *
   * Rules:
   * - Only active states (running, verifying, repairing) can transition to interrupted.
   * - Already terminal states (verified, failed, aborted) reject recovery.
   * - Already interrupted tasks reject recovery (idempotent guard).
   * - Never transitions directly to verified or repairing.
   */
  public recoverToInterrupted(): boolean {
    if (TaskStateMachine.isActive(this.currentState)) {
      this.currentState = 'interrupted';
      return true;
    }
    return false;
  }
}

