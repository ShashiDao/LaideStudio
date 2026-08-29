// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../db';
import { 
  savePersistentSession, 
  getPersistentSession, 
  clearPersistentSession, 
  hashVaultKey,
  SESSION_ID
} from './session';

describe('Vault Session Persistence', () => {
  beforeEach(async () => {
    await db.vaultSessions.clear();
  });

  it('computes consistent SHA-256 hash for master key bytes', async () => {
    const rawKey = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const hash1 = await hashVaultKey(rawKey);
    const hash2 = await hashVaultKey(rawKey);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // 32 bytes in hex = 64 characters
  });

  it('persists session with key hash and expiration in IndexedDB', async () => {
    const rawKey = new Uint8Array(64).fill(42);
    const session = await savePersistentSession(rawKey, 60000); // 1 minute

    expect(session.id).toBe(SESSION_ID);
    expect(session.keyHash).toBeTruthy();
    expect(session.masterKeyBytes).toEqual(rawKey);
    expect(session.expiresAt).toBeGreaterThan(Date.now());

    // Verify retrieval
    const retrieved = await getPersistentSession();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(SESSION_ID);
    expect(retrieved?.masterKeyBytes).toEqual(rawKey);
    expect(retrieved?.keyHash).toBe(session.keyHash);
  });

  it('rejects and purges expired sessions', async () => {
    const rawKey = new Uint8Array(64).fill(11);
    // Expired 1000ms ago
    await savePersistentSession(rawKey, -1000);

    const retrieved = await getPersistentSession();
    expect(retrieved).toBeNull();

    // Confirm it was purged from IndexedDB
    const inDb = await db.vaultSessions.get(SESSION_ID);
    expect(inDb).toBeUndefined();
  });

  it('rejects and purges sessions when keyHash has been tampered with', async () => {
    const rawKey = new Uint8Array(64).fill(99);
    await savePersistentSession(rawKey, 60000);

    // Tamper with the stored bytes in IndexedDB
    const tamperedBytes = new Uint8Array(64).fill(77);
    await db.vaultSessions.update(SESSION_ID, { masterKeyBytes: tamperedBytes });

    const retrieved = await getPersistentSession();
    expect(retrieved).toBeNull();

    // Confirm it was purged
    const inDb = await db.vaultSessions.get(SESSION_ID);
    expect(inDb).toBeUndefined();
  });

  it('clears session explicitly upon locking or logout', async () => {
    const rawKey = new Uint8Array(64).fill(5);
    await savePersistentSession(rawKey, 60000);

    expect(await getPersistentSession()).not.toBeNull();

    await clearPersistentSession();

    expect(await getPersistentSession()).toBeNull();
    const inDb = await db.vaultSessions.get(SESSION_ID);
    expect(inDb).toBeUndefined();
  });
});
