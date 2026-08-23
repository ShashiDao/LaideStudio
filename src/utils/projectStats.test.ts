import { describe, it, expect } from 'vitest';
import { calculateProjectMetadata, formatBytes } from './projectStats';
import type { FileItem } from '../db';

describe('calculateProjectMetadata utility', () => {
  it('handles empty file list', () => {
    const meta = calculateProjectMetadata([]);
    expect(meta.totalFiles).toBe(0);
    expect(meta.totalLines).toBe(0);
    expect(meta.totalBytes).toBe(0);
    expect(meta.dominantLanguage).toBe('None');
    expect(meta.languages).toEqual([]);
  });

  it('calculates lines of code, bytes, and language breakdown accurately', () => {
    const mockFiles: FileItem[] = [
      {
        id: 'f-1',
        projectId: 'p-1',
        path: '/src/App.tsx',
        content: 'import React from "react";\n\nexport default function App() {\n  return <div>Hello</div>;\n}',
        updatedAt: 1000
      },
      {
        id: 'f-2',
        projectId: 'p-1',
        path: '/src/index.ts',
        content: 'console.log("start");\nconsole.log("end");',
        updatedAt: 1000
      },
      {
        id: 'f-3',
        projectId: 'p-1',
        path: '/src/styles.css',
        content: 'body {\n  margin: 0;\n  padding: 0;\n}',
        updatedAt: 1000
      },
      {
        id: 'f-4',
        projectId: 'p-1',
        path: '/package.json',
        content: '{\n  "name": "test"\n}',
        updatedAt: 1000
      }
    ];

    const meta = calculateProjectMetadata(mockFiles);
    expect(meta.totalFiles).toBe(4);
    // App.tsx has 5 lines, index.ts has 2 lines, styles.css has 4 lines, package.json has 3 lines => 14 lines total
    expect(meta.totalLines).toBe(14);
    expect(meta.totalBytes).toBeGreaterThan(0);
    expect(meta.dominantLanguage).toBe('TypeScript (React)');
    
    // Check languages array
    expect(meta.languages.length).toBe(4);
    const tsxStat = meta.languages.find(l => l.language === 'TypeScript (React)');
    expect(tsxStat?.linesOfCode).toBe(5);
    expect(tsxStat?.filesCount).toBe(1);
    expect(tsxStat?.percentage).toBe(35.7); // 5/14 = ~35.7%
  });
});

describe('formatBytes utility', () => {
  it('formats zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats KB and MB properly', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(2500)).toBe('2.4 KB');
  });
});
