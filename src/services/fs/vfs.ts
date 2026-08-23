import { db, type FileItem, type Project } from '../../db';

export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Validates path format and checks for path collisions.
 * 1. Exact match (duplicate path).
 * 2. Path is a folder prefix for other files (e.g. creating '/a/b' when '/a/b/c.txt' exists).
 * 3. An existing file is a folder prefix for the new path (e.g. creating '/a/b/c.txt' when '/a/b' exists).
 */
export async function checkPathCollision(projectId: string, path: string, excludeFileId?: string): Promise<void> {
  if (!path.startsWith('/')) {
    throw new Error(`Path must start with '/': ${path}`);
  }

  const allFiles = await db.files.where('projectId').equals(projectId).toArray();
  
  for (const f of allFiles) {
    if (f.id === excludeFileId) continue;

    if (f.path === path) {
      throw new Error(`Duplicate path: ${path} already exists`);
    }

    // Check if the new path acts as a folder for an existing file
    if (f.path.startsWith(path + '/')) {
      throw new Error(`Path collision: ${path} is a folder prefix for existing file ${f.path}`);
    }

    // Check if an existing file acts as a folder for the new path
    if (path.startsWith(f.path + '/')) {
      throw new Error(`Path collision: existing file ${f.path} is a folder prefix for ${path}`);
    }
  }
}

export async function listFiles(projectId: string): Promise<FileItem[]> {
  return await db.files.where('projectId').equals(projectId).toArray();
}

export async function readFile(id: string): Promise<FileItem> {
  const file = await db.files.get(id);
  if (!file) throw new Error(`File not found: ${id}`);
  return file;
}

export async function writeFile(id: string, content: string): Promise<FileItem> {
  const file = await db.files.get(id);
  if (!file) throw new Error(`File not found: ${id}`);
  
  const updated = { ...file, content, updatedAt: Date.now() };
  await db.files.put(updated);
  return updated;
}

export async function createFile(projectId: string, path: string, content: string): Promise<FileItem> {
  const newFile: FileItem = {
    id: generateId(),
    projectId,
    path,
    content,
    updatedAt: Date.now()
  };
  
  await db.transaction('rw', db.files, async () => {
    await checkPathCollision(projectId, path);
    await db.files.add(newFile);
  });

  return newFile;
}

export async function deleteFile(id: string): Promise<void> {
  const file = await db.files.get(id);
  if (!file) throw new Error(`File not found: ${id}`);
  
  await db.files.delete(id);
}

export async function renameFile(id: string, newPath: string): Promise<FileItem> {
  const file = await db.files.get(id);
  if (!file) throw new Error(`File not found: ${id}`);
  
  const updated = { ...file, path: newPath, updatedAt: Date.now() };

  await db.transaction('rw', db.files, async () => {
    await checkPathCollision(file.projectId, newPath, id);
    await db.files.put(updated);
  });

  return updated;
}

/**
 * Deletes all files under a specific folder path prefix.
 * Throws if the folder prefix is empty.
 */
export async function deleteFolder(projectId: string, folderPath: string): Promise<void> {
  if (!folderPath.startsWith('/') || folderPath === '/') {
    throw new Error(`Invalid folder path: ${folderPath}`);
  }

  const prefix = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
  
  const files = await db.files.where('projectId').equals(projectId).toArray();
  const filesToDelete = files.filter(f => f.path.startsWith(prefix));
  
  if (filesToDelete.length === 0) {
    throw new Error(`Folder not found or empty: ${folderPath}`);
  }
  
  await db.files.bulkDelete(filesToDelete.map(f => f.id));
}

/**
 * Deletes a project and all associated files and snapshots in a single Dexie transaction.
 */
export async function deleteProject(projectId: string): Promise<void> {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  await db.transaction('rw', db.projects, db.files, db.snapshots, async () => {
    await db.files.where('projectId').equals(projectId).delete();
    await db.snapshots.where('projectId').equals(projectId).delete();
    await db.projects.delete(projectId);
  });
}

/**
 * Renames a project and updates its updatedAt timestamp.
 */
export async function renameProject(projectId: string, newName: string): Promise<Project> {
  const trimmed = newName.trim();
  if (!trimmed) {
    throw new Error('Project name cannot be empty');
  }

  const project = await db.projects.get(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const updated: Project = {
    ...project,
    name: trimmed,
    updatedAt: Date.now()
  };

  await db.projects.put(updated);
  return updated;
}
