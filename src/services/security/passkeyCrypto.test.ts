import { describe, it, expect } from 'vitest';
import { enrollPasskey, unlockWithPasskey, isPasskeyPrfSupported } from './passkeyCrypto';

describe('Passkey PRF Engine', () => {
  it('should gracefully return false for isPasskeyPrfSupported in non-browser/unsupported environments', async () => {
    const supported = await isPasskeyPrfSupported();
    expect(supported).toBe(false);
  });

  it('should gracefully return null when enrolling passkey without WebAuthn support', async () => {
    const dummyMasterKey = new Uint8Array(64); // 512 bits
    const passkeyData = await enrollPasskey(dummyMasterKey);
    expect(passkeyData).toBeNull();
  });

  it('should gracefully return null when unlocking without WebAuthn support', async () => {
    const dummyData = {
      credentialId: 'Y3JlZF9pZA==', // base64 "cred_id"
      prfSalt: 'c2FsdA==', // base64 "salt"
      wrappedMasterKey: 'enc.v1.aXY=.Y2lwaGVydGV4dA==' // fake wrapped key
    };
    
    const unlocked = await unlockWithPasskey(dummyData);
    expect(unlocked).toBeNull();
  });
});
