// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TerminalPanel } from './TerminalPanel';
import { db, type FileItem } from '../../db';
import { useAppStore } from '../../store';

vi.mock('../../services/bundler/testRunner', () => ({
  runProjectTests: vi.fn().mockResolvedValue('Tests run: 5, Passed: 5, Failed: 0\n✅ all tests passed')
}));

vi.mock('../../services/bundler/bundler', () => ({
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

  it('rejects unknown commands with standard "sh: command not found: [input]" error without creating files', async () => {
    const onFilesChanged = vi.fn();
    render(<TerminalPanel projectId={projectId} files={mockFiles} onFilesChanged={onFilesChanged} />);

    const input = screen.getByPlaceholderText(/Type a command/);
    fireEvent.change(input, { target: { value: 'foobar_unknown_cmd --flag' } });
    fireEvent.submit(input);

    await waitFor(() => {
      expect(screen.getByText(/sh: command not found: foobar_unknown_cmd/)).toBeDefined();
    });

    // Verify no files were created in DB
    const dbFiles = await db.files.where('projectId').equals(projectId).toArray();
    expect(dbFiles.length).toBe(mockFiles.length);
    expect(onFilesChanged).not.toHaveBeenCalled();
  });

  it('safely rejects pasted multi-line JavaScript code block without creating artifact files on disk', async () => {
    const onFilesChanged = vi.fn();
    render(<TerminalPanel projectId={projectId} files={mockFiles} onFilesChanged={onFilesChanged} />);

    const pastedScript = `const x = 10;\nfunction test() { return x > 5; }\nconsole.log(test());`;
    const input = screen.getByPlaceholderText(/Type a command/);
    fireEvent.change(input, { target: { value: pastedScript } });
    fireEvent.submit(input);

    await waitFor(() => {
      expect(screen.getByText(/sh: command not found: const/)).toBeDefined();
    });

    const dbFiles = await db.files.where('projectId').equals(projectId).toArray();
    expect(dbFiles.length).toBe(mockFiles.length);
    expect(onFilesChanged).not.toHaveBeenCalled();
  });

  it('safely executes redirection for valid commands like "echo hello > /test.txt"', async () => {
    const onFilesChanged = vi.fn();
    render(<TerminalPanel projectId={projectId} files={mockFiles} onFilesChanged={onFilesChanged} />);

    const input = screen.getByPlaceholderText(/Type a command/);
    fireEvent.change(input, { target: { value: 'echo "hello file" > /test.txt' } });
    fireEvent.submit(input);

    await waitFor(() => {
      expect(onFilesChanged).toHaveBeenCalled();
    });

    const created = await db.files.where({ projectId, path: '/test.txt' }).first();
    expect(created).toBeDefined();
    expect(created?.content).toBe('hello file');
  });

  it('purges existing accidental artifact files on mount', async () => {
    const artifactFile: FileItem = {
      id: 'artifact-bad-1',
      projectId,
      path: '/const x = 10; }',
      content: 'bad content',
      updatedAt: Date.now()
    };
    await db.files.add(artifactFile);

    const onFilesChanged = vi.fn();
    render(<TerminalPanel projectId={projectId} files={[...mockFiles, artifactFile]} onFilesChanged={onFilesChanged} />);

    await waitFor(() => {
      expect(onFilesChanged).toHaveBeenCalled();
    });

    const remaining = await db.files.where('projectId').equals(projectId).toArray();
    expect(remaining.find(f => f.id === 'artifact-bad-1')).toBeUndefined();
  });

  describe('Sticky Keyboard Accessory Bar & Shell Modifiers', () => {
    it('renders the sticky keyboard accessory bar with all required shell modifiers and quick chips', () => {
      render(<TerminalPanel projectId={projectId} files={mockFiles} />);

      const toolbar = screen.getByRole('toolbar', { name: 'Terminal keyboard accessory bar' });
      expect(toolbar).toBeDefined();

      expect(screen.getByRole('button', { name: 'Tab Autocomplete' })).toBeDefined();
      expect(screen.getByRole('button', { name: 'History Previous' })).toBeDefined();
      expect(screen.getByRole('button', { name: 'History Next' })).toBeDefined();
      expect(screen.getByRole('button', { name: 'Insert hyphen' })).toBeDefined();
      expect(screen.getByRole('button', { name: 'Insert slash' })).toBeDefined();
      expect(screen.getByRole('button', { name: 'Insert pipe' })).toBeDefined();
      expect(screen.getByRole('button', { name: 'SIGINT Abort (Ctrl+C)' })).toBeDefined();

      // Quick chips
      expect(screen.getByRole('button', { name: /npm test/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /npm run build/i })).toBeDefined();
      expect(screen.getByRole('button', { name: 'tree' })).toBeDefined();
      expect(screen.getByRole('button', { name: 'ls -la' })).toBeDefined();
      expect(screen.getByRole('button', { name: 'help' })).toBeDefined();
    });

    it('inserts characters (-, /, |) into input when modifier buttons are clicked', () => {
      render(<TerminalPanel projectId={projectId} files={mockFiles} />);
      const input = screen.getByPlaceholderText<HTMLInputElement>(/Type a command/);

      const hyphenBtn = screen.getByRole('button', { name: 'Insert hyphen' });
      const slashBtn = screen.getByRole('button', { name: 'Insert slash' });
      const pipeBtn = screen.getByRole('button', { name: 'Insert pipe' });

      fireEvent.click(hyphenBtn);
      expect(input.value).toBe('-');

      fireEvent.click(slashBtn);
      expect(input.value).toBe('-/');

      fireEvent.click(pipeBtn);
      expect(input.value).toBe('-/ | ');
    });

    it('handles Tab autocomplete via modifier button', () => {
      render(<TerminalPanel projectId={projectId} files={mockFiles} />);
      const input = screen.getByPlaceholderText<HTMLInputElement>(/Type a command/);
      const tabBtn = screen.getByRole('button', { name: 'Tab Autocomplete' });

      fireEvent.change(input, { target: { value: 'tre' } });
      fireEvent.click(tabBtn);

      expect(input.value).toBe('tree ');
    });

    it('autocompletes npm subcommands like "npm run build" and "npm test"', () => {
      render(<TerminalPanel projectId={projectId} files={mockFiles} />);
      const input = screen.getByPlaceholderText<HTMLInputElement>(/Type a command/);
      const tabBtn = screen.getByRole('button', { name: 'Tab Autocomplete' });

      // npm t -> npm test
      fireEvent.change(input, { target: { value: 'npm t' } });
      fireEvent.click(tabBtn);
      expect(input.value).toBe('npm test ');

      // npm run b -> npm run build
      fireEvent.change(input, { target: { value: 'npm run b' } });
      fireEvent.click(tabBtn);
      expect(input.value).toBe('npm run build ');

      // git s -> git status
      fireEvent.change(input, { target: { value: 'git s' } });
      fireEvent.click(tabBtn);
      expect(input.value).toBe('git status ');
    });

    it('autocompletes file and folder paths with Tab', () => {
      render(<TerminalPanel projectId={projectId} files={mockFiles} />);
      const input = screen.getByPlaceholderText<HTMLInputElement>(/Type a command/);
      const tabBtn = screen.getByRole('button', { name: 'Tab Autocomplete' });

      // cd sr -> cd src/
      fireEvent.change(input, { target: { value: 'cd sr' } });
      fireEvent.click(tabBtn);
      expect(input.value).toBe('cd src/');

      // cat src/m -> cat src/main.tsx
      fireEvent.change(input, { target: { value: 'cat src/m' } });
      fireEvent.click(tabBtn);
      expect(input.value).toBe('cat src/main.tsx ');
    });

    it('prevents default on mousedown to preserve keyboard focus', () => {
      render(<TerminalPanel projectId={projectId} files={mockFiles} />);
      const tabBtn = screen.getByRole('button', { name: 'Tab Autocomplete' });
      const hyphenBtn = screen.getByRole('button', { name: 'Insert hyphen' });

      const tabPrevented = !fireEvent.mouseDown(tabBtn);
      expect(tabPrevented).toBe(true);

      const hyphenPrevented = !fireEvent.mouseDown(hyphenBtn);
      expect(hyphenPrevented).toBe(true);
    });

    it('cycles command history with Up and Down modifier buttons', async () => {
      render(<TerminalPanel projectId={projectId} files={mockFiles} />);
      const input = screen.getByPlaceholderText<HTMLInputElement>(/Type a command/);
      const upBtn = screen.getByRole('button', { name: 'History Previous' });
      const downBtn = screen.getByRole('button', { name: 'History Next' });

      // Run 2 commands
      fireEvent.change(input, { target: { value: 'echo first' } });
      fireEvent.submit(input);

      fireEvent.change(input, { target: { value: 'echo second' } });
      fireEvent.submit(input);

      // Press Up: should show "echo second"
      fireEvent.click(upBtn);
      expect(input.value).toBe('echo second');

      // Press Up again: should show "echo first"
      fireEvent.click(upBtn);
      expect(input.value).toBe('echo first');

      // Press Down: should go back to "echo second"
      fireEvent.click(downBtn);
      expect(input.value).toBe('echo second');

      // Press Down: should clear input back to current edit buffer
      fireEvent.click(downBtn);
      expect(input.value).toBe('');
    });

    it('aborts input or running command with SIGINT (^C) modifier button', () => {
      render(<TerminalPanel projectId={projectId} files={mockFiles} />);
      const input = screen.getByPlaceholderText<HTMLInputElement>(/Type a command/);
      const sigintBtn = screen.getByRole('button', { name: 'SIGINT Abort (Ctrl+C)' });

      fireEvent.change(input, { target: { value: 'long running unsubmitted' } });
      fireEvent.click(sigintBtn);

      expect(input.value).toBe('');
      expect(screen.getByText(/long running unsubmitted \^C/)).toBeDefined();
    });

    it('executes quick command when sticky quick chip is clicked', async () => {
      render(<TerminalPanel projectId={projectId} files={mockFiles} />);
      const treeBtn = screen.getByRole('button', { name: 'tree' });

      fireEvent.click(treeBtn);

      await waitFor(() => {
        expect(screen.getByText(/package\.json/)).toBeDefined();
      });
    });
  });
});
