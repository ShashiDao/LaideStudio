import React from 'react';
import { 
  CornerDownLeft, 
  ArrowUp, 
  ArrowDown, 
  Play, 
  Sparkles, 
  HelpCircle 
} from 'lucide-react';

interface TerminalPromptProps {
  cwd: string;
  input: string;
  setInput: (value: string) => void;
  isRunning: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onExecute: (cmd: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onTab: () => void;
  onHistoryUp: () => void;
  onHistoryDown: () => void;
  onInsertChar: (char: string) => void;
  onSigInt: () => void;
  hasHistory: boolean;
  hasHistoryNext: boolean;
}

export function TerminalPrompt({
  cwd,
  input,
  setInput,
  isRunning,
  inputRef,
  onExecute,
  onKeyDown,
  onTab,
  onHistoryUp,
  onHistoryDown,
  onInsertChar,
  onSigInt,
  hasHistory,
  hasHistoryNext
}: TerminalPromptProps) {
  return (
    <div 
      className="sticky bottom-0 z-20 bg-surface border-t border-border flex flex-col shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Interactive Command Input Prompt */}
      <div className="p-2 sm:p-2.5 pb-2.5 flex items-center gap-2 border-b border-border/40 bg-surface">
        <div className="flex items-center gap-1 shrink-0 select-none text-xs">
          <span className="text-moss font-bold hidden xs:inline">dev@laide:</span>
          <span className="text-accent font-bold">{cwd === '/' ? '~' : cwd}$</span>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onExecute(input);
          }}
          className="flex-1 flex items-center gap-1.5"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={isRunning}
            placeholder={isRunning ? 'Executing command...' : 'Type a command (e.g. "help", "npm test", "ls -la")...'}
            aria-label="Terminal command input"
            className="flex-1 bg-transparent text-text font-mono text-xs focus:outline-none placeholder:text-muted/50"
            autoComplete="off"
            spellCheck={false}
          />

          <button
            type="submit"
            disabled={!input.trim() || isRunning}
            className="min-h-[36px] min-w-[36px] h-9 w-9 rounded-md bg-accent/15 text-accent hover:bg-accent hover:text-accent-text-on active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Run command"
            title="Run command (Enter)"
          >
            <CornerDownLeft size={14} />
          </button>
        </form>
      </div>

      {/* Sticky Keyboard Accessory Bar with >= 36x36px Touch Targets */}
      <div 
        className="px-2 py-1.5 pb-safe bg-surface-elevated/80 flex items-center justify-between gap-1.5 overflow-x-auto scrollbar-none select-none"
        role="toolbar"
        aria-label="Terminal keyboard accessory bar"
      >
        {/* Shell Modifiers */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Tab key */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onTab}
            className="h-9 px-3 min-w-[54px] bg-surface border border-border hover:border-accent/50 active:bg-accent/20 active:scale-95 rounded-md font-mono font-bold text-xs text-text hover:text-accent flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs shrink-0"
            title="Tab (Autocomplete command or path)"
            aria-label="Tab Autocomplete"
          >
            <span>Tab</span>
            <span className="text-[10px] text-muted font-normal">⇥</span>
          </button>

          {/* History Up */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onHistoryUp}
            disabled={!hasHistory}
            className="h-9 w-9 min-w-[36px] min-h-[36px] bg-surface border border-border hover:border-accent/50 active:bg-accent/20 active:scale-95 rounded-md text-text hover:text-accent disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-all cursor-pointer shadow-xs shrink-0"
            title="History Previous (Up Arrow)"
            aria-label="History Previous"
          >
            <ArrowUp size={15} />
          </button>

          {/* History Down */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onHistoryDown}
            disabled={!hasHistoryNext}
            className="h-9 w-9 min-w-[36px] min-h-[36px] bg-surface border border-border hover:border-accent/50 active:bg-accent/20 active:scale-95 rounded-md text-text hover:text-accent disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-all cursor-pointer shadow-xs shrink-0"
            title="History Next (Down Arrow)"
            aria-label="History Next"
          >
            <ArrowDown size={15} />
          </button>

          {/* Insert '-' */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onInsertChar('-')}
            className="h-9 w-9 min-w-[36px] min-h-[36px] bg-surface border border-border hover:border-accent/50 active:bg-accent/20 active:scale-95 rounded-md font-mono font-bold text-sm text-text hover:text-accent flex items-center justify-center transition-all cursor-pointer shadow-xs shrink-0"
            title="Insert hyphen/flag (-)"
            aria-label="Insert hyphen"
          >
            -
          </button>

          {/* Insert '/' */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onInsertChar('/')}
            className="h-9 w-9 min-w-[36px] min-h-[36px] bg-surface border border-border hover:border-accent/50 active:bg-accent/20 active:scale-95 rounded-md font-mono font-bold text-sm text-text hover:text-accent flex items-center justify-center transition-all cursor-pointer shadow-xs shrink-0"
            title="Insert path slash (/)"
            aria-label="Insert slash"
          >
            /
          </button>

          {/* Insert '|' */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onInsertChar(' | ')}
            className="h-9 w-9 min-w-[36px] min-h-[36px] bg-surface border border-border hover:border-accent/50 active:bg-accent/20 active:scale-95 rounded-md font-mono font-bold text-sm text-text hover:text-accent flex items-center justify-center transition-all cursor-pointer shadow-xs shrink-0"
            title="Insert pipe ( | )"
            aria-label="Insert pipe"
          >
            |
          </button>

          {/* Ctrl+C SIGINT */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onSigInt}
            className="h-9 px-2.5 min-w-[50px] bg-surface border border-border hover:border-oxide/60 hover:bg-oxide/10 active:bg-oxide/20 active:scale-95 rounded-md font-mono font-bold text-xs text-oxide/90 hover:text-oxide flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs shrink-0"
            title="Ctrl+C (SIGINT: Abort running command or clear input)"
            aria-label="SIGINT Abort (Ctrl+C)"
          >
            <span>^C</span>
            <span className="text-[10px] text-oxide/70 font-normal">Abort</span>
          </button>
        </div>

        {/* Divider */}
        <div className="w-[1px] h-5 bg-border/80 shrink-0 mx-0.5" />

        {/* Quick Action Chips in Sticky Accessory Bar */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-muted/70 uppercase tracking-wider shrink-0 mr-0.5 hidden sm:inline">Quick:</span>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onExecute('npm test')}
            disabled={isRunning}
            className="h-9 px-3 min-h-[36px] bg-surface border border-border hover:border-accent/40 active:scale-95 rounded-md text-xs text-text hover:text-accent flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shrink-0"
          >
            <Play size={11} className="text-moss" />
            <span>npm test</span>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onExecute('npm run build')}
            disabled={isRunning}
            className="h-9 px-3 min-h-[36px] bg-surface border border-border hover:border-accent/40 active:scale-95 rounded-md text-xs text-text hover:text-accent flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shrink-0"
          >
            <Sparkles size={11} className="text-accent" />
            <span>npm run build</span>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onExecute('tree')}
            disabled={isRunning}
            className="h-9 px-3 min-h-[36px] bg-surface border border-border hover:border-accent/40 active:scale-95 rounded-md text-xs text-text hover:text-accent flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50 shrink-0"
          >
            <span>tree</span>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onExecute('ls -la')}
            disabled={isRunning}
            className="h-9 px-3 min-h-[36px] bg-surface border border-border hover:border-accent/40 active:scale-95 rounded-md text-xs text-text hover:text-accent flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50 shrink-0"
          >
            <span>ls -la</span>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onExecute('help')}
            disabled={isRunning}
            className="h-9 px-3 min-h-[36px] bg-surface border border-border hover:border-accent/40 active:scale-95 rounded-md text-xs text-text hover:text-accent flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shrink-0"
          >
            <HelpCircle size={11} className="text-muted" />
            <span>help</span>
          </button>
        </div>
      </div>
    </div>
  );
}
