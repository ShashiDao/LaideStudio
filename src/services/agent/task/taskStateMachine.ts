import type { TaskState } from './taskTypes';

export class TaskStateMachine {
  private currentState: TaskState;

  // The valid transitions according to roadmap §6
  private static readonly transitions: Record<TaskState, TaskState[]> = {
    queued: ['analyzing', 'cancelled'],
    analyzing: ['planning', 'cancelled', 'failed'],
    planning: ['implementing', 'cancelled', 'failed'],
    implementing: ['verifying', 'cancelled', 'failed'],
    verifying: ['reviewing', 'repairing', 'cancelled', 'failed'],
    repairing: ['implementing', 'cancelled', 'failed'],
    reviewing: ['awaiting_approval', 'repairing', 'cancelled', 'failed'],
    awaiting_approval: ['applying', 'cancelled', 'failed'],
    applying: ['learning', 'cancelled', 'failed'],
    learning: ['completed', 'cancelled', 'failed'],
    completed: [],
    failed: [],
    cancelled: []
  };

  constructor(initialState: TaskState = 'queued') {
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
}
