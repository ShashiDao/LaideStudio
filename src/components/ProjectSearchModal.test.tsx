// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ProjectSearchModal } from './ProjectSearchModal';
import type { FileItem } from '../db';
import { useAppStore } from '../store';

describe('ProjectSearchModal', () => {
  const dummyFiles: FileItem[] = [
    {
      id: 'file-1',
      projectId: 'proj-1',
      path: '/src/App.tsx',
      content: `import React from 'react';\nexport function App() {\n  return <div>Hello Studio</div>;\n}`,
      updatedAt: 100
    },
    {
      id: 'file-2',
      projectId: 'proj-1',
      path: '/src/utils/helpers.ts',
      content: `export function calculateTotal(a: number, b: number) {\n  return a + b;\n}`,
      updatedAt: 100
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders search modal with shortcut indicators and input when open', () => {
    render(
      <ProjectSearchModal
        isOpen={true}
        onClose={() => {}}
        files={dummyFiles}
      />
    );

    expect(screen.getByText('Find in Files')).toBeDefined();
    expect(screen.getByText('Ctrl+Shift+F')).toBeDefined();
    expect(screen.getByPlaceholderText(/Search across all files in project/i)).toBeDefined();
  });

  it('searches across files and displays matching lines and counts', () => {
    render(
      <ProjectSearchModal
        isOpen={true}
        onClose={() => {}}
        files={dummyFiles}
      />
    );

    const input = screen.getByPlaceholderText(/Search across all files in project/i);
    fireEvent.change(input, { target: { value: 'export function' } });

    expect(screen.getByText(/2 matches/i)).toBeDefined();
    expect(screen.getByText(/2 files/i)).toBeDefined();
    expect(screen.getByText('App.tsx')).toBeDefined();
    expect(screen.getByText('helpers.ts')).toBeDefined();
  });

  it('toggles case-sensitive and whole-word modes', () => {
    render(
      <ProjectSearchModal
        isOpen={true}
        onClose={() => {}}
        files={dummyFiles}
      />
    );

    const input = screen.getByPlaceholderText(/Search across all files in project/i);
    fireEvent.change(input, { target: { value: 'hello' } });

    // Case-insensitive match initially found
    expect(screen.getByText(/1 match/i)).toBeDefined();

    // Toggle Case Sensitive (Alt+C)
    const caseBtn = screen.getByTitle(/Match Case/i);
    fireEvent.click(caseBtn);

    // 'hello' with lowercase 'h' does not match 'Hello Studio'
    expect(screen.getByText(/No matches found/i)).toBeDefined();
  });

  it('navigates to file and sets line/column target when match is clicked', () => {
    const handleClose = vi.fn();
    render(
      <ProjectSearchModal
        isOpen={true}
        onClose={handleClose}
        files={dummyFiles}
      />
    );

    const input = screen.getByPlaceholderText(/Search across all files in project/i);
    fireEvent.change(input, { target: { value: 'calculateTotal' } });

    const matchRow = screen.getByText('calculateTotal');
    fireEvent.click(matchRow);

    const state = useAppStore.getState();
    expect(state.activeFileId).toBe('file-2');
    expect(state.activeTab).toBe('files');
    expect(state.editorNavigationTarget).toEqual({
      line: 1,
      column: 17,
      length: 14
    });
    expect(handleClose).toHaveBeenCalled();
  });

  it('toggles expandable file include/exclude filters', () => {
    render(
      <ProjectSearchModal
        isOpen={true}
        onClose={() => {}}
        files={dummyFiles}
      />
    );

    const filterBtn = screen.getByTitle(/Toggle file include\/exclude filters/i);
    fireEvent.click(filterBtn);

    expect(screen.getByLabelText(/Files to include filter/i)).toBeDefined();
    expect(screen.getByLabelText(/Files to exclude filter/i)).toBeDefined();

    const input = screen.getByPlaceholderText(/Search across all files in project/i);
    fireEvent.change(input, { target: { value: 'export function' } });

    const includeInput = screen.getByLabelText(/Files to include filter/i);
    fireEvent.change(includeInput, { target: { value: '*.tsx' } });

    // Should only match App.tsx, not helpers.ts
    expect(screen.getByText('App.tsx')).toBeDefined();
    expect(screen.queryByText('helpers.ts')).toBeNull();
  });
});
