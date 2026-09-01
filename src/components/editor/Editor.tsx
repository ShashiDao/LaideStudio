import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, Copy, Check, Search, Sparkles, MoreHorizontal, Undo, Redo, PaintBucket } from 'lucide-react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { createTheme } from '@uiw/codemirror-themes';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { undo, redo } from '@codemirror/commands';
import { 
  search, 
  SearchQuery, 
  setSearchQuery, 
  findNext, 
  findPrevious, 
  replaceNext, 
  replaceAll 
} from '@codemirror/search';

import { db, type FileItem, type ProvenanceEntry } from '../../db';
import { writeFile } from '../../services/fs/vfs';
import { useAppStore } from '../../store';
import { useShellBreakpoint } from '../../hooks/useShellBreakpoint';
import { EditorFindReplace } from './EditorFindReplace';
import { getFileAiBlameCached } from '../../services/provenance/blame';
import { createAiBlameHoverTooltip, createAiBlameCursorListener, createAiTrustGutter, AiBlameSidePanel } from './EditorAiBlame';
import { calculateFileTrustScore, getTrustColorStyles } from '../../services/provenance/trustScore';

export const oledEditorTheme = createTheme({
  theme: 'dark',
  settings: {
    background: '#070709',
    foreground: '#F2F0EA',
    caret: '#E8A33D',
    selection: '#232326',
    selectionMatch: '#232326',
    lineHighlight: '#131316',
    gutterBackground: '#070709',
    gutterForeground: '#8A8A8F',
    gutterBorder: 'transparent',
  },
  styles: [
    { tag: t.comment, color: '#8A8A8F' },
    { tag: t.variableName, color: '#F2F0EA' },
    { tag: [t.string, t.special(t.brace)], color: '#E8A33D' },
    { tag: t.number, color: '#E8A33D' },
    { tag: t.bool, color: '#E8A33D' },
    { tag: t.null, color: '#E8A33D' },
    { tag: t.keyword, color: '#3FAE68' },
    { tag: t.operator, color: '#3FAE68' },
    { tag: t.className, color: '#3FAE68' },
    { tag: t.definition(t.typeName), color: '#3FAE68' },
    { tag: t.typeName, color: '#3FAE68' },
    { tag: t.angleBracket, color: '#3FAE68' },
    { tag: t.tagName, color: '#3FAE68' },
    { tag: t.attributeName, color: '#E8A33D' },
  ],
});

export const paperEditorTheme = createTheme({
  theme: 'light',
  settings: {
    background: '#E2E8EE',
    foreground: '#1F2E3D',
    caret: '#E8A33D',
    selection: '#CBD8E2',
    selectionMatch: '#CBD8E2',
    lineHighlight: '#D7DFE6',
    gutterBackground: '#E2E8EE',
    gutterForeground: '#5C6B78',
    gutterBorder: 'transparent',
  },
  styles: [
    { tag: t.comment, color: '#7C8B99' },
    { tag: t.variableName, color: '#1F2E3D' },
    { tag: [t.string, t.special(t.brace)], color: '#C47D18' },
    { tag: t.number, color: '#C47D18' },
    { tag: t.bool, color: '#C47D18' },
    { tag: t.null, color: '#C47D18' },
    { tag: t.keyword, color: '#2A8550' },
    { tag: t.operator, color: '#2A8550' },
    { tag: t.className, color: '#2A8550' },
    { tag: t.definition(t.typeName), color: '#2A8550' },
    { tag: t.typeName, color: '#2A8550' },
    { tag: t.angleBracket, color: '#2A8550' },
    { tag: t.tagName, color: '#2A8550' },
    { tag: t.attributeName, color: '#C47D18' },
  ],
});

export const editorTheme = oledEditorTheme;

export const langExtensionCache = new Map<string, Extension>();

export async function getLanguageExtensionAsync(path: string): Promise<Extension | null> {
  const p = path.toLowerCase();
  if (p.endsWith('.js') || p.endsWith('.jsx') || p.endsWith('.ts') || p.endsWith('.tsx')) {
    const isTs = p.endsWith('.ts') || p.endsWith('.tsx');
    const cacheKey = `javascript-${isTs}`;
    if (langExtensionCache.has(cacheKey)) {
      return langExtensionCache.get(cacheKey)!;
    }
    const { javascript } = await import('@codemirror/lang-javascript');
    const ext = javascript({ jsx: true, typescript: isTs });
    langExtensionCache.set(cacheKey, ext);
    return ext;
  }
  if (p.endsWith('.html')) {
    if (langExtensionCache.has('html')) return langExtensionCache.get('html')!;
    const { html } = await import('@codemirror/lang-html');
    const ext = html();
    langExtensionCache.set('html', ext);
    return ext;
  }
  if (p.endsWith('.css')) {
    if (langExtensionCache.has('css')) return langExtensionCache.get('css')!;
    const { css } = await import('@codemirror/lang-css');
    const ext = css();
    langExtensionCache.set('css', ext);
    return ext;
  }
  if (p.endsWith('.json')) {
    if (langExtensionCache.has('json')) return langExtensionCache.get('json')!;
    const { json } = await import('@codemirror/lang-json');
    const ext = json();
    langExtensionCache.set('json', ext);
    return ext;
  }
  if (p.endsWith('.md')) {
    if (langExtensionCache.has('markdown')) return langExtensionCache.get('markdown')!;
    const { markdown } = await import('@codemirror/lang-markdown');
    const ext = markdown();
    langExtensionCache.set('markdown', ext);
    return ext;
  }
  return null;
}

const MOBILE_ACCESSORY_KEYS = [
  { label: 'Tab', value: '  ', title: 'Insert 2 spaces (Tab)' },
  { label: '{', value: '{' },
  { label: '}', value: '}' },
  { label: '(', value: '(' },
  { label: ')', value: ')' },
  { label: '[', value: '[' },
  { label: ']', value: ']' },
  { label: '<', value: '<' },
  { label: '>', value: '>' },
  { label: '=>', value: '=>' },
  { label: ';', value: ';' },
  { label: "'", value: "'" },
  { label: '"', value: '"' },
  { label: '=', value: '=' },
];

export function Editor({ 
  file, 
  onContentChanged,
  onOpenBisect,
  onOpenTrustReport
}: { 
  file: FileItem, 
  onContentChanged: (newContent: string) => void,
  onOpenBisect?: (testName?: string) => void,
  onOpenTrustReport?: (filePath?: string) => void
}) {
  const { 
    setActiveFileId, 
    theme, 
    addToast, 
    editorNavigationTarget, 
    setEditorNavigationTarget,
    showLineNumbers = true
  } = useAppStore();
  const breakpoint = useShellBreakpoint();
  const isPhone = breakpoint === 'phone';
  const [content, setContent] = useState(file.content);
  const [isUnsaved, setIsUnsaved] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [languageExt, setLanguageExt] = useState<Extension[]>([]);
  const saveTimeoutRef = useRef<any>(null);
  const savedFlashTimeoutRef = useRef<any>(null);
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  // Find & Replace States
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [focusTarget, setFocusTarget] = useState<'find' | 'replace'>('find');
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [matchWholeWord, setMatchWholeWord] = useState(false);
  const [totalMatches, setTotalMatches] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [regexError, setRegexError] = useState<string | null>(null);

  // AI Blame States
  const [provenanceEntries, setProvenanceEntries] = useState<ProvenanceEntry[]>([]);
  const [isBlameOpen, setIsBlameOpen] = useState(false);
  const [activeLineNumber, setActiveLineNumber] = useState<number | null>(1);
  const [showTrustGutter, setShowTrustGutter] = useState(true);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Close overflow menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(event.target as Node)) {
        setIsOverflowOpen(false);
      }
    }
    if (isOverflowOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOverflowOpen]);

  // Fetch provenance entries for this file
  useEffect(() => {
    let active = true;
    const fetchEntries = async () => {
      try {
        const raw = await db.provenanceEntries.where('projectId').equals(file.projectId).toArray();
        if (active) {
          const fileEntries = raw.filter(e => e.filePath === file.path);
          setProvenanceEntries(fileEntries);
        }
      } catch (err) {
        console.warn('Failed to load provenance entries for file:', err);
      }
    };
    fetchEntries();
    return () => {
      active = false;
    };
  }, [file.projectId, file.path]);

  // Compute line-by-line AI blame with memoized caching for 0 typing lag
  const blameResult = useMemo(() => {
    return getFileAiBlameCached(file.path, provenanceEntries, content);
  }, [file.path, provenanceEntries, content]);

  const fileTrustScore = useMemo(() => {
    return calculateFileTrustScore(file.path, content, provenanceEntries);
  }, [file.path, content, provenanceEntries]);

  const trustColorStyles = getTrustColorStyles(fileTrustScore.score, theme);
  const activeBlameEntry = blameResult.blameMap.get(activeLineNumber ?? 1) || null;

  const handleCopyPath = () => {
    navigator.clipboard.writeText(file.path).then(() => {
      setCopiedPath(true);
      addToast(`Copied path: ${file.path}`, 'success');
      setTimeout(() => setCopiedPath(false), 1500);
    }).catch(() => {
      addToast('Failed to copy path', 'error');
    });
  };

  // Sync state if file changes
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        setContent(file.content);
        setIsUnsaved(false);
        setJustSaved(false);
      }
    });
    return () => {
      active = false;
    };
  }, [file.id, file.content]);

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (savedFlashTimeoutRef.current) clearTimeout(savedFlashTimeoutRef.current);
    };
  }, []);

  // Jump to specific line/column if editorNavigationTarget is provided
  useEffect(() => {
    if (!editorNavigationTarget) return;

    // Small delay to allow CodeMirror DOM and view initialization
    const timer = setTimeout(() => {
      const view = editorRef.current?.view;
      if (!view) return;

      try {
        const doc = view.state.doc;
        const lineNum = Math.min(Math.max(1, editorNavigationTarget.line), doc.lines);
        const line = doc.line(lineNum);
        const startCol = Math.max(0, (editorNavigationTarget.column || 1) - 1);
        const fromPos = Math.min(line.from + startCol, line.to);
        const toPos = editorNavigationTarget.length 
          ? Math.min(fromPos + editorNavigationTarget.length, line.to)
          : fromPos;

        view.dispatch({
          selection: { anchor: fromPos, head: toPos },
          scrollIntoView: true
        });
        view.focus();
        setActiveLineNumber(lineNum);
        setEditorNavigationTarget(null);
      } catch (err) {
        console.warn('Failed to jump to editor navigation target', err);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [editorNavigationTarget, file.id, setEditorNavigationTarget]);

  // Dynamically load language extension for file type
  useEffect(() => {
    let active = true;
    getLanguageExtensionAsync(file.path)
      .then((ext) => {
        if (active) {
          setLanguageExt(ext ? [ext] : []);
        }
      })
      .catch((err) => {
        console.warn('Failed to load language extension for', file.path, err);
      });
    return () => {
      active = false;
    };
  }, [file.path]);

  const doSave = useCallback(async (newContent: string) => {
    if (newContent !== file.content || isUnsaved) {
      try {
        await writeFile(file.id, newContent);
        onContentChanged(newContent);
        setIsUnsaved(false);
        setJustSaved(true);
        if (savedFlashTimeoutRef.current) clearTimeout(savedFlashTimeoutRef.current);
        savedFlashTimeoutRef.current = setTimeout(() => {
          setJustSaved(false);
        }, 2000);
      } catch (err) {
        console.error('Failed to save file', err);
      }
    }
  }, [file.id, file.content, isUnsaved, onContentChanged]);

  const handleChange = (val: string) => {
    setContent(val);
    setJustSaved(false);
    setIsUnsaved(val !== file.content);
    
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      doSave(val);
    }, 1000);
  };

  const handleBlur = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    doSave(content);
  };

  const handleClose = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (isUnsaved) {
      doSave(content);
    }
    setActiveFileId(null);
  };

  // Update CodeMirror search query and calculate matches
  const updateSearchQuery = useCallback(() => {
    const view = editorRef.current?.view;
    if (!searchTerm) {
      setTotalMatches(0);
      setCurrentMatchIndex(0);
      setRegexError(null);
      if (view) {
        view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '' })) });
      }
      return;
    }

    try {
      const query = new SearchQuery({
        search: searchTerm,
        caseSensitive,
        regexp: useRegex,
        wholeWord: matchWholeWord,
        replace: replaceTerm,
      });
      setRegexError(null);

      if (view) {
        view.dispatch({ effects: setSearchQuery.of(query) });
        const doc = view.state.doc;
        const cursor = query.getCursor(doc);
        let count = 0;
        let activeIdx = 0;
        const sel = view.state.selection.main;

        let matchResult = cursor.next();
        while (!matchResult.done) {
          count++;
          const { from, to } = matchResult.value;
          if (sel.from <= to && sel.to >= from) {
            activeIdx = count;
          }
          matchResult = cursor.next();
        }
        setTotalMatches(count);
        setCurrentMatchIndex(count > 0 ? (activeIdx > 0 ? activeIdx : 1) : 0);
      } else {
        // Fallback match count calculation
        let count = 0;
        if (useRegex) {
          const flags = caseSensitive ? 'g' : 'gi';
          const reg = new RegExp(searchTerm, flags);
          const m = content.match(reg);
          count = m ? m.length : 0;
        } else {
          let pos = 0;
          const searchIn = caseSensitive ? content : content.toLowerCase();
          const target = caseSensitive ? searchTerm : searchTerm.toLowerCase();
          while (true) {
            const found = searchIn.indexOf(target, pos);
            if (found === -1) break;
            count++;
            pos = found + Math.max(1, target.length);
          }
        }
        setTotalMatches(count);
        setCurrentMatchIndex(count > 0 ? 1 : 0);
      }
    } catch (err: any) {
      setRegexError(err.message || 'Invalid regular expression');
      setTotalMatches(0);
      setCurrentMatchIndex(0);
    }
  }, [searchTerm, replaceTerm, caseSensitive, useRegex, matchWholeWord, content]);

  useEffect(() => {
    let active = true;
    if (isFindOpen) {
      Promise.resolve().then(() => {
        if (active) {
          updateSearchQuery();
        }
      });
    } else {
      const view = editorRef.current?.view;
      if (view) {
        view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '' })) });
      }
    }
    return () => {
      active = false;
    };
  }, [isFindOpen, updateSearchQuery]);

  const updateActiveMatchIndex = () => {
    const view = editorRef.current?.view;
    if (!view || !searchTerm) return;
    try {
      const query = new SearchQuery({
        search: searchTerm,
        caseSensitive,
        regexp: useRegex,
        wholeWord: matchWholeWord,
        replace: replaceTerm,
      });
      const doc = view.state.doc;
      const cursor = query.getCursor(doc);
      let count = 0;
      let activeIdx = 0;
      const sel = view.state.selection.main;

      let matchResult = cursor.next();
      while (!matchResult.done) {
        count++;
        const { from, to } = matchResult.value;
        if (sel.from <= to && sel.to >= from) {
          activeIdx = count;
        }
        matchResult = cursor.next();
      }
      setTotalMatches(count);
      if (count > 0) {
        setCurrentMatchIndex(activeIdx > 0 ? activeIdx : 1);
      } else {
        setCurrentMatchIndex(0);
      }
    } catch {
      // ignore
    }
  };

  const handleFindNext = () => {
    const view = editorRef.current?.view;
    if (view) {
      findNext(view);
      setTimeout(() => updateActiveMatchIndex(), 10);
    }
  };

  const handleFindPrevious = () => {
    const view = editorRef.current?.view;
    if (view) {
      findPrevious(view);
      setTimeout(() => updateActiveMatchIndex(), 10);
    }
  };

  const handleReplaceNext = () => {
    const view = editorRef.current?.view;
    if (view) {
      replaceNext(view);
      const updated = view.state.doc.toString();
      setContent(updated);
      handleChange(updated);
      setTimeout(() => updateActiveMatchIndex(), 10);
    }
  };

  const handleReplaceAll = () => {
    const view = editorRef.current?.view;
    if (view) {
      const countBefore = totalMatches;
      replaceAll(view);
      const updated = view.state.doc.toString();
      setContent(updated);
      handleChange(updated);
      addToast(`Replaced ${countBefore} match${countBefore !== 1 ? 'es' : ''}`, 'success');
      setTimeout(() => updateSearchQuery(), 20);
    }
  };

  const handleToggleFind = () => {
    setIsFindOpen(prev => {
      const next = !prev;
      if (next) {
        setFocusTarget('find');
      }
      return next;
    });
  };

  const handleCloseFind = () => {
    setIsFindOpen(false);
    editorRef.current?.view?.focus();
  };

  const handleToggleReplace = () => {
    setIsReplaceOpen(prev => !prev);
    if (!isReplaceOpen) {
      setFocusTarget('replace');
    }
  };

  // Keyboard shortcut listener for Mod+S, Mod+F and Mod+H
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        doSave(contentRef.current);
      } else if (isMod && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setIsFindOpen(true);
        setFocusTarget('find');
      } else if (isMod && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        setIsFindOpen(true);
        setIsReplaceOpen(true);
        setFocusTarget('replace');
      } else if (e.key === 'Escape') {
        if (isOverflowOpen) {
          e.preventDefault();
          setIsOverflowOpen(false);
        } else if (isFindOpen) {
          e.preventDefault();
          handleCloseFind();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFindOpen, isOverflowOpen, doSave]);

  // CodeMirror search and keymap extensions
  const searchExt = useMemo(() => [
    search({ top: false }),
    keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
          doSave(contentRef.current);
          return true;
        }
      },
      {
        key: 'Mod-f',
        run: () => {
          setIsFindOpen(true);
          setFocusTarget('find');
          return true;
        }
      },
      {
        key: 'Mod-h',
        run: () => {
          setIsFindOpen(true);
          setIsReplaceOpen(true);
          setFocusTarget('replace');
          return true;
        }
      },
      {
        key: 'Escape',
        run: (view) => {
          if (isFindOpen) {
            setIsFindOpen(false);
            view.focus();
            return true;
          }
          return false;
        }
      }
    ])
  ], [isFindOpen, doSave]);

  const activeCmTheme = theme === 'paper' ? paperEditorTheme : oledEditorTheme;

  // CodeMirror AI blame extensions (hover tooltip, cursor line listener, trust gutter)
  const aiBlameExtensions = useMemo(() => {
    const hoverExt = createAiBlameHoverTooltip(
      (lineNum) => blameResult.blameMap.get(lineNum) || null,
      theme
    );
    const cursorExt = createAiBlameCursorListener(
      (lineNum) => {
        setActiveLineNumber(lineNum);
      },
      (lineNum) => blameResult.blameMap.get(lineNum) || null
    );
    const exts = [hoverExt, cursorExt];
    if (showTrustGutter && blameResult.hasAiHistory) {
      exts.push(createAiTrustGutter((lineNum) => blameResult.blameMap.get(lineNum) || null));
    }
    return exts;
  }, [blameResult, theme, showTrustGutter]);

  const combinedExtensions = useMemo(
    () => [...languageExt, ...searchExt, ...aiBlameExtensions],
    [languageExt, searchExt, aiBlameExtensions]
  );

  const handleInsertSymbol = (symbol: string) => {
    const view = editorRef.current?.view;
    if (!view) return;
    const sel = view.state.selection.main;
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: symbol },
      selection: { anchor: sel.from + symbol.length },
      scrollIntoView: true
    });
    view.focus();
  };

  const handleUndo = () => {
    const view = editorRef.current?.view;
    if (!view) return;
    undo(view);
    view.focus();
  };

  const handleRedo = () => {
    const view = editorRef.current?.view;
    if (!view) return;
    redo(view);
    view.focus();
  };

  return (
    <div className="absolute inset-0 bg-code-bg canvas-grid-pattern flex flex-col z-10 overflow-hidden">
      {/* Editor Header Bar */}
      <div className="h-[40px] shrink-0 bg-surface flex items-center justify-between px-3 border-b border-border gap-2 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="font-mono text-xs text-accent truncate font-semibold" title={file.path}>
            {file.path}
          </div>

          {/* Subtle Saved / Sync Status Indicator */}
          {justSaved ? (
            <div
              role="status"
              aria-live="polite"
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 transition-all duration-300 animate-in fade-in shrink-0 ${isBlameOpen ? 'hidden sm:inline-flex' : ''}`}
              title="Changes saved and synced to local database"
            >
              <Check size={11} className="stroke-[2.5]" />
              <span>Saved</span>
            </div>
          ) : isUnsaved ? (
            <div
              className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono text-muted/70 bg-surface-elevated border border-border/70 shrink-0 transition-all ${isBlameOpen ? 'hidden sm:inline-flex' : ''}`}
              title="Unsaved changes pending database sync"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="hidden xs:inline">Editing</span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Merged Insights & Trust Score Control */}
          <button
            type="button"
            onClick={() => setIsBlameOpen(prev => !prev)}
            aria-label="Insights"
            aria-expanded={isBlameOpen}
            title={`Insights: ${fileTrustScore.score}% (${fileTrustScore.grade}) • Toggle AI Blame & Trust Inspector`}
            className={`flex items-center gap-1 py-0.5 rounded text-[11px] font-mono border transition-all cursor-pointer shadow-xs active:scale-95 ${
              isBlameOpen 
                ? 'px-1.5 sm:px-2 bg-accent text-accent-text-on border-accent font-bold' 
                : 'px-2 border-border bg-surface hover:bg-surface-elevated text-muted hover:text-accent'
            }`}
          >
            <Sparkles size={12} className={`shrink-0 ${isBlameOpen ? 'text-accent-text-on' : 'text-accent'}`} />
            <span className={`font-semibold text-[10.5px] ${isBlameOpen ? 'hidden md:inline' : ''}`}>
              Insights {fileTrustScore.score}%
            </span>
          </button>

          {/* AI Trust Gutter Toggle — colored bar per line: green=verified, amber=untested, red=failing */}
          {blameResult.hasAiHistory && (
            <button
              type="button"
              onClick={() => setShowTrustGutter(prev => !prev)}
              aria-label="Toggle AI trust gutter"
              aria-pressed={showTrustGutter}
              title="Trust gutter: colors each line by AI verification status (green=tested & passing, amber=untested, red=failing)"
              className={`hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                showTrustGutter
                  ? 'bg-accent text-accent-text-on border-accent font-bold shadow-xs'
                  : 'border-border bg-surface hover:bg-surface-elevated text-muted hover:text-accent'
              }`}
            >
              <PaintBucket size={12} className="shrink-0" />
            </button>
          )}

          {/* Find & Replace Toggle Button */}
          <button
            type="button"
            onClick={handleToggleFind}
            aria-label="Find & Replace"
            title="Find & Replace in file (Ctrl+F)"
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
              isFindOpen 
                ? 'bg-accent text-accent-text-on border-accent font-bold shadow-xs' 
                : 'border-border bg-surface hover:bg-surface-elevated text-muted hover:text-accent'
            }`}
          >
            <Search size={13} />
            <span className="hidden sm:inline text-[10px]">Find</span>
          </button>

          {/* Overflow Menu ("⋯") */}
          <div className="relative" ref={overflowRef}>
            <button
              type="button"
              onClick={() => setIsOverflowOpen(prev => !prev)}
              aria-label="More actions"
              aria-haspopup="true"
              aria-expanded={isOverflowOpen}
              title="More actions"
              className={`flex items-center justify-center p-1 rounded text-xs border transition-colors cursor-pointer ${
                isOverflowOpen
                  ? 'bg-accent text-accent-text-on border-accent font-bold shadow-xs'
                  : 'border-border bg-surface hover:bg-surface-elevated text-muted hover:text-accent'
              }`}
            >
              <MoreHorizontal size={14} />
            </button>

            {isOverflowOpen && (
              <div 
                className="absolute right-0 top-full mt-1 z-30 w-44 bg-surface border border-border rounded-lg shadow-xl py-1 font-mono text-xs animate-in fade-in zoom-in-95 duration-100"
                role="menu"
                aria-orientation="vertical"
              >
                <button
                  type="button"
                  onClick={() => {
                    handleCopyPath();
                    setIsOverflowOpen(false);
                  }}
                  className="w-full px-3 py-1.5 flex items-center gap-2 text-left text-text hover:text-accent hover:bg-surface-elevated transition-colors cursor-pointer"
                  role="menuitem"
                >
                  {copiedPath ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
                  <span>{copiedPath ? 'Copied Path!' : 'Copy Path'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Close Button */}
          <button 
            onClick={handleClose}
            aria-label="Close file"
            className="text-muted hover:text-text p-1 rounded cursor-pointer transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Find & Replace Bar */}
      <EditorFindReplace
        isOpen={isFindOpen}
        isReplaceOpen={isReplaceOpen}
        onClose={handleCloseFind}
        onToggleReplace={handleToggleReplace}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        replaceTerm={replaceTerm}
        setReplaceTerm={setReplaceTerm}
        caseSensitive={caseSensitive}
        setCaseSensitive={setCaseSensitive}
        useRegex={useRegex}
        setUseRegex={setUseRegex}
        matchWholeWord={matchWholeWord}
        setMatchWholeWord={setMatchWholeWord}
        totalMatches={totalMatches}
        currentMatchIndex={currentMatchIndex}
        onFindNext={handleFindNext}
        onFindPrevious={handleFindPrevious}
        onReplaceNext={handleReplaceNext}
        onReplaceAll={handleReplaceAll}
        regexError={regexError}
        focusTarget={focusTarget}
      />

      {/* CodeMirror Editor Area & AI Blame SidePanel */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 overflow-auto bg-code-bg canvas-grid-pattern [&_.cm-editor]:h-auto [&_.cm-scroller]:font-mono [&_.cm-scroller]:text-[13px] [&_.cm-gutters]:border-r [&_.cm-gutters]:border-border [&_.cm-gutters]:bg-code-bg [&_.cm-lineNumbers]:min-w-[2.5em]">
          <CodeMirror
            ref={editorRef}
            value={content}
            extensions={combinedExtensions}
            theme={activeCmTheme}
            onChange={handleChange}
            onBlur={handleBlur}
            basicSetup={{
              lineNumbers: showLineNumbers,
              highlightActiveLineGutter: showLineNumbers,
              highlightSpecialChars: true,
              history: true,
              foldGutter: true,
              drawSelection: true,
              dropCursor: true,
              allowMultipleSelections: true,
              indentOnInput: true,
              syntaxHighlighting: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
              rectangularSelection: true,
              crosshairCursor: true,
              highlightActiveLine: true,
              highlightSelectionMatches: true,
              closeBracketsKeymap: true,
              defaultKeymap: true,
              searchKeymap: false,
              historyKeymap: true,
              foldKeymap: true,
              completionKeymap: true,
              lintKeymap: true,
            }}
          />
        </div>
        <AiBlameSidePanel
          isOpen={isBlameOpen}
          onClose={() => setIsBlameOpen(false)}
          activeLineNumber={activeLineNumber}
          activeEntry={activeBlameEntry}
          totalAiLines={blameResult.blameMap.size}
          totalDocLines={blameResult.lines.length}
          theme={theme}
          onOpenBisect={onOpenBisect}
          fileTrustScore={fileTrustScore}
          onOpenTrustReport={() => onOpenTrustReport?.(file.path)}
        />
      </div>

      {/* CodeMirror Mobile Coding Accessory Bar (Sticky on Phone Viewport) */}
      {isPhone && (
        <div 
          className="shrink-0 bg-surface/95 backdrop-blur-md border-t border-border px-2 py-1.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none select-none z-20 touch-manipulation pb-safe"
          role="toolbar"
          aria-label="Mobile Coding Toolbar"
        >
          {/* Undo / Redo Actions */}
          <div className="flex items-center gap-1 shrink-0 pr-1.5 border-r border-border/70">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onTouchStart={(e) => {
                e.preventDefault();
                handleUndo();
              }}
              onClick={handleUndo}
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface-elevated active:bg-accent active:text-accent-text-on text-text border border-border/80 text-xs font-mono font-medium shadow-xs transition-transform active:scale-95 cursor-pointer shrink-0"
            >
              <Undo size={15} />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onTouchStart={(e) => {
                e.preventDefault();
                handleRedo();
              }}
              onClick={handleRedo}
              aria-label="Redo"
              title="Redo (Ctrl+Y)"
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface-elevated active:bg-accent active:text-accent-text-on text-text border border-border/80 text-xs font-mono font-medium shadow-xs transition-transform active:scale-95 cursor-pointer shrink-0"
            >
              <Redo size={15} />
            </button>
          </div>

          {/* Quick Symbol Touch Chips */}
          <div className="flex items-center gap-1 shrink-0">
            {MOBILE_ACCESSORY_KEYS.map((keyItem) => (
              <button
                key={keyItem.label}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => {
                  e.preventDefault();
                  handleInsertSymbol(keyItem.value);
                }}
                onClick={() => handleInsertSymbol(keyItem.value)}
                aria-label={`Insert ${keyItem.label}`}
                title={keyItem.title || `Insert ${keyItem.label}`}
                className={`min-w-9 h-9 px-2.5 flex items-center justify-center rounded-lg bg-surface-elevated active:bg-accent active:text-accent-text-on text-text border border-border/80 font-mono text-xs font-semibold shadow-xs transition-transform active:scale-95 cursor-pointer shrink-0 ${
                  keyItem.label === 'Tab' ? 'text-[11px] font-bold text-accent px-3' : ''
                }`}
              >
                {keyItem.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
