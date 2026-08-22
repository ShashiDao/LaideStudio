import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db';
import {
  listFiles,
  readFile,
  writeFile,
  createFile,
  deleteFile,
  renameFile,
  deleteFolder,
  deleteProject
} from './vfs';

describe('Virtual File System', () => {
  const projectId = 'test-project';

  beforeEach(async () => {
    // Clear all files before each test
    await db.files.clear();
  });

  it('should create and list files', async () => {
    await createFile(projectId, '/src/main.ts', 'console.log("hello");');
    await createFile(projectId, '/README.md', '# Readme');

    const files = await listFiles(projectId);
    expect(files).toHaveLength(2);
    expect(files.find(f => f.path === '/src/main.ts')).toBeDefined();
    expect(files.find(f => f.path === '/README.md')).toBeDefined();
  });

  it('should read and write file content', async () => {
    const file = await createFile(projectId, '/test.txt', 'initial');
    const read1 = await readFile(file.id);
    expect(read1.content).toBe('initial');

    const updated = await writeFile(file.id, 'updated');
    expect(updated.content).toBe('updated');

    const read2 = await readFile(file.id);
    expect(read2.content).toBe('updated');
  });

  it('should delete a file', async () => {
    const file = await createFile(projectId, '/delete-me.txt', '');
    let files = await listFiles(projectId);
    expect(files).toHaveLength(1);

    await deleteFile(file.id);
    
    files = await listFiles(projectId);
    expect(files).toHaveLength(0);

    await expect(readFile(file.id)).rejects.toThrow('File not found');
  });

  it('should rename a file', async () => {
    const file = await createFile(projectId, '/old-name.txt', 'content');
    
    const renamed = await renameFile(file.id, '/new-name.txt');
    expect(renamed.path).toBe('/new-name.txt');

    const read = await readFile(file.id);
    expect(read.path).toBe('/new-name.txt');
  });

  describe('Edge Cases and Collisions', () => {
    it('should reject creating a file with a duplicate path', async () => {
      await createFile(projectId, '/duplicate.txt', '1');
      await expect(
        createFile(projectId, '/duplicate.txt', '2')
      ).rejects.toThrow('Duplicate path');
    });

    it('should reject renaming a file to an existing path', async () => {
      const file1 = await createFile(projectId, '/file1.txt', '');
      await createFile(projectId, '/file2.txt', '');

      await expect(
        renameFile(file1.id, '/file2.txt')
      ).rejects.toThrow('Duplicate path');
    });

    it('should prevent creating a file if its path is a folder prefix for an existing file', async () => {
      // Setup: /src/main.ts exists
      await createFile(projectId, '/src/main.ts', '');

      // Try to create /src (a file, but it acts as a folder for /src/main.ts)
      await expect(
        createFile(projectId, '/src', 'file content')
      ).rejects.toThrow('is a folder prefix for existing file /src/main.ts');
    });

    it('should prevent creating a file if an existing file is a folder prefix', async () => {
      // Setup: /src exists as a file
      await createFile(projectId, '/src', 'i am a file');

      // Try to create /src/main.ts (invalid because /src is a file, not a folder)
      await expect(
        createFile(projectId, '/src/main.ts', 'content')
      ).rejects.toThrow('existing file /src is a folder prefix for /src/main.ts');
    });

    it('should allow renaming a file to itself (no collision)', async () => {
      const file = await createFile(projectId, '/self.txt', '');
      const renamed = await renameFile(file.id, '/self.txt');
      expect(renamed.path).toBe('/self.txt');
    });
  });

  describe('Deleting non-empty folder path prefix', () => {
    it('should delete all files under a given folder path prefix', async () => {
      await createFile(projectId, '/src/utils/math.ts', '');
      await createFile(projectId, '/src/utils/string.ts', '');
      await createFile(projectId, '/src/main.ts', '');
      await createFile(projectId, '/README.md', '');

      let files = await listFiles(projectId);
      expect(files).toHaveLength(4);

      // Delete the non-empty folder prefix /src/utils
      await deleteFolder(projectId, '/src/utils');

      files = await listFiles(projectId);
      expect(files).toHaveLength(2); // main.ts and README.md should remain
      
      const paths = files.map(f => f.path);
      expect(paths).not.toContain('/src/utils/math.ts');
      expect(paths).not.toContain('/src/utils/string.ts');
      expect(paths).toContain('/src/main.ts');
      expect(paths).toContain('/README.md');
    });

    it('should throw when trying to delete an empty or non-existent folder prefix', async () => {
      await expect(
        deleteFolder(projectId, '/non-existent')
      ).rejects.toThrow('Folder not found or empty');
    });
  });

  describe('deleteProject', () => {
    it('should delete a project, all its files, and all its snapshots in a transaction', async () => {
      const projId1 = 'proj-to-delete';
      const projId2 = 'proj-to-keep';

      await db.projects.bulkAdd([
        { id: projId1, name: 'Delete Me', createdAt: Date.now(), updatedAt: Date.now() },
        { id: projId2, name: 'Keep Me', createdAt: Date.now(), updatedAt: Date.now() }
      ]);

      await createFile(projId1, '/index.ts', 'console.log("del");');
      await createFile(projId1, '/style.css', 'body { color: red; }');
      await createFile(projId2, '/main.ts', 'console.log("keep");');

      await db.snapshots.bulkAdd([
        { id: 'snap-1', projectId: projId1, label: 'Snap 1', createdAt: Date.now(), fileSnapshotJson: '[]' },
        { id: 'snap-2', projectId: projId2, label: 'Snap 2', createdAt: Date.now(), fileSnapshotJson: '[]' }
      ]);

      expect(await db.projects.get(projId1)).toBeDefined();
      expect(await listFiles(projId1)).toHaveLength(2);
      expect(await db.snapshots.where('projectId').equals(projId1).count()).toBe(1);

      await deleteProject(projId1);

      // Verify projId1 is completely purged
      expect(await db.projects.get(projId1)).toBeUndefined();
      expect(await listFiles(projId1)).toHaveLength(0);
      expect(await db.snapshots.where('projectId').equals(projId1).count()).toBe(0);

      // Verify projId2 is completely untouched
      expect(await db.projects.get(projId2)).toBeDefined();
      expect(await listFiles(projId2)).toHaveLength(1);
      expect(await db.snapshots.where('projectId').equals(projId2).count()).toBe(1);
    });

    it('should throw when trying to delete a non-existent project', async () => {
      await expect(
        deleteProject('non-existent-id')
      ).rejects.toThrow('Project not found: non-existent-id');
    });
  });
});
