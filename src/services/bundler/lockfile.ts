import type { FileItem } from '../../db';

export const LOCKFILE_PATH = '/.laide/lockfile.json';
export const ALT_LOCKFILE_PATHS = ['/.laide/lockfile.json', '.laide/lockfile.json', '/lockfile.json', 'lockfile.json'];

export interface LockfileEntry {
  specifier: string;
  url: string;
  integrity: string; // e.g. "sha256-abcdef..."
  lockedAt: number;
  vendored?: boolean;
  vendorPath?: string;
}

export interface DependencyLockfile {
  version: number;
  lockfileVersion: number;
  dependencies: Record<string, LockfileEntry>;
}

/**
 * Pure JS fallback for SHA-256 when crypto.subtle is unavailable in mock/worker contexts
 */
function sha256PureJs(inputStr: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let ascii = inputStr;
  let i: number;
  let j: number;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  let hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isPrime = (n: number) => {
    for (let factor = 2; factor * factor <= n; factor++) {
      if (n % factor === 0) return false;
    }
    return true;
  };

  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (isPrime(candidate)) {
      if (primeCounter < 8) {
        hash[primeCounter] = (mathPow(candidate, 1 / 2) * maxWord) | 0;
      }
      k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      primeCounter++;
    }
  }

  ascii += '\x80';
  while ((ascii.length % 64) !== 56) {
    ascii += '\x00';
  }
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return ''; // Non-ASCII fallback handled via TextEncoder
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (j = 0; j < words.length;) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];

      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      const val = (w[i] = (i < 16 ? w[i] : (w[i - 16] + s0 + w[i - 7] + s1) | 0));

      const s1h = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const temp1 = (hash[7] + s1h + ch + k[i] + val) | 0;
      const s0h = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const temp2 = (s0h + maj) | 0;

      hash = [(temp1 + temp2) | 0, hash[0], hash[1], hash[2], (hash[3] + temp1) | 0, hash[4], hash[5], hash[6]];
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (let b = 3; b >= 0; b--) {
      const byte = (hash[i] >> (b * 8)) & 255;
      result += (byte < 16 ? '0' : '') + byte.toString(16);
    }
  }
  return result;
}

/**
 * Computes a standard SHA-256 integrity hash formatted as "sha256-<hex>"
 */
export async function computeSha256(content: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
      const encoder = new TextEncoder();
      const data = encoder.encode(content);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return `sha256-${hashHex}`;
    }
  } catch {
    // Fall back to pure JS
  }

  const hex = sha256PureJs(content);
  return `sha256-${hex}`;
}

/**
 * Parses lockfile content with fallback to an empty lockfile structure.
 */
export function parseLockfile(content?: string): DependencyLockfile {
  if (!content || !content.trim()) {
    return {
      version: 1,
      lockfileVersion: 1,
      dependencies: {}
    };
  }
  try {
    const parsed = JSON.parse(content);
    return {
      version: parsed.version || 1,
      lockfileVersion: parsed.lockfileVersion || 1,
      dependencies: parsed.dependencies && typeof parsed.dependencies === 'object' ? parsed.dependencies : {}
    };
  } catch (err) {
    console.warn('Failed to parse lockfile JSON, initializing fresh lockfile:', err);
    return {
      version: 1,
      lockfileVersion: 1,
      dependencies: {}
    };
  }
}

/**
 * Serializes dependency lockfile to formatted JSON string.
 */
export function serializeLockfile(lockfile: DependencyLockfile): string {
  // Sort dependency keys for deterministic file output
  const sortedDeps: Record<string, LockfileEntry> = {};
  for (const key of Object.keys(lockfile.dependencies).sort()) {
    sortedDeps[key] = lockfile.dependencies[key];
  }
  return JSON.stringify({
    version: lockfile.version || 1,
    lockfileVersion: lockfile.lockfileVersion || 1,
    dependencies: sortedDeps
  }, null, 2);
}

/**
 * Locates the lockfile file item inside a project's files list.
 */
export function findLockfile(files: (Pick<FileItem, 'path' | 'content'> & Partial<FileItem>)[]): {
  file?: Pick<FileItem, 'path' | 'content'> & Partial<FileItem>;
  lockfile: DependencyLockfile;
} {
  const file = files.find(f => ALT_LOCKFILE_PATHS.includes(f.path));
  const lockfile = parseLockfile(file?.content);
  return { file, lockfile };
}

/**
 * Checks whether a package specifier has been vendored locally into the project VFS.
 */
export function isVendoredSpecifier(
  specifier: string, 
  files: (Pick<FileItem, 'path' | 'content'> & Partial<FileItem>)[]
): { isVendored: boolean; filePath?: string } {
  const cleanSpec = specifier.replace(/^\.?\//, '');
  const candidatePaths = [
    `/vendor/${cleanSpec}.js`,
    `/vendor/${cleanSpec}.ts`,
    `/vendor/${cleanSpec}/index.js`,
    `/vendor/${cleanSpec}/index.ts`,
    `/.laide/vendor/${cleanSpec}.js`,
    `/.laide/vendor/${cleanSpec}/index.js`,
    `vendor/${cleanSpec}.js`,
    `vendor/${cleanSpec}/index.js`
  ];

  for (const p of candidatePaths) {
    const matched = files.find(f => f.path === p);
    if (matched && matched.content !== undefined) {
      return { isVendored: true, filePath: matched.path };
    }
  }

  return { isVendored: false };
}

/**
 * Returns canonical vendor destination path for a given specifier.
 */
export function getCanonicalVendorPath(specifier: string): string {
  const cleanSpec = specifier.replace(/^\.?\//, '');
  return `/vendor/${cleanSpec}.js`;
}

/**
 * Validates integrity of dependency content against lockfile or locks it if new.
 */
export async function verifyAndLockDependency(params: {
  specifier: string;
  url: string;
  content: string;
  lockfile: DependencyLockfile;
  onLockUpdated?: (lockfile: DependencyLockfile) => void;
}): Promise<{ valid: boolean; entry: LockfileEntry; error?: string }> {
  const { specifier, url, content, lockfile, onLockUpdated } = params;
  const computedHash = await computeSha256(content);
  const cleanName = url.replace('https://esm.sh/', '').split('?')[0];
  const lockedEntry = lockfile.dependencies[specifier] || lockfile.dependencies[cleanName] || lockfile.dependencies[url];

  if (lockedEntry && lockedEntry.integrity) {
    if (lockedEntry.integrity !== computedHash) {
      const errorMsg = `[SECURITY INTEGRITY MISMATCH] Dependency "${specifier}" (${url}) failed SHA-256 integrity verification!\n` +
        `Expected: ${lockedEntry.integrity}\n` +
        `Received: ${computedHash}\n` +
        `Upstream content at esm.sh has changed or was tampered with. Build aborted to prevent untrusted code execution.\n` +
        `To accept this update, run "npm update-lock ${specifier}" in the terminal or update /.laide/lockfile.json.`;
      return {
        valid: false,
        entry: lockedEntry,
        error: errorMsg
      };
    }
    return {
      valid: true,
      entry: lockedEntry
    };
  }

  const newEntry: LockfileEntry = {
    specifier,
    url,
    integrity: computedHash,
    lockedAt: Date.now()
  };
  lockfile.dependencies[specifier] = newEntry;
  onLockUpdated?.(lockfile);

  return {
    valid: true,
    entry: newEntry
  };
}
