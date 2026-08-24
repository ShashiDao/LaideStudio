import { db, type FileItem, type Project } from '../../db';

export function generateId(): string {
  return crypto.randomUUID();
}

const isOpfsSupported = () => typeof navigator !== 'undefined' && navigator.storage && !!navigator.storage.getDirectory;

async function getOpfsFileHandle(projectId: string, path: string, create: boolean = false) {
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
    if (f.path.startsWith(path + '/')) {
      throw new Error(`Path collision: ${path} is a folder prefix for existing file ${f.path}`);
    }
    if (path.startsWith(f.path + '/')) {
      throw new Error(`Path collision: existing file ${f.path} is a folder prefix for ${path}`);
    }
  }
}

export async function listFiles(projectId: string): Promise<FileItem[]> {
  const files = await db.files.where('projectId').equals(projectId).toArray();
  if (isOpfsSupported()) {
    await Promise.all(
      files.map(async (file) => {
        try {
          const handle = await getOpfsFileHandle(projectId, file.path, false);
          const opfsFile = await handle.getFile();
          file.content = await opfsFile.text();
        } catch {
          // Fallback to what's in Dexie if OPFS fails (or migration)
        }
      })
    );
  }
  return files;
}

export async function readFile(id: string): Promise<FileItem> {
  const file = await db.files.get(id);
  if (!file) throw new Error(`File not found: ${id}`);
  
  if (isOpfsSupported()) {
    try {
      const handle = await getOpfsFileHandle(file.projectId, file.path, false);
      const opfsFile = await handle.getFile();
      file.content = await opfsFile.text();
    } catch {
      // Fallback
    }
  }
  return file;
}

export async function writeFile(id: string, content: string): Promise<FileItem> {
  const file = await db.files.get(id);
  if (!file) throw new Error(`File not found: ${id}`);
  
  if (isOpfsSupported()) {
    try {
      const handle = await getOpfsFileHandle(file.projectId, file.path, true);
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
    } catch (e) {
      console.warn("OPFS write failed", e);
    }
  }
  
  // Store empty content in Dexie if OPFS is supported, to save DB space
  const dbContent = isOpfsSupported() ? '' : content;
  const updated = { ...file, content: dbContent, updatedAt: Date.now() };
  await db.files.put(updated);
  
  return { ...updated, content };
}

export async function createFile(projectId: string, path: string, content: string): Promise<FileItem> {
  const dbContent = isOpfsSupported() ? '' : content;
  const newFile: FileItem = {
    id: generateId(),
    projectId,
    path,
    content: dbContent,
    updatedAt: Date.now()
  };
  
  await db.transaction('rw', db.files, async () => {
    await checkPathCollision(projectId, path);
    await db.files.add(newFile);
  });
  
  if (isOpfsSupported()) {
    try {
      const handle = await getOpfsFileHandle(projectId, path, true);
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
    } catch (e) {
      console.warn("OPFS create failed", e);
    }
  }
  
  return { ...newFile, content };
}

export async function deleteFile(id: string): Promise<void> {
  const file = await db.files.get(id);
  if (!file) throw new Error(`File not found: ${id}`);
  
  if (isOpfsSupported()) {
    try {
      const root = await navigator.storage.getDirectory();
      const projDir = await root.getDirectoryHandle(file.projectId, { create: false });
      const parts = file.path.split('/').filter(Boolean);
      const fileName = parts.pop();
      if (fileName) {
        let currentDir = projDir;
        for (const part of parts) {
          currentDir = await currentDir.getDirectoryHandle(part, { create: false });
        }
        await currentDir.removeEntry(fileName);
      }
    } catch {
      // Ignore
    }
  }
  
  await db.files.delete(id);
}

export async function renameFile(id: string, newPath: string): Promise<FileItem> {
  const file = await db.files.get(id);
  if (!file) throw new Error(`File not found: ${id}`);
  
  let currentContent = file.content;
  if (isOpfsSupported()) {
    try {
      const handle = await getOpfsFileHandle(file.projectId, file.path, false);
      const opfsFile = await handle.getFile();
      currentContent = await opfsFile.text();
      
      // Delete old
      const root = await navigator.storage.getDirectory();
      const projDir = await root.getDirectoryHandle(file.projectId, { create: false });
      const oldParts = file.path.split('/').filter(Boolean);
      const oldFileName = oldParts.pop();
      if (oldFileName) {
        let currentDir = projDir;
        for (const part of oldParts) {
          currentDir = await currentDir.getDirectoryHandle(part, { create: false });
        }
        await currentDir.removeEntry(oldFileName);
      }
      
      // Create new
      const newHandle = await getOpfsFileHandle(file.projectId, newPath, true);
      const writable = await newHandle.createWritable();
      await writable.write(currentContent);
      await writable.close();
    } catch {
      // Fallback
    }
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
      try {
        const root = await navigator.storage.getDirectory();
        const projDir = await root.getDirectoryHandle(projectId, { create: false });
        const parts = f.path.split('/').filter(Boolean);
        const fileName = parts.pop();
        if (fileName) {
          let currentDir = projDir;
          for (const part of parts) {
            currentDir = await currentDir.getDirectoryHandle(part, { create: false });
          }
          await currentDir.removeEntry(fileName);
        }
      } catch {
        // Ignore
      }
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
