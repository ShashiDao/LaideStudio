import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db';
import { createFile, readFile, writeFile, listFiles } from './vfs';
import { createSnapshot, restoreSnapshot } from './snapshot';

describe('Snapshot Service', () => {
  const projectId = 'snap-proj-test';

  beforeEach(async () => {
    // Clear the tables before each test
    await db.files.clear();
    await db.snapshots.clear();
  });

  it('should create a snapshot, edit a file, and restore to the previous state', async () => {
    // 1. Initial State: Create a file
    const file = await createFile(projectId, '/index.ts', 'console.log("v1");');
    
    // 2. Snapshot
    const snapshot = await createSnapshot(projectId, 'v1-snapshot');
    expect(snapshot.id).toBeDefined();
    expect(snapshot.label).toBe('v1-snapshot');
    
    // 3. Edit file and add a new file
    await writeFile(file.id, 'console.log("v2");');
    const newFile = await createFile(projectId, '/styles.css', 'body { margin: 0; }');
    
    // Verify changes were applied
    let currentFiles = await listFiles(projectId);
    expect(currentFiles).toHaveLength(2);
    
    const modifiedFile = await readFile(file.id);
    expect(modifiedFile.content).toBe('console.log("v2");');

    // 4. Restore snapshot
    await restoreSnapshot(snapshot.id);
    
    // 5. Assert content matches the snapshot
    currentFiles = await listFiles(projectId);
    expect(currentFiles).toHaveLength(1);
    
    const restoredFile = await readFile(file.id);
    expect(restoredFile.content).toBe('console.log("v1");');
    
    // The newly created file should be gone
    await expect(readFile(newFile.id)).rejects.toThrow('File not found');
  });

  it('should throw an error if snapshot is not found', async () => {
    await expect(
      restoreSnapshot('invalid-snapshot-id')
    ).rejects.toThrow('Snapshot not found: invalid-snapshot-id');
  });
});
