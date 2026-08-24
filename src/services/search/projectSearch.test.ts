import { describe, it, expect } from 'vitest';
import { 
  searchProjectFiles, 
  matchesGlobFilter, 
  isBinaryFilePath 
} from './projectSearch';
import type { FileItem } from '../../db';

describe('projectSearch service', () => {
  const dummyFiles: FileItem[] = [
    {
      id: 'f1',
      projectId: 'p1',
      path: '/src/App.tsx',
      content: `import React, { useState } from 'react';
export function App() {
  const [count, setCount] = useState(0);
  return <div className="app-container">Count: {count}</div>;
}`,
      updatedAt: 1000
    },
    {
      id: 'f2',
      projectId: 'p1',
      path: '/src/utils/math.ts',
      content: `export function add(a: number, b: number): number {
  return a + b;
}
export function multiply(a: number, b: number): number {
  return a * b;
}`,
      updatedAt: 1000
    },
    {
      id: 'f3',
      projectId: 'p1',
      path: '/src/components/Header.tsx',
      content: `export function Header() {
  return <header><h1>Studio Title</h1></header>;
}`,
      updatedAt: 1000
    },
    {
      id: 'f4',
      projectId: 'p1',
      path: '/package.json',
      content: `{\n  "name": "my-app",\n  "version": "1.0.0"\n}`,
      updatedAt: 1000
    },
    {
      id: 'f5',
      projectId: 'p1',
      path: '/public/logo.png',
      content: 'fakebase64imagepayload',
      updatedAt: 1000
    }
  ];

  describe('isBinaryFilePath', () => {
    it('detects binary file extensions correctly', () => {
      expect(isBinaryFilePath('/public/logo.png')).toBe(true);
      expect(isBinaryFilePath('/assets/bundle.zip')).toBe(true);
      expect(isBinaryFilePath('/src/App.tsx')).toBe(false);
      expect(isBinaryFilePath('/package.json')).toBe(false);
    });
  });

  describe('matchesGlobFilter', () => {
    it('matches simple extension wildcard', () => {
      expect(matchesGlobFilter('/src/App.tsx', '*.tsx')).toBe(true);
      expect(matchesGlobFilter('/src/math.ts', '*.tsx')).toBe(false);
    });

    it('matches path glob with directory prefix', () => {
      expect(matchesGlobFilter('/src/utils/math.ts', 'src/**')).toBe(true);
      expect(matchesGlobFilter('/package.json', 'src/**')).toBe(false);
    });

    it('respects exclude filters', () => {
      expect(matchesGlobFilter('/src/App.tsx', '*.tsx', 'App.*')).toBe(false);
      expect(matchesGlobFilter('/src/Header.tsx', '*.tsx', 'App.*')).toBe(true);
    });
  });

  describe('searchProjectFiles', () => {
    it('returns empty result on blank query', () => {
      const res = searchProjectFiles(dummyFiles, { query: '' });
      expect(res.results).toEqual([]);
      expect(res.totalMatches).toBe(0);
    });

    it('finds literal text across multiple files with exact line and column numbers', () => {
      const res = searchProjectFiles(dummyFiles, { query: 'export function' });
      expect(res.totalFiles).toBe(3); // App.tsx, math.ts, Header.tsx
      expect(res.totalMatches).toBe(4); // math.ts has 2

      const appResult = res.results.find(r => r.filePath === '/src/App.tsx');
      expect(appResult).toBeDefined();
      expect(appResult?.matches[0].lineNumber).toBe(2);
      expect(appResult?.matches[0].columnNumber).toBe(1);
      expect(appResult?.matches[0].matchText).toBe('export function');
    });

    it('handles case-sensitive searches', () => {
      const caseInsensitive = searchProjectFiles(dummyFiles, { query: 'app', isCaseSensitive: false });
      expect(caseInsensitive.totalMatches).toBeGreaterThan(1);

      const caseSensitive = searchProjectFiles(dummyFiles, { query: 'App', isCaseSensitive: true });
      expect(caseSensitive.results.every(r => r.matches.every(m => m.matchText === 'App'))).toBe(true);
    });

    it('handles whole-word searches', () => {
      const res = searchProjectFiles(dummyFiles, { query: 'a', isWholeWord: true });
      // 'a' as parameter identifier, not inside 'React', 'useState', etc.
      expect(res.totalMatches).toBeGreaterThan(0);
      const mathMatches = res.results.find(r => r.filePath === '/src/utils/math.ts');
      expect(mathMatches).toBeDefined();
    });

    it('handles regular expression searches', () => {
      const res = searchProjectFiles(dummyFiles, { 
        query: 'function\\s+([a-zA-Z0-9_]+)', 
        isRegex: true 
      });
      expect(res.totalMatches).toBe(4);
    });

    it('gracefully reports invalid regular expressions without crashing', () => {
      const res = searchProjectFiles(dummyFiles, { 
        query: '[unclosed regex', 
        isRegex: true 
      });
      expect(res.error).toBeDefined();
      expect(res.results).toEqual([]);
      expect(res.totalMatches).toBe(0);
    });

    it('skips binary files automatically', () => {
      const res = searchProjectFiles(dummyFiles, { query: 'payload' });
      expect(res.results.find(r => r.filePath === '/public/logo.png')).toBeUndefined();
    });

    it('filters files using includePattern', () => {
      const res = searchProjectFiles(dummyFiles, { 
        query: 'export function', 
        includePattern: '*.ts' 
      });
      expect(res.totalFiles).toBe(1);
      expect(res.results[0].filePath).toBe('/src/utils/math.ts');
    });
  });
});
