import { db, type VaultSession } from '../../db';
import { generateVerifier, verifyPassphrase, type KeyMaterial } from './crypto';

export const SESSION_ID = 'active_session';
export const DEFAULT_SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24h, was 7 days

export async function savePersistentSession(
  keys: Pick<KeyMaterial, 'aesKey' | 'hmacKey'>,
  durationMs: number = DEFAULT_SESSION_DURATION_MS
): Promise<VaultSession> {
  const verifierBase64 = await generateVerifier(keys.hmacKey);
  const now = Date.now();
  const session: VaultSession = {
    id: SESSION_ID,
    aesKey: keys.aesKey,     // non-extractable CryptoKey, not raw bytes
    hmacKey: keys.hmacKey,
    verifierBase64,
    createdAt: now,
    expiresAt: now + durationMs,
  };
  await db.vaultSessions.put(session);
  return session;
}

export async function getPersistentSession(): Promise<Pick<KeyMaterial, 'aesKey' | 'hmacKey'> | null> {
  try {
    const session = await db.vaultSessions.get(SESSION_ID);
    if (!session) return null;
    if (Date.now() > session.expiresAt) { await clearPersistentSession(); return null; }

    // Integrity check without ever exporting key bytes.
    const isValid = await verifyPassphrase(session.hmacKey, session.verifierBase64);
    if (!isValid) { await clearPersistentSession(); return null; }

    return { aesKey: session.aesKey, hmacKey: session.hmacKey };
  } catch { return null; }
}

export async function clearPersistentSession(): Promise<void> {
  try { await db.vaultSessions.delete(SESSION_ID); } catch { /* ignore */ }
}

