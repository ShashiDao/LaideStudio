/**
 * Best-effort recovery for ZIP archives whose central directory is missing or unreadable.
 *
 * ZIP local-file headers contain enough information to recover many archives that were
 * truncated after their file data was written. Recovery is deliberately conservative:
 * encrypted entries, data-descriptor entries without local sizes, unsupported methods,
 * invalid bounds, CRC mismatches, and oversized entries are skipped rather than guessed.
 */

import { sanitizeImportedPath } from './vfs';

export interface RecoveredZipFile {
  path: string;
  content: string;
}

export interface ZipRecoveryResult {
  files: RecoveredZipFile[];
  skipped: string[];
}

const LOCAL_FILE_SIGNATURE = 0x04034b50;
const MAX_RECOVERY_ENTRIES = 2000;
const MAX_RECOVERY_ENTRY_BYTES = 25 * 1024 * 1024;
const MAX_RECOVERY_TOTAL_BYTES = 100 * 1024 * 1024;
const DATA_DESCRIPTOR_FLAG = 0x0008;
const ENCRYPTED_FLAG = 0x0001;

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Raw DEFLATE decompression is unavailable in this browser');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

function isText(bytes: Uint8Array): boolean {
  for (let i = 0; i < Math.min(bytes.length, 8192); i++) {
    if (bytes[i] === 0) return false;
  }
  return true;
}

function decodeContent(bytes: Uint8Array): string {
  return isText(bytes) ? new TextDecoder('utf-8').decode(bytes) : toBase64(bytes);
}

/**
 * Scans ZIP local-file headers without relying on the central directory.
 * This recovers the common "missing end of central directory" case while
 * refusing to invent boundaries when the local header does not provide sizes.
 */
export async function recoverZip(zipData: ArrayBuffer | Uint8Array): Promise<ZipRecoveryResult> {
  const bytes = zipData instanceof Uint8Array ? zipData : new Uint8Array(zipData);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files: RecoveredZipFile[] = [];
  const skipped: string[] = [];
  const seenPaths = new Set<string>();
  let totalRecoveredBytes = 0;
  let offset = 0;
  let scannedEntries = 0;

  while (offset + 30 <= bytes.length && scannedEntries < MAX_RECOVERY_ENTRIES) {
    if (readUint32(view, offset) !== LOCAL_FILE_SIGNATURE) {
      offset++;
      continue;
    }

    scannedEntries++;
    const flags = readUint16(view, offset + 6);
    const method = readUint16(view, offset + 8);
    const expectedCrc = readUint32(view, offset + 14);
    const compressedSize = readUint32(view, offset + 18);
    const uncompressedSize = readUint32(view, offset + 22);
    const fileNameLength = readUint16(view, offset + 26);
    const extraLength = readUint16(view, offset + 28);
    const headerEnd = offset + 30 + fileNameLength + extraLength;

    if (headerEnd > bytes.length) {
      offset += 4;
      continue;
    }

    const rawName = new TextDecoder('utf-8', { fatal: false })
      .decode(bytes.subarray(offset + 30, offset + 30 + fileNameLength));
    const safePath = sanitizeImportedPath(rawName.replace(/^\//, ''));
    const isDirectoryEntry = rawName.endsWith('/') || rawName.endsWith('\\');

    // Directory entries are structural metadata, not VFS files. In particular,
    // do not turn /src/ into /src, or bulk validation will correctly reject it
    // as a parent of /src/components/*.
    if (isDirectoryEntry) {
      offset = headerEnd + compressedSize;
      continue;
    }

    if (flags & ENCRYPTED_FLAG) {
      skipped.push(rawName);
      offset += 4;
      continue;
    }

    // Without local sizes, recovering a data-descriptor entry requires guessing
    // the compressed-data boundary. That is unsafe, so leave it for a future
    // stronger recovery implementation rather than importing corrupted bytes.
    if (flags & DATA_DESCRIPTOR_FLAG || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      skipped.push(rawName);
      offset = headerEnd;
      continue;
    }

    if (!safePath || compressedSize > MAX_RECOVERY_ENTRY_BYTES || uncompressedSize > MAX_RECOVERY_ENTRY_BYTES) {
      skipped.push(rawName);
      offset = headerEnd;
      continue;
    }

    const dataEnd = headerEnd + compressedSize;
    if (dataEnd > bytes.length) {
      skipped.push(rawName);
      offset = headerEnd;
      continue;
    }

    try {
      const compressed = bytes.subarray(headerEnd, dataEnd);
      const decoded = method === 0
        ? new Uint8Array(compressed)
        : method === 8
          ? await inflateRaw(compressed)
          : null;

      if (!decoded || decoded.length !== uncompressedSize || (expectedCrc !== 0 && crc32(decoded) !== expectedCrc)) {
        skipped.push(rawName);
        offset = dataEnd;
        continue;
      }

      if (totalRecoveredBytes + decoded.length > MAX_RECOVERY_TOTAL_BYTES) {
        skipped.push(rawName);
        offset = dataEnd;
        continue;
      }

      if (!seenPaths.has(safePath)) {
        files.push({ path: safePath, content: decodeContent(decoded) });
        seenPaths.add(safePath);
        totalRecoveredBytes += decoded.length;
      } else {
        skipped.push(rawName);
      }
    } catch {
      skipped.push(rawName);
    }

    offset = dataEnd;
  }

  if (scannedEntries >= MAX_RECOVERY_ENTRIES) {
    skipped.push('[recovery limit: too many ZIP entries]');
  }

  return { files, skipped };
}
