// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TerminalPanel } from './TerminalPanel';
import { db, type FileItem } from '../db';
import { useAppStore } from '../store';

vi.mock('../services/bundler/testRunner', () => ({
  runProjectTests: vi.fn().mockResolvedValue('Tests run: 5, Passed: 5, Failed: 0\n✅ all tests passed')
}));

vi.mock('../services/bundler/bundler', () => ({
  bundle: vi.fn().mockResolvedValue('// bundled bundle code'),
  escapeScriptClosingTags: (s: string) => s
}));

describe('TerminalPanel Component', () => {
  const projectId = 'test-term-proj';
  const mockFiles: FileItem[] = [
    {
      id: 'f-1',
      projectId,
      path: '/package.json',
      content: '{\n  "name": "term-demo",\n  "version": "1.0.0",\n  "dependencies": {\n    "react": "^18.2.0"\n  }\n}',
      updatedAt: 1000
    },
    {
      id: 'f-2',
      projectId,
      path: '/src/main.tsx',
      content: 'import React from "react";\nconsole.log("Main rendered");',
      updatedAt: 1000
    },
    {
      id: 'f-3',
      projectId,
      path: '/src/utils.ts',
      content: 'export function add(a: number, b: number) {\n  return a + b;\n}',
      updatedAt: 1000
    }
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    cleanup();
    await db.files.clear();
    for (const f of mockFiles) {
      await db.files.add(f);
    }
    useAppStore.setState({
      activeFileId: null,
      activeProjectId: projectId,
      activeTab: 'terminal'
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders terminal interface with prompt, status, and quick chips', () => {
    render(<TerminalPanel projectId={projectId} files={mockFiles} />);

    expect(screen.getByRole('region', { name: 'Sandbox Terminal' })).toBeDefined();
    expect(screen.getByText('TERMINAL')).toBeDefined();
    expect(screen.getByText('ONLINE')).toBeDefined();
    expect(screen.getByText('npm test')).toBeDefined();
    expect(screen.getByText('npm run build')).toBeDefined();
    expect(screen.getByPlaceholderText(/Type a command/)).toBeDefined();
  });

  it('executes "help" command and displays command list', async () => {
    render(<TerminalPanel projectId={projectId} files={mockFiles} />);

    const input = screen.getByPlaceholderText(/Type a command/);
    fireEvent.change(input, { target: { value: 'help' } });
    fireEvent.submit(input);

    await waitFor(() => {
      expect(screen.getByText(/LAIDE Virtual Shell — Available Commands/)).toBeDefined();
      expect(screen.getByText(/FILE SYSTEM/)).toBeDefined();
    });
  });

  it('executes "pwd" and "cd" commands navigating directories', async () => {
    render(<TerminalPanel projectId={projectId} files={mockFiles} />);

    const input = screen.getByPlaceholderText(/Type a command/);

    // pwd -> /
    fireEvent.change(input, { target: { value: 'pwd' } });
    fireEvent.submit(input);

    await waitFor(() => {
      const logArea = screen.getByRole('log');
      expect(logArea.textContent).toContain('dev@laide');
    });

    // cd src
    fireEvent.change(input, { target: { value: 'cd src' } });
    fireEvent.submit(input);

    // pwd -> /src
    fireEvent.change(input, { target: { value: 'pwd' } });
    fireEvent.submit(input);

    await waitFor(() => {
      const logArea = screen.getByRole('log');
      expect(logArea.textContent).toContain('/src');
    });
  });

  it('executes "ls" and lists files and folders', async () => {
    render(<TerminalPanel projectId={projectId} files={mockFiles} />);

    const input = screen.getByPlaceholderText(/Type a command/);
    fireEvent.change(input, { target: { value: 'ls' } });
    fireEvent.submit(input);

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes('src/') && content.includes('package.json'))).toBeDefined();
    });
  });

  it('executes "cat" and "head" on a file', async () => {
    render(<TerminalPanel projectId={projectId} files={mockFiles} />);

    const input = screen.getByPlaceholderText(/Type a command/);
    fireEvent.change(input, { target: { value: 'cat /src/utils.ts' } });
    fireEvent.submit(input);

    await waitFor(() => {
      expect(screen.getByText(/export function add\(a: number, b: number\)/)).toBeDefined();
    });
  });

  it('executes "grep" searching for keywords across files', async () => {
    render(<TerminalPanel projectId={projectId} files={mockFiles} />);

    const input = screen.getByPlaceholderText(/Type a command/);
    fireEvent.change(input, { target: { value: 'grep -n "Main rendered"' } });
    fireEvent.submit(input);

    await waitFor(() => {
      expect(screen.getByText(/\/src\/main\.tsx:2:console\.log\("Main rendered"\);/)).toBeDefined();
    });
  });

  it('executes "tree" and renders tree structure', async () => {
    render(<TerminalPanel projectId={projectId} files={mockFiles} />);

    const input = screen.getByPlaceholderText(/Type a command/);
    fireEvent.change(input, { target: { value: 'tree' } });
    fireEvent.submit(input);

    await waitFor(() => {
      expect(screen.getByText(/1 directories, 3 files/)).toBeDefined();
    });
  });

  it('opens a file in the editor using "code" or "open"', async () => {
    render(<TerminalPanel projectId={projectId} files={mockFiles} />);

    const input = screen.getByPlaceholderText(/Type a command/);
    fireEvent.change(input, { target: { value: 'code /src/main.tsx' } });
    fireEvent.submit(input);

    await waitFor(() => {
      expect(useAppStore.getState().activeFileId).toBe('f-2');
      expect(screen.getByText(/Opened \/src\/main\.tsx in Code Editor/)).toBeDefined();
    });
  });

  it('executes JavaScript evaluation with "eval" or "node -e"', async () => {
    render(<TerminalPanel projectId={projectId} files={mockFiles} />);

    const input = screen.getByPlaceholderText(/Type a command/);
    fireEvent.change(input, { target: { value: 'eval console.log("Eval Works: " + (21 * 2))' } });
    fireEvent.submit(input);

    await waitFor(() => {
      expect(screen.getByText(/Eval Works: 42/)).toBeDefined();
    });
  });

  it('runs "npm test" and prints results', async () => {
    render(<TerminalPanel projectId={projectId} files={mockFiles} />);

    const input = screen.getByPlaceholderText(/Type a command/);
    fireEvent.change(input, { target: { value: 'npm test' } });
    fireEvent.submit(input);

    await waitFor(() => {
      expect(screen.getByText(/Tests run: 5, Passed: 5, Failed: 0/)).toBeDefined();
      expect(screen.getByText(/all tests passed/)).toBeDefined();
    });
  });

  it('runs "npm run build" and prints build status and bundle size', async () => {
    render(<TerminalPanel projectId={projectId} files={mockFiles} />);

    const input = screen.getByPlaceholderText(/Type a command/);
    fireEvent.change(input, { target: { value: 'npm run build' } });
    fireEvent.submit(input);

    await waitFor(() => {
      expect(screen.getByText(/Build succeeded in/)).toBeDefined();
    });
  });

  it('supports command history navigation with ArrowUp and ArrowDown', async () => {
    render(<TerminalPanel projectId={projectId} files={mockFiles} />);

    const input = screen.getByPlaceholderText(/Type a command/) as HTMLInputElement;

    // Run first command
    fireEvent.change(input, { target: { value: 'pwd' } });
    fireEvent.submit(input);

    // Run second command
    fireEvent.change(input, { target: { value: 'date' } });
    fireEvent.submit(input);

    // Press ArrowUp to get 'date'
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('date');

    // Press ArrowUp again to get 'pwd'
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('pwd');

    // Press ArrowDown to return to 'date'
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.value).toBe('date');
  });

  it('clears output on clear button click or "clear" command', async () => {
    render(<TerminalPanel projectId={projectId} files={mockFiles} />);

    const input = screen.getByPlaceholderText(/Type a command/);
    fireEvent.change(input, { target: { value: 'echo "hello terminal"' } });
    fireEvent.submit(input);

    await waitFor(() => {
      expect(screen.getByText('hello terminal')).toBeDefined();
    });

    const clearButton = screen.getByLabelText('Clear Screen');
    fireEvent.click(clearButton);

    expect(screen.queryByText('hello terminal')).toBeNull();
  });
});
