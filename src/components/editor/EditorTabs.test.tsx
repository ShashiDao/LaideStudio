// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { EditorTabs } from './EditorTabs';
import type { FileItem } from '../../db';

describe('EditorTabs Component', () => {
  const mockFiles: FileItem[] = [
    {
      id: 'file-1',
      projectId: 'proj-1',
      path: '/src/App.tsx',
      content: 'export default function App() {}',
      updatedAt: 1000
    },
    {
      id: 'file-2',
      projectId: 'proj-1',
      path: '/src/main.ts',
      content: 'console.log("hello")',
      updatedAt: 1000
    },
    {
      id: 'file-3',
      projectId: 'proj-1',
      path: '/package.json',
      content: '{}',
      updatedAt: 1000
    }
  ];

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders tab items for all openFileIds', () => {
    const mockSelect = vi.fn();
    const mockClose = vi.fn();

    render(
      <EditorTabs
        files={mockFiles}
        openFileIds={['file-1', 'file-2']}
        activeFileId="file-1"
        onSelectFile={mockSelect}
        onCloseFile={mockClose}
      />
    );

    expect(screen.getByRole('tab', { name: /App\.tsx/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /main\.ts/i })).toBeDefined();
    expect(screen.queryByRole('tab', { name: /package\.json/i })).toBeNull();
  });

  it('marks the active tab with aria-selected="true"', () => {
    const mockSelect = vi.fn();
    const mockClose = vi.fn();

    render(
      <EditorTabs
        files={mockFiles}
        openFileIds={['file-1', 'file-2']}
        activeFileId="file-2"
        onSelectFile={mockSelect}
        onCloseFile={mockClose}
      />
    );

    const activeTab = screen.getByRole('tab', { name: /main\.ts/i });
    expect(activeTab.getAttribute('aria-selected')).toBe('true');

    const inactiveTab = screen.getByRole('tab', { name: /App\.tsx/i });
    expect(inactiveTab.getAttribute('aria-selected')).toBe('false');
  });

  it('calls onSelectFile when tab is clicked', () => {
    const mockSelect = vi.fn();
    const mockClose = vi.fn();

    render(
      <EditorTabs
        files={mockFiles}
        openFileIds={['file-1', 'file-2']}
        activeFileId="file-1"
        onSelectFile={mockSelect}
        onCloseFile={mockClose}
      />
    );

    const secondTab = screen.getByRole('tab', { name: /main\.ts/i });
    fireEvent.click(secondTab);

    expect(mockSelect).toHaveBeenCalledWith('file-2');
  });

  it('calls onCloseFile when the close button is clicked without bubbling to tab select', () => {
    const mockSelect = vi.fn();
    const mockClose = vi.fn();

    render(
      <EditorTabs
        files={mockFiles}
        openFileIds={['file-1', 'file-2']}
        activeFileId="file-1"
        onSelectFile={mockSelect}
        onCloseFile={mockClose}
      />
    );

    const closeBtn = screen.getByRole('button', { name: /Close App\.tsx/i });
    fireEvent.click(closeBtn);

    expect(mockClose).toHaveBeenCalledWith('file-1', expect.anything());
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('handles drag-and-drop tab reordering and calls onReorderTabs', () => {
    const mockReorder = vi.fn();
    const mockDataTransfer = {
      setData: vi.fn(),
      effectAllowed: 'none',
      dropEffect: 'none'
    };

    render(
      <EditorTabs
        files={mockFiles}
        openFileIds={['file-1', 'file-2', 'file-3']}
        activeFileId="file-1"
        onSelectFile={vi.fn()}
        onCloseFile={vi.fn()}
        onReorderTabs={mockReorder}
      />
    );

    const tab1 = screen.getByRole('tab', { name: /App\.tsx/i });
    const tab3 = screen.getByRole('tab', { name: /package\.json/i });

    expect(tab1.getAttribute('draggable')).toBe('true');

    // 1. Drag start on Tab 1
    fireEvent.dragStart(tab1, { dataTransfer: mockDataTransfer });
    expect(mockDataTransfer.setData).toHaveBeenCalledWith('text/plain', 'file-1');

    // 2. Drag over Tab 3
    fireEvent.dragOver(tab3, { dataTransfer: mockDataTransfer });
    fireEvent.dragEnter(tab3, { dataTransfer: mockDataTransfer });

    // 3. Drop on Tab 3
    fireEvent.drop(tab3, { dataTransfer: mockDataTransfer });

    // Tab 1 moved to position of Tab 3: ['file-2', 'file-3', 'file-1']
    expect(mockReorder).toHaveBeenCalledWith(['file-2', 'file-3', 'file-1']);
  });

  it('does not trigger onReorderTabs when dropped on the same tab', () => {
    const mockReorder = vi.fn();
    const mockDataTransfer = {
      setData: vi.fn(),
      effectAllowed: 'none',
      dropEffect: 'none'
    };

    render(
      <EditorTabs
        files={mockFiles}
        openFileIds={['file-1', 'file-2']}
        activeFileId="file-1"
        onSelectFile={vi.fn()}
        onCloseFile={vi.fn()}
        onReorderTabs={mockReorder}
      />
    );

    const tab1 = screen.getByRole('tab', { name: /App\.tsx/i });

    fireEvent.dragStart(tab1, { dataTransfer: mockDataTransfer });
    fireEvent.drop(tab1, { dataTransfer: mockDataTransfer });

    expect(mockReorder).not.toHaveBeenCalled();
  });
});
