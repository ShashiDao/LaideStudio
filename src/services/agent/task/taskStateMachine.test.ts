import { describe, it, expect } from 'vitest';
import { TaskStateMachine } from './taskStateMachine';

describe('TaskStateMachine', () => {
  it('initializes with created state by default', () => {
    const sm = new TaskStateMachine();
    expect(sm.getState()).toBe('created');
  });

  it('allows valid transitions', () => {
    const sm = new TaskStateMachine('queued');
    
    expect(sm.canTransitionTo('analyzing')).toBe(true);
    expect(sm.transitionTo('analyzing')).toBe(true);
    expect(sm.getState()).toBe('analyzing');
    
    expect(sm.transitionTo('planning')).toBe(true);
    expect(sm.getState()).toBe('planning');
  });

  it('prevents invalid transitions', () => {
    const sm = new TaskStateMachine('queued');
    
    expect(sm.canTransitionTo('reviewing')).toBe(false);
    expect(sm.transitionTo('reviewing')).toBe(false);
    
    // State should not have changed
    expect(sm.getState()).toBe('queued');
  });

  it('handles completion states', () => {
    const sm = new TaskStateMachine('learning');
    
    expect(sm.transitionTo('completed')).toBe(true);
    expect(sm.getState()).toBe('completed');
    
    // completed is a terminal state
    expect(sm.canTransitionTo('analyzing')).toBe(false);
  });
});
