import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { db } from '../../db';
import { importZip } from './zipImport';
import { listFiles } from './vfs';

describe('Zip Import Service', () => {
  const projectId = 'zip-import-test';

  beforeEach(async () => {
    await db.files.clear();
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
    
    await importZip(zipData, projectId);
    
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
    
    // Since we used base64 encoding for binary via JSZip, let's verify it decodes correctly
    // We can simulate what JSZip output using native Buffer base64 toString
    const expectedBase64 = Buffer.from(mockBinary).toString('base64');
    expect(iconPng?.content).toBe(expectedBase64);
  });
});
