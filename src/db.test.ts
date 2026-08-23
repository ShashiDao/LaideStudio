// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { db, migrateXiomToLaide } from './db';

describe('Database Migration', () => {
  beforeEach(async () => {
    // Ensure both are deleted before each test
    await Dexie.delete('XiomDatabase');
    await Dexie.delete('LaideDatabase');
  });

  it('migrates data from XiomDatabase to LaideDatabase and deletes old database', async () => {
    // 1. Seed fake XiomDatabase
    const oldDb = new Dexie('XiomDatabase');
    oldDb.version(1).stores({
      projects: 'id, name, createdAt, updatedAt',
      files: 'id, projectId, path, updatedAt',
      snapshots: 'id, projectId, createdAt',
      connectionProfiles: 'id, provider, label',
    });
    oldDb.version(2).stores({
      projects: 'id, name, createdAt, updatedAt',
      files: 'id, projectId, path, updatedAt',
      snapshots: 'id, projectId, createdAt',
      connectionProfiles: 'id, provider, label',
      provenanceEntries: 'id, projectId, filePath, timestamp, prevEntryHash, entryHash',
    });

    await oldDb.open();
    await oldDb.table('projects').put({ id: 'p1', name: 'Test Proj', createdAt: 1, updatedAt: 1 });
    await oldDb.table('files').put({ id: 'f1', projectId: 'p1', path: '/test.ts', content: 'test', updatedAt: 1 });
    await oldDb.table('snapshots').put({ id: 's1', projectId: 'p1', createdAt: 1, label: 'init', fileSnapshotJson: '[]' });
    await oldDb.table('connectionProfiles').put({ id: 'c1', provider: 'google', label: 'My Key', encryptedApiKey: 'xxx', baseUrl: '', model: '' });
    await oldDb.table('provenanceEntries').put({ id: 'pe1', projectId: 'p1', filePath: '/test.ts', beforeHash: '', afterHash: '', timestamp: 1, prevEntryHash: '0', entryHash: '1' });
    oldDb.close();

    // Verify it exists
    expect(await Dexie.exists('XiomDatabase')).toBe(true);
    // Note: The global `db` variable was already instantiated in `db.ts` upon import,
    // which implicitly creates the IndexedDB DB record (though it's empty/unopened)
    // so we skip testing that LaideDatabase doesn't exist yet, it's safer.

    // 2. Run migration
    await migrateXiomToLaide();

    // 3. Confirm old DB is deleted
    expect(await Dexie.exists('XiomDatabase')).toBe(false);

    // 4. Confirm new DB has the data
    const projects = await db.projects.toArray();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('Test Proj');

    const files = await db.files.toArray();
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('/test.ts');
    
    const snapshots = await db.snapshots.toArray();
    expect(snapshots).toHaveLength(1);
    
    const profiles = await db.connectionProfiles.toArray();
    expect(profiles).toHaveLength(1);
    
    const provenance = await db.provenanceEntries.toArray();
    expect(provenance).toHaveLength(1);
  });
});
