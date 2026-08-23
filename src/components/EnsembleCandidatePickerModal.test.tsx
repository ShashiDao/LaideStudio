// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { EnsembleCandidatePickerModal } from './EnsembleCandidatePickerModal';
import type { EnsembleEvaluationResult } from '../services/agent/ensemble';

describe('EnsembleCandidatePickerModal', () => {
  afterEach(() => {
    cleanup();
  });

  const mockEvaluationResult: EnsembleEvaluationResult = {
    candidateA: {
      candidateId: 'A',
      profile: {
        id: 'p-a',
        label: 'Claude 3.7 Sonnet',
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
        adapter: {} as any
      },
      patches: [
        {
          path: '/src/components/Button.tsx',
          type: 'replace',
          newContent: 'export const Button = () => <button>Click</button>;',
          rationale: 'Refactored button component with Tailwind'
        }
      ],
      messages: [],
      testResult: {
        passed: 4,
        failed: 0,
        total: 4,
        status: 'passed',
        output: '✅ 4 tests passed'
      },
      status: 'passed'
    },
    candidateB: {
      candidateId: 'B',
      profile: {
        id: 'p-b',
        label: 'GPT-4o',
        provider: 'openai',
        model: 'gpt-4o',
        adapter: {} as any
      },
      patches: [
        {
          path: '/src/components/Button.tsx',
          type: 'replace',
          newContent: 'export const Button = () => <button className="btn">Click</button>;',
          rationale: 'Refactored button with custom class'
        }
      ],
      messages: [],
      testResult: {
        passed: 4,
        failed: 0,
        total: 4,
        status: 'passed',
        output: '✅ 4 tests passed'
      },
      status: 'passed'
    },
    passedCandidates: [],
    chosenCandidate: null,
    requiresUserSelection: true,
    summary: 'Both candidates passed all tests! Review and pick your preferred patch.'
  };

  it('renders both candidate comparison columns with test status and diff details', () => {
    const onSelectCandidate = vi.fn();
    const onDismiss = vi.fn();

    render(
      <EnsembleCandidatePickerModal
        evaluationResult={mockEvaluationResult}
        onSelectCandidate={onSelectCandidate}
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByText(/Dual-LLM Candidate Comparison/i)).toBeDefined();
    expect(screen.getByText(/Candidate A: Claude 3.7 Sonnet/i)).toBeDefined();
    expect(screen.getByText(/Candidate B: GPT-4o/i)).toBeDefined();
    expect(screen.getByText(/Both candidates passed all tests/i)).toBeDefined();
  });

  it('allows switching between candidates and accepting chosen candidate patches', () => {
    const onSelectCandidate = vi.fn();
    const onDismiss = vi.fn();

    render(
      <EnsembleCandidatePickerModal
        evaluationResult={mockEvaluationResult}
        onSelectCandidate={onSelectCandidate}
        onDismiss={onDismiss}
      />
    );

    // Click candidate B card
    fireEvent.click(screen.getByText(/Candidate B: GPT-4o/i));

    // Click Accept button
    const acceptBtn = screen.getByRole('button', { name: /Accept Candidate B Patches/i });
    fireEvent.click(acceptBtn);

    expect(onSelectCandidate).toHaveBeenCalledTimes(1);
    expect(onSelectCandidate).toHaveBeenCalledWith(mockEvaluationResult.candidateB);
  });
});
