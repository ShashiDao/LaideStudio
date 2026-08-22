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

export class LaideDatabase extends Dexie {
  projects!: Table<Project, string>;
  files!: Table<FileItem, string>;
  snapshots!: Table<Snapshot, string>;
  connectionProfiles!: Table<ConnectionProfile, string>;

  constructor() {
    super('XiomDatabase');
    this.version(1).stores({
      projects: 'id, name, createdAt, updatedAt',
      files: 'id, projectId, path, updatedAt',
      snapshots: 'id, projectId, createdAt',
      connectionProfiles: 'id, provider, label',
    });
  }
}

export const db = new LaideDatabase();
