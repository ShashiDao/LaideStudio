import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { db } from '../../db';
import { exportZip } from './zipExport';
import { importZip } from './zipImport';
import { createFile, listFiles } from './vfs';

describe('Zip Export Service', () => {
  const projectId = 'export-test';

  beforeEach(async () => {
    await db.files.clear();
  });

  it('should export all files preserving paths', async () => {
    await createFile(projectId, '/README.md', '# Test');
    await createFile(projectId, '/src/main.ts', 'console.log();');
    await createFile(projectId, '/assets/logo.png', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg=='); // Valid base64

    const blob = await exportZip(projectId);
    expect(blob).toBeInstanceOf(Blob);

    const arrayBuffer = await blob.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    // JSZip also creates folder entries for 'src/' and 'assets/' implicitly when files are added
    const paths = Object.keys(zip.files);
    expect(paths).toContain('README.md');
    expect(paths).toContain('src/main.ts');
    expect(paths).toContain('assets/logo.png');
    
    const readmeContent = await zip.file('README.md')?.async('string');
    expect(readmeContent).toBe('# Test');

    const pngBase64 = await zip.file('assets/logo.png')?.async('base64');
    expect(pngBase64).toBe('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==');
  });

  it('should roundtrip seamlessly when exporting a project and importing into a new project', async () => {
    await createFile(projectId, '/package.json', '{"name": "roundtrip"}');
    await createFile(projectId, '/src/index.ts', 'export const v = 42;');
    await createFile(projectId, '/public/favicon.ico', 'AAABAAEAEBAAAAAAAABoBQAAFgAAACgAAAAQAAAA');

    const exportedBlob = await exportZip(projectId);
    const targetProjId = 'imported-roundtrip-target';

    const { count } = await importZip(exportedBlob, targetProjId);
    expect(count).toBe(3);

    const importedFiles = await listFiles(targetProjId);
    expect(importedFiles).toHaveLength(3);

    const pkg = importedFiles.find(f => f.path === '/package.json');
    expect(pkg?.content).toBe('{"name": "roundtrip"}');

    const src = importedFiles.find(f => f.path === '/src/index.ts');
    expect(src?.content).toBe('export const v = 42;');

    const ico = importedFiles.find(f => f.path === '/public/favicon.ico');
    expect(ico?.content).toBe('AAABAAEAEBAAAAAAAABoBQAAFgAAACgAAAAQAAAA');
  });

  it('should exclude package-lock.json and AI_CHANGELOG.md from zip export', async () => {
    await createFile(projectId, '/package.json', '{"name": "test"}');
    await createFile(projectId, '/package-lock.json', '{"name": "test", "lockfileVersion": 3}');
    await createFile(projectId, '/AI_CHANGELOG.md', '# AI Changelog\n- History item');
    await createFile(projectId, '/src/App.tsx', 'export function App() { return null; }');

    const blob = await exportZip(projectId);
    const arrayBuffer = await blob.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const paths = Object.keys(zip.files);
    expect(paths).toContain('package.json');
    expect(paths).toContain('src/App.tsx');
    expect(paths).not.toContain('package-lock.json');
    expect(paths).not.toContain('AI_CHANGELOG.md');
    expect(paths).not.toContain('ai_changelog.md');
  });
});

