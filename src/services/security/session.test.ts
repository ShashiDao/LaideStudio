// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../db';
import { deriveKeys } from './crypto';
import { 
  savePersistentSession, 
  getPersistentSession, 
  clearPersistentSession, 
  SESSION_ID
} from './session';

describe('Vault Session Persistence with Non-Extractable CryptoKey', () => {
  const dummySalt = new Uint8Array(16).fill(7);

  beforeEach(async () => {
    await db.vaultSessions.clear();
  });

  it('persists session with non-extractable CryptoKeys and verifier in IndexedDB', async () => {
    const keys = await deriveKeys('test-password-123', dummySalt);
    const session = await savePersistentSession(keys, 60000); // 1 minute

    expect(session.id).toBe(SESSION_ID);
    expect(session.verifierBase64).toBeTruthy();
    expect(session.aesKey).toBe(keys.aesKey);
    expect(session.hmacKey).toBe(keys.hmacKey);
    expect(session.expiresAt).toBeGreaterThan(Date.now());

    // Verify retrieval without exporting key bytes
    const retrieved = await getPersistentSession();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.aesKey).toBeDefined();
    expect(retrieved?.hmacKey).toBeDefined();
  });

  it('rejects and purges expired sessions', async () => {
    const keys = await deriveKeys('test-password-123', dummySalt);
    // Expired 1000ms ago
    await savePersistentSession(keys, -1000);

    const retrieved = await getPersistentSession();
    expect(retrieved).toBeNull();

    // Confirm it was purged from IndexedDB
    const inDb = await db.vaultSessions.get(SESSION_ID);
    expect(inDb).toBeUndefined();
  });

  it('rejects and purges sessions when verifierBase64 has been tampered with', async () => {
    const keys = await deriveKeys('test-password-123', dummySalt);
    await savePersistentSession(keys, 60000);

    // Tamper with the stored verifier in IndexedDB
    await db.vaultSessions.update(SESSION_ID, { verifierBase64: 'tampered_invalid_verifier' });

    const retrieved = await getPersistentSession();
    expect(retrieved).toBeNull();

    // Confirm it was purged
    const inDb = await db.vaultSessions.get(SESSION_ID);
    expect(inDb).toBeUndefined();
  });

  it('clears session explicitly upon locking or logout', async () => {
    const keys = await deriveKeys('test-password-123', dummySalt);
    await savePersistentSession(keys, 60000);

    expect(await getPersistentSession()).not.toBeNull();

    await clearPersistentSession();

    expect(await getPersistentSession()).toBeNull();
    const inDb = await db.vaultSessions.get(SESSION_ID);
    expect(inDb).toBeUndefined();
  });
});
