/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Migrates all persisted keys starting with "xiom_" to "laide_"
 * in localStorage and sessionStorage. Byte-for-byte copy with removal of the legacy key.
 */
export function migrateLocalStorage(
  customLocalStorage?: Storage,
  customSessionStorage?: Storage
): void {
  const local = customLocalStorage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  const session = customSessionStorage ?? (typeof sessionStorage !== 'undefined' ? sessionStorage : null);

  if (local) {
    try {
      const keysToMigrate: { oldKey: string; newKey: string; value: string }[] = [];
      for (let i = 0; i < local.length; i++) {
        const key = local.key(i);
        if (key && key.startsWith('xiom_')) {
          const value = local.getItem(key);
          if (value !== null) {
            const newKey = 'laide_' + key.slice('xiom_'.length);
            keysToMigrate.push({ oldKey: key, newKey, value });
          }
        }
      }

      for (const { oldKey, newKey, value } of keysToMigrate) {
        if (local.getItem(newKey) === null) {
          local.setItem(newKey, value);
        }
        local.removeItem(oldKey);
      }
    } catch (err) {
      console.error('Failed to migrate localStorage keys from xiom_ to laide_:', err);
    }
  }

  if (session) {
    try {
      const keysToMigrate: { oldKey: string; newKey: string; value: string }[] = [];
      for (let i = 0; i < session.length; i++) {
        const key = session.key(i);
        if (key && key.startsWith('xiom_')) {
          const value = session.getItem(key);
          if (value !== null) {
            const newKey = 'laide_' + key.slice('xiom_'.length);
            keysToMigrate.push({ oldKey: key, newKey, value });
          }
        }
      }

      for (const { oldKey, newKey, value } of keysToMigrate) {
        if (session.getItem(newKey) === null) {
          session.setItem(newKey, value);
        }
        session.removeItem(oldKey);
      }
    } catch (err) {
      console.error('Failed to migrate sessionStorage keys from xiom_ to laide_:', err);
    }
  }
}
