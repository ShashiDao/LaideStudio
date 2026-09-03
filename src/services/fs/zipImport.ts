import JSZip from 'jszip';
import { bulkCreateOrUpdateFiles, sanitizeImportedPath } from './vfs';
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

/**
 * Efficiently converts a Uint8Array to a Base64 string in chunks
 * without exceeding call stack limits.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 0x8000;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

export async function importZip(
  zipData: Blob | ArrayBuffer | Uint8Array,
  projectId: string,
  options?: { autoRestructure?: boolean }
): Promise<{ count: number; skipped: string[] }> {
  const startedAt = performance.now();
  const rawData = (typeof Blob !== 'undefined' && zipData instanceof Blob)
    ? await zipData.arrayBuffer()
    : zipData;
  const zipReadFinishedAt = performance.now();

  const zip = await JSZip.loadAsync(rawData);
  const zipParsedFinishedAt = performance.now();
  const rawEntries = Object.values(zip.files).filter(entry => !entry.dir);

  if (rawEntries.length === 0) {
    return { count: 0, skipped: [] };
  }

  // Detect common top-level wrapper folder if autoRestructure is enabled
  let commonFolder: string | null = null;
  if (options?.autoRestructure && rawEntries.length > 0) {
    const firstParts = rawEntries[0].name.replace(/^\//, '').split('/');
    if (firstParts.length > 1) {
      const candidate = firstParts[0];
      const allShare = rawEntries.every(entry => {
        const parts = entry.name.replace(/^\//, '').split('/');
        return parts.length > 1 && parts[0] === candidate;
      });
      if (allShare) {
        commonFolder = candidate;
      }
    }
  }
  const structureDetectedAt = performance.now();

  // Parallel single-pass decode of files from ZIP with path sanitization
  const skipped: string[] = [];
  const utf8Decoder = new TextDecoder('utf-8');
  const decodedEntries = await Promise.all(
    rawEntries.map(async (entry) => {
      const rawPath = entry.name.replace(/^\//, '');
      const relativePath = (commonFolder && rawPath.startsWith(`${commonFolder}/`))
        ? rawPath.substring(commonFolder.length + 1)
        : rawPath;

      const safePath = sanitizeImportedPath(relativePath);
      if (!safePath) {
        skipped.push(entry.name);
        return null;
      }

      // Single decompression pass to Uint8Array: no second JSZip decompress call
      const uint8Array = await entry.async('uint8array');
      const content = isText(uint8Array)
        ? utf8Decoder.decode(uint8Array)
        : uint8ArrayToBase64(uint8Array);

      return { path: safePath, content };
    })
  );
  const decodeFinishedAt = performance.now();

  const decodedFiles = decodedEntries.filter((f): f is { path: string; content: string } => f !== null);

  await bulkCreateOrUpdateFiles(projectId, decodedFiles);
  const persistenceFinishedAt = performance.now();

  if (options?.autoRestructure && !commonFolder) {
    await flattenWrapperFolder(projectId);
  }
  const restructureFinishedAt = performance.now();

  if (import.meta.env?.DEV) {
    console.debug('[LAIDE ZIP import]', {
      files: decodedFiles.length,
      skipped: skipped.length,
      readZipMs: Math.round((zipReadFinishedAt - startedAt) * 100) / 100,
      parseZipMs: Math.round((zipParsedFinishedAt - zipReadFinishedAt) * 100) / 100,
      detectStructureMs: Math.round((structureDetectedAt - zipParsedFinishedAt) * 100) / 100,
      decodeMs: Math.round((decodeFinishedAt - structureDetectedAt) * 100) / 100,
      persistenceMs: Math.round((persistenceFinishedAt - decodeFinishedAt) * 100) / 100,
      restructureMs: Math.round((restructureFinishedAt - persistenceFinishedAt) * 100) / 100,
      totalMs: Math.round((restructureFinishedAt - startedAt) * 100) / 100,
    });
  }

  return { count: decodedFiles.length, skipped };
}
