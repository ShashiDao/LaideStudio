import JSZip from 'jszip';
import { createFile, listFiles, writeFile } from './vfs';
import { flattenWrapperFolder } from './restructure';

/**
 * Heuristic to detect if a file is text or binary.
 * Checks the first 8192 bytes for a null byte.
 * If a null byte is found, it's considered binary.
 */
export function isText(buffer: Uint8Array): boolean {
  for (let i = 0; i < Math.min(buffer.length, 8192); i++) {
    if (buffer[i] === 0) return false;
  }
  return true;
}

export async function importZip(zipData: Blob | ArrayBuffer | Uint8Array, projectId: string, options?: { autoRestructure?: boolean }): Promise<void> {
  const zip = await JSZip.loadAsync(zipData);
  let expectedCount = 0;
  let writtenCount = 0;

  const entries = Object.values(zip.files);
  const currentFiles = await listFiles(projectId);
  const existingMap = new Map(currentFiles.map(f => [f.path, f.id]));

  for (const entry of entries) {
    if (entry.dir) continue;
    expectedCount++;

    const path = entry.name.startsWith('/') ? entry.name : `/${entry.name}`;
    
    // Read the raw bytes to determine text vs binary
    const uint8Array = await entry.async('uint8array');
    
    const content = isText(uint8Array)
      ? await entry.async('string') // Decode as UTF-8 via JSZip
      : await entry.async('base64'); // Decode as base64

    if (existingMap.has(path)) {
      await writeFile(existingMap.get(path)!, content);
    } else {
      await createFile(projectId, path, content);
    }
    
    writtenCount++;
  }

  // Verify extraction wrote the same amount of actual files as the zip claimed (excluding directories)
  if (expectedCount !== writtenCount) {
    throw new Error(`Zip import count mismatch. Expected ${expectedCount}, wrote ${writtenCount}.`);
  }

  if (options?.autoRestructure) {
    await flattenWrapperFolder(projectId);
  }
}
