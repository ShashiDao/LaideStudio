// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { EnsembleDashboard } from './EnsembleDashboard';
import { useAppStore } from '../store';
import { db } from '../db';
import * as ensembleService from '../services/agent/ensemble';
import * as vfsService from '../services/fs/vfs';
import * as snapshotService from '../services/fs/snapshot';
import * as provenanceService from '../services/provenance';

// Mock dependencies
vi.mock('../services/llm/factory', () => ({
  createLLMAdapter: vi.fn().mockResolvedValue({
    send: vi.fn().mockResolvedValue({ text: 'Mock LLM Response', usage: { inputTokens: 50, outputTokens: 50 } }),
    testConnection: vi.fn().mockResolvedValue(true)
  })
}));

vi.mock('../services/agent/ensemble', () => ({
  runEnsembleDualEvaluation: vi.fn()
}));

vi.mock('../services/fs/vfs', () => ({
  listFiles: vi.fn().mockResolvedValue([
    { id: 'f-1', projectId: 'p-1', path: 'src/index.ts', content: 'console.log("old");', updatedAt: Date.now() }
  ]),
  writeFile: vi.fn().mockResolvedValue(undefined),
  createFile: vi.fn().mockResolvedValue({ id: 'f-2', projectId: 'p-1', path: 'src/new.ts', content: 'new', updatedAt: Date.now() }),
  deleteFile: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../services/fs/snapshot', () => ({
  createSnapshot: vi.fn().mockResolvedValue({ id: 's-1', projectId: 'p-1', name: 'Snap', timestamp: Date.now(), files: [] })
}));

vi.mock('../services/provenance', () => ({
  recordProvenanceEntry: vi.fn().mockResolvedValue('prov-1'),
  runBackgroundTestsForProvenance: vi.fn().mockResolvedValue(undefined)
}));

describe('EnsembleDashboard', () => {
  const dummyFiles = [
    { id: 'f-1', projectId: 'p-1', path: 'src/index.ts', content: 'console.log("old");', updatedAt: Date.now() }
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    useAppStore.setState({
      keys: { aesKey: {} as CryptoKey, hmacKey: {} as CryptoKey, masterKeyBytes: new Uint8Array() },
      activeProfileId: 'prof-1'
    });

    await db.projects.clear();
    await db.projects.add({
      id: 'p-1',
      name: 'Test Project',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // Mock DB profiles
    await db.connectionProfiles.clear();
    await db.connectionProfiles.bulkAdd([
      {
        id: 'prof-1',
        label: 'GPT-4o (Primary)',
        provider: 'openai',
        model: 'gpt-4o',
        baseUrl: '',
        encryptedApiKey: 'enc1'
      },
      {
        id: 'prof-2',
        label: 'Claude 3.7 Sonnet',
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
        baseUrl: '',
        encryptedApiKey: 'enc2'
      }
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders correctly when open with slots for Model A and Model B', async () => {
    render(
      <EnsembleDashboard
        isOpen={true}
        onClose={vi.fn()}
        projectId="p-1"
        files={dummyFiles}
      />
    );

    expect(screen.getByText('Ensemble Mode Studio')).toBeTruthy();
    expect(screen.getByText('Dual-Model & Judge AI')).toBeTruthy();
    expect(screen.getByPlaceholderText(/Describe the feature to implement/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Run Parallel Generation/i })).toBeTruthy();

    await waitFor(() => {
      expect(screen.getAllByText(/GPT-4o/i).length).toBeGreaterThan(0);
    });
  });

  it('populates sample task prompt on chip click', async () => {
    render(
      <EnsembleDashboard
        isOpen={true}
        onClose={vi.fn()}
        projectId="p-1"
        files={dummyFiles}
      />
    );

    const sampleBtn = screen.getByRole('button', { name: /Fix failing unit tests/i });
    fireEvent.click(sampleBtn);

    const textarea = screen.getByPlaceholderText(/Describe the feature to implement/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain('Fix failing unit tests');
  });

  it('executes parallel generation and renders Judge AI recommendation with side-by-side candidate outputs', async () => {
    const mockEnsembleResult: ensembleService.EnsembleEvaluationResult = {
      candidateA: {
        candidateId: 'cand-a',
        profile: {
          id: 'prof-1',
          label: 'GPT-4o (Primary)',
          provider: 'openai',
          model: 'gpt-4o',
          adapter: {} as any
        },
        patches: [
          {
            type: 'replace',
            path: 'src/index.ts',
            oldContent: 'console.log("old");',
            newContent: 'console.log("fixed A");',
            rationale: 'Fix A null check'
          }
        ],
        messages: [],
        testResult: {
          status: 'passed',
          passed: 4,
          failed: 0,
          total: 4,
          output: '4 tests passed',
          durationMs: 120
        },
        status: 'passed'
      },
      candidateB: {
        candidateId: 'cand-b',
        profile: {
          id: 'prof-2',
          label: 'Claude 3.7 Sonnet',
          provider: 'anthropic',
          model: 'claude-3-7-sonnet',
          adapter: {} as any
        },
        patches: [
          {
            type: 'replace',
            path: 'src/index.ts',
            oldContent: 'console.log("old");',
            newContent: 'console.log("fixed B");',
            rationale: 'Fix B edge cases'
          }
        ],
        messages: [],
        testResult: {
          status: 'passed',
          passed: 4,
          failed: 0,
          total: 4,
          output: '4 tests passed',
          durationMs: 110
        },
        status: 'passed'
      },
      passedCandidates: [],
      chosenCandidate: null,
      requiresUserSelection: false,
      summary: 'Ensemble Arbiter selected candidate Claude 3.7 Sonnet.',
      arbiter: {
        winner: 'B',
        reasoning: 'Claude 3.7 Sonnet provided cleaner syntax handling and concise diff.'
      }
    };
    mockEnsembleResult.chosenCandidate = mockEnsembleResult.candidateB;

    vi.mocked(ensembleService.runEnsembleDualEvaluation).mockResolvedValue(mockEnsembleResult);

    render(
      <EnsembleDashboard
        isOpen={true}
        onClose={vi.fn()}
        projectId="p-1"
        files={dummyFiles}
        initialPrompt="Fix failing tests in user service"
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/GPT-4o/i).length).toBeGreaterThan(0);
    });

    const runBtn = screen.getByRole('button', { name: /Run Parallel Generation/i });
    await waitFor(() => {
      expect((runBtn as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText(/🏆 Judge AI Recommends Candidate B: Claude 3.7 Sonnet/i)).toBeTruthy();
      expect(screen.getByText(/Claude 3.7 Sonnet provided cleaner syntax handling/i)).toBeTruthy();
    });

    // Check side-by-side columns
    expect(screen.getByText('Candidate A: GPT-4o (Primary)')).toBeTruthy();
    expect(screen.getByText('Candidate B: Claude 3.7 Sonnet')).toBeTruthy();
    expect(screen.getAllByText(/Tests Passed \(4\)/i).length).toBe(2);
    expect(screen.getByText('Fix A null check')).toBeTruthy();
    expect(screen.getByText('Fix B edge cases')).toBeTruthy();
  });

  it('applies the Judge-recommended candidate patches to workspace files and closes', async () => {
    const onCloseMock = vi.fn();
    const onRefreshFilesMock = vi.fn();

    const mockEnsembleResult: ensembleService.EnsembleEvaluationResult = {
      candidateA: {
        candidateId: 'cand-a',
        profile: { id: 'prof-1', label: 'Candidate A', provider: 'openai', model: 'gpt-4o', adapter: {} as any },
        patches: [],
        messages: [],
        testResult: null,
        status: 'no_patches'
      },
      candidateB: {
        candidateId: 'cand-b',
        profile: { id: 'prof-2', label: 'Candidate B', provider: 'anthropic', model: 'claude-3-7-sonnet', adapter: {} as any },
        patches: [
          {
            type: 'replace',
            path: 'src/index.ts',
            oldContent: 'console.log("old");',
            newContent: 'console.log("fixed B");',
            rationale: 'Fix B'
          }
        ],
        messages: [],
        testResult: { status: 'passed', passed: 3, failed: 0, total: 3, output: 'ok', durationMs: 90 },
        status: 'passed'
      },
      passedCandidates: [],
      chosenCandidate: null,
      requiresUserSelection: false,
      summary: 'Winner is Candidate B',
      arbiter: {
        winner: 'B',
        reasoning: 'Candidate B passed all tests.'
      }
    };
    mockEnsembleResult.chosenCandidate = mockEnsembleResult.candidateB;

    vi.mocked(ensembleService.runEnsembleDualEvaluation).mockResolvedValue(mockEnsembleResult);

    render(
      <EnsembleDashboard
        isOpen={true}
        onClose={onCloseMock}
        projectId="p-1"
        files={dummyFiles}
        onRefreshFiles={onRefreshFilesMock}
        initialPrompt="Resolve memory leak"
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/GPT-4o/i).length).toBeGreaterThan(0);
    });

    const runBtn = screen.getByRole('button', { name: /Run Parallel Generation/i });
    await waitFor(() => {
      expect((runBtn as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText(/Apply Recommended Solution/i)).toBeTruthy();
    });

    const applyRecommendedBtn = screen.getByText(/Apply Recommended Solution/i);
    fireEvent.click(applyRecommendedBtn);

    await waitFor(() => {
      expect(snapshotService.createSnapshot).toHaveBeenCalled();
      expect(vfsService.writeFile).toHaveBeenCalled();
      expect(provenanceService.recordProvenanceEntry).toHaveBeenCalled();
      expect(onRefreshFilesMock).toHaveBeenCalled();
      expect(onCloseMock).toHaveBeenCalled();
    });
  });
});
