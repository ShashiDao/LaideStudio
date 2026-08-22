import { BIP39_WORDS } from './bip39Words';
import { 
  deriveKeys, 
  generateVerifier, 
  verifyPassphrase, 
  arrayBufferToBase64, 
  base64ToArrayBuffer 
} from './crypto';

export interface RecoveryData {
  saltBase64: string;
  wrappedMasterKey: string;
  verifierBase64: string;
}

const wordSet = new Set(BIP39_WORDS);

/**
 * Generates a cryptographically secure BIP39-style recovery phrase (12 words by default).
 */
export function generateRecoveryPhrase(wordCount: number = 12): string {
  const randomIndices = new Uint16Array(wordCount);
  crypto.getRandomValues(randomIndices);
  
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    const idx = randomIndices[i] % BIP39_WORDS.length;
    words.push(BIP39_WORDS[idx]);
  }
  
  return words.join(' ');
}

/**
 * Normalizes user input recovery phrases (lowercases, removes extra whitespace).
 */
export function normalizeRecoveryPhrase(phrase: string): string {
  return phrase.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}

/**
 * Validates whether a recovery phrase consists of 12 valid BIP39 words.
 */
export function validateRecoveryPhrase(phrase: string): { valid: boolean; error?: string; words?: string[] } {
  const normalized = normalizeRecoveryPhrase(phrase);
  if (!normalized) {
    return { valid: false, error: 'Recovery phrase cannot be empty' };
  }

  const words = normalized.split(' ');
  if (words.length !== 12) {
    return { valid: false, error: `Expected 12 words, received ${words.length}` };
  }

  for (let i = 0; i < words.length; i++) {
    if (!wordSet.has(words[i])) {
      return { valid: false, error: `Word #${i + 1} ("${words[i]}") is not in the wordlist` };
    }
  }

  return { valid: true, words };
}

/**
 * Wraps raw master key bytes using an AES-GCM wrapping key.
 */
export async function wrapMasterKey(wrappingAesKey: CryptoKey, masterKeyBytes: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingAesKey,
    masterKeyBytes
  );

  const ivBase64 = arrayBufferToBase64(iv.buffer);
  const cipherBase64 = arrayBufferToBase64(ciphertext);

  return `enc.v1.${ivBase64}.${cipherBase64}`;
}

/**
 * Unwraps raw master key bytes using an AES-GCM wrapping key.
 */
export async function unwrapMasterKey(wrappingAesKey: CryptoKey, wrappedPayload: string): Promise<Uint8Array> {
  const parts = wrappedPayload.split('.');
  if (parts.length !== 4 || parts[0] !== 'enc' || parts[1] !== 'v1') {
    throw new Error('Invalid wrapped master key format');
  }

  const iv = base64ToArrayBuffer(parts[2]);
  const ciphertext = base64ToArrayBuffer(parts[3]);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      wrappingAesKey,
      ciphertext
    );
    return new Uint8Array(decrypted);
  } catch (_err) {
    throw new Error('Recovery unwrap failed: invalid key or corrupted payload', { cause: _err });
  }
}

/**
 * Derives a second wrapping key from the 12-word recovery phrase and creates a wrapped copy of masterKeyBytes.
 */
export async function createRecoveryBundle(
  masterKeyBytes: Uint8Array,
  recoveryPhrase: string
): Promise<RecoveryData> {
  const normalized = normalizeRecoveryPhrase(recoveryPhrase);
  const recoverySalt = crypto.getRandomValues(new Uint8Array(16));
  
  const recoveryKeys = await deriveKeys(normalized, recoverySalt);
  const verifier = await generateVerifier(recoveryKeys.hmacKey);
  const wrappedMasterKey = await wrapMasterKey(recoveryKeys.aesKey, masterKeyBytes);

  return {
    saltBase64: arrayBufferToBase64(recoverySalt.buffer),
    wrappedMasterKey,
    verifierBase64: verifier,
  };
}

/**
 * Attempts to unlock and recover masterKeyBytes using the user-entered 12-word phrase.
 */
export async function unlockWithRecoveryPhrase(
  recoveryData: RecoveryData,
  recoveryPhrase: string
): Promise<Uint8Array | null> {
  const normalized = normalizeRecoveryPhrase(recoveryPhrase);
  if (!normalized) return null;

  try {
    const salt = base64ToArrayBuffer(recoveryData.saltBase64);
    const recoveryKeys = await deriveKeys(normalized, new Uint8Array(salt));
    
    const isValid = await verifyPassphrase(recoveryKeys.hmacKey, recoveryData.verifierBase64);
    if (!isValid) {
      return null;
    }

    const masterKeyBytes = await unwrapMasterKey(recoveryKeys.aesKey, recoveryData.wrappedMasterKey);
    return masterKeyBytes;
  } catch (e) {
    console.warn('Recovery phrase unlock failed:', e);
    return null;
  }
}
