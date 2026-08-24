import JSZip from 'jszip';
import { bulkCreateOrUpdateFiles } from './vfs';
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

export async function importZip(
  zipData: Blob | ArrayBuffer | Uint8Array, 
  projectId: string, 
  options?: { autoRestructure?: boolean }
): Promise<{ count: number }> {
  const rawData = (typeof Blob !== 'undefined' && zipData instanceof Blob)
    ? await zipData.arrayBuffer()
    : zipData;
  const zip = await JSZip.loadAsync(rawData);
  const rawEntries = Object.values(zip.files).filter(entry => !entry.dir);

  if (rawEntries.length === 0) {
    return { count: 0 };
  }

  // Parallel decode of files from ZIP
  const decodedFiles = await Promise.all(
    rawEntries.map(async (entry) => {
      const path = entry.name.startsWith('/') ? entry.name : `/${entry.name}`;
      const uint8Array = await entry.async('uint8array');
      const content = isText(uint8Array)
        ? await entry.async('string')
        : await entry.async('base64');
      return { path, content };
    })
  );

  await bulkCreateOrUpdateFiles(projectId, decodedFiles);

  if (options?.autoRestructure) {
    await flattenWrapperFolder(projectId);
  }

  return { count: decodedFiles.length };
}
