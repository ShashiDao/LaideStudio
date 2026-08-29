// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Editor, getLanguageExtensionAsync, langExtensionCache } from './Editor';
import type { FileItem } from '../../db';

const mockSetActiveFileId = vi.fn();
const mockAddToast = vi.fn();
const mockSetEditorNavigationTarget = vi.fn();

vi.mock('../../store', () => ({
  useAppStore: () => ({
    setActiveFileId: mockSetActiveFileId,
    theme: 'oled',
    addToast: mockAddToast,
    editorNavigationTarget: null,
    setEditorNavigationTarget: mockSetEditorNavigationTarget,
  })
}));

vi.mock('../../db', () => ({
  db: {
    provenanceEntries: {
      where: () => ({
        equals: () => ({
          toArray: vi.fn().mockResolvedValue([])
        })
      })
    },
    files: {
      put: vi.fn().mockResolvedValue('file-1'),
      get: vi.fn()
    }
  }
}));

vi.mock('../../services/fs/vfs', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../hooks/useShellBreakpoint', () => ({
  useShellBreakpoint: () => 'phone'
}));

describe('Editor lazy language extension loading', () => {
  beforeEach(() => {
    langExtensionCache.clear();
  });

  it('loads and caches javascript extension for .tsx and .js files', async () => {
    const ext1 = await getLanguageExtensionAsync('/src/App.tsx');
    expect(ext1).not.toBeNull();
    expect(langExtensionCache.has('javascript-true')).toBe(true);

    const ext2 = await getLanguageExtensionAsync('/src/index.js');
    expect(ext2).not.toBeNull();
    expect(langExtensionCache.has('javascript-false')).toBe(true);
  });

  it('loads HTML, CSS, JSON, and Markdown extensions per file type', async () => {
    const htmlExt = await getLanguageExtensionAsync('/index.html');
    expect(htmlExt).not.toBeNull();
    expect(langExtensionCache.has('html')).toBe(true);

    const cssExt = await getLanguageExtensionAsync('/src/index.css');
    expect(cssExt).not.toBeNull();
    expect(langExtensionCache.has('css')).toBe(true);

    const jsonExt = await getLanguageExtensionAsync('/package.json');
    expect(jsonExt).not.toBeNull();
    expect(langExtensionCache.has('json')).toBe(true);

    const mdExt = await getLanguageExtensionAsync('/README.md');
    expect(mdExt).not.toBeNull();
    expect(langExtensionCache.has('markdown')).toBe(true);
  });

  it('returns null for unknown file types without loading extensions', async () => {
    const ext = await getLanguageExtensionAsync('/unknown.bin');
    expect(ext).toBeNull();
  });
});

describe('Editor Toolbar & Controls', () => {
  const sampleFile: FileItem = {
    id: 'file-1',
    projectId: 'proj-1',
    path: '/src/App.tsx',
    content: 'console.log("hello world");',
    updatedAt: Date.now()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined)
      },
      configurable: true,
      writable: true
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders file path and merged Insights button with inline trust score', () => {
    render(React.createElement(Editor, {
      file: sampleFile,
      onContentChanged: vi.fn()
    }));

    // Check file path
    expect(screen.getByText('/src/App.tsx')).toBeDefined();

    // Check merged Insights button
    const insightsBtn = screen.getByRole('button', { name: /Insights/i });
    expect(insightsBtn).toBeDefined();
    expect(insightsBtn.textContent).toContain('Insights');
    expect(insightsBtn.textContent).toContain('%');
  });

  it('toggles AI Blame & Trust panel when Insights button is clicked', async () => {
    render(React.createElement(Editor, {
      file: sampleFile,
      onContentChanged: vi.fn()
    }));

    const insightsBtn = screen.getByRole('button', { name: /Insights/i });
    expect(screen.queryByRole('complementary', { name: 'AI Blame Inspector' })).toBeNull();

    fireEvent.click(insightsBtn);
    expect(screen.getByRole('complementary', { name: 'AI Blame Inspector' })).toBeDefined();

    fireEvent.click(insightsBtn);
    expect(screen.queryByRole('complementary', { name: 'AI Blame Inspector' })).toBeNull();
  });

  it('renders Find button and opens Find & Replace bar', () => {
    render(React.createElement(Editor, {
      file: sampleFile,
      onContentChanged: vi.fn()
    }));

    const findBtn = screen.getByRole('button', { name: /Find & Replace/i });
    expect(findBtn).toBeDefined();

    fireEvent.click(findBtn);
    expect(screen.getByPlaceholderText(/Find in file/i)).toBeDefined();
  });

  it('renders overflow menu button and copies path when Copy Path item is clicked', async () => {
    render(React.createElement(Editor, {
      file: sampleFile,
      onContentChanged: vi.fn()
    }));

    // Initially Copy Path is not visible in main toolbar
    expect(screen.queryByRole('menuitem', { name: /Copy Path/i })).toBeNull();

    // Open overflow menu
    const overflowBtn = screen.getByRole('button', { name: 'More actions' });
    expect(overflowBtn).toBeDefined();

    fireEvent.click(overflowBtn);

    // Copy Path is visible in overflow menu
    const copyItem = screen.getByRole('menuitem', { name: /Copy Path/i });
    expect(copyItem).toBeDefined();

    fireEvent.click(copyItem);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/src/App.tsx');
  });

  it('renders Close button and handles file close', () => {
    render(React.createElement(Editor, {
      file: sampleFile,
      onContentChanged: vi.fn()
    }));

    const closeBtn = screen.getByRole('button', { name: 'Close file' });
    expect(closeBtn).toBeDefined();

    fireEvent.click(closeBtn);
    expect(mockSetActiveFileId).toHaveBeenCalledWith(null);
  });

  it('renders mobile coding accessory bar with quick symbol buttons', () => {
    render(React.createElement(Editor, {
      file: sampleFile,
      onContentChanged: vi.fn()
    }));

    // Check for mobile accessory bar container
    const toolbar = screen.getByRole('toolbar', { name: 'Mobile Coding Toolbar' });
    expect(toolbar).toBeDefined();

    // Check quick symbol buttons
    expect(screen.getByRole('button', { name: 'Insert Tab' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Insert {' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Insert }' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDefined();
  });
});
