import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { createTheme } from '@uiw/codemirror-themes';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

import type { FileItem } from '../db';
import { writeFile } from '../services/fs/vfs';
import { useAppStore } from '../store';

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

export function Editor({ file, onContentChanged }: { file: FileItem, onContentChanged: (newContent: string) => void }) {
  const { setActiveFileId, theme } = useAppStore();
  const [content, setContent] = useState(file.content);
  const [isUnsaved, setIsUnsaved] = useState(false);
  const [languageExt, setLanguageExt] = useState<Extension[]>([]);
  const saveTimeoutRef = useRef<any>(null);

  // Sync state if file changes
  useEffect(() => {
    setContent(file.content);
    setIsUnsaved(false);
  }, [file.id, file.content]);

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

  const doSave = async (newContent: string) => {
    if (newContent !== file.content) {
      try {
        await writeFile(file.id, newContent);
        onContentChanged(newContent);
        setIsUnsaved(false);
      } catch (err) {
        console.error('Failed to save file', err);
      }
    }
  };

  const handleChange = (val: string) => {
    setContent(val);
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

  const activeCmTheme = theme === 'paper' ? paperEditorTheme : oledEditorTheme;

  return (
    <div className="absolute inset-0 bg-code-bg canvas-grid-pattern flex flex-col z-10 overflow-hidden">
      <div className="h-[40px] shrink-0 bg-surface flex items-center justify-between px-3 border-b border-border gap-2 min-w-0">
        <div className="font-mono text-xs text-accent truncate min-w-0 flex-1 font-semibold" title={file.path}>
          {file.path}
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {isUnsaved && (
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" title="Unsaved changes" />
          )}
          <button 
            onClick={handleClose}
            aria-label="Close file"
            className="text-muted hover:text-text p-1 rounded cursor-pointer transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-code-bg canvas-grid-pattern [&_.cm-editor]:h-auto [&_.cm-scroller]:font-mono [&_.cm-scroller]:text-[13px] [&_.cm-gutters]:border-r [&_.cm-gutters]:border-border [&_.cm-gutters]:bg-code-bg [&_.cm-lineNumbers]:min-w-[2.5em]">
        <CodeMirror
          value={content}
          extensions={languageExt}
          theme={activeCmTheme}
          onChange={handleChange}
          onBlur={handleBlur}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
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
            searchKeymap: true,
            historyKeymap: true,
            foldKeymap: true,
            completionKeymap: true,
            lintKeymap: true,
          }}
        />
      </div>
    </div>
  );
}
