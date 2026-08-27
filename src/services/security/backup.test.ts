import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { 
  createEncryptedBackup, 
  validateBackupFile, 
  restoreBackup, 
  type EncryptedBackupPayload 
} from './backup';
import { db } from '../../db';

// Mock localStorage for node test environment
const mockStorage: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, val: string) => { mockStorage[key] = val; },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); },
  key: (i: number) => Object.keys(mockStorage)[i] || null,
  length: 0,
} as Storage;

describe('Encrypted Backup & Restore Engine', () => {
  beforeEach(async () => {
    await db.projects.clear();
    await db.files.clear();
    await db.connectionProfiles.clear();
    await db.snapshots.clear();
    localStorage.clear();
  });

  it('should create a valid backup structure from the current database', async () => {
    // Populate dummy project & profile
    const projId = 'proj-123';
    await db.projects.add({
      id: projId,
      name: 'Test App',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await db.files.add({
      id: 'file-1',
      projectId: projId,
      path: 'index.html',
      content: '<h1>Hello World</h1>',
      updatedAt: Date.now(),
    });

    await db.connectionProfiles.add({
      id: 'prof-1',
      label: 'Anthropic Main',
      provider: 'anthropic',
      encryptedApiKey: 'enc.v1.fakeiv.fakecipher',
      baseUrl: '',
      model: 'claude-3-5-sonnet',
    });

    const backup = await createEncryptedBackup();
    expect(backup.version).toBe('xiom-backup-v1');
    expect(backup.projects.length).toBe(1);
    expect(backup.files.length).toBe(1);
    expect(backup.connectionProfiles.length).toBe(1);
    expect(backup.metadata.projectCount).toBe(1);
  });

  it('should validate valid backup JSON and reject malformed JSON', () => {
    const validJson = JSON.stringify({
      version: 'xiom-backup-v1',
      exportedAt: Date.now(),
      metadata: { projectCount: 1, fileCount: 2, profileCount: 1, snapshotCount: 0 },
      projects: [{ id: 'p1', name: 'App' }],
      files: [{ id: 'f1', projectId: 'p1', path: 'main.js', content: 'console.log(1)' }],
      snapshots: [],
      connectionProfiles: [{ id: 'c1', label: 'OpenAI', provider: 'openai', encryptedApiKey: 'enc...' }]
    });

    const valResult = validateBackupFile(validJson);
    expect(valResult.valid).toBe(true);
    expect(valResult.summary?.projectCount).toBe(1);
    expect(valResult.summary?.fileCount).toBe(1);

    // Reject unknown version
    const invalidVersion = JSON.stringify({ version: 'xiom-backup-v99' });
    expect(validateBackupFile(invalidVersion).valid).toBe(false);

    // Reject malformed JSON
    expect(validateBackupFile('not json {').valid).toBe(false);
  });

  it('should restore projects, files, and profiles into Dexie database', async () => {
    const backup: EncryptedBackupPayload = {
      version: 'xiom-backup-v1',
      exportedAt: Date.now(),
      metadata: {
        appName: 'LAIDE Studio',
        projectCount: 1,
        fileCount: 1,
        profileCount: 1,
        snapshotCount: 0,
      },
      lockConfig: null,
      githubPatEncrypted: 'enc.v1.pat.token',
      customInstructions: 'Always write TypeScript',
      activeProfileId: 'prof-restored-1',
      projects: [{
        id: 'proj-restored',
        name: 'Restored Project',
        createdAt: 1000,
        updatedAt: 2000,
      }],
      files: [{
        id: 'file-restored',
        projectId: 'proj-restored',
        path: 'src/App.tsx',
        content: 'export const App = () => <div>Restored</div>;',
        updatedAt: 2000,
      }],
      snapshots: [],
      connectionProfiles: [{
        id: 'prof-restored-1',
        label: 'Restored Gemini',
        provider: 'google',
        encryptedApiKey: 'enc.v1.iv.cipher',
        baseUrl: '',
        model: 'gemini-1.5-pro',
      }],
    };

    const counts = await restoreBackup(backup);
    expect(counts.projectsCount).toBe(1);
    expect(counts.filesCount).toBe(1);
    expect(counts.profilesCount).toBe(1);

    // Verify database state
    const loadedProjects = await db.projects.toArray();
    expect(loadedProjects.length).toBe(1);
    expect(loadedProjects[0].name).toBe('Restored Project');

    const loadedFiles = await db.files.toArray();
    expect(loadedFiles.length).toBe(1);
    expect(loadedFiles[0].path).toBe('src/App.tsx');

    expect(localStorage.getItem('xiom_custom_instructions')).toBe('Always write TypeScript');
    expect(localStorage.getItem('xiom_github_pat')).toBe('enc.v1.pat.token');
  });
});
