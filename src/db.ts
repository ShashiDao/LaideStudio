import Dexie, { type Table } from 'dexie';

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
}

export class LaideDatabase extends Dexie {
  projects!: Table<Project, string>;
  files!: Table<FileItem, string>;
  snapshots!: Table<Snapshot, string>;
  connectionProfiles!: Table<ConnectionProfile, string>;
  provenanceEntries!: Table<ProvenanceEntry, string>;

  constructor() {
    super('XiomDatabase');
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
  }
}

export const db = new LaideDatabase();
