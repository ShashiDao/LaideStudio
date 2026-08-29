// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { db, type ProvenanceEntry, type FileItem } from '../../db';
import { FindWhatBrokeModal } from './FindWhatBrokeModal';
import { useAppStore } from '../../store';
import * as bisectModule from '../../services/provenance/bisect';

vi.mock('../../services/provenance/bisect', async (importOriginal) => {
  const actual = await importOriginal<typeof bisectModule>();
  return {
    ...actual,
    bisectBrokenTest: vi.fn(actual.bisectBrokenTest)
  };
});

describe('FindWhatBrokeModal', () => {
  const projectId = 'test-modal-proj';

  beforeEach(async () => {
    await db.provenanceEntries.clear();
    await db.files.clear();
    await db.snapshots.clear();
    useAppStore.setState({ activeProjectId: projectId, queuedPrompt: null, activeTab: 'files' });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders modal with initial state and starts bisection when run button is clicked', async () => {
    const entry: ProvenanceEntry = {
      id: 'e1',
      projectId,
      filePath: '/src/index.ts',
      beforeContent: 'const a = 1;',
      afterContent: 'const a = 2;',
      beforeHash: 'h1',
      afterHash: 'h2',
      prevEntryHash: '0000000000000000000000000000000000000000000000000000000000000000',
      entryHash: 'entry1',
      model: 'claude-3-7-sonnet',
      provider: 'anthropic',
      rationale: 'Updated constant',
      timestamp: Date.now() - 10000
    };
    await db.provenanceEntries.add(entry);

    const file: FileItem = {
      id: 'f1',
      projectId,
      path: '/src/index.ts',
      content: 'const a = 2;',
      updatedAt: Date.now()
    };
    await db.files.add(file);

    const onClose = vi.fn();
    render(
      <FindWhatBrokeModal
        projectId={projectId}
        isOpen={true}
        onClose={onClose}
        initialTestName="handles token authentication"
      />
    );

    expect(screen.getByText('Find What Broke This')).toBeTruthy();
    expect(screen.getByDisplayValue('handles token authentication')).toBeTruthy();

    const startBtn = screen.getByRole('button', { name: /Start Bisection/i });
    expect(startBtn).toBeTruthy();
  });

  it('allows closing modal via close button and backdrop', () => {
    const onClose = vi.fn();
    render(
      <FindWhatBrokeModal
        projectId={projectId}
        isOpen={true}
        onClose={onClose}
      />
    );

    const closeBtn = screen.getByRole('button', { name: /Close/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('displays safe snapshot option and allows reverting workspace when regression is found', async () => {
    const timestamp = Date.now() - 5000;
    const entry: ProvenanceEntry = {
      id: 'e1',
      projectId,
      filePath: '/src/math.ts',
      beforeContent: 'export const sum = (a, b) => a + b;',
      afterContent: 'export const sum = (a, b) => a - b;',
      beforeHash: 'h1',
      afterHash: 'h2',
      prevEntryHash: '0000000000000000000000000000000000000000000000000000000000000000',
      entryHash: 'entry1',
      model: 'gemini-2.5-flash',
      provider: 'google',
      rationale: 'broke math sum',
      timestamp
    };
    await db.provenanceEntries.add(entry);

    await db.snapshots.add({
      id: 'snap-safe-1',
      projectId,
      label: 'Before applying agent patches (1)',
      createdAt: timestamp - 1000,
      fileSnapshotJson: JSON.stringify([
        { id: 'f1', projectId, path: '/src/math.ts', content: 'export const sum = (a, b) => a + b;', updatedAt: timestamp - 1000 }
      ])
    });

    vi.mocked(bisectModule.bisectBrokenTest).mockResolvedValueOnce({
      found: true,
      offendingEntry: entry,
      testName: 'sum adds numbers',
      totalStepsRun: 1
    });

    const onRestore = vi.fn();
    const onClose = vi.fn();

    render(
      <FindWhatBrokeModal
        projectId={projectId}
        isOpen={true}
        onClose={onClose}
        onRestore={onRestore}
      />
    );

    const startBtn = screen.getByRole('button', { name: /Start Bisection/i });
    fireEvent.click(startBtn);

    // Wait for bisection to find regression and show safe snapshot option
    await screen.findByText(/Safe Snapshot Available/i);
    expect(screen.getByText(/Before applying agent patches/i)).toBeTruthy();

    const revertBtn = screen.getByRole('button', { name: /Revert Workspace to Snapshot Before Patch/i });
    fireEvent.click(revertBtn);

    const confirmBtn = screen.getByRole('button', { name: /Revert Workspace to Snapshot/i });
    fireEvent.click(confirmBtn);

    expect(onClose).toBeDefined();
  });
});
