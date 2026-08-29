import { db, type Snapshot, type FileItem } from '../../db';
import { listFiles, generateId, isOpfsSupported, deleteOpfsFile, writeOpfsFile } from './vfs';

export async function createSnapshot(projectId: string, label: string): Promise<Snapshot> {
  const currentFiles = await listFiles(projectId);
  
  const snapshot: Snapshot = {
    id: generateId(),
    projectId,
    label,
    createdAt: Date.now(),
    fileSnapshotJson: JSON.stringify(currentFiles),
  };
  
  await db.snapshots.add(snapshot);
  return snapshot;
}

/**
 * Restores a project's files to a previous snapshot.
 * Note: Confirmation (e.g. user prompt) should be handled by the UI 
 * before calling this function, as it is a destructive action.
 */
export async function restoreSnapshot(snapshotId: string): Promise<void> {
  const snapshot = await db.snapshots.get(snapshotId);
  if (!snapshot) {
    throw new Error(`Snapshot not found: ${snapshotId}`);
  }

  const filesToRestore: FileItem[] = JSON.parse(snapshot.fileSnapshotJson);
  
  // 1. Delete all current files for this project in OPFS
  const currentFiles = await db.files.where('projectId').equals(snapshot.projectId).toArray();
  const currentFileIds = currentFiles.map(f => f.id);
  
  if (isOpfsSupported()) {
    for (const f of currentFiles) {
      await deleteOpfsFile(snapshot.projectId, f.path);
    }
  }

  // 2. Insert files into Dexie
  const dbFilesToRestore = isOpfsSupported()
    ? filesToRestore.map(f => ({ ...f, content: '' }))
    : filesToRestore;

  await db.transaction('rw', db.files, async () => {
    if (currentFileIds.length > 0) {
      await db.files.bulkDelete(currentFileIds);
    }
    if (dbFilesToRestore.length > 0) {
      await db.files.bulkAdd(dbFilesToRestore);
    }
  });

  // 3. Write restored files into OPFS
  if (isOpfsSupported() && filesToRestore.length > 0) {
    await Promise.all(
      filesToRestore.map(async (file) => {
        await writeOpfsFile(snapshot.projectId, file.path, file.content);
      })
    );
  }
}

export async function listSnapshots(projectId: string): Promise<Snapshot[]> {
  const snapshots = await db.snapshots.where('projectId').equals(projectId).toArray();
  return snapshots.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getSnapshot(snapshotId: string): Promise<Snapshot | undefined> {
  return await db.snapshots.get(snapshotId);
}

export async function getLatestSnapshot(projectId: string): Promise<Snapshot | undefined> {
  const snapshots = await listSnapshots(projectId);
  return snapshots[0];
}

export async function deleteSnapshot(snapshotId: string): Promise<void> {
  await db.snapshots.delete(snapshotId);
}

export async function clearSnapshots(projectId: string): Promise<void> {
  const snapshots = await db.snapshots.where('projectId').equals(projectId).toArray();
  const ids = snapshots.map(s => s.id);
  if (ids.length > 0) {
    await db.snapshots.bulkDelete(ids);
  }
}

