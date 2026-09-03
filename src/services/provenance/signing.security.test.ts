// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db';
import { importMasterKey } from '../security/crypto';
import { getOrCreateProvenanceSigningKeys } from './signing';

describe('Provenance signing key persistence boundary', () => {
  beforeEach(async () => {
    await db.secureTokens.clear();
    localStorage.clear();
  });

  it('never persists a private JWK when the vault is unavailable', async () => {
    const keys = await getOrCreateProvenanceSigningKeys(null);

    expect(keys.privateKey).toBeDefined();
    expect(keys.publicKey).toBeDefined();
    expect(localStorage.getItem('laide_prov_priv_unwrapped')).toBeNull();
    expect(await db.secureTokens.get('provenance_signing_private_key')).toBeUndefined();
    expect(await db.secureTokens.get('provenance_signing_public_key')).toBeUndefined();
  });

  it('removes legacy plaintext private-key storage and does not use it', async () => {
    localStorage.setItem(
      'laide_prov_priv_unwrapped',
      JSON.stringify({ kty: 'EC', crv: 'P-256', d: 'legacy-private-key' })
    );

    const keys = await getOrCreateProvenanceSigningKeys(null);

    expect(localStorage.getItem('laide_prov_priv_unwrapped')).toBeNull();
    expect(keys.publicJwk.d).toBeUndefined();
  });

  it('persists the private key only as vault-encrypted secure-token data', async () => {
    const rawMasterBytes = new Uint8Array(64);
    rawMasterBytes.fill(42);
    const keyMaterial = await importMasterKey(rawMasterBytes);

    const keys = await getOrCreateProvenanceSigningKeys(keyMaterial.aesKey);
    const privateToken = await db.secureTokens.get('provenance_signing_private_key');
    const publicToken = await db.secureTokens.get('provenance_signing_public_key');

    expect(keys.privateKey).toBeDefined();
    expect(privateToken).toBeDefined();
    expect(privateToken?.encryptedValue.startsWith('enc.v1.')).toBe(true);
    expect(publicToken).toBeDefined();
    expect(localStorage.getItem('laide_prov_priv_unwrapped')).toBeNull();
  });

  it('reuses a vault-encrypted keypair with the same vault key', async () => {
    const rawMasterBytes = new Uint8Array(64);
    rawMasterBytes.fill(7);
    const keyMaterial = await importMasterKey(rawMasterBytes);

    const first = await getOrCreateProvenanceSigningKeys(keyMaterial.aesKey);
    const second = await getOrCreateProvenanceSigningKeys(keyMaterial.aesKey);

    expect(second.publicJwk.x).toBe(first.publicJwk.x);
    expect(second.publicJwk.y).toBe(first.publicJwk.y);
  });
});
