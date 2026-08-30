import { db, type Project, type FileItem, type Snapshot, type ConnectionProfile } from '../../db';
import { getAllFileContent, isOpfsSupported, writeOpfsFile } from '../fs/vfs';
import { getLockConfig, saveLockConfig, type LockConfig } from './lockConfig';

export interface EncryptedBackupPayload {
  version: 'xiom-backup-v1';
  exportedAt: number;
  metadata: {
    appName: string;
    projectCount: number;
    fileCount: number;
    profileCount: number;
    snapshotCount: number;
  };
  lockConfig: LockConfig | null;
  githubPatEncrypted: string | null;
  customInstructions: string | null;
  activeProfileId: string | null;
  projects: Project[];
  files: FileItem[];
  snapshots: Snapshot[];
  connectionProfiles: ConnectionProfile[];
}

export interface BackupValidationResult {
  valid: boolean;
  error?: string;
  backup?: EncryptedBackupPayload;
  summary?: {
    exportedAt: number;
    projectCount: number;
    fileCount: number;
    profileCount: number;
    snapshotCount: number;
    hasLockConfig: boolean;
  };
}

/**
 * Creates an encrypted backup bundle of all projects, files, snapshots, profiles, and configuration.
 */
export async function createEncryptedBackup(): Promise<EncryptedBackupPayload> {
  const [projects, files, snapshots, connectionProfiles] = await Promise.all([
    db.projects.toArray(),
    getAllFileContent(),
    db.snapshots.toArray(),
    db.connectionProfiles.toArray(),
  ]);

  const lockConfig = getLockConfig();
  const githubTokenRec = await db.secureTokens.get('github_pat');
  const githubPatEncrypted = githubTokenRec?.encryptedValue || null;
  const customInstructions = typeof localStorage !== 'undefined' ? localStorage.getItem('laide_custom_instructions') : null;
  const activeProfileId = typeof localStorage !== 'undefined' ? localStorage.getItem('laide_active_profile_id') : null;

  const payload: EncryptedBackupPayload = {
    version: 'xiom-backup-v1',
    exportedAt: Date.now(),
    metadata: {
      appName: 'LAIDE Studio',
      projectCount: projects.length,
      fileCount: files.length,
      profileCount: connectionProfiles.length,
      snapshotCount: snapshots.length,
    },
    lockConfig,
    githubPatEncrypted,
    customInstructions,
    activeProfileId,
    projects,
    files,
    snapshots,
    connectionProfiles,
  };

  return payload;
}

/**
 * Triggers a browser download for the encrypted backup JSON payload.
 */
export function downloadBackupFile(payload: EncryptedBackupPayload): void {
  const dateStr = new Date(payload.exportedAt).toISOString().split('T')[0];
  const filename = `laide-encrypted-backup-${dateStr}.json`;
  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Validates a parsed JSON object or string as a valid LAIDE encrypted backup.
 */
export function validateBackupFile(jsonContent: string): BackupValidationResult {
  try {
    const data = JSON.parse(jsonContent);
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Invalid file: not a JSON object' };
    }

    if (data.version !== 'xiom-backup-v1') {
      return { valid: false, error: `Unsupported backup version: ${data.version || 'unknown'}` };
    }

    if (!Array.isArray(data.projects) || !Array.isArray(data.files) || !Array.isArray(data.connectionProfiles)) {
      return { valid: false, error: 'Malformed backup structure: missing projects, files, or profiles tables' };
    }

    return {
      valid: true,
      backup: data as EncryptedBackupPayload,
      summary: {
        exportedAt: data.exportedAt || Date.now(),
        projectCount: data.projects.length,
        fileCount: data.files.length,
        profileCount: data.connectionProfiles.length,
        snapshotCount: Array.isArray(data.snapshots) ? data.snapshots.length : 0,
        hasLockConfig: Boolean(data.lockConfig),
      },
    };
  } catch (err: unknown) {
    return { valid: false, error: `Invalid JSON format: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Restores data from a validated encrypted backup payload into IndexedDB and settings.
 */
export async function restoreBackup(backup: EncryptedBackupPayload): Promise<{
  projectsCount: number;
  filesCount: number;
  snapshotsCount: number;
  profilesCount: number;
}> {
  await db.transaction('rw', [db.projects, db.files, db.snapshots, db.connectionProfiles], async () => {
    if (backup.projects && backup.projects.length > 0) {
      await db.projects.bulkPut(backup.projects);
    }
    if (backup.files && backup.files.length > 0) {
      const filesToPut = isOpfsSupported()
        ? backup.files.map(f => ({ ...f, content: '' }))
        : backup.files;
      await db.files.bulkPut(filesToPut);
    }
    if (backup.snapshots && backup.snapshots.length > 0) {
      await db.snapshots.bulkPut(backup.snapshots);
    }
    if (backup.connectionProfiles && backup.connectionProfiles.length > 0) {
      await db.connectionProfiles.bulkPut(backup.connectionProfiles);
    }
  });

  if (isOpfsSupported() && backup.files && backup.files.length > 0) {
    await Promise.all(
      backup.files.map(async (file) => {
        await writeOpfsFile(file.projectId, file.path, file.content);
      })
    );
  }

  if (backup.customInstructions && typeof localStorage !== 'undefined') {
    localStorage.setItem('laide_custom_instructions', backup.customInstructions);
  }
  if (backup.activeProfileId && typeof localStorage !== 'undefined') {
    localStorage.setItem('laide_active_profile_id', backup.activeProfileId);
  }
  if (backup.githubPatEncrypted) {
    await db.secureTokens.put({ key: 'github_pat', encryptedValue: backup.githubPatEncrypted });
  }
  if (backup.lockConfig) {
    const existing = getLockConfig();
    if (!existing) {
      saveLockConfig(backup.lockConfig);
    }
  }

  return {
    projectsCount: backup.projects.length,
    filesCount: backup.files.length,
    snapshotsCount: backup.snapshots?.length || 0,
    profilesCount: backup.connectionProfiles.length,
  };
}
