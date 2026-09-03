import JSZip from 'jszip';
import { bulkCreateOrUpdateFiles, sanitizeImportedPath } from './vfs';
import { flattenWrapperFolder } from './restructure';
import { recoverZip } from './zipRecovery';

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

function detectCommonFolder(paths: string[]): string | null {
  if (paths.length === 0) return null;
  const firstParts = paths[0].replace(/^\//, '').split('/');
  if (firstParts.length <= 1) return null;
  const candidate = firstParts[0];
  return paths.every(path => {
    const parts = path.replace(/^\//, '').split('/');
    return parts.length > 1 && parts[0] === candidate;
  }) ? candidate : null;
}

function applyCommonFolder(path: string, commonFolder: string | null): string {
  const rawPath = path.replace(/^\//, '');
  return commonFolder && rawPath.startsWith(`${commonFolder}/`)
    ? rawPath.substring(commonFolder.length + 1)
    : rawPath;
}

export async function importZip(
  zipData: Blob | ArrayBuffer | Uint8Array,
  projectId: string,
  options?: { autoRestructure?: boolean }
): Promise<{ count: number; skipped: string[]; recovered?: boolean }> {
  const startedAt = performance.now();
  const rawData = (typeof Blob !== 'undefined' && zipData instanceof Blob)
    ? await zipData.arrayBuffer()
    : zipData;
  const zipReadFinishedAt = performance.now();

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(rawData);
  } catch (parseError) {
    const recovery = await recoverZip(rawData);
    if (recovery.files.length === 0) {
      throw new Error(
        `Corrupted ZIP: ${parseError instanceof Error ? parseError.message : 'archive directory could not be read'}; no readable files could be recovered`,
        { cause: parseError }
      );
    }

    const commonFolder = options?.autoRestructure
      ? detectCommonFolder(recovery.files.map(file => file.path))
      : null;
    const skipped = [...recovery.skipped];
    const decodedFiles = recovery.files.map(file => {
      const path = applyCommonFolder(file.path, commonFolder);
      const safePath = sanitizeImportedPath(path);
      if (!safePath) {
        skipped.push(file.path);
        return null;
      }
      return { path: safePath, content: file.content };
    }).filter((file): file is { path: string; content: string } => file !== null);

    await bulkCreateOrUpdateFiles(projectId, decodedFiles);
    if (options?.autoRestructure && !commonFolder) {
      await flattenWrapperFolder(projectId);
    }

    if (import.meta.env?.DEV) {
      console.debug('[LAIDE ZIP recovery]', {
        files: decodedFiles.length,
        skipped: skipped.length,
        totalMs: Math.round((performance.now() - startedAt) * 100) / 100,
      });
    }

    return { count: decodedFiles.length, skipped, recovered: true };
  }

  const zipParsedFinishedAt = performance.now();
  const rawEntries = Object.values(zip.files).filter(entry => !entry.dir);

  if (rawEntries.length === 0) {
    return { count: 0, skipped: [] };
  }

  // Detect common top-level wrapper folder if autoRestructure is enabled
  const commonFolder = options?.autoRestructure
    ? detectCommonFolder(rawEntries.map(entry => entry.name))
    : null;
  const structureDetectedAt = performance.now();

  // Parallel single-pass decode of files from ZIP with path sanitization
  const skipped: string[] = [];
  const utf8Decoder = new TextDecoder('utf-8');
  let decodedFiles: { path: string; content: string }[];
  try {
    const decodedEntries = await Promise.all(
      rawEntries.map(async (entry) => {
        const rawPath = applyCommonFolder(entry.name, commonFolder);
        const safePath = sanitizeImportedPath(rawPath);
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
    decodedFiles = decodedEntries.filter((f): f is { path: string; content: string } => f !== null);
  } catch (decodeError) {
    // No VFS mutation has happened yet. If one entry is corrupt, retry the entire
    // archive through the conservative local-header recovery path so good entries
    // can still be salvaged without partially importing this failed attempt.
    const recovery = await recoverZip(rawData);
    if (recovery.files.length === 0) {
      throw decodeError;
    }

    const recoveryCommonFolder = options?.autoRestructure
      ? detectCommonFolder(recovery.files.map(file => file.path))
      : null;
    const recoverySkipped = [...recovery.skipped];
    decodedFiles = recovery.files.map(file => {
      const path = applyCommonFolder(file.path, recoveryCommonFolder);
      const safePath = sanitizeImportedPath(path);
      if (!safePath) {
        recoverySkipped.push(file.path);
        return null;
      }
      return { path: safePath, content: file.content };
    }).filter((file): file is { path: string; content: string } => file !== null);
    skipped.push(...recoverySkipped);

    await bulkCreateOrUpdateFiles(projectId, decodedFiles);
    if (options?.autoRestructure && !recoveryCommonFolder) {
      await flattenWrapperFolder(projectId);
    }

    if (import.meta.env?.DEV) {
      console.debug('[LAIDE ZIP recovery]', {
        files: decodedFiles.length,
        skipped: skipped.length,
        totalMs: Math.round((performance.now() - startedAt) * 100) / 100,
      });
    }
    return { count: decodedFiles.length, skipped, recovered: true };
  }
  const decodeFinishedAt = performance.now();

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
