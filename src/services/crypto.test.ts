import { describe, it, expect } from 'vitest';
import { 
  deriveKeys, 
  encryptData, 
  decryptData, 
  generateVerifier, 
  verifyPassphrase 
} from './crypto';

describe('Passphrase Crypto Engine', () => {
  it('should generate a verifier and verify a correct passphrase', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const passphrase = 'my-super-secret-passphrase';
    
    const keys1 = await deriveKeys(passphrase, salt);
    const verifier = await generateVerifier(keys1.hmacKey);
    
    // Simulate logging in again
    const keys2 = await deriveKeys(passphrase, salt);
    const isValid = await verifyPassphrase(keys2.hmacKey, verifier);
    
    expect(isValid).toBe(true);
  }, 10000);

  it('should fail to verify an incorrect passphrase', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keys1 = await deriveKeys('correct-pass', salt);
    const verifier = await generateVerifier(keys1.hmacKey);
    
    const keys2 = await deriveKeys('wrong-pass', salt);
    const isValid = await verifyPassphrase(keys2.hmacKey, verifier);
    
    expect(isValid).toBe(false);
  }, 10000);

  it('should encrypt and decrypt connection profile data round-trip', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keys = await deriveKeys('another-pass', salt);
    
    const secretApiKey = 'sk-ant-api03-abcdefg';
    const encrypted = await encryptData(keys.aesKey, secretApiKey);
    
    // Check format
    expect(encrypted.startsWith('enc.v1.')).toBe(true);
    expect(encrypted.split('.').length).toBe(4);
    
    const decrypted = await decryptData(keys.aesKey, encrypted);
    expect(decrypted).toBe(secretApiKey);
  }, 10000);

  it('should throw an error when decrypting with the wrong key', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keys1 = await deriveKeys('pass-1', salt);
    const keys2 = await deriveKeys('pass-2', salt);
    
    const encrypted = await encryptData(keys1.aesKey, 'secret-data');
    
    await expect(decryptData(keys2.aesKey, encrypted)).rejects.toThrow('Decryption failed: incorrect key or corrupted data');
  }, 10000);

  it('should reject invalid payload formats', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keys = await deriveKeys('pass', salt);
    
    await expect(decryptData(keys.aesKey, 'enc.v2.abc.def')).rejects.toThrow('Invalid encrypted payload format');
    await expect(decryptData(keys.aesKey, 'plain-text-data')).rejects.toThrow('Invalid encrypted payload format');
  });
});
