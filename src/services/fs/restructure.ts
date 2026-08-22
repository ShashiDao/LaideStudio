import { listFiles, renameFile } from './vfs';
import { createSnapshot } from './snapshot';

/**
 * Detects if a project has a single top-level wrapper folder that contains all files.
 * If so, it takes a snapshot and flattens the structure by moving everything up one level.
 * Returns true if restructuring occurred, false otherwise.
 */
export async function flattenWrapperFolder(projectId: string): Promise<boolean> {
  const files = await listFiles(projectId);
  if (files.length === 0) return false;

  let commonFolder: string | null = null;
  
  for (const file of files) {
    const parts = file.path.split('/');
    // A file path like '/file.txt' splits to ['', 'file.txt'] (length 2)
    // A file path like '/wrapper/file.txt' splits to ['', 'wrapper', 'file.txt'] (length >= 3)
    if (parts.length < 3) {
      return false; // Found a file at the root level, so no single wrapper folder.
    }
    
    const topLevelFolder = parts[1];
    if (commonFolder === null) {
      commonFolder = topLevelFolder;
    } else if (commonFolder !== topLevelFolder) {
      return false; // Multiple top-level items exist.
    }
  }

  if (!commonFolder) return false;

  // Ensure that no file is exactly '/commonFolder' (which would mean a file, not a folder, shares the name)
  const isExactMatch = files.some(f => f.path === `/${commonFolder}`);
  if (isExactMatch) return false;
  
  // Take a snapshot before destructive modification
  await createSnapshot(projectId, 'Pre-Restructure');

  // Move files up one level
  const prefix = `/${commonFolder}`;
  for (const file of files) {
    if (file.path.startsWith(prefix + '/')) {
      const newPath = file.path.substring(prefix.length);
      await renameFile(file.id, newPath);
    }
  }

  return true;
}
