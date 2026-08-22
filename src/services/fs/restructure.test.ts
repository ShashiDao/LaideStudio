import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db';
import { createFile, listFiles } from './vfs';
import { flattenWrapperFolder } from './restructure';

describe('Restructure Service', () => {
  const projectId = 'restructure-test';

  beforeEach(async () => {
    await db.files.clear();
    await db.snapshots.clear();
  });

  it('should flatten a redundant top-level wrapper folder and create a snapshot', async () => {
    await createFile(projectId, '/my-repo-main/README.md', 'hello');
    await createFile(projectId, '/my-repo-main/src/index.ts', 'console.log();');
    await createFile(projectId, '/my-repo-main/package.json', '{}');
    
    const restructured = await flattenWrapperFolder(projectId);
    expect(restructured).toBe(true);
    
    const files = await listFiles(projectId);
    const paths = files.map(f => f.path);
    expect(paths).toContain('/README.md');
    expect(paths).toContain('/src/index.ts');
    expect(paths).toContain('/package.json');
    expect(paths).not.toContain('/my-repo-main/README.md');
    
    const snapshots = await db.snapshots.where('projectId').equals(projectId).toArray();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].label).toBe('Pre-Restructure');
  });

  it('should not flatten if there are multiple root folders/files', async () => {
    await createFile(projectId, '/folder1/file1.txt', '');
    await createFile(projectId, '/folder2/file2.txt', '');
    
    const restructured = await flattenWrapperFolder(projectId);
    expect(restructured).toBe(false);
    
    const files = await listFiles(projectId);
    const paths = files.map(f => f.path);
    expect(paths).toContain('/folder1/file1.txt');
    expect(paths).toContain('/folder2/file2.txt');
    
    const snapshots = await db.snapshots.where('projectId').equals(projectId).toArray();
    expect(snapshots).toHaveLength(0);
  });

  it('should not flatten if there is a file in the root directory', async () => {
    await createFile(projectId, '/my-repo/src/index.ts', '');
    await createFile(projectId, '/README.md', ''); // Root file
    
    const restructured = await flattenWrapperFolder(projectId);
    expect(restructured).toBe(false);
  });
});
