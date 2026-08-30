import Dexie, { type Table } from 'dexie';
import { migrateLocalStorage } from './utils/storageMigration';

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface FileItem {
  id: string;
  projectId: string;
  path: string;
  content: string;
  updatedAt: number;
}

export interface Snapshot {
  id: string;
  projectId: string;
  label: string;
  createdAt: number;
  fileSnapshotJson: string;
}

export interface ConnectionProfile {
  id: string;
  provider: string;
  label: string;
  encryptedApiKey: string;
  baseUrl: string;
  model: string;
}

export interface ProvenanceTestResult {
  passed: number;
  failed: number;
  total: number;
  failedTests?: string[];
  output?: string;
  durationMs?: number;
  status: 'passed' | 'failed' | 'no_tests' | 'error';
  error?: string;
}

export interface ProvenanceEntry {
  id: string;
  projectId: string;
  filePath: string;
  beforeHash: string;
  afterHash: string;
  model?: string;
  provider?: string;
  messageId?: string;
  rationale?: string;
  timestamp: number;
  prevEntryHash: string;
  entryHash: string;
  testResult?: ProvenanceTestResult;
  beforeContent?: string;
  afterContent?: string;
}

export interface VaultSession {
  id: string;
  keyHash: string;
  masterKeyBytes: Uint8Array;
  createdAt: number;
  expiresAt: number;
}

export interface ArchivedProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  archivedAt: number;
  fileCount?: number;
}

export interface SecureToken {
  key: string;
  encryptedValue: string;
}

export class LaideDatabase extends Dexie {
  projects!: Table<Project, string>;
  files!: Table<FileItem, string>;
  snapshots!: Table<Snapshot, string>;
  connectionProfiles!: Table<ConnectionProfile, string>;
  provenanceEntries!: Table<ProvenanceEntry, string>;
  vaultSessions!: Table<VaultSession, string>;
  archivedProjects!: Table<ArchivedProject, string>;
  archivedFiles!: Table<FileItem, string>;
  secureTokens!: Table<SecureToken, string>;

  constructor() {
    super('LaideDatabase');
    this.version(1).stores({
      projects: 'id, name, createdAt, updatedAt',
      files: 'id, projectId, path, updatedAt',
      snapshots: 'id, projectId, createdAt',
      connectionProfiles: 'id, provider, label',
    });
    this.version(2).stores({
      projects: 'id, name, createdAt, updatedAt',
      files: 'id, projectId, path, updatedAt',
      snapshots: 'id, projectId, createdAt',
      connectionProfiles: 'id, provider, label',
      provenanceEntries: 'id, projectId, filePath, timestamp, prevEntryHash, entryHash',
    });
    this.version(3).stores({
      projects: 'id, name, createdAt, updatedAt',
      files: 'id, projectId, path, updatedAt',
      snapshots: 'id, projectId, createdAt',
      connectionProfiles: 'id, provider, label',
      provenanceEntries: 'id, projectId, filePath, timestamp, prevEntryHash, entryHash',
      vaultSessions: 'id, keyHash, createdAt, expiresAt',
    });
    this.version(4).stores({
      projects: 'id, name, createdAt, updatedAt',
      files: 'id, projectId, path, updatedAt',
      snapshots: 'id, projectId, createdAt',
      connectionProfiles: 'id, provider, label',
      provenanceEntries: 'id, projectId, filePath, timestamp, prevEntryHash, entryHash',
      vaultSessions: 'id, keyHash, createdAt, expiresAt',
      archivedProjects: 'id, name, createdAt, updatedAt, archivedAt',
      archivedFiles: 'id, projectId, path, updatedAt',
    });
    this.version(5).stores({
      projects: 'id, name, createdAt, updatedAt',
      files: 'id, projectId, path, updatedAt',
      snapshots: 'id, projectId, createdAt',
      connectionProfiles: 'id, provider, label',
      provenanceEntries: 'id, projectId, filePath, timestamp, prevEntryHash, entryHash',
      vaultSessions: 'id, keyHash, createdAt, expiresAt',
      archivedProjects: 'id, name, createdAt, updatedAt, archivedAt',
      archivedFiles: 'id, projectId, path, updatedAt',
      secureTokens: 'key',
    });
  }
}

export const db = new LaideDatabase();

export async function migrateXiomToLaide(): Promise<void> {
  migrateLocalStorage();

  // Migrate tokens to IndexedDB
  const tokensToMigrate = [
    { lsKey: 'laide_github_pat', dbKey: 'github_pat' },
    { lsKey: 'laide_netlify_token', dbKey: 'netlify_token' },
    { lsKey: 'laide_vercel_token', dbKey: 'vercel_token' }
  ];
  for (const token of tokensToMigrate) {
    const val = localStorage.getItem(token.lsKey);
    if (val) {
      await db.secureTokens.put({ key: token.dbKey, encryptedValue: val });
      localStorage.removeItem(token.lsKey);
    }
  }

  const exists = await Dexie.exists('XiomDatabase');
  if (!exists) return;

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

  try {
    await oldDb.open();
    const projects = await oldDb.table('projects').toArray();
    const files = await oldDb.table('files').toArray();
    const snapshots = await oldDb.table('snapshots').toArray();
    const connectionProfiles = await oldDb.table('connectionProfiles').toArray();
    const provenanceEntries = await oldDb.table('provenanceEntries').toArray();

    await db.transaction('rw', db.projects, db.files, db.snapshots, db.connectionProfiles, db.provenanceEntries, async () => {
      if (projects.length > 0) await db.projects.bulkPut(projects);
      if (files.length > 0) await db.files.bulkPut(files);
      if (snapshots.length > 0) await db.snapshots.bulkPut(snapshots);
      if (connectionProfiles.length > 0) await db.connectionProfiles.bulkPut(connectionProfiles);
      if (provenanceEntries.length > 0) await db.provenanceEntries.bulkPut(provenanceEntries);
    });

    oldDb.close();
    await Dexie.delete('XiomDatabase');
  } catch (err) {
    console.error('Failed to migrate XiomDatabase to LaideDatabase:', err);
    oldDb.close();
  }
}

