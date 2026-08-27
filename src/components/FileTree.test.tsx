// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FileTree, buildFileTree, getAllFolderPaths, getFileIcon, getFolderIcon } from './FileTree';
import { useAppStore } from '../store';
import type { FileItem } from '../db';

describe('FileTree & Global File Search', () => {
  const mockFiles: FileItem[] = [
    {
      id: 'f-1',
      projectId: 'p-1',
      path: '/src/App.tsx',
      content: 'import React from "react";\nexport default function App() { return <div>App</div>; }',
      updatedAt: 1000,
    },
    {
      id: 'f-2',
      projectId: 'p-1',
      path: '/src/components/PreviewPanel.tsx',
      content: 'export function PreviewPanel() { return <div>Preview</div>; }',
      updatedAt: 1000,
    },
    {
      id: 'f-3',
      projectId: 'p-1',
      path: '/src/services/bundler/esbuild.worker.ts',
      content: 'self.onmessage = () => {};',
      updatedAt: 1000,
    },
    {
      id: 'f-4',
      projectId: 'p-1',
      path: '/package.json',
      content: '{"name": "test-project"}',
      updatedAt: 1000,
    },
    {
      id: 'f-5',
      projectId: 'p-1',
      path: '/src/index.css',
      content: '@tailwind base;',
      updatedAt: 1000,
    },
    {
      id: 'f-6',
      projectId: 'p-1',
      path: '/public/logo.png',
      content: 'fake-png-base64',
      updatedAt: 1000,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    useAppStore.setState({
      activeFileId: null,
      flashingPaths: [],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('builds tree structure correctly and discovers all folder paths', () => {
    const tree = buildFileTree(mockFiles);
    expect(tree.type).toBe('folder');
    expect(tree.children?.['src']).toBeDefined();
    expect(tree.children?.['package.json']).toBeDefined();
    expect(tree.children?.['src'].children?.['App.tsx']).toBeDefined();
    expect(tree.children?.['src'].children?.['components'].children?.['PreviewPanel.tsx']).toBeDefined();

    const folderPaths = getAllFolderPaths(tree);
    expect(folderPaths).toContain('/src');
    expect(folderPaths).toContain('/src/components');
    expect(folderPaths).toContain('/src/services');
    expect(folderPaths).toContain('/src/services/bundler');
    expect(folderPaths).toContain('/public');
  });

  it('renders distinct icons for different file types and special configs', () => {
    const tsxIcon = getFileIcon('App.tsx');
    const tsIcon = getFileIcon('index.ts');
    const jsonIcon = getFileIcon('data.json');
    const pkgIcon = getFileIcon('package.json');
    const cssIcon = getFileIcon('main.css');
    const imgIcon = getFileIcon('icon.png');
    const envIcon = getFileIcon('.env.local');

    expect(tsxIcon).toBeDefined();
    expect(tsIcon).toBeDefined();
    expect(jsonIcon).toBeDefined();
    expect(pkgIcon).toBeDefined();
    expect(cssIcon).toBeDefined();
    expect(imgIcon).toBeDefined();
    expect(envIcon).toBeDefined();

    // Folder open/closed states
    const openFolder = getFolderIcon('components', true);
    const closedFolder = getFolderIcon('components', false);
    expect(openFolder).toBeDefined();
    expect(closedFolder).toBeDefined();
  });

  it('renders standard tree view when search query is empty with folder and file controls', () => {
    render(<FileTree files={mockFiles} projectId="p-1" />);

    // Search bar is present with placeholder
    const searchInput = screen.getByPlaceholderText('Search files... (/)');
    expect(searchInput).toBeDefined();

    // Folder and file items are displayed in tree
    expect(screen.getByText('src')).toBeDefined();
    expect(screen.getByText('package.json')).toBeDefined();
    expect(screen.getByText('App.tsx')).toBeDefined();

    // Stats bar showing file and folder counts
    expect(screen.getByText(/6 files/)).toBeDefined();
    expect(screen.getByText(/folders/)).toBeDefined();

    // Expand & Collapse All buttons
    expect(screen.getByRole('button', { name: 'Expand all folders' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Collapse all folders' })).toBeDefined();
  });

  it('toggles folder expansion state on clicking folder node', () => {
    render(<FileTree files={mockFiles} projectId="p-1" />);

    const srcFolderBtn = screen.getByRole('button', { name: /Folder src, expanded/i });
    expect(srcFolderBtn.getAttribute('aria-expanded')).toBe('true');

    // Click to collapse
    fireEvent.click(srcFolderBtn);
    expect(screen.getByRole('button', { name: /Folder src, collapsed/i }).getAttribute('aria-expanded')).toBe('false');

    // Click to expand again
    fireEvent.click(srcFolderBtn);
    expect(screen.getByRole('button', { name: /Folder src, expanded/i }).getAttribute('aria-expanded')).toBe('true');
  });

  it('collapses all and expands all folders with one-click actions', () => {
    render(<FileTree files={mockFiles} projectId="p-1" />);

    const collapseAllBtn = screen.getByRole('button', { name: 'Collapse all folders' });
    const expandAllBtn = screen.getByRole('button', { name: 'Expand all folders' });

    // Collapse all
    fireEvent.click(collapseAllBtn);
    const collapsedSrc = screen.getByRole('button', { name: /Folder src, collapsed/i });
    expect(collapsedSrc.getAttribute('aria-expanded')).toBe('false');

    // Expand all
    fireEvent.click(expandAllBtn);
    const expandedSrc = screen.getByRole('button', { name: /Folder src, expanded/i });
    expect(expandedSrc.getAttribute('aria-expanded')).toBe('true');
  });

  it('filters files globally across folders when searching by filename', () => {
    render(<FileTree files={mockFiles} projectId="p-1" />);

    const searchInput = screen.getByPlaceholderText('Search files... (/)');
    fireEvent.change(searchInput, { target: { value: 'Preview' } });

    // Match count badge
    expect(screen.getByText('1 file found')).toBeDefined();

    // Matching file is shown in results
    const option = screen.getByRole('option');
    expect(option.textContent).toContain('PreviewPanel.tsx');
    expect(option.textContent).toContain('/src/components');

    // Non-matching files are not in results
    expect(screen.queryByText('esbuild.worker.ts')).toBeNull();
  });

  it('filters files globally by path substring', () => {
    render(<FileTree files={mockFiles} projectId="p-1" />);

    const searchInput = screen.getByPlaceholderText('Search files... (/)');
    fireEvent.change(searchInput, { target: { value: 'bundler' } });

    expect(screen.getByText('1 file found')).toBeDefined();
    const option = screen.getByRole('option');
    expect(option.textContent).toContain('esbuild.worker.ts');
    expect(option.textContent).toContain('/src/services/bundler');
  });

  it('navigates search results with keyboard ArrowDown / ArrowUp and selects on Enter', () => {
    render(<FileTree files={mockFiles} projectId="p-1" />);

    const searchInput = screen.getByPlaceholderText('Search files... (/)');
    fireEvent.change(searchInput, { target: { value: 'tsx' } });

    // Both App.tsx and PreviewPanel.tsx match
    expect(screen.getByText('2 files found')).toBeDefined();

    const options = screen.getAllByRole('option');
    expect(options.length).toBe(2);

    // Initial option at index 0 is selected
    expect(options[0].getAttribute('aria-selected')).toBe('true');

    // Arrow down selects next option
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    expect(options[1].getAttribute('aria-selected')).toBe('true');

    // Enter triggers selection of activeFileId in store
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(useAppStore.getState().activeFileId).toBe('f-2');
  });

  it('clears search on Escape key press and on clear button click', () => {
    render(<FileTree files={mockFiles} projectId="p-1" />);

    const searchInput = screen.getByPlaceholderText('Search files... (/)') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'worker' } });
    expect(searchInput.value).toBe('worker');

    // Clear with Escape key
    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(searchInput.value).toBe('');
    expect(screen.getByText('src')).toBeDefined(); // Tree view restored

    // Type again and clear via clear button
    fireEvent.change(searchInput, { target: { value: 'json' } });
    const clearBtn = screen.getByLabelText('Clear search');
    fireEvent.click(clearBtn);
    expect(searchInput.value).toBe('');
  });

  it('displays empty state when no files match the search query and allows clearing', () => {
    render(<FileTree files={mockFiles} projectId="p-1" />);

    const searchInput = screen.getByPlaceholderText('Search files... (/)') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'nonexistent-xyz' } });

    expect(screen.getByText('No matching files')).toBeDefined();
    expect(screen.getByText(/nonexistent-xyz/)).toBeDefined();

    const clearBtn = screen.getByRole('button', { name: 'Clear Search' });
    fireEvent.click(clearBtn);

    expect(searchInput.value).toBe('');
    expect(screen.getByText('src')).toBeDefined();
  });

  it('selects file and opens editor on clicking search result item', () => {
    render(<FileTree files={mockFiles} projectId="p-1" />);

    const searchInput = screen.getByPlaceholderText('Search files... (/)');
    fireEvent.change(searchInput, { target: { value: 'package' } });

    const resultOption = screen.getByRole('option');
    fireEvent.click(resultOption);

    expect(useAppStore.getState().activeFileId).toBe('f-4');
  });

  it('focuses search input when pressing "/" key outside of inputs', () => {
    render(<FileTree files={mockFiles} projectId="p-1" />);

    const searchInput = screen.getByPlaceholderText('Search files... (/)');
    const focusSpy = vi.spyOn(searchInput, 'focus');

    // Press '/' on window
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }));

    expect(focusSpy).toHaveBeenCalled();
  });

  it('allows copying file path from tree node action button', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    render(<FileTree files={mockFiles} projectId="p-1" />);

    // Find copy button for App.tsx
    const copyBtn = screen.getByLabelText('Copy path /src/App.tsx');
    expect(copyBtn).toBeDefined();

    fireEvent.click(copyBtn);
    expect(writeTextMock).toHaveBeenCalledWith('/src/App.tsx');
  });

  it('allows copying file path from global search results', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    render(<FileTree files={mockFiles} projectId="p-1" />);

    const searchInput = screen.getByPlaceholderText('Search files... (/)');
    fireEvent.change(searchInput, { target: { value: 'package' } });

    const copyBtn = screen.getByLabelText('Copy path /package.json');
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith('/package.json');
  });

  it('opens image files in dedicated ImageViewerModal instead of opening CodeMirror editor', () => {
    render(<FileTree files={mockFiles} projectId="p-1" />);

    // In tree, find logo.png
    const logoFile = screen.getByText('logo.png');
    fireEvent.click(logoFile);

    // activeFileId in store should NOT be set (so CodeMirror editor is not opened)
    expect(useAppStore.getState().activeFileId).toBeNull();

    // ImageViewerModal should be rendered
    const modal = screen.getByRole('dialog');
    expect(modal).toBeDefined();
    expect(screen.getAllByText('logo.png').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('/public/logo.png')).toBeDefined();

    // Close button dismisses modal
    const closeBtn = screen.getByLabelText('Close image viewer');
    fireEvent.click(closeBtn);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens image files from search results in ImageViewerModal without setting activeFileId', () => {
    render(<FileTree files={mockFiles} projectId="p-1" />);

    const searchInput = screen.getByPlaceholderText('Search files... (/)');
    fireEvent.change(searchInput, { target: { value: 'logo' } });

    const option = screen.getByRole('option');
    fireEvent.click(option);

    expect(useAppStore.getState().activeFileId).toBeNull();
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('/public/logo.png')).toBeDefined();
  });
});
