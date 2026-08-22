import { describe, it, expect } from 'vitest';
import { 
  generateRecoveryPhrase, 
  validateRecoveryPhrase, 
  normalizeRecoveryPhrase,
  wrapMasterKey, 
  unwrapMasterKey, 
  createRecoveryBundle, 
  unlockWithRecoveryPhrase 
} from './recovery';
import { BIP39_WORDS } from './bip39Words';
import { deriveKeys, importMasterKey } from './crypto';

describe('Recovery Phrase & Master Key Wrapping', () => {
  it('should contain exactly 2048 unique BIP-39 words in wordlist', () => {
    expect(BIP39_WORDS.length).toBe(2048);
    const uniqueWords = new Set(BIP39_WORDS);
    expect(uniqueWords.size).toBe(2048);
  });

  it('should generate a 12-word phrase consisting of valid BIP-39 words', () => {
    const phrase = generateRecoveryPhrase(12);
    const words = phrase.split(' ');
    expect(words.length).toBe(12);
    
    const validation = validateRecoveryPhrase(phrase);
    expect(validation.valid).toBe(true);
    expect(validation.words?.length).toBe(12);
  });

  it('should correctly normalize and validate phrases with varied whitespace and case', () => {
    const phrase = '  abandon   ABSOLUTE   zoo  ';
    // Even if 3 words is invalid length, normalization works
    expect(normalizeRecoveryPhrase(phrase)).toBe('abandon absolute zoo');
  });

  it('should reject invalid phrases with wrong word counts or unknown words', () => {
    expect(validateRecoveryPhrase('abandon ability able').valid).toBe(false);
    expect(validateRecoveryPhrase('foobarbaz invalidword extra word count test non existent dictionary entry word item sample').valid).toBe(false);
  });

  it('should wrap and unwrap masterKeyBytes with AES-GCM', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keys = await deriveKeys('test-wrapping-pass', salt);
    
    const originalMasterKey = crypto.getRandomValues(new Uint8Array(64));
    const wrapped = await wrapMasterKey(keys.aesKey, originalMasterKey);
    
    expect(wrapped.startsWith('enc.v1.')).toBe(true);
    
    const unwrapped = await unwrapMasterKey(keys.aesKey, wrapped);
    expect(unwrapped).toEqual(originalMasterKey);
  });

  it('should complete full recovery bundle creation and unlock cycle', async () => {
    const primarySalt = crypto.getRandomValues(new Uint8Array(16));
    const primaryKeys = await deriveKeys('user-main-passphrase', primarySalt);
    
    // Generate recovery phrase
    const recoveryPhrase = generateRecoveryPhrase(12);
    
    // Create recovery bundle
    const recoveryData = await createRecoveryBundle(primaryKeys.masterKeyBytes, recoveryPhrase);
    expect(recoveryData.saltBase64).toBeDefined();
    expect(recoveryData.wrappedMasterKey).toBeDefined();
    expect(recoveryData.verifierBase64).toBeDefined();

    // Recover using exact phrase
    const recoveredBytes = await unlockWithRecoveryPhrase(recoveryData, recoveryPhrase);
    expect(recoveredBytes).not.toBeNull();
    expect(recoveredBytes).toEqual(primaryKeys.masterKeyBytes);

    // Verify the recovered master keys match original
    const recoveredKeys = await importMasterKey(recoveredBytes!);
    expect(recoveredKeys.masterKeyBytes).toEqual(primaryKeys.masterKeyBytes);
  }, 15000);

  it('should fail recovery if incorrect phrase is provided', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keys = await deriveKeys('pass', salt);
    
    const correctPhrase = generateRecoveryPhrase(12);
    const wrongPhrase = generateRecoveryPhrase(12);
    
    const recoveryData = await createRecoveryBundle(keys.masterKeyBytes, correctPhrase);
    
    const recovered = await unlockWithRecoveryPhrase(recoveryData, wrongPhrase);
    expect(recovered).toBeNull();
  }, 15000);
});
