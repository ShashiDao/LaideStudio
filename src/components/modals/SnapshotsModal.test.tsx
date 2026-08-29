// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { db, type Project, type Snapshot } from '../../db';
import { SnapshotsModal } from './SnapshotsModal';
import * as snapshotService from '../../services/fs/snapshot';

describe('SnapshotsModal', () => {
  const dummyProject: Project = {
    id: 'proj-snap-test-1',
    name: 'Test Snapshot App',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const dummySnapshot: Snapshot = {
    id: 'snap-1',
    projectId: 'proj-snap-test-1',
    label: 'Before applying agent patches (2)',
    createdAt: Date.now() - 5000,
    fileSnapshotJson: JSON.stringify([
      { id: 'f1', projectId: 'proj-snap-test-1', path: '/src/App.tsx', content: 'console.log("old");', updatedAt: Date.now() }
    ])
  };

  beforeEach(async () => {
    await db.snapshots.clear();
    await db.files.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders modal header, empty state when no snapshots exist, and manual creation form', async () => {
    render(<SnapshotsModal isOpen={true} onClose={() => {}} project={dummyProject} />);

    expect(screen.getByText('Snapshots & Version History')).toBeDefined();
    expect(screen.getByText('Test Snapshot App')).toBeDefined();
    
    await waitFor(() => {
      expect(screen.getByText('No Snapshots Yet')).toBeDefined();
    });

    const createBtn = screen.getByRole('button', { name: /Create Bookmark Snapshot/i });
    fireEvent.click(createBtn);

    expect(screen.getByPlaceholderText(/Snapshot label/i)).toBeDefined();
  });

  it('lists existing snapshots and displays Quick Undo AI banner for AI snapshots', async () => {
    await db.snapshots.add(dummySnapshot);

    render(<SnapshotsModal isOpen={true} onClose={() => {}} project={dummyProject} />);

    await waitFor(() => {
      expect(screen.getByText('Before applying agent patches (2)')).toBeDefined();
      expect(screen.getByText('Undo Last AI Changes')).toBeDefined();
      expect(screen.getByText('AI Auto-Snapshot')).toBeDefined();
    });
  });

  it('allows restoring a snapshot with confirmation dialog', async () => {
    await db.snapshots.add(dummySnapshot);
    const restoreSpy = vi.spyOn(snapshotService, 'restoreSnapshot').mockResolvedValue();
    const onRestore = vi.fn();
    const onClose = vi.fn();

    render(
      <SnapshotsModal 
        isOpen={true} 
        onClose={onClose} 
        project={dummyProject} 
        onRestore={onRestore} 
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Before applying agent patches (2)')).toBeDefined();
    });

    // Click Restore button on snapshot row
    const restoreBtn = screen.getAllByRole('button', { name: /Restore/i })[0];
    fireEvent.click(restoreBtn);

    // Confirm step should appear
    expect(screen.getByText('Confirm Workspace Restore')).toBeDefined();
    const confirmBtn = screen.getByRole('button', { name: /Revert Workspace Now/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(restoreSpy).toHaveBeenCalledWith('snap-1');
      expect(onRestore).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('allows expanding files in a snapshot and deleting a snapshot', async () => {
    await db.snapshots.add(dummySnapshot);
    const deleteSpy = vi.spyOn(snapshotService, 'deleteSnapshot').mockResolvedValue();

    render(<SnapshotsModal isOpen={true} onClose={() => {}} project={dummyProject} />);

    await waitFor(() => {
      expect(screen.getByText('Before applying agent patches (2)')).toBeDefined();
    });

    // Expand files
    const expandBtn = screen.getByTitle('View files in snapshot');
    fireEvent.click(expandBtn);

    await waitFor(() => {
      expect(screen.getByText('/src/App.tsx')).toBeDefined();
    });

    // Delete
    const deleteBtn = screen.getByTitle('Delete snapshot');
    fireEvent.click(deleteBtn);

    expect(screen.getByText('Delete this snapshot?')).toBeDefined();
    const confirmDeleteBtn = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('snap-1');
    });
  });
});
