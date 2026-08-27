import React, { useRef, useEffect } from 'react';
import { 
  Search, 
  Replace, 
  ChevronUp, 
  ChevronDown, 
  X, 
  AlertCircle,
  CaseSensitive,
  Regex,
  WholeWord
} from 'lucide-react';

export interface EditorFindReplaceProps {
  isOpen: boolean;
  isReplaceOpen: boolean;
  onClose: () => void;
  onToggleReplace: () => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  replaceTerm: string;
  setReplaceTerm: (term: string) => void;
  caseSensitive: boolean;
  setCaseSensitive: (val: boolean | ((prev: boolean) => boolean)) => void;
  useRegex: boolean;
  setUseRegex: (val: boolean | ((prev: boolean) => boolean)) => void;
  matchWholeWord: boolean;
  setMatchWholeWord: (val: boolean | ((prev: boolean) => boolean)) => void;
  totalMatches: number;
  currentMatchIndex: number;
  onFindNext: () => void;
  onFindPrevious: () => void;
  onReplaceNext: () => void;
  onReplaceAll: () => void;
  regexError: string | null;
  focusTarget?: 'find' | 'replace';
}

export function EditorFindReplace({
  isOpen,
  isReplaceOpen,
  onClose,
  onToggleReplace,
  searchTerm,
  setSearchTerm,
  replaceTerm,
  setReplaceTerm,
  caseSensitive,
  setCaseSensitive,
  useRegex,
  setUseRegex,
  matchWholeWord,
  setMatchWholeWord,
  totalMatches,
  currentMatchIndex,
  onFindNext,
  onFindPrevious,
  onReplaceNext,
  onReplaceAll,
  regexError,
  focusTarget = 'find'
}: EditorFindReplaceProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (focusTarget === 'replace' && replaceInputRef.current) {
          replaceInputRef.current.focus();
          replaceInputRef.current.select();
        } else if (searchInputRef.current) {
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, focusTarget]);

  if (!isOpen) return null;

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        onFindPrevious();
      } else {
        onFindNext();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleReplaceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        onReplaceAll();
      } else {
        onReplaceNext();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const hasMatches = totalMatches > 0;
  const matchCounterText = searchTerm.trim()
    ? regexError
      ? 'Regex Error'
      : totalMatches > 0
      ? `${currentMatchIndex} of ${totalMatches}`
      : '0 matches'
    : '';

  return (
    <div 
      className="shrink-0 bg-surface/95 backdrop-blur-md border-b border-border/90 px-2.5 py-2 font-mono text-xs select-none shadow-md z-20 transition-all animate-in slide-in-from-top-1 duration-150"
      role="region"
      aria-label="Find and Replace Bar"
    >
      <div className="flex flex-col gap-2 max-w-full">
        {/* Desktop Single-Row Layout (sm:flex) / Mobile Top Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 min-w-0">
          
          {/* Main Search Row: Input + Match Count + Nav & Close */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {/* Toggle Replace Row Button (Desktop only here, mobile in sub-toolbar) */}
            <button
              type="button"
              onClick={onToggleReplace}
              aria-label={isReplaceOpen ? 'Collapse Replace Row' : 'Expand Replace Row'}
              title={isReplaceOpen ? 'Hide Replace (Ctrl+H)' : 'Show Replace (Ctrl+H)'}
              className={`hidden sm:flex p-1 rounded transition-colors cursor-pointer shrink-0 border ${
                isReplaceOpen 
                  ? 'bg-accent/20 text-accent border-accent/40 font-bold' 
                  : 'bg-surface-elevated text-muted hover:text-text border-border hover:border-accent/40'
              }`}
            >
              <Replace size={13} />
            </button>

            {/* Search Input Container */}
            <div className="relative flex-1 min-w-0 flex items-center">
              <Search size={12} className="absolute left-2.5 text-muted pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Find in file..."
                aria-label="Find in file"
                className={`w-full pl-7 pr-20 py-1.5 sm:py-1 bg-bg border rounded-lg sm:rounded text-xs font-mono text-text placeholder:text-muted/60 focus:outline-none transition-colors ${
                  regexError 
                    ? 'border-error text-error focus:border-error' 
                    : searchTerm && !hasMatches
                    ? 'border-amber-500/60 focus:border-amber-500'
                    : 'border-border focus:border-accent'
                }`}
              />
              {/* Match count / error indicator badge */}
              {matchCounterText && (
                <div className="absolute right-1.5 flex items-center gap-1 pointer-events-none">
                  <span 
                    className={`text-[9.5px] px-1.5 py-0.5 rounded font-mono font-medium ${
                      regexError
                        ? 'bg-error/20 text-error'
                        : totalMatches > 0
                        ? 'bg-accent/15 text-accent'
                        : 'bg-surface-elevated text-muted'
                    }`}
                  >
                    {matchCounterText}
                  </span>
                </div>
              )}
            </div>

            {/* Options Toggles Group (Desktop) */}
            <div className="hidden sm:flex items-center bg-surface-elevated border border-border rounded p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setCaseSensitive((prev: boolean) => !prev)}
                aria-label="Match Case"
                title="Match Case (Alt+C)"
                aria-pressed={caseSensitive}
                className={`p-1 rounded text-[10px] transition-colors cursor-pointer flex items-center justify-center ${
                  caseSensitive 
                    ? 'bg-accent text-accent-text-on font-bold shadow-xs' 
                    : 'text-muted hover:text-text hover:bg-surface'
                }`}
              >
                <CaseSensitive size={13} />
              </button>
              <button
                type="button"
                onClick={() => setMatchWholeWord((prev: boolean) => !prev)}
                aria-label="Match Whole Word"
                title="Match Whole Word (Alt+W)"
                aria-pressed={matchWholeWord}
                className={`p-1 rounded text-[10px] transition-colors cursor-pointer flex items-center justify-center ${
                  matchWholeWord 
                    ? 'bg-accent text-accent-text-on font-bold shadow-xs' 
                    : 'text-muted hover:text-text hover:bg-surface'
                }`}
              >
                <WholeWord size={13} />
              </button>
              <button
                type="button"
                onClick={() => setUseRegex((prev: boolean) => !prev)}
                aria-label="Use Regular Expression"
                title="Use Regular Expression (Alt+R)"
                aria-pressed={useRegex}
                className={`p-1 rounded text-[10px] transition-colors cursor-pointer flex items-center justify-center ${
                  useRegex 
                    ? 'bg-accent text-accent-text-on font-bold shadow-xs' 
                    : 'text-muted hover:text-text hover:bg-surface'
                }`}
              >
                <Regex size={13} />
              </button>
            </div>

            {/* Navigation & Close */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onFindPrevious}
                disabled={!hasMatches}
                aria-label="Previous match"
                title="Previous match (Shift+Enter)"
                className="p-1.5 sm:p-1 rounded bg-surface-elevated hover:bg-surface border border-border hover:border-accent/40 text-muted hover:text-text disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer active:scale-95"
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                onClick={onFindNext}
                disabled={!hasMatches}
                aria-label="Next match"
                title="Next match (Enter)"
                className="p-1.5 sm:p-1 rounded bg-surface-elevated hover:bg-surface border border-border hover:border-accent/40 text-muted hover:text-text disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer active:scale-95"
              >
                <ChevronDown size={14} />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Find & Replace (Esc)"
                title="Close (Esc)"
                className="p-1.5 sm:p-1 text-muted hover:text-text rounded hover:bg-surface-elevated transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Mobile Options Sub-Toolbar (sm:hidden) */}
          <div className="flex sm:hidden items-center justify-between gap-1.5 pt-0.5 border-t border-border/50">
            {/* Options Toggle Pills */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onToggleReplace}
                aria-label={isReplaceOpen ? 'Hide Replace' : 'Show Replace'}
                className={`px-2 py-1 rounded text-[10.5px] font-medium flex items-center gap-1 border transition-colors cursor-pointer ${
                  isReplaceOpen 
                    ? 'bg-accent text-accent-text-on border-accent font-bold shadow-xs' 
                    : 'bg-surface-elevated text-muted border-border'
                }`}
              >
                <Replace size={12} />
                <span>Replace</span>
              </button>

              <div className="flex items-center bg-surface-elevated border border-border rounded p-0.5">
                <button
                  type="button"
                  onClick={() => setCaseSensitive((prev: boolean) => !prev)}
                  aria-label="Match Case"
                  aria-pressed={caseSensitive}
                  className={`px-2 py-1 rounded text-[10px] transition-colors cursor-pointer ${
                    caseSensitive 
                      ? 'bg-accent text-accent-text-on font-bold shadow-xs' 
                      : 'text-muted hover:text-text'
                  }`}
                >
                  <CaseSensitive size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setMatchWholeWord((prev: boolean) => !prev)}
                  aria-label="Match Whole Word"
                  aria-pressed={matchWholeWord}
                  className={`px-2 py-1 rounded text-[10px] transition-colors cursor-pointer ${
                    matchWholeWord 
                      ? 'bg-accent text-accent-text-on font-bold shadow-xs' 
                      : 'text-muted hover:text-text'
                  }`}
                >
                  <WholeWord size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setUseRegex((prev: boolean) => !prev)}
                  aria-label="Use Regular Expression"
                  aria-pressed={useRegex}
                  className={`px-2 py-1 rounded text-[10px] transition-colors cursor-pointer ${
                    useRegex 
                      ? 'bg-accent text-accent-text-on font-bold shadow-xs' 
                      : 'text-muted hover:text-text'
                  }`}
                >
                  <Regex size={13} />
                </button>
              </div>
            </div>

            {hasMatches && (
              <span className="text-[10px] text-muted font-mono">
                {currentMatchIndex}/{totalMatches}
              </span>
            )}
          </div>
        </div>

        {/* Row 2: Replace Input & Action Buttons (when Replace is open) */}
        {isReplaceOpen && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 min-w-0 pt-1 sm:pt-0.5 animate-in slide-in-from-top-1 duration-150 border-t sm:border-t-0 border-border/60">
            {/* Replace Input */}
            <div className="relative flex-1 min-w-0 flex items-center">
              <Replace size={12} className="absolute left-2.5 text-muted pointer-events-none" />
              <input
                ref={replaceInputRef}
                type="text"
                value={replaceTerm}
                onChange={(e) => setReplaceTerm(e.target.value)}
                onKeyDown={handleReplaceKeyDown}
                placeholder="Replace with..."
                aria-label="Replace with"
                className="w-full pl-7 pr-2 py-1.5 sm:py-1 bg-bg border border-border rounded-lg sm:rounded text-xs font-mono text-text placeholder:text-muted/60 focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            {/* Replace Buttons */}
            <div className="flex items-center justify-end gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onReplaceNext}
                disabled={!hasMatches}
                aria-label="Replace current match"
                title="Replace current match (Enter in replace field)"
                className="flex-1 sm:flex-initial px-2.5 py-1.5 sm:py-1 rounded bg-surface-elevated hover:bg-surface border border-border hover:border-accent/40 text-text hover:text-accent disabled:opacity-30 disabled:pointer-events-none text-[11px] sm:text-[10px] font-mono font-medium transition-colors cursor-pointer shadow-xs text-center"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={onReplaceAll}
                disabled={!hasMatches}
                aria-label="Replace all matches"
                title="Replace all matches (Ctrl+Enter in replace field)"
                className="flex-1 sm:flex-initial px-2.5 py-1.5 sm:py-1 rounded bg-accent/15 hover:bg-accent text-accent hover:text-accent-text-on border border-accent/40 disabled:opacity-30 disabled:pointer-events-none text-[11px] sm:text-[10px] font-mono font-bold transition-colors cursor-pointer shadow-xs text-center"
              >
                Replace All
              </button>
            </div>
          </div>
        )}

        {/* Inline Regex Error Display */}
        {regexError && (
          <div className="flex items-center gap-1 text-error text-[10px] bg-error/10 border border-error/20 rounded px-2 py-0.5 mt-0.5">
            <AlertCircle size={11} className="shrink-0" />
            <span className="truncate">{regexError}</span>
          </div>
        )}
      </div>
    </div>
  );
}
