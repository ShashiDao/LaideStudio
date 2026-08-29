import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Search, 
  X, 
  ChevronRight, 
  ChevronDown, 
  Filter, 
  ChevronsDown, 
  ChevronsUp,
  AlertCircle,
  Clock,
  ArrowRight
} from 'lucide-react';
import type { FileItem } from '../../db';
import { useAppStore } from '../../store';
import { 
  searchProjectFiles, 
  type SearchMatch 
} from '../../services/search/projectSearch';
import { getFileIcon } from '../shared/FileTree';
import { EmptyState } from '../shared/EmptyState';

export interface ProjectSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileItem[];
  initialQuery?: string;
}

export function ProjectSearchModal({
  isOpen,
  onClose,
  files,
  initialQuery = ''
}: ProjectSearchModalProps) {
  const { setActiveFileId, setActiveTab, setEditorNavigationTarget } = useAppStore();

  const [query, setQuery] = useState(initialQuery);
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [isWholeWord, setIsWholeWord] = useState(false);
  const [isRegex, setIsRegex] = useState(false);

  const [showFilters, setShowFilters] = useState(false);
  const [includePattern, setIncludePattern] = useState('');
  const [excludePattern, setExcludePattern] = useState('');

  // Map of filePath -> collapsed boolean
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});
  
  // Selected flattened match index for keyboard navigation
  const [selectedFlatIndex, setSelectedFlatIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Sync initial query when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (initialQuery) {
          setQuery(initialQuery);
        }
        setSelectedFlatIndex(0);
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 20);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialQuery]);

  // Execute project search
  const searchSummary = useMemo(() => {
    if (!isOpen) {
      return { results: [], totalMatches: 0, totalFiles: 0, durationMs: 0, error: null };
    }
    return searchProjectFiles(files, {
      query,
      isRegex,
      isCaseSensitive,
      isWholeWord,
      includePattern,
      excludePattern
    });
  }, [isOpen, files, query, isRegex, isCaseSensitive, isWholeWord, includePattern, excludePattern]);

  // Flattened list of matches for keyboard navigation
  const flatMatches = useMemo(() => {
    const list: Array<{ file: FileItem; match: SearchMatch }> = [];
    for (const res of searchSummary.results) {
      if (!collapsedFiles[res.filePath]) {
        for (const match of res.matches) {
          list.push({ file: res.file, match });
        }
      }
    }
    return list;
  }, [searchSummary.results, collapsedFiles]);

  const toggleFileCollapse = useCallback((filePath: string) => {
    setCollapsedFiles(prev => ({
      ...prev,
      [filePath]: !prev[filePath]
    }));
  }, []);

  const expandAllFiles = useCallback(() => {
    setCollapsedFiles({});
  }, []);

  const collapseAllFiles = useCallback(() => {
    const next: Record<string, boolean> = {};
    for (const res of searchSummary.results) {
      next[res.filePath] = true;
    }
    setCollapsedFiles(next);
  }, [searchSummary.results]);

  const handleSelectMatch = useCallback((file: FileItem, match: SearchMatch) => {
    setActiveTab('files');
    setActiveFileId(file.id);
    setEditorNavigationTarget({
      line: match.lineNumber,
      column: match.columnNumber,
      length: match.matchLength
    });
    onClose();
  }, [setActiveTab, setActiveFileId, setEditorNavigationTarget, onClose]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    // Toggle options with Alt+ shortcuts
    if (e.altKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      setIsCaseSensitive(prev => !prev);
      return;
    }
    if (e.altKey && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      setIsWholeWord(prev => !prev);
      return;
    }
    if (e.altKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      setIsRegex(prev => !prev);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flatMatches.length > 0) {
        setSelectedFlatIndex(prev => (prev + 1) % flatMatches.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flatMatches.length > 0) {
        setSelectedFlatIndex(prev => (prev - 1 + flatMatches.length) % flatMatches.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const safeIndex = flatMatches.length > 0 ? Math.min(selectedFlatIndex, flatMatches.length - 1) : 0;
      if (flatMatches[safeIndex]) {
        const item = flatMatches[safeIndex];
        handleSelectMatch(item.file, item.match);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-10 sm:pt-14 p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-search-title"
    >
      <div 
        className="bg-surface border border-border rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden font-mono text-xs flex flex-col max-h-[85vh] corner-ticks"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border/80 bg-surface-elevated/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-accent/15 text-accent border border-accent/30 shrink-0 shadow-xs">
              <Search size={16} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="project-search-title" className="text-xs font-bold text-text uppercase tracking-wider truncate">
                  Find in Files
                </h2>
                <span className="hidden sm:inline-block text-[9px] px-1.5 py-0.2 bg-surface text-accent rounded border border-accent/30 shrink-0">
                  Ctrl+Shift+F
                </span>
              </div>
              <p className="text-[10px] text-muted truncate">
                Search across all files
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close project search"
            className="p-1 text-muted hover:text-text rounded-md hover:bg-surface-elevated transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search Input Bar & Modifiers */}
        <div className="p-3 border-b border-border/70 bg-bg/40 space-y-2.5 shrink-0">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-3 text-muted pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search workspace..."
              aria-label="Search workspace"
              className="w-full pl-9 pr-32 py-2 bg-surface border border-border rounded-lg text-xs font-mono text-text placeholder:text-muted/60 focus:outline-none focus:border-accent transition-colors shadow-inner"
            />
            
            {/* Search Modifiers & Clear */}
            <div className="absolute right-2 flex items-center gap-1">
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  className="p-1 text-muted hover:text-text rounded hover:bg-surface-elevated cursor-pointer transition-colors"
                  title="Clear search"
                  aria-label="Clear query"
                >
                  <X size={13} />
                </button>
              )}

              {/* Match Case */}
              <button
                type="button"
                onClick={() => setIsCaseSensitive(prev => !prev)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-all cursor-pointer ${
                  isCaseSensitive 
                    ? 'bg-accent text-accent-text-on border-accent font-bold shadow-xs' 
                    : 'bg-surface border-border text-muted hover:text-text hover:bg-surface-elevated'
                }`}
                title="Match Case (Alt+C)"
                aria-pressed={isCaseSensitive}
              >
                Aa
              </button>

              {/* Match Whole Word */}
              <button
                type="button"
                onClick={() => setIsWholeWord(prev => !prev)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-all cursor-pointer ${
                  isWholeWord 
                    ? 'bg-accent text-accent-text-on border-accent font-bold shadow-xs' 
                    : 'bg-surface border-border text-muted hover:text-text hover:bg-surface-elevated'
                }`}
                title="Match Whole Word (Alt+W)"
                aria-pressed={isWholeWord}
              >
                \b
              </button>

              {/* Use Regular Expression */}
              <button
                type="button"
                onClick={() => setIsRegex(prev => !prev)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-all cursor-pointer ${
                  isRegex 
                    ? 'bg-accent text-accent-text-on border-accent font-bold shadow-xs' 
                    : 'bg-surface border-border text-muted hover:text-text hover:bg-surface-elevated'
                }`}
                title="Use Regular Expression (Alt+R)"
                aria-pressed={isRegex}
              >
                .*
              </button>

              {/* Filter Toggle */}
              <button
                type="button"
                onClick={() => setShowFilters(prev => !prev)}
                className={`p-1 rounded border transition-all cursor-pointer ${
                  showFilters || includePattern || excludePattern
                    ? 'bg-accent/20 border-accent text-accent' 
                    : 'bg-surface border-border text-muted hover:text-text hover:bg-surface-elevated'
                }`}
                title="Toggle file include/exclude filters"
                aria-label="Toggle file filters"
                aria-pressed={showFilters}
              >
                <Filter size={12} />
              </button>
            </div>
          </div>

          {/* Expandable File Filters */}
          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 animate-in fade-in duration-100 font-mono text-[11px]">
              <div>
                <label className="block text-[10px] text-muted mb-1">
                  Files to include (e.g. <span className="text-text font-bold">*.tsx, src/**</span>):
                </label>
                <input
                  type="text"
                  value={includePattern}
                  onChange={(e) => setIncludePattern(e.target.value)}
                  placeholder="e.g. *.ts, *.tsx"
                  aria-label="Files to include filter"
                  className="w-full px-2.5 py-1 bg-surface border border-border rounded text-[11px] font-mono text-text placeholder:text-muted/50 focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-[10px] text-muted mb-1">
                  Files to exclude (e.g. <span className="text-text font-bold">*.min.js, *.lock</span>):
                </label>
                <input
                  type="text"
                  value={excludePattern}
                  onChange={(e) => setExcludePattern(e.target.value)}
                  placeholder="e.g. *.lock, *.map"
                  aria-label="Files to exclude filter"
                  className="w-full px-2.5 py-1 bg-surface border border-border rounded text-[11px] font-mono text-text placeholder:text-muted/50 focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          )}

          {/* Search Statistics & Controls Bar */}
          <div className="flex items-center justify-between text-[10px] font-mono text-muted pt-0.5">
            {searchSummary.error ? (
              <div className="flex items-center gap-1 text-red-400">
                <AlertCircle size={12} />
                <span>{searchSummary.error}</span>
              </div>
            ) : query ? (
              <div className="flex items-center gap-2">
                <span className="text-accent font-bold">
                  {searchSummary.totalMatches} match{searchSummary.totalMatches !== 1 ? 'es' : ''}
                </span>
                <span>in</span>
                <span className="text-text font-medium">
                  {searchSummary.totalFiles} file{searchSummary.totalFiles !== 1 ? 's' : ''}
                </span>
                <span className="text-muted/60">•</span>
                <span className="flex items-center gap-1 text-muted/80">
                  <Clock size={10} /> {searchSummary.durationMs}ms
                </span>
              </div>
            ) : (
              <span className="text-muted">Type a query to search file contents</span>
            )}

            {searchSummary.results.length > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={expandAllFiles}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 bg-surface hover:bg-surface-elevated border border-border text-muted hover:text-text rounded transition-colors cursor-pointer"
                  title="Expand all file matches"
                >
                  <ChevronsDown size={11} />
                  <span>Expand All</span>
                </button>
                <button
                  type="button"
                  onClick={collapseAllFiles}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 bg-surface hover:bg-surface-elevated border border-border text-muted hover:text-text rounded transition-colors cursor-pointer"
                  title="Collapse all file matches"
                >
                  <ChevronsUp size={11} />
                  <span>Collapse All</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Search Results List */}
        <div 
          ref={listContainerRef}
          className="flex-1 overflow-y-auto divide-y divide-border/40 scrollbar-thin p-1"
          tabIndex={0}
        >
          {!query ? (
            <EmptyState
              variant="subtle"
              icon={<Search size={22} />}
              title="Global Project Search"
              description="Search within file contents across your entire project. Use ↑ ↓ to navigate results and Enter to jump straight to the code."
            />
          ) : searchSummary.results.length === 0 ? (
            <EmptyState
              variant="subtle"
              icon={<AlertCircle size={22} />}
              title="No matches found"
              description={<span>No files contained &ldquo;<span className="text-accent font-mono">{query}</span>&rdquo;</span>}
            />
          ) : (
            searchSummary.results.map((res) => {
              const isCollapsed = Boolean(collapsedFiles[res.filePath]);
              return (
                <div key={res.filePath} className="py-1">
                  {/* File Header */}
                  <div 
                    onClick={() => toggleFileCollapse(res.filePath)}
                    className="flex items-center justify-between px-2.5 py-1.5 bg-surface-elevated/50 hover:bg-surface-elevated rounded-md cursor-pointer select-none transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-muted group-hover:text-text transition-colors">
                        {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                      </span>
                      {getFileIcon(res.fileName)}
                      <span className="font-bold text-text truncate text-xs">
                        {res.fileName}
                      </span>
                      <span className="text-muted text-[10px] truncate max-w-[200px]">
                        {res.filePath}
                      </span>
                    </div>

                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-accent/15 text-accent border border-accent/30 font-bold shrink-0">
                      {res.matches.length}
                    </span>
                  </div>

                  {/* Matches under this file */}
                  {!isCollapsed && (
                    <div className="mt-1 space-y-0.5 pl-6 pr-1">
                      {res.matches.map((match, mIdx) => {
                        // Calculate flattened index
                        const currentFlatIdx = flatMatches.findIndex(
                          item => item.file.id === res.file.id && 
                                  item.match.lineNumber === match.lineNumber && 
                                  item.match.columnNumber === match.columnNumber
                        );
                        const isSelected = currentFlatIdx === selectedFlatIndex;

                        const before = match.lineContent.slice(0, match.matchStartInLine);
                        const matchedText = match.matchText;
                        const after = match.lineContent.slice(match.matchStartInLine + match.matchLength);

                        return (
                          <div
                            key={`${res.filePath}-${match.lineNumber}-${match.columnNumber}-${mIdx}`}
                            onClick={() => handleSelectMatch(res.file, match)}
                            onMouseEnter={() => {
                              if (currentFlatIdx >= 0) setSelectedFlatIndex(currentFlatIdx);
                            }}
                            className={`flex items-start gap-2.5 px-2.5 py-1 rounded cursor-pointer select-none font-mono text-[11px] transition-colors border-l-2 ${
                              isSelected
                                ? 'bg-accent/15 border-accent text-text'
                                : 'border-transparent hover:bg-surface-elevated text-muted hover:text-text'
                            }`}
                          >
                            <span className="text-[10px] text-accent/80 font-bold shrink-0 min-w-[32px] pt-0.5">
                              {match.lineNumber}:{match.columnNumber}
                            </span>
                            <div className="truncate flex-1 min-w-0">
                              <span className="text-muted/80">{before}</span>
                              <span className="bg-accent text-accent-text-on font-bold px-1 rounded-[2px] shadow-xs">
                                {matchedText}
                              </span>
                              <span className="text-muted/80">{after}</span>
                            </div>
                            {isSelected && (
                              <ArrowRight size={12} className="text-accent shrink-0 pt-0.5 animate-pulse" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts helper / Mobile summary */}
        <div className="px-4 py-2 border-t border-border/80 bg-surface-elevated/30 flex items-center justify-between text-[10px] font-mono text-muted shrink-0">
          <div className="hidden sm:flex items-center gap-3">
            <span><kbd className="px-1 py-0.5 bg-surface border border-border rounded text-[9px]">↑↓</kbd> Navigate</span>
            <span><kbd className="px-1 py-0.5 bg-surface border border-border rounded text-[9px]">↵</kbd> Open Match</span>
            <span><kbd className="px-1 py-0.5 bg-surface border border-border rounded text-[9px]">Esc</kbd> Close</span>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span><kbd className="px-1 py-0.5 bg-surface border border-border rounded text-[9px]">Alt+C</kbd> Case</span>
            <span><kbd className="px-1 py-0.5 bg-surface border border-border rounded text-[9px]">Alt+W</kbd> Word</span>
            <span><kbd className="px-1 py-0.5 bg-surface border border-border rounded text-[9px]">Alt+R</kbd> Regex</span>
          </div>
          <div className="flex sm:hidden items-center justify-between w-full text-[10px] font-mono text-muted">
            <span className="text-text font-medium">
              {searchSummary.totalMatches} match{searchSummary.totalMatches === 1 ? '' : 'es'} in {searchSummary.totalFiles} file{searchSummary.totalFiles === 1 ? '' : 's'}
            </span>
            <span className="text-accent text-[9px]">Tap to open</span>
          </div>
        </div>
      </div>
    </div>
  );
}
