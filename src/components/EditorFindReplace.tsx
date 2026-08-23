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
      className="shrink-0 bg-surface/95 backdrop-blur-md border-b border-border/90 px-2 py-1.5 font-mono text-xs select-none shadow-md z-20 transition-all animate-in slide-in-from-top-1 duration-150"
      role="region"
      aria-label="Find and Replace Bar"
    >
      <div className="flex flex-col gap-1.5 max-w-full">
        {/* Row 1: Find input, match count, options & navigation */}
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Toggle Replace Row Button */}
          <button
            type="button"
            onClick={onToggleReplace}
            aria-label={isReplaceOpen ? 'Collapse Replace Row' : 'Expand Replace Row'}
            title={isReplaceOpen ? 'Hide Replace (Ctrl+H)' : 'Show Replace (Ctrl+H)'}
            className={`p-1 rounded transition-colors cursor-pointer shrink-0 border ${
              isReplaceOpen 
                ? 'bg-accent/20 text-accent border-accent/40 font-bold' 
                : 'bg-surface-elevated text-muted hover:text-text border-border hover:border-accent/40'
            }`}
          >
            <Replace size={13} />
          </button>

          {/* Search Input Container */}
          <div className="relative flex-1 min-w-[120px] flex items-center">
            <Search size={12} className="absolute left-2 text-muted pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Find in file... (Enter for next, Shift+Enter for prev)"
              aria-label="Find in file"
              className={`w-full pl-6 pr-16 py-1 bg-bg border rounded text-[11px] font-mono text-text placeholder:text-muted/60 focus:outline-none transition-colors ${
                regexError 
                  ? 'border-error text-error focus:border-error' 
                  : searchTerm && !hasMatches
                  ? 'border-amber-500/60 focus:border-amber-500'
                  : 'border-border focus:border-accent'
              }`}
            />
            {/* Match count / error indicator badge */}
            {matchCounterText && (
              <div className="absolute right-1.5 flex items-center gap-1">
                <span 
                  className={`text-[9px] px-1 py-0.2 rounded font-mono font-medium ${
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

          {/* Options Toggles Group */}
          <div className="flex items-center bg-surface-elevated border border-border rounded p-0.5 shrink-0">
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

          {/* Previous / Next Navigation Buttons */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={onFindPrevious}
              disabled={!hasMatches}
              aria-label="Previous match"
              title="Previous match (Shift+Enter)"
              className="p-1 rounded bg-surface-elevated hover:bg-surface border border-border hover:border-accent/40 text-muted hover:text-text disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <ChevronUp size={13} />
            </button>
            <button
              type="button"
              onClick={onFindNext}
              disabled={!hasMatches}
              aria-label="Next match"
              title="Next match (Enter)"
              className="p-1 rounded bg-surface-elevated hover:bg-surface border border-border hover:border-accent/40 text-muted hover:text-text disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <ChevronDown size={13} />
            </button>
          </div>

          {/* Close Find & Replace Bar */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Find & Replace (Esc)"
            title="Close (Esc)"
            className="p-1 text-muted hover:text-text rounded hover:bg-surface-elevated transition-colors cursor-pointer shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        {/* Row 2: Replace Input & Action Buttons (when Replace is open) */}
        {isReplaceOpen && (
          <div className="flex items-center gap-1.5 min-w-0 pt-0.5 animate-in slide-in-from-top-1 duration-150">
            {/* Replace Input */}
            <div className="relative flex-1 min-w-[120px] flex items-center">
              <Replace size={12} className="absolute left-2 text-muted pointer-events-none" />
              <input
                ref={replaceInputRef}
                type="text"
                value={replaceTerm}
                onChange={(e) => setReplaceTerm(e.target.value)}
                onKeyDown={handleReplaceKeyDown}
                placeholder="Replace with... (Enter to replace, Ctrl+Enter for all)"
                aria-label="Replace with"
                className="w-full pl-6 pr-2 py-1 bg-bg border border-border rounded text-[11px] font-mono text-text placeholder:text-muted/60 focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            {/* Replace Buttons */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onReplaceNext}
                disabled={!hasMatches}
                aria-label="Replace current match"
                title="Replace current match (Enter in replace field)"
                className="px-2 py-1 rounded bg-surface-elevated hover:bg-surface border border-border hover:border-accent/40 text-text hover:text-accent disabled:opacity-30 disabled:pointer-events-none text-[10px] font-mono font-medium transition-colors cursor-pointer shadow-xs"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={onReplaceAll}
                disabled={!hasMatches}
                aria-label="Replace all matches"
                title="Replace all matches (Ctrl+Enter in replace field)"
                className="px-2 py-1 rounded bg-accent/15 hover:bg-accent text-accent hover:text-accent-text-on border border-accent/40 disabled:opacity-30 disabled:pointer-events-none text-[10px] font-mono font-bold transition-colors cursor-pointer shadow-xs"
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
