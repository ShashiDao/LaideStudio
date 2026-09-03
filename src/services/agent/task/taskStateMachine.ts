import type { TaskState } from './taskTypes';

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

  public static isTerminal(state: TaskState): boolean {
    const next = TaskStateMachine.transitions[state];
    return !next || next.length === 0;
  }

  public static isActive(state: TaskState): boolean {
    return state === 'running' || state === 'verifying' || state === 'repairing';
  }
}
