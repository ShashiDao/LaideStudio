import { db, type FileItem, type Project, type ArchivedProject } from '../../db';

export function generateId(): string {
  return crypto.randomUUID();
}

export const isOpfsSupported = (): boolean =>
  typeof navigator !== 'undefined' &&
  !!navigator.storage &&
  typeof navigator.storage.getDirectory === 'function';

export async function getOpfsFileHandle(projectId: string, path: string, create = false) {
  const root = await navigator.storage.getDirectory();
  const projDir = await root.getDirectoryHandle(projectId, { create: true });
  const parts = path.split('/').filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) throw new Error('Invalid path');

  let currentDir = projDir;
  for (const part of parts) {
    currentDir = await currentDir.getDirectoryHandle(part, { create });
  }
  return currentDir.getFileHandle(fileName, { create });
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
    if (!fileName) return;
    let currentDir = projDir;
    for (const part of parts) {
      currentDir = await currentDir.getDirectoryHandle(part, { create: false });
    }
    await currentDir.removeEntry(fileName);
  } catch {
    // Missing OPFS entries are already in the desired state.
  }
}

export function sanitizeImportedPath(rawPath: string): string | null {
  if (!rawPath || /[\r\n\t\0]/.test(rawPath)) return null;
  const segments = rawPath.split('/').filter(Boolean);
  const safe = segments.filter((s) => s !== '.' && s !== '..');
  if (safe.length === 0 || safe.length !== segments.length) return null;
  return '/' + safe.join('/');
}

export function isValidFilePath(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  if (path.length > 255) return false;
  if (/[\r\n\t\0]/.test(path)) return false;
  if (/[{}();<>=]/.test(path)) return false;
  if (/\b(function|const|let|var|return|console|import|export|typeof|instanceof)\b/.test(path)) return false;
  if (/^\/?\s*[0-9]+(\s|;|})/.test(path)) return false;
  return true;
}

export function isArtifactPath(path: string): boolean {
  return !isValidFilePath(path);
}

export async function purgeArtifactFiles(projectId?: string): Promise<number> {
  const allFiles = projectId
    ? await db.files.where('projectId').equals(projectId).toArray()
    : await db.files.toArray();
  const artifactFiles = allFiles.filter((f) => isArtifactPath(f.path));
  for (const file of artifactFiles) await deleteOpfsFile(file.projectId, file.path);
  if (artifactFiles.length) await db.files.bulkDelete(artifactFiles.map((f) => f.id));
  return artifactFiles.length;
}

export async function checkPathCollision(projectId: string, path: string, excludeFileId?: string): Promise<void> {
  if (!path.startsWith('/')) throw new Error(`Path must start with '/': ${path}`);
  if (!isValidFilePath(path)) throw new Error(`Invalid file path: ${path}`);
  const files = await db.files.where('projectId').equals(projectId).toArray();
  for (const file of files) {
    if (file.id === excludeFileId) continue;
    if (file.path === path) throw new Error(`Duplicate path: ${path} already exists`);
    if (file.path.startsWith(path + '/')) {
      throw new Error(`Path collision: ${path} is a folder prefix for existing file ${file.path}`);
    }
    if (path.startsWith(file.path + '/')) {
      throw new Error(`Path collision: existing file ${file.path} is a folder prefix for ${path}`);
    }
  }
}

export async function getAllFileContent(projectIdOrFiles?: string | FileItem[]): Promise<FileItem[]> {
  let files = typeof projectIdOrFiles === 'string'
    ? await db.files.where('projectId').equals(projectIdOrFiles).toArray()
    : Array.isArray(projectIdOrFiles)
      ? projectIdOrFiles
      : await db.files.toArray();

  const validFiles = files.filter((file) => isValidFilePath(file.path));
  const corruptIds = files.filter((file) => !isValidFilePath(file.path)).map((file) => file.id);
  if (corruptIds.length) db.files.bulkDelete(corruptIds).catch(() => {});
  files = validFiles;

  if (isOpfsSupported()) {
    await Promise.all(files.map(async (file) => {
      try {
        const handle = await getOpfsFileHandle(file.projectId, file.path, false);
        const text = await (await handle.getFile()).text();
        if (text || !file.content) file.content = text;
      } catch {
        // Dexie remains the durable fallback.
      }
    }));
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
  const updated = { ...file, content, updatedAt: Date.now() };
  await db.files.put(updated);
  await writeOpfsFile(file.projectId, file.path, content);
  return updated;
}

export async function createFile(projectId: string, path: string, content: string): Promise<FileItem> {
  const newFile: FileItem = { id: generateId(), projectId, path, content, updatedAt: Date.now() };
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

  const normalizedEntries = entries.map((entry) => ({
    path: (entry.path.startsWith('/') ? entry.path : `/${entry.path}`).replace(/\\+/g, '/'),
    content: entry.content,
  }));
  const uniqueMap = new Map<string, string>();
  for (const entry of normalizedEntries) {
    if (entry.path && entry.path !== '/') uniqueMap.set(entry.path, entry.content);
  }

  const existingFiles = await db.files.where('projectId').equals(projectId).toArray();
  const existingMap = new Map(existingFiles.map((file) => [file.path, file]));
  const existingPrefixOwners = new Map<string, string>();

  // Index all directory prefixes once. This lets an incoming path detect an
  // existing descendant without rescanning the whole project for every entry.
  for (const file of existingFiles) {
    const segments = file.path.split('/').filter(Boolean);
    for (let i = 1; i < segments.length; i++) {
      const prefix = '/' + segments.slice(0, i).join('/');
      if (!existingPrefixOwners.has(prefix)) existingPrefixOwners.set(prefix, file.path);
    }
  }

  // Validate every incoming path against the single existing-file snapshot.
  for (const [path] of uniqueMap) {
    if (!path.startsWith('/')) throw new Error(`Path must start with '/': ${path}`);
    if (!isValidFilePath(path)) throw new Error(`Invalid file path: ${path}`);

    const segments = path.split('/').filter(Boolean);
    for (let i = 1; i < segments.length; i++) {
      const prefix = '/' + segments.slice(0, i).join('/');
      const ancestor = existingMap.get(prefix);
      if (ancestor) {
        throw new Error(`Path collision: existing file ${ancestor.path} is a folder prefix for ${path}`);
      }
    }

    const descendant = existingPrefixOwners.get(path);
    if (descendant && !existingMap.has(path)) {
      throw new Error(`Path collision: ${path} is a folder prefix for existing file ${descendant}`);
    }
  }

  // Validate collisions between entries in the same batch in O(n * path-depth)
  // rather than comparing every pair of entries.
  const incomingPaths = new Set<string>();
  const incomingPrefixOwners = new Map<string, string>();
  for (const [path] of uniqueMap) {
    const segments = path.split('/').filter(Boolean);

    for (let i = 1; i < segments.length; i++) {
      const prefix = '/' + segments.slice(0, i).join('/');
      if (incomingPaths.has(prefix)) {
        throw new Error(`Path collision within bulk operation: ${prefix} and ${path}`);
      }
    }

    const descendant = incomingPrefixOwners.get(path);
    if (descendant) {
      throw new Error(`Path collision within bulk operation: ${path} and ${descendant}`);
    }

    incomingPaths.add(path);
    for (let i = 1; i < segments.length; i++) {
      const prefix = '/' + segments.slice(0, i).join('/');
      if (!incomingPrefixOwners.has(prefix)) incomingPrefixOwners.set(prefix, path);
    }
  }

  const filesToPut: FileItem[] = [];
  const results: FileItem[] = [];
  for (const [path, content] of uniqueMap) {
    const existing = existingMap.get(path);
    const file: FileItem = existing
      ? { ...existing, content, updatedAt: Date.now() }
      : { id: generateId(), projectId, path, content, updatedAt: Date.now() };
    filesToPut.push(file);
    results.push(file);
  }

  await db.files.bulkPut(filesToPut);
  if (isOpfsSupported()) {
    await Promise.all([...uniqueMap].map(async ([path, content]) => {
      try {
        const handle = await getOpfsFileHandle(projectId, path, true);
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
      } catch (e) {
        console.warn('OPFS bulk write failed', e);
      }
    }));
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

  // Validate the destination before touching OPFS. A failed collision check must
  // leave both Dexie and OPFS representing the original file.
  await checkPathCollision(file.projectId, newPath, id);

  const updated = { ...file, path: newPath, updatedAt: Date.now() };
  await db.files.put(updated);

  if (isOpfsSupported()) {
    await deleteOpfsFile(file.projectId, file.path);
    const written = await writeOpfsFile(file.projectId, newPath, currentContent);
    if (!written) {
      console.warn(`OPFS rename mirror failed for ${file.path} -> ${newPath}; Dexie remains durable source of truth`);
    }
  }

  return { ...updated, content: currentContent };
}

export async function deleteFolder(projectId: string, folderPath: string): Promise<void> {
  if (!folderPath.startsWith('/') || folderPath === '/') throw new Error(`Invalid folder path: ${folderPath}`);
  const prefix = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
  const files = await db.files.where('projectId').equals(projectId).toArray();
  const filesToDelete = files.filter((file) => file.path.startsWith(prefix));
  if (!filesToDelete.length) throw new Error(`Folder not found or empty: ${folderPath}`);
  for (const file of filesToDelete) await deleteOpfsFile(projectId, file.path);
  await db.files.bulkDelete(filesToDelete.map((file) => file.id));
}

export async function deleteProject(projectId: string): Promise<void> {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  if (isOpfsSupported()) {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(projectId, { recursive: true });
    } catch {
      // Missing OPFS project is already in the desired state.
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
  if (!trimmed) throw new Error('Project name cannot be empty');
  const project = await db.projects.get(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const updated = { ...project, name: trimmed, updatedAt: Date.now() };
  await db.projects.put(updated);
  return updated;
}

export async function archiveProject(projectId: string): Promise<ArchivedProject> {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const files = await getAllFileContent(projectId);
  const archivedItem: ArchivedProject = {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    archivedAt: Date.now(),
    fileCount: files.length,
  };
  const archivedFiles = files.map((file) => ({
    id: file.id,
    projectId: file.projectId,
    path: file.path,
    content: file.content,
    updatedAt: file.updatedAt,
  }));

  // Move the durable Dexie records first. OPFS cleanup is performed only after
  // the archive transaction succeeds, preventing an archive failure from deleting data.
  await db.transaction('rw', db.projects, db.files, db.archivedProjects, db.archivedFiles, async () => {
    await db.archivedProjects.put(archivedItem);
    if (archivedFiles.length) await db.archivedFiles.bulkPut(archivedFiles);
    await db.files.where('projectId').equals(projectId).delete();
    await db.projects.delete(projectId);
  });

  if (isOpfsSupported()) {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(projectId, { recursive: true });
    } catch (e) {
      console.warn(`OPFS archive cleanup failed for project ${projectId}`, e);
    }
  }

  return archivedItem;
}

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
  const filesToRestore = archivedFiles.map((file) => ({ ...file }));

  await db.transaction('rw', db.projects, db.files, db.archivedProjects, db.archivedFiles, async () => {
    await db.projects.put(restoredProject);
    if (filesToRestore.length) await db.files.bulkPut(filesToRestore);
    await db.archivedProjects.delete(projectId);
    await db.archivedFiles.where('projectId').equals(projectId).delete();
  });

  if (isOpfsSupported()) {
    await Promise.all(archivedFiles.map(async (file) => {
      try {
        await writeOpfsFile(file.projectId, file.path, file.content);
      } catch (e) {
        console.warn(`OPFS restore failed for ${file.path}`, e);
      }
    }));
  }
  return restoredProject;
}

export async function listArchivedProjects(): Promise<ArchivedProject[]> {
  try {
    return await db.archivedProjects.orderBy('archivedAt').reverse().toArray();
  } catch {
    return db.archivedProjects.toArray();
  }
}

export async function deleteArchivedProject(projectId: string): Promise<void> {
  if (isOpfsSupported()) {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(projectId, { recursive: true });
    } catch {
      // Missing OPFS project is already in the desired state.
    }
  }
  await db.transaction('rw', db.archivedProjects, db.archivedFiles, async () => {
    await db.archivedFiles.where('projectId').equals(projectId).delete();
    await db.archivedProjects.delete(projectId);
  });
}
