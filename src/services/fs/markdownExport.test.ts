import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db';
import { createFile } from './vfs';
import { 
  getLanguageForPath, 
  getSafeCodeFence, 
  buildAsciiTree, 
  generateProjectMarkdown, 
  exportProjectAsMarkdown 
} from './markdownExport';

describe('Markdown Export Service', () => {
  const projectId = 'md-export-test';

  beforeEach(async () => {
    await db.files.where('projectId').equals(projectId).delete();
    await db.projects.where('id').equals(projectId).delete();

    await db.projects.put({
      id: projectId,
      name: 'Sample App',
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    });
  });

  describe('getLanguageForPath', () => {
    it('returns appropriate markdown language identifiers', () => {
      expect(getLanguageForPath('/src/App.tsx')).toBe('tsx');
      expect(getLanguageForPath('/src/main.ts')).toBe('typescript');
      expect(getLanguageForPath('/src/index.js')).toBe('javascript');
      expect(getLanguageForPath('/index.html')).toBe('html');
      expect(getLanguageForPath('/style.css')).toBe('css');
      expect(getLanguageForPath('/package.json')).toBe('json');
      expect(getLanguageForPath('/README.md')).toBe('markdown');
      expect(getLanguageForPath('/docker/Dockerfile')).toBe('');
      expect(getLanguageForPath('/scripts/build.sh')).toBe('bash');
      expect(getLanguageForPath('/data/schema.sql')).toBe('sql');
      expect(getLanguageForPath('/unknown.xyz')).toBe('');
    });
  });

  describe('getSafeCodeFence', () => {
    it('returns standard 3 backticks when content has no backticks', () => {
      expect(getSafeCodeFence('const x = 1;')).toBe('```');
    });

    it('returns 4 backticks if content contains 3 backticks', () => {
      expect(getSafeCodeFence('Here is a fence:\n```json\n{"a": 1}\n```')).toBe('````');
    });

    it('returns 5 backticks if content contains 4 backticks', () => {
      expect(getSafeCodeFence('Here is: ````markdown\ncode\n````')).toBe('`````');
    });
  });

  describe('buildAsciiTree', () => {
    it('handles empty file array', () => {
      expect(buildAsciiTree([])).toBe('.\n└── (empty project)');
    });

    it('renders clean hierarchy with nested directories and files', () => {
      const paths = [
        '/README.md',
        '/package.json',
        '/src/App.tsx',
        '/src/components/Header.tsx',
        '/src/components/Footer.tsx',
        '/public/icon.svg',
      ];

      const tree = buildAsciiTree(paths);
      expect(tree).toContain('public/');
      expect(tree).toContain('icon.svg');
      expect(tree).toContain('src/');
      expect(tree).toContain('components/');
      expect(tree).toContain('Header.tsx');
      expect(tree).toContain('README.md');
    });
  });

  describe('generateProjectMarkdown & exportProjectAsMarkdown', () => {
    it('generates a complete formatted markdown document with all code blocks and links', async () => {
      await createFile(projectId, '/package.json', '{\n  "name": "sample-app",\n  "version": "1.0.0"\n}');
      await createFile(projectId, '/src/main.ts', 'import { hello } from "./hello";\nconsole.log(hello());');
      await createFile(projectId, '/assets/logo.png', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==');

      const markdown = await generateProjectMarkdown(projectId);

      // Verify Title & Metadata
      expect(markdown).toContain('# Sample App — Project Documentation');
      expect(markdown).toContain('Total Files');
      expect(markdown).toContain('3 (2 text, 1 binary)');
      expect(markdown).toContain('📁 Project Structure');
      expect(markdown).toContain('📑 Table of Contents');
      expect(markdown).toContain('📄 Source Files');

      // Verify code blocks
      expect(markdown).toContain('### `package.json`');
      expect(markdown).toContain('```json\n{\n  "name": "sample-app"');
      expect(markdown).toContain('### `src/main.ts`');
      expect(markdown).toContain('```typescript\nimport { hello } from "./hello";');

      // Verify binary asset note
      expect(markdown).toContain('### `assets/logo.png`');
      expect(markdown).toContain('[Binary Asset: PNG file');

      // Verify exportProjectAsMarkdown
      const exported = await exportProjectAsMarkdown(projectId);
      expect(exported.filename).toBe('sample_app_docs.md');
      expect(exported.blob.type).toContain('text/markdown');
      expect(exported.content).toBe(markdown);
    });
  });
});
