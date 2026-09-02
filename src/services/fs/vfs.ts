import { db, type FileItem, type Project, type ArchivedProject } from '../../db';

export function generateId(): string {
  return crypto.randomUUID();
}

export const isOpfsSupported = (): boolean => typeof navigator !== 'undefined' && !!navigator.storage && typeof navigator.storage.getDirectory === 'function';

export async function getOpfsFileHandle(projectId: string, path: string, create: boolean = false) {
  const root = await navigator.storage.getDirectory();
  const projDir = await root.getDirectoryHandle(projectId, { create: true });
  
  const parts = path.split('/').filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) throw new Error("Invalid path");
  
  let currentDir = projDir;
  for (const part of parts) {
    currentDir = await currentDir.getDirectoryHandle(part, { create });
  }
  
  return await currentDir.getFileHandle(fileName, { create });
}

export async function writeOpfsFile(projectId: string, path: string, content: string): Promise<boolean> {
  if (!isOpfsSupported()) return false;
  try {
    const handle = await getOpfsFileHandle(projectId, path, true);
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch (e) {
    console.warn(`OPFS write failed for ${path}`, e);
    return false;
  }
}

export async function deleteOpfsFile(projectId: string, path: string): Promise<void> {
  if (!isOpfsSupported()) return;
  try {
    const root = await navigator.storage.getDirectory();
    const projDir = await root.getDirectoryHandle(projectId, { create: false });
    const parts = path.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (fileName) {
      let currentDir = projDir;
      for (const part of parts) {
        currentDir = await currentDir.getDirectoryHandle(part, { create: false });
      }
      await currentDir.removeEntry(fileName);
    }
  } catch {
    // Ignore if not present in OPFS
  }
}

/**
 * Sanitizes a file path coming from an external import (e.g. ZIP archive).
 * Rejects path traversal (`..` or `.`), control characters, and invalid path segments.
 * Returns normalized absolute path starting with `/` or null if rejected.
 */
export function sanitizeImportedPath(rawPath: string): string | null {
  if (!rawPath || /[\r\n\t\0]/.test(rawPath)) return null;
  const segments = rawPath.split('/').filter(Boolean);
  const safe = segments.filter(s => s !== '.' && s !== '..');
  if (safe.length === 0 || safe.length !== segments.length) return null; // reject rather than silently rewrite
  return '/' + safe.join('/');
}

/**
 * Determines whether a file path is a valid workspace path or an accidental artifact
 * (e.g. created by pasting code snippets or invalid shell parameters).
 */
export function isValidFilePath(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  if (path.length > 255) return false;
  // Disallow control characters, newlines, and tabs
  if (/[\r\n\t\0]/.test(path)) return false;
  // Disallow common code tokens / symbols that indicate pasted script artifacts
  if (/[{}();<>=]/.test(path)) return false;
  if (/\b(function|const|let|var|return|console|import|export|typeof|instanceof)\b/.test(path)) return false;
  // Disallow paths starting with number/semicolon/brace artifacts like /0; or / 0
  if (/^\/?\s*[0-9]+(\s|;|})/.test(path)) return false;
  return true;
}

export function isArtifactPath(path: string): boolean {
  return !isValidFilePath(path);
}

/**
 * Deletes any accidental artifact files from Dexie and OPFS.
 */
export async function purgeArtifactFiles(projectId?: string): Promise<number> {
  const allFiles = projectId
    ? await db.files.where('projectId').equals(projectId).toArray()
    : await db.files.toArray();

  const artifactFiles = allFiles.filter(f => isArtifactPath(f.path));
  if (artifactFiles.length > 0) {
    for (const f of artifactFiles) {
      try {
        await deleteOpfsFile(f.projectId, f.path);
      } catch {
        // Ignore if file doesn't exist in OPFS
      }
    }
    await db.files.bulkDelete(artifactFiles.map(f => f.id));
  }
  return artifactFiles.length;
}

export async function checkPathCollision(projectId: string, path: string, excludeFileId?: string): Promise<void> {
  if (!path.startsWith('/')) {
    throw new Error(`Path must start with '/': ${path}`);
  }
  if (!isValidFilePath(path)) {
    throw new Error(`Invalid file path: ${path}`);
  }
  const allFiles = await db.files.where('projectId').equals(projectId).toArray();
  
  for (const f of allFiles) {
    if (f.id === excludeFileId) continue;
    if (f.path === path) {
      throw new Error(`Duplicate path: ${path} already exists`);
    }
    if (f.path.startsWith(path + '/')) {
      throw new Error(`Path collision: ${path} is a folder prefix for existing file ${f.path}`);
    }
    if (path.startsWith(f.path + '/')) {
      throw new Error(`Path collision: existing file ${f.path} is a folder prefix for ${path}`);
    }
  }
}

/**
 * Loads full file content from OPFS (or Dexie fallback) for a project, a given list of files, or all files.
 * If projectId is passed as string, queries and resolves all files for that project.
 * If an array of FileItem is passed, loads content for each file in the array.
 * If omitted or undefined, loads and returns all files across the entire database.
 */
export async function getAllFileContent(projectIdOrFiles?: string | FileItem[]): Promise<FileItem[]> {
  let files: FileItem[];
  if (typeof projectIdOrFiles === 'string') {
    files = await db.files.where('projectId').equals(projectIdOrFiles).toArray();
  } else if (Array.isArray(projectIdOrFiles)) {
    files = projectIdOrFiles;
  } else {
    files = await db.files.toArray();
  }

  // Filter out any invalid artifact files and clean them up
  const validFiles: FileItem[] = [];
  const corruptFileIds: string[] = [];
  for (const f of files) {
    if (isValidFilePath(f.path)) {
      validFiles.push(f);
    } else {
      corruptFileIds.push(f.id);
    }
  }

  if (corruptFileIds.length > 0) {
    db.files.bulkDelete(corruptFileIds).catch(() => {});
  }

  files = validFiles;

  if (isOpfsSupported()) {
    await Promise.all(
      files.map(async (file) => {
        try {
          const handle = await getOpfsFileHandle(file.projectId, file.path, false);
          const opfsFile = await handle.getFile();
          const text = await opfsFile.text();
          // Use OPFS content when available; fallback to Dexie content if empty or read fails
          if (text || !file.content) {
            file.content = text;
          }
        } catch {
          // Fallback to what's in Dexie if OPFS read fails or file is only in Dexie
        }
      })
    );
  }
  return files;
}

export async function listFiles(projectId: string): Promise<FileItem[]> {
  return getAllFileContent(projectId);
}

export async function readFile(id: string): Promise<FileItem> {
  const file = await db.files.get(id);
  if (!file) throw new Error(`File not found: ${id}`);
  
  const [hydrated] = await getAllFileContent([file]);
  return hydrated || file;
}

export async function writeFile(id: string, content: string): Promise<FileItem> {
  const file = await db.files.get(id);
  if (!file) throw new Error(`File not found: ${id}`);
  
  // Store full content in Dexie as durable source of truth
  const updated = { ...file, content, updatedAt: Date.now() };
  await db.files.put(updated);
  
  // Also mirror to OPFS if supported
  await writeOpfsFile(file.projectId, file.path, content);
  
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
  
  await writeOpfsFile(projectId, path, content);
  
  return newFile;
}

export async function bulkCreateOrUpdateFiles(
  projectId: string,
  entries: { path: string; content: string }[]
): Promise<FileItem[]> {
  if (entries.length === 0) return [];

  // Normalize paths: ensure leading '/' and no double slashes
  const normalizedEntries = entries.map(e => ({
    path: (e.path.startsWith('/') ? e.path : `/${e.path}`).replace(/\/+/g, '/'),
    content: e.content
  }));

  // Unique map within incoming batch (latest entry wins)
  const uniqueMap = new Map<string, string>();
  for (const item of normalizedEntries) {
    if (item.path && item.path !== '/') {
      uniqueMap.set(item.path, item.content);
    }
  }

  const existingFiles = await db.files.where('projectId').equals(projectId).toArray();
  const existingMap = new Map(existingFiles.map(f => [f.path, f]));

  const filesToPut: FileItem[] = [];
  const results: FileItem[] = [];

  for (const [path, content] of uniqueMap.entries()) {
    const existing = existingMap.get(path);
    if (existing) {
      const updated: FileItem = {
        ...existing,
        content,
        updatedAt: Date.now()
      };
      filesToPut.push(updated);
      results.push(updated);
    } else {
      const created: FileItem = {
        id: generateId(),
        projectId,
        path,
        content,
        updatedAt: Date.now()
      };
      filesToPut.push(created);
      results.push(created);
    }
  }

  // Single batch database write
  await db.files.bulkPut(filesToPut);

  // Parallel OPFS file writes
  if (isOpfsSupported()) {
    await Promise.all(
      Array.from(uniqueMap.entries()).map(async ([path, content]) => {
        try {
          const handle = await getOpfsFileHandle(projectId, path, true);
          const writable = await handle.createWritable();
          await writable.write(content);
          await writable.close();
        } catch (e) {
          console.warn("OPFS bulk write failed", e);
        }
      })
    );
  }

  return results;
}

export async function deleteFile(id: string): Promise<void> {
  const file = await db.files.get(id);
  if (!file) throw new Error(`File not found: ${id}`);
  
  await deleteOpfsFile(file.projectId, file.path);
  await db.files.delete(id);
}

export async function renameFile(id: string, newPath: string): Promise<FileItem> {
  const file = await db.files.get(id);
  if (!file) throw new Error(`File not found: ${id}`);
  
  const [hydrated] = await getAllFileContent([file]);
  const currentContent = hydrated ? hydrated.content : file.content;

  if (isOpfsSupported()) {
    await deleteOpfsFile(file.projectId, file.path);
    await writeOpfsFile(file.projectId, newPath, currentContent);
  }
  
  const updated = { ...file, path: newPath, updatedAt: Date.now() };
  await db.transaction('rw', db.files, async () => {
    await checkPathCollision(file.projectId, newPath, id);
    await db.files.put(updated);
  });
  
  return { ...updated, content: currentContent };
}

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
  
  if (isOpfsSupported()) {
    for (const f of filesToDelete) {
      await deleteOpfsFile(projectId, f.path);
    }
  }
  
  await db.files.bulkDelete(filesToDelete.map(f => f.id));
}

export async function deleteProject(projectId: string): Promise<void> {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  
  if (isOpfsSupported()) {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(projectId, { recursive: true });
    } catch {
      // Ignore
    }
  }
  
  await db.transaction('rw', db.projects, db.files, db.snapshots, async () => {
    await db.files.where('projectId').equals(projectId).delete();
    await db.snapshots.where('projectId').equals(projectId).delete();
    await db.projects.delete(projectId);
  });
}

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

/**
 * Archives an active project by moving its project record and all its associated files
 * from active storage into the separate `archivedProjects` and `archivedFiles` collections.
 */
export async function archiveProject(projectId: string): Promise<ArchivedProject> {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  // Fetch all files and hydrate content so full content is preserved in archivedFiles
  const files = await getAllFileContent(projectId);

  const archivedItem: ArchivedProject = {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    archivedAt: Date.now(),
    fileCount: files.length,
  };

  const archivedFilesToSave: FileItem[] = files.map(f => ({
    id: f.id,
    projectId: f.projectId,
    path: f.path,
    content: f.content,
    updatedAt: f.updatedAt,
  }));

  await db.transaction('rw', db.projects, db.files, db.archivedProjects, db.archivedFiles, async () => {
    await db.archivedProjects.put(archivedItem);
    if (archivedFilesToSave.length > 0) {
      await db.archivedFiles.bulkPut(archivedFilesToSave);
    }
    await db.files.where('projectId').equals(projectId).delete();
    await db.projects.delete(projectId);
  });

  return archivedItem;
}

/**
 * Restores an archived project back to the active workspace collections.
 */
export async function restoreProject(projectId: string): Promise<Project> {
  const archived = await db.archivedProjects.get(projectId);
  if (!archived) throw new Error(`Archived project not found: ${projectId}`);

  const archivedFiles = await db.archivedFiles.where('projectId').equals(projectId).toArray();

  const restoredProject: Project = {
    id: archived.id,
    name: archived.name,
    createdAt: archived.createdAt,
    updatedAt: Date.now(),
  };

  const filesToRestore: FileItem[] = archivedFiles.map(f => ({
    id: f.id,
    projectId: f.projectId,
    path: f.path,
    content: f.content,
    updatedAt: f.updatedAt,
  }));

  await db.transaction('rw', db.projects, db.files, db.archivedProjects, db.archivedFiles, async () => {
    await db.projects.put(restoredProject);
    if (filesToRestore.length > 0) {
      await db.files.bulkPut(filesToRestore);
    }
    await db.archivedProjects.delete(projectId);
    await db.archivedFiles.where('projectId').equals(projectId).delete();
  });

  // Re-write files to OPFS if supported
  if (isOpfsSupported() && archivedFiles.length > 0) {
    await Promise.all(
      archivedFiles.map(async (file) => {
        try {
          await writeOpfsFile(file.projectId, file.path, file.content);
        } catch {
          // ignore
        }
      })
    );
  }

  return restoredProject;
}

/**
 * Lists all archived projects in the separate storage collection.
 */
export async function listArchivedProjects(): Promise<ArchivedProject[]> {
  try {
    return await db.archivedProjects.orderBy('archivedAt').reverse().toArray();
  } catch {
    return await db.archivedProjects.toArray();
  }
}

/**
 * Permanently deletes an archived project from the archive collection.
 */
export async function deleteArchivedProject(projectId: string): Promise<void> {
  if (isOpfsSupported()) {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(projectId, { recursive: true });
    } catch {
      // Ignore
    }
  }

  await db.transaction('rw', db.archivedProjects, db.archivedFiles, async () => {
    await db.archivedFiles.where('projectId').equals(projectId).delete();
    await db.archivedProjects.delete(projectId);
  });
}

