// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PatchReviewSheet } from './PatchReviewSheet';
import { db } from '../../db';
import { useAppStore, type PendingPatch } from '../../store';
import { listFiles, createFile, readFile } from '../../services/fs/vfs';
import { getProvenanceEntries, verifyProvenanceChain } from '../../services/provenance/provenance';

describe('PatchReviewSheet', () => {
  const projectId = 'test-proj-patches';

  beforeEach(async () => {
    vi.restoreAllMocks();
    cleanup();
    await db.projects.clear();
    await db.files.clear();
    await db.snapshots.clear();
    await db.provenanceEntries.clear();
    localStorage.clear();
    sessionStorage.clear();

    await db.projects.add({
      id: projectId,
      name: 'Patch Review Test Project',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    useAppStore.getState().clearPendingPatches();
    useAppStore.getState().setIsPatchReviewOpen(true);
  });

  afterEach(() => {
    cleanup();
  });

  it('creates an automatic snapshot before applying patches to VFS', async () => {
    // 1. Setup initial files in VFS
    await createFile(projectId, '/src/index.ts', 'console.log("version 1");\n');
    await createFile(projectId, '/README.md', '# Initial Docs\n');

    const patches: PendingPatch[] = [
      {
        path: '/src/index.ts',
        type: 'replace',
        oldContent: 'console.log("version 1");\n',
        newContent: 'console.log("version 2 modified");\n',
        rationale: 'Bump log version'
      },
      {
        path: '/src/newComponent.tsx',
        type: 'create',
        newContent: 'export const NewComp = () => <div>Hello</div>;\n',
        rationale: 'Add new component'
      }
    ];

    useAppStore.getState().setPendingPatches(patches);

    render(React.createElement(PatchReviewSheet, { projectId }));

    // Verify review sheet opened with 2 pending patches
    expect(screen.getByText(/Review Patches \(2\)/i)).toBeDefined();

    // Click Apply Selected (2)
    const applyBtn = screen.getByRole('button', { name: /apply selected/i });
    fireEvent.click(applyBtn);

    await waitFor(async () => {
      const remaining = useAppStore.getState().pendingPatches;
      expect(remaining).toHaveLength(0);
    });

    // Verify snapshot was created in Dexie database
    const snapshots = await db.snapshots.where('projectId').equals(projectId).toArray();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].label).toBe('Before applying agent patches (2)');

    // Verify snapshot saved the pre-patched content
    const snapshotFiles = JSON.parse(snapshots[0].fileSnapshotJson);
    expect(snapshotFiles).toHaveLength(2);
    const snapIndex = snapshotFiles.find((f: any) => f.path === '/src/index.ts');
    expect(snapIndex.content).toBe('console.log("version 1");\n');

    // Verify active VFS files now have the applied patches
    const activeFiles = await listFiles(projectId);
    expect(activeFiles).toHaveLength(3);
    const updatedIndex = activeFiles.find(f => f.path === '/src/index.ts');
    expect(updatedIndex?.content).toBe('console.log("version 2 modified");\n');
    const createdComp = activeFiles.find(f => f.path === '/src/newComponent.tsx');
    expect(createdComp?.content).toBe('export const NewComp = () => <div>Hello</div>;\n');
  });

  it('partially applies only checked hunks when a hunk is deselected', async () => {
    // Setup file with two distinct sections separated by context
    const originalLines = [
      '// HEADER',
      'const TITLE = "Old App Title";',
      '// Line 3',
      '// Line 4',
      '// Line 5',
      '// Line 6',
      '// Line 7',
      '// Line 8',
      '// Line 9',
      '// Line 10',
      'const FOOTER = "Old Footer Note";',
      '// END'
    ];
    const originalContent = originalLines.join('\n') + '\n';
    const file = await createFile(projectId, '/src/config.ts', originalContent);

    const patchedLines = [
      '// HEADER',
      'const TITLE = "New App Title";',
      '// Line 3',
      '// Line 4',
      '// Line 5',
      '// Line 6',
      '// Line 7',
      '// Line 8',
      '// Line 9',
      '// Line 10',
      'const FOOTER = "New Footer Note";',
      '// END'
    ];
    const patchedContent = patchedLines.join('\n') + '\n';

    const patches: PendingPatch[] = [
      {
        path: '/src/config.ts',
        type: 'replace',
        oldContent: originalContent,
        newContent: patchedContent,
        rationale: 'Update header title and footer note'
      }
    ];

    useAppStore.getState().setPendingPatches(patches);

    render(React.createElement(PatchReviewSheet, { projectId }));

    // There should be 2 hunk checkboxes for the two separate hunks
    const toggleButtons = screen.getAllByRole('button', { name: /Deselect changes for/i });
    expect(toggleButtons).toHaveLength(2);

    // Uncheck the second hunk (footer change)
    fireEvent.click(toggleButtons[1]);

    // Apply selected
    const applyBtn = screen.getByRole('button', { name: /apply selected/i });
    fireEvent.click(applyBtn);

    await waitFor(async () => {
      expect(useAppStore.getState().pendingPatches).toHaveLength(0);
    });

    // Verify only the first hunk (TITLE) was updated, FOOTER was kept as old
    const updatedFile = await readFile(file.id);
    expect(updatedFile.content).toContain('const TITLE = "New App Title";');
    expect(updatedFile.content).toContain('const FOOTER = "Old Footer Note";');
    expect(updatedFile.content).not.toContain('const FOOTER = "New Footer Note";');
  });

  it('delete-confirmation modal blocks delete-type patches until explicitly confirmed', async () => {
    await createFile(projectId, '/src/legacy.ts', 'export const deprecated = true;\n');
    await createFile(projectId, '/src/safe.ts', 'export const keepMe = true;\n');

    const patches: PendingPatch[] = [
      {
        path: '/src/legacy.ts',
        type: 'delete',
        oldContent: 'export const deprecated = true;\n',
        newContent: '',
        rationale: 'Remove obsolete legacy file'
      }
    ];

    useAppStore.getState().setPendingPatches(patches);

    render(React.createElement(PatchReviewSheet, { projectId }));

    // The button shows "Review & Apply (1)" with warning style because of delete patch
    const reviewApplyBtn = screen.getByRole('button', { name: /review & apply/i });
    fireEvent.click(reviewApplyBtn);

    // Confirmation modal is displayed
    expect(screen.getByText('Confirm Permanent File Deletion')).toBeDefined();
    expect(screen.getByText(/The following 1 file will be permanently removed/i)).toBeDefined();

    // Verify file has NOT been deleted yet (modal is blocking execution)
    let files = await listFiles(projectId);
    expect(files.find(f => f.path === '/src/legacy.ts')).toBeDefined();

    // Click "Cancel / Keep Files"
    const cancelBtn = screen.getByRole('button', { name: /cancel \/ keep files/i });
    fireEvent.click(cancelBtn);

    // Verify modal is closed and file still exists
    expect(screen.queryByText('Confirm Permanent File Deletion')).toBeNull();
    files = await listFiles(projectId);
    expect(files.find(f => f.path === '/src/legacy.ts')).toBeDefined();

    // Now re-trigger modal and click confirm
    fireEvent.click(screen.getByRole('button', { name: /review & apply/i }));
    expect(screen.getByText('Confirm Permanent File Deletion')).toBeDefined();

    const confirmDeleteBtn = screen.getByRole('button', { name: /confirm deletion & apply all/i });
    fireEvent.click(confirmDeleteBtn);

    await waitFor(async () => {
      expect(useAppStore.getState().pendingPatches).toHaveLength(0);
    });

    // Verify file is now deleted from VFS and safe file remains
    files = await listFiles(projectId);
    expect(files).toHaveLength(1);
    expect(files.find(f => f.path === '/src/legacy.ts')).toBeUndefined();
    expect(files.find(f => f.path === '/src/safe.ts')).toBeDefined();
  });

  it('aborts partial apply if file content drifts from patch.oldContent between proposal and apply', async () => {
    const originalLines = [
      '// HEADER',
      'const TITLE = "Old App Title";',
      '// Line 3',
      '// Line 4',
      '// Line 5',
      '// Line 6',
      '// Line 7',
      '// Line 8',
      '// Line 9',
      '// Line 10',
      'const FOOTER = "Old Footer Note";',
      '// END'
    ];
    const originalContent = originalLines.join('\n') + '\n';
    await createFile(projectId, '/src/config.ts', originalContent);

    const patchedLines = [...originalLines];
    patchedLines[1] = 'const TITLE = "New App Title";';
    patchedLines[10] = 'const FOOTER = "New Footer Note";';
    const patchedContent = patchedLines.join('\n') + '\n';

    const patches: PendingPatch[] = [
      {
        path: '/src/config.ts',
        type: 'replace',
        oldContent: originalContent,
        newContent: patchedContent,
        rationale: 'Update header title and footer note'
      }
    ];

    useAppStore.getState().setPendingPatches(patches);

    render(React.createElement(PatchReviewSheet, { projectId }));

    const toggleButtons = screen.getAllByRole('button', { name: /Deselect changes for/i });
    fireEvent.click(toggleButtons[1]); // uncheck one hunk to make it partial apply

    // Mutate the VFS file BEFORE apply
    const mutatedLines = [...originalLines];
    mutatedLines[4] = '// Line 5 mutated';
    const { writeFile } = await import('../../services/fs/vfs');
    const files = await listFiles(projectId);
    const file = files.find(f => f.path === '/src/config.ts');
    await writeFile(file!.id, mutatedLines.join('\n') + '\n');
    
    const applyBtn = screen.getByRole('button', { name: /apply selected/i });
    fireEvent.click(applyBtn);

    await waitFor(async () => {
      expect(screen.getByText(/has been modified since this patch was generated/i)).toBeDefined();
    });
  });

  it('records tamper-evident provenance ledger entries for all applied patches', async () => {
    await createFile(projectId, '/src/index.ts', 'console.log("v1");\n');

    const patches: PendingPatch[] = [
      {
        path: '/src/index.ts',
        type: 'replace',
        oldContent: 'console.log("v1");\n',
        newContent: 'console.log("v2");\n',
        rationale: 'Update log version',
        model: 'gemini-1.5-pro',
        provider: 'google',
        messageId: 'msg-patch-1'
      },
      {
        path: '/src/utils.ts',
        type: 'create',
        newContent: 'export const add = (a: number, b: number) => a + b;\n',
        rationale: 'Add math utility',
        model: 'gemini-1.5-pro',
        provider: 'google',
        messageId: 'msg-patch-2'
      }
    ];

    useAppStore.getState().setPendingPatches(patches);

    render(React.createElement(PatchReviewSheet, { projectId }));

    const applyBtn = screen.getByRole('button', { name: /apply selected/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(useAppStore.getState().pendingPatches).toHaveLength(0);
    });

    const entries = await getProvenanceEntries(projectId);
    expect(entries).toHaveLength(2);

    expect(entries[0].filePath).toBe('/src/index.ts');
    expect(entries[0].model).toBe('gemini-1.5-pro');
    expect(entries[0].provider).toBe('google');
    expect(entries[0].messageId).toBe('msg-patch-1');
    expect(entries[0].rationale).toBe('Update log version');
    expect(entries[0].prevEntryHash).toBe('0'.repeat(64));

    expect(entries[1].filePath).toBe('/src/utils.ts');
    expect(entries[1].model).toBe('gemini-1.5-pro');
    expect(entries[1].provider).toBe('google');
    expect(entries[1].messageId).toBe('msg-patch-2');
    expect(entries[1].rationale).toBe('Add math utility');
    expect(entries[1].prevEntryHash).toBe(entries[0].entryHash);

    const verifyResult = await verifyProvenanceChain(projectId);
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.totalEntries).toBe(2);
  });

  it('supports pointer swipe gestures: swipe left to reject/uncheck and swipe right to approve/check', async () => {
    const patches: PendingPatch[] = [
      {
        path: '/src/main.ts',
        type: 'replace',
        oldContent: 'const a = 1;\n',
        newContent: 'const a = 2;\n',
        rationale: 'Update constant a'
      }
    ];

    useAppStore.getState().setPendingPatches(patches);

    render(React.createElement(PatchReviewSheet, { projectId }));

    const hunkRow = screen.getByTestId('hunk-row-0');
    // Initially checked (button label asks to deselect)
    expect(screen.getByRole('button', { name: /Deselect changes for \/src\/main\.ts/i })).toBeDefined();

    // 1. Simulate pointer-based swipe left (x0: 100 -> xMove: 20 -> xUp: 20, deltaX = -80px)
    fireEvent.pointerDown(hunkRow, { clientX: 100, clientY: 50, pointerId: 1, button: 0 });
    fireEvent.pointerMove(hunkRow, { clientX: 20, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(hunkRow, { clientX: 20, clientY: 50, pointerId: 1 });

    // Assert hunk is now unchecked/rejected
    expect(screen.getByRole('button', { name: /Select changes for \/src\/main\.ts/i })).toBeDefined();

    // 2. Simulate pointer-based swipe right (x0: 20 -> xMove: 100 -> xUp: 100, deltaX = +80px)
    fireEvent.pointerDown(hunkRow, { clientX: 20, clientY: 50, pointerId: 1, button: 0 });
    fireEvent.pointerMove(hunkRow, { clientX: 100, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(hunkRow, { clientX: 100, clientY: 50, pointerId: 1 });

    // Assert hunk is now approved/checked again
    expect(screen.getByRole('button', { name: /Deselect changes for \/src\/main\.ts/i })).toBeDefined();
  });

  it('preserves keyboard operability with Space and Enter on hunk checkboxes', async () => {
    const patches: PendingPatch[] = [
      {
        path: '/src/main.ts',
        type: 'replace',
        oldContent: 'const a = 1;\n',
        newContent: 'const a = 2;\n',
        rationale: 'Update constant a'
      }
    ];

    useAppStore.getState().setPendingPatches(patches);

    render(React.createElement(PatchReviewSheet, { projectId }));

    const checkbox = screen.getByRole('button', { name: /Deselect changes for \/src\/main\.ts/i });
    
    // Press Space to toggle uncheck
    fireEvent.keyDown(checkbox, { key: ' ' });
    expect(screen.getByRole('button', { name: /Select changes for \/src\/main\.ts/i })).toBeDefined();

    // Press Enter to toggle check back
    const uncheckedCheckbox = screen.getByRole('button', { name: /Select changes for \/src\/main\.ts/i });
    fireEvent.keyDown(uncheckedCheckbox, { key: 'Enter' });
    expect(screen.getByRole('button', { name: /Deselect changes for \/src\/main\.ts/i })).toBeDefined();
  });

  it('respects prefers-reduced-motion by suppressing transform animation styles', async () => {
    // Mock matchMedia to simulate prefers-reduced-motion: reduce
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));

    try {
      const patches: PendingPatch[] = [
        {
          path: '/src/main.ts',
          type: 'replace',
          oldContent: 'const a = 1;\n',
          newContent: 'const a = 2;\n',
          rationale: 'Update constant a'
        }
      ];

      useAppStore.getState().setPendingPatches(patches);

      render(React.createElement(PatchReviewSheet, { projectId }));

      const hunkRow = screen.getByTestId('hunk-row-0');
      // Verify style has transition: none and no transform during swipe
      fireEvent.pointerDown(hunkRow, { clientX: 100, clientY: 50, pointerId: 1, button: 0 });
      fireEvent.pointerMove(hunkRow, { clientX: 160, clientY: 50, pointerId: 1 });

      expect(hunkRow.style.transition).toBe('none');
      expect(hunkRow.style.transform).toBe('');

      // Completing the pointer release still flips the state
      fireEvent.pointerUp(hunkRow, { clientX: 160, clientY: 50, pointerId: 1 });
      expect(screen.getByRole('button', { name: /Deselect changes for \/src\/main\.ts/i })).toBeDefined();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('renders advisory Reviewer Critique section with severity badges and never blocks patch application', async () => {
    await createFile(projectId, '/src/auth.ts', 'export const check = () => false;\n');

    const patches: PendingPatch[] = [
      {
        path: '/src/auth.ts',
        type: 'replace',
        oldContent: 'export const check = () => false;\n',
        newContent: 'export const check = () => true;\n',
        rationale: 'Update auth check'
      }
    ];

    useAppStore.getState().setPendingPatches(patches);
    useAppStore.getState().setReviewFindings([
      {
        severity: 'critical',
        file: '/src/auth.ts',
        summary: 'Authentication bypasses all validation checks'
      },
      {
        severity: 'warning',
        file: '/src/auth.ts',
        summary: 'Missing unit test coverage for true condition'
      }
    ]);

    render(React.createElement(PatchReviewSheet, { projectId }));

    // Verify Reviewer Critique header and non-blocking advisory note appear
    expect(screen.getByText(/Reviewer Critique \(2\)/i)).toBeDefined();
    expect(screen.getByText(/Advisory · Non-blocking/i)).toBeDefined();
    expect(screen.getByText(/1 critical/i)).toBeDefined();
    expect(screen.getByText(/1 warning/i)).toBeDefined();

    // Verify individual finding details
    expect(screen.getByText('Authentication bypasses all validation checks')).toBeDefined();
    expect(screen.getByText('Missing unit test coverage for true condition')).toBeDefined();

    // Verify Apply button is NOT disabled despite critical finding
    const applyButton = screen.getByRole('button', { name: /Apply Selected/i });
    expect(applyButton).toBeDefined();
    expect(applyButton.hasAttribute('disabled')).toBe(false);

    // Apply the patch
    fireEvent.click(applyButton);

    await waitFor(async () => {
      const files = await listFiles(projectId);
      const authFile = files.find(f => f.path === '/src/auth.ts');
      expect(authFile?.content).toBe('export const check = () => true;\n');
    });
  });
});

