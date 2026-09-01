import { describe, it, expect } from 'vitest';
import {
  computeSha256,
  parseLockfile,
  serializeLockfile,
  findLockfile,
  getCanonicalVendorPath,
  verifyAndLockDependency,
  LOCKFILE_PATH
} from './lockfile';

describe('lockfile service', () => {
  describe('computeSha256', () => {
    it('computes sha256 hash using crypto.subtle or fallback', async () => {
      const input = 'export default function() { return 42; };';
      const hash = await computeSha256(input);
      expect(hash).toMatch(/^sha256-[a-f0-9]{64}$/);
      // Same input produces identical hash
      const hash2 = await computeSha256(input);
      expect(hash).toBe(hash2);
    });

    it('produces different hashes for different inputs', async () => {
      const hashA = await computeSha256('const a = 1;');
      const hashB = await computeSha256('const a = 2;');
      expect(hashA).not.toBe(hashB);
    });
  });

  describe('parseLockfile and serializeLockfile', () => {
    it('creates a fresh lockfile if string is empty or invalid', () => {
      const emptyLock = parseLockfile('');
      expect(emptyLock.version).toBe(1);
      expect(emptyLock.dependencies).toEqual({});

      const invalidLock = parseLockfile('invalid json {');
      expect(invalidLock.version).toBe(1);
      expect(invalidLock.dependencies).toEqual({});
    });

    it('round-trips valid lockfile correctly with sorted keys', () => {
      const initial = {
        version: 1 as const,
        lockfileVersion: 1 as const,
        generatedAt: 1700000000000,
        dependencies: {
          'zebra-pkg': {
            specifier: 'zebra-pkg',
            url: 'https://esm.sh/zebra-pkg@1.0.0',
            integrity: 'sha256-1111111111111111111111111111111111111111111111111111111111111111',
            lockedAt: 1700000000000
          },
          'alpha-pkg': {
            specifier: 'alpha-pkg',
            url: 'https://esm.sh/alpha-pkg@2.0.0',
            integrity: 'sha256-2222222222222222222222222222222222222222222222222222222222222222',
            lockedAt: 1700000000000,
            vendored: true,
            vendorPath: '/vendor/alpha-pkg.js'
          }
        }
      };

      const serialized = serializeLockfile(initial);
      const parsed = parseLockfile(serialized);
      expect(parsed.dependencies['alpha-pkg'].integrity).toBe(initial.dependencies['alpha-pkg'].integrity);
      expect(parsed.dependencies['zebra-pkg'].url).toBe(initial.dependencies['zebra-pkg'].url);

      // Verify alpha-pkg appears before zebra-pkg in serialized string
      const alphaIdx = serialized.indexOf('alpha-pkg');
      const zebraIdx = serialized.indexOf('zebra-pkg');
      expect(alphaIdx).toBeLessThan(zebraIdx);
    });
  });

  describe('findLockfile', () => {
    it('returns empty lockfile when file is absent', () => {
      const { file, lockfile } = findLockfile([]);
      expect(file).toBeUndefined();
      expect(lockfile.dependencies).toEqual({});
    });

    it('finds and parses .laide/lockfile.json', () => {
      const files = [
        {
          path: LOCKFILE_PATH,
          content: JSON.stringify({
            version: 1,
            dependencies: {
              lodash: {
                specifier: 'lodash',
                url: 'https://esm.sh/lodash@4.17.21',
                integrity: 'sha256-abcd',
                lockedAt: 12345
              }
            }
          })
        }
      ];

      const { file, lockfile } = findLockfile(files);
      expect(file?.path).toBe(LOCKFILE_PATH);
      expect(lockfile.dependencies['lodash'].url).toBe('https://esm.sh/lodash@4.17.21');
    });
  });

  describe('getCanonicalVendorPath', () => {
    it('formats flat package names', () => {
      expect(getCanonicalVendorPath('canvas-confetti')).toBe('/vendor/canvas-confetti.js');
    });

    it('formats scoped package names safely', () => {
      expect(getCanonicalVendorPath('@lucide/lab')).toBe('/vendor/@lucide/lab.js');
    });
  });

  describe('verifyAndLockDependency', () => {
    it('locks dependency on first load when not present', async () => {
      const lockfile = parseLockfile('');
      const code = 'export const greeting = "hello";';
      const result = await verifyAndLockDependency({
        specifier: 'greeting-lib',
        url: 'https://esm.sh/greeting-lib@1.0.0',
        content: code,
        lockfile
      });

      expect(result.valid).toBe(true);
      expect(result.entry.specifier).toBe('greeting-lib');
      expect(lockfile.dependencies['greeting-lib'].integrity).toMatch(/^sha256-/);
    });

    it('passes when hash matches existing lock', async () => {
      const code = 'export const greeting = "hello";';
      const hash = await computeSha256(code);
      const lockfile = {
        version: 1 as const,
        lockfileVersion: 1 as const,
        dependencies: {
          'greeting-lib': {
            specifier: 'greeting-lib',
            url: 'https://esm.sh/greeting-lib@1.0.0',
            integrity: hash,
            lockedAt: Date.now()
          }
        }
      };

      const result = await verifyAndLockDependency({
        specifier: 'greeting-lib',
        url: 'https://esm.sh/greeting-lib@1.0.0',
        content: code,
        lockfile
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('fails with clear tamper/mismatch warning when fetched bytes differ from locked hash', async () => {
      const originalCode = 'export const safe = true;';
      const tamperedCode = 'export const safe = false; /* hacked */';
      const originalHash = await computeSha256(originalCode);
      const lockfile = {
        version: 1 as const,
        lockfileVersion: 1 as const,
        dependencies: {
          'my-lib': {
            specifier: 'my-lib',
            url: 'https://esm.sh/my-lib@1.0.0',
            integrity: originalHash,
            lockedAt: Date.now()
          }
        }
      };

      const result = await verifyAndLockDependency({
        specifier: 'my-lib',
        url: 'https://esm.sh/my-lib@1.0.0',
        content: tamperedCode,
        lockfile
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('INTEGRITY MISMATCH');
      expect(result.error).toContain('Expected: ' + originalHash);
      expect(result.error).toContain('npm update-lock my-lib');
    });
  });
});
