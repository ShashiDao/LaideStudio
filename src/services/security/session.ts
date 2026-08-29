import { db, type VaultSession } from '../../db';

export const SESSION_ID = 'active_session';
export const DEFAULT_SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Computes a SHA-256 hash of the vault master key bytes.
 */
export async function hashVaultKey(masterKeyBytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', masterKeyBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Persists the active vault session in IndexedDB for the specified duration.
 */
export async function savePersistentSession(
  masterKeyBytes: Uint8Array,
  durationMs: number = DEFAULT_SESSION_DURATION_MS
): Promise<VaultSession> {
  const keyHash = await hashVaultKey(masterKeyBytes);
  const now = Date.now();
  const session: VaultSession = {
    id: SESSION_ID,
    keyHash,
    masterKeyBytes,
    createdAt: now,
    expiresAt: now + durationMs,
  };

  await db.vaultSessions.put(session);
  return session;
}

/**
 * Retrieves the persisted vault session from IndexedDB if it exists, has not expired,
 * and passes cryptographic hash verification.
 */
export async function getPersistentSession(): Promise<VaultSession | null> {
  try {
    const session = await db.vaultSessions.get(SESSION_ID);
    if (!session) return null;

    // Check expiration
    if (Date.now() > session.expiresAt) {
      await clearPersistentSession();
      return null;
    }

    // Verify key hash integrity
    const computedHash = await hashVaultKey(session.masterKeyBytes);
    if (computedHash !== session.keyHash) {
      console.warn('Persistent session hash mismatch. Purging invalid session.');
      await clearPersistentSession();
      return null;
    }

    return session;
  } catch (err) {
    console.error('Failed to retrieve persistent vault session', err);
    return null;
  }
}

/**
 * Clears the persisted vault session from IndexedDB.
 */
export async function clearPersistentSession(): Promise<void> {
  try {
    await db.vaultSessions.delete(SESSION_ID);
  } catch (err) {
    console.error('Failed to clear persistent session', err);
  }
}
