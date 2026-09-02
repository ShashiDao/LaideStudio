import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { db } from '../../db';
import { importZip, uint8ArrayToBase64, isText } from './zipImport';
import { listFiles, sanitizeImportedPath } from './vfs';

describe('Zip Import Service', () => {
  const projectId = 'zip-import-test';

  beforeEach(async () => {
    await db.files.clear();
    await db.snapshots.clear();
  });

  it('sanitizeImportedPath rejects dot-dot traversal, control chars, and normalizes valid paths', () => {
    expect(sanitizeImportedPath('../escaped.txt')).toBeNull();
    expect(sanitizeImportedPath('src/../../etc/passwd')).toBeNull();
    expect(sanitizeImportedPath('./foo/./bar.ts')).toBeNull();
    expect(sanitizeImportedPath('foo\0bar.ts')).toBeNull();
    expect(sanitizeImportedPath('foo\nbar.ts')).toBeNull();
    expect(sanitizeImportedPath('')).toBeNull();
    expect(sanitizeImportedPath('src/components/App.tsx')).toBe('/src/components/App.tsx');
    expect(sanitizeImportedPath('/package.json')).toBe('/package.json');
  });

  it('rejects path traversal and unsafe paths during zip import', async () => {
    const zip = new JSZip();
    zip.file('safe.txt', 'safe content');
    zip.file('bad\0char.txt', 'null byte');

    // Manually inject zip entry with path traversal name to test real parser rejection
    (zip.files as Record<string, unknown>)['../escaped.txt'] = {
      name: '../escaped.txt',
      dir: false,
      async: async () => new TextEncoder().encode('traversal content')
    };
    (zip.files as Record<string, unknown>)['foo/../../bar.ts'] = {
      name: 'foo/../../bar.ts',
      dir: false,
      async: async () => new TextEncoder().encode('traversal content 2')
    };

    const spy = vi.spyOn(JSZip, 'loadAsync').mockResolvedValueOnce(zip);

    const result = await importZip(new Uint8Array([1, 2, 3]), projectId);

    expect(result.count).toBe(1);
    expect(result.skipped).toContain('../escaped.txt');
    expect(result.skipped).toContain('foo/../../bar.ts');
    expect(result.skipped).toContain('bad\0char.txt');

    const files = await listFiles(projectId);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('/safe.txt');

    spy.mockRestore();
  });

  it('should import a zip file with text and binary files, ignoring directories', async () => {
    const zip = new JSZip();
    
    // 1. Root text file
    zip.file('readme.md', '# Hello World');
    
    // 2. Nested folder with text file
    zip.folder('src')?.folder('utils')?.file('math.ts', 'export const add = (a, b) => a + b;');
    
    // 3. Binary file (e.g., mock PNG starting with PNG magic numbers)
    const mockBinary = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
    zip.file('assets/icon.png', mockBinary);
    
    // Note: The zip now contains 3 file entries and multiple folder entries ('src/', 'src/utils/', 'assets/').
    const zipData = await zip.generateAsync({ type: 'uint8array' });
    
    const result = await importZip(zipData, projectId);
    expect(result.count).toBe(3);
    
    const files = await listFiles(projectId);
    
    // Verify count excludes folders and perfectly matches our 3 inserted file entries
    expect(files).toHaveLength(3);
    
    // Verify files & path normalizations
    const readme = files.find(f => f.path === '/readme.md');
    expect(readme).toBeDefined();
    expect(readme?.content).toBe('# Hello World');
    
    const mathTs = files.find(f => f.path === '/src/utils/math.ts');
    expect(mathTs).toBeDefined();
    expect(mathTs?.content).toBe('export const add = (a, b) => a + b;');
    
    const iconPng = files.find(f => f.path === '/assets/icon.png');
    expect(iconPng).toBeDefined();
    
    const expectedBase64 = Buffer.from(mockBinary).toString('base64');
    expect(iconPng?.content).toBe(expectedBase64);
  });

  it('preserves exact line endings (CRLF and LF) and UTF-8 multi-byte characters', async () => {
    const zip = new JSZip();
    const crlfContent = 'line1\r\nline2\r\nline3\r\n';
    const utf8Content = 'Hello 世界! 🚀 Special chars: äöü, € and \n\t tabs.';
    
    zip.file('windows.txt', crlfContent);
    zip.file('unicode.txt', utf8Content);
    
    const zipData = await zip.generateAsync({ type: 'uint8array' });
    await importZip(zipData, projectId);
    
    const files = await listFiles(projectId);
    const winFile = files.find(f => f.path === '/windows.txt');
    const uFile = files.find(f => f.path === '/unicode.txt');
    
    expect(winFile?.content).toBe(crlfContent);
    expect(uFile?.content).toBe(utf8Content);
  });

  it('handles autoRestructure on archive with top-level wrapper folder (GitHub archive style)', async () => {
    const zip = new JSZip();
    zip.file('my-org-repo-abc1234/package.json', '{"name": "test-repo"}');
    zip.file('my-org-repo-abc1234/src/index.ts', 'export const x = 1;');
    zip.file('my-org-repo-abc1234/README.md', '# Repo Title');
    
    const zipData = await zip.generateAsync({ type: 'uint8array' });
    const { count } = await importZip(zipData, projectId, { autoRestructure: true });
    
    expect(count).toBe(3);
    const files = await listFiles(projectId);
    expect(files).toHaveLength(3);
    
    const paths = files.map(f => f.path).sort();
    expect(paths).toEqual(['/README.md', '/package.json', '/src/index.ts']);
    
    const pkg = files.find(f => f.path === '/package.json');
    expect(pkg?.content).toBe('{"name": "test-repo"}');
  });

  it('accurately imports 150+ files matching exact contents and paths', async () => {
    const zip = new JSZip();
    const totalFiles = 150;
    const expectedMap = new Map<string, string>();

    for (let i = 0; i < totalFiles; i++) {
      const path = `src/components/module_${i}/Component${i}.tsx`;
      const content = `// Component ${i}\nexport function Component${i}() {\n  return <div>Component ${i}</div>;\n}`;
      zip.file(`repo-wrapper-123/${path}`, content);
      expectedMap.set(`/${path}`, content);
    }

    const zipData = await zip.generateAsync({ type: 'uint8array' });
    const { count } = await importZip(zipData, projectId, { autoRestructure: true });

    expect(count).toBe(totalFiles);
    const files = await listFiles(projectId);
    expect(files).toHaveLength(totalFiles);

    for (const file of files) {
      expect(expectedMap.has(file.path)).toBe(true);
      expect(file.content).toBe(expectedMap.get(file.path));
    }
  });

  it('uint8ArrayToBase64 matches native Buffer base64 conversion on binary data', () => {
    const binaryData = new Uint8Array(65536); // 64KB
    for (let i = 0; i < binaryData.length; i++) {
      binaryData[i] = i % 256;
    }
    expect(isText(binaryData)).toBe(false); // contains byte 0
    const b64 = uint8ArrayToBase64(binaryData);
    const expected = Buffer.from(binaryData).toString('base64');
    expect(b64).toBe(expected);
  });
});

