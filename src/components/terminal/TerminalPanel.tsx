import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Terminal, 
  Trash2, 
  Copy, 
  Check, 
  Folder, 
  Loader2 
} from 'lucide-react';
import type { FileItem } from '../../db';
import { useAppStore } from '../../store';
import { 
  ALLOWED_COMMANDS, 
  COMMAND_LIST, 
  getDirEntries,
  dirExists,
  type TerminalOutputItem 
} from './terminalTypes';
import { executeTerminalCommand } from './terminalExecutor';
import { handleTerminalAutocomplete } from './terminalAutocomplete';
import { TerminalOutputList } from './TerminalOutputList';
import { TerminalPrompt } from './TerminalPrompt';
import { purgeArtifactFiles } from '../../services/fs/vfs';

// Re-export for backward compatibility
export { ALLOWED_COMMANDS, COMMAND_LIST };
export type { TerminalOutputItem };

export interface TerminalPanelProps {
  projectId?: string;
  files?: FileItem[];
  onFilesChanged?: () => void;
  onOpenBisect?: (testName?: string) => void;
}

export function TerminalPanel({
  projectId,
  files = [],
  onFilesChanged,
  onOpenBisect
}: TerminalPanelProps) {
  const { setActiveFileId, addToast, theme, toggleTheme } = useAppStore();
  const [cwd, setCwd] = useState<string>('/');
  const [input, setInput] = useState<string>('');
  const [history, setHistory] = useState<TerminalOutputItem[]>(() => [
    {
      id: 'welcome-1',
      type: 'system',
      text: `LAIDE Sandbox Terminal v1.0.0 [Ready]
Type "help" for a list of available commands or click quick actions below.`,
      timestamp: Date.now()
    }
  ]);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyPointer, setHistoryPointer] = useState<number>(-1);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [env, setEnv] = useState<Record<string, string>>({
    NODE_ENV: 'development',
    USER: 'developer',
    SHELL: '/bin/sh',
    PWD: '/'
  });
  const [copied, setCopied] = useState<boolean>(false);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [history, scrollToBottom]);

  // Keep PWD in sync with cwd
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        setEnv(prev => ({ ...prev, PWD: cwd }));
      }
    });
    return () => {
      active = false;
    };
  }, [cwd]);

  // Purge any accidental artifact files from VFS on project load
  useEffect(() => {
    if (projectId) {
      purgeArtifactFiles(projectId).then(count => {
        if (count > 0) {
          onFilesChanged?.();
        }
      }).catch(() => {});
    }
  }, [projectId, onFilesChanged]);

  const addOutput = useCallback((
    type: TerminalOutputItem['type'], 
    text: string, 
    extra?: Partial<TerminalOutputItem>
  ) => {
    const item: TerminalOutputItem = {
      id: 'out-' + Math.random().toString(36).substring(2, 9),
      type,
      text,
      timestamp: Date.now(),
      ...extra
    };
    setHistory(prev => [...prev, item]);
  }, []);

  // Directory listing helper for current VFS state
  const getEntries = useCallback((dirPath: string) => {
    return getDirEntries(files, dirPath);
  }, [files]);

  // Check if directory exists in VFS
  const checkDirExists = useCallback((dirPath: string): boolean => {
    return dirExists(files, dirPath);
  }, [files]);

  // Navigation and Autocomplete handlers
  const handleHistoryUp = useCallback(() => {
    if (cmdHistory.length === 0) return;
    const nextIndex = historyPointer === -1 
      ? cmdHistory.length - 1 
      : Math.max(0, historyPointer - 1);
    setHistoryPointer(nextIndex);
    setInput(cmdHistory[nextIndex] || '');
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [cmdHistory, historyPointer]);

  const handleHistoryDown = useCallback(() => {
    if (historyPointer === -1) return;
    const nextIndex = historyPointer + 1;
    if (nextIndex >= cmdHistory.length) {
      setHistoryPointer(-1);
      setInput('');
    } else {
      setHistoryPointer(nextIndex);
      setInput(cmdHistory[nextIndex] || '');
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [cmdHistory, historyPointer]);

  const handleAutocomplete = useCallback(() => {
    handleTerminalAutocomplete({
      input,
      cwd,
      files,
      setInput,
      addOutput
    });
  }, [input, cwd, files, addOutput]);

  const handleTab = useCallback(() => {
    handleAutocomplete();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [handleAutocomplete]);

  const insertCharacter = useCallback((char: string) => {
    if (!inputRef.current) {
      setInput(prev => prev + char);
      return;
    }
    const el = inputRef.current;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const text = el.value;
    const next = text.substring(0, start) + char + text.substring(end);
    setInput(next);
    
    requestAnimationFrame(() => {
      el.focus();
      const newPos = start + char.length;
      el.setSelectionRange(newPos, newPos);
    });
  }, []);

  const handleSigInt = useCallback(() => {
    if (isRunning) {
      setIsRunning(false);
      addOutput('stderr', '^C (SIGINT: Command execution aborted)');
    } else if (input) {
      addOutput('cmd', input + ' ^C', { cwd: cwd === '/' ? '~' : cwd });
      setInput('');
      setHistoryPointer(-1);
    } else {
      addOutput('system', '^C');
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isRunning, input, addOutput, cwd]);

  // Autocomplete & key bindings support
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleHistoryUp();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleHistoryDown();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleTab();
    } else if (e.key === 'c' && (e.ctrlKey || (e.metaKey && window.getSelection()?.toString() === ''))) {
      e.preventDefault();
      handleSigInt();
    } else if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setHistory([]);
    }
  };

  const handleExecute = useCallback(async (rawCommand: string) => {
    setHistoryPointer(-1);
    setInput('');

    await executeTerminalCommand(rawCommand, {
      projectId,
      files,
      cwd,
      setCwd,
      env,
      setEnv,
      cmdHistory,
      setCmdHistory,
      addOutput,
      setHistory,
      setIsRunning,
      dirExists: checkDirExists,
      getDirEntries: getEntries,
      onFilesChanged,
      onOpenBisect,
      setActiveFileId,
      theme,
      toggleTheme
    });
  }, [
    projectId,
    files,
    cwd,
    setCwd,
    env,
    setEnv,
    cmdHistory,
    setCmdHistory,
    addOutput,
    setHistory,
    setIsRunning,
    checkDirExists,
    getEntries,
    onFilesChanged,
    onOpenBisect,
    setActiveFileId,
    theme,
    toggleTheme
  ]);

  const handleCopyLogs = () => {
    const raw = history.map(h => {
      if (h.type === 'cmd') return `dev@laide:${h.cwd || '~'}$ ${h.text}`;
      return h.text;
    }).join('\n');

    navigator.clipboard.writeText(raw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      addToast('Terminal output copied to clipboard', 'info');
    });
  };

  return (
    <div 
      role="region" 
      aria-label="Sandbox Terminal"
      className="flex-1 flex flex-col h-full bg-bg text-text overflow-hidden font-mono select-text"
    >
      {/* Top Terminal Strip Header */}
      <div 
        className="h-9 shrink-0 bg-surface border-b border-border px-3 flex items-center justify-between text-xs font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-surface-elevated border border-border rounded text-[11px] text-accent">
            <Terminal size={12} className="shrink-0" />
            <span className="font-bold tracking-tight">TERMINAL</span>
          </div>
          
          <div className="flex items-center gap-1 text-[11px] text-muted truncate">
            <Folder size={11} className="text-moss/80 shrink-0" />
            <span className="truncate font-mono text-text/80">{cwd}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {isRunning ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-accent/10 border border-accent/30 rounded text-[10px] text-accent font-medium">
              <Loader2 size={10} className="animate-spin" />
              <span>RUNNING</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-moss font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-moss animate-pulse" />
              <span>ONLINE</span>
            </div>
          )}

          <button
            onClick={handleCopyLogs}
            className="p-1 text-muted hover:text-text rounded hover:bg-surface-elevated transition-colors cursor-pointer"
            title="Copy Terminal Logs"
            aria-label="Copy Terminal Logs"
          >
            {copied ? <Check size={13} className="text-moss" /> : <Copy size={13} />}
          </button>

          <button
            onClick={() => setHistory([])}
            className="p-1 text-muted hover:text-oxide rounded hover:bg-surface-elevated transition-colors cursor-pointer"
            title="Clear Screen (Ctrl+L)"
            aria-label="Clear Screen"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Main Terminal Output Area */}
      <TerminalOutputList history={history} ref={terminalEndRef} />

      {/* Sticky Bottom Control Area */}
      <TerminalPrompt 
        cwd={cwd}
        input={input}
        setInput={setInput}
        isRunning={isRunning}
        inputRef={inputRef}
        onExecute={handleExecute}
        onKeyDown={handleKeyDown}
        onTab={handleTab}
        onHistoryUp={handleHistoryUp}
        onHistoryDown={handleHistoryDown}
        onInsertChar={insertCharacter}
        onSigInt={handleSigInt}
        hasHistory={cmdHistory.length > 0}
        hasHistoryNext={historyPointer !== -1}
      />
    </div>
  );
}
