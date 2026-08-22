export interface KeyMaterial {
  aesKey: CryptoKey;
  hmacKey: CryptoKey;
  masterKeyBytes: Uint8Array;
}

const PBKDF2_ITERATIONS = 600000;
const VERIFIER_MESSAGE = "XIOM_APP_VERIFIER";

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function importMasterKey(masterKeyBytes: Uint8Array): Promise<KeyMaterial> {
  const aesKeyBytes = masterKeyBytes.slice(0, 32);
  const hmacKeyBytes = masterKeyBytes.slice(32, 64);

  const aesKey = await crypto.subtle.importKey(
    'raw',
    aesKeyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );

  const hmacKey = await crypto.subtle.importKey(
    'raw',
    hmacKeyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );

  return { aesKey, hmacKey, masterKeyBytes };
}

export async function deriveKeys(passphrase: string, salt: Uint8Array): Promise<KeyMaterial> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    baseKey,
    512 // 256 bits for AES and 256 bits for HMAC = 512 bits total
  );

  return importMasterKey(new Uint8Array(bits));
}

export async function generateVerifier(hmacKey: CryptoKey): Promise<string> {
  const enc = new TextEncoder();
  const signature = await crypto.subtle.sign(
    'HMAC',
    hmacKey,
    enc.encode(VERIFIER_MESSAGE)
  );
  return arrayBufferToBase64(signature);
}

export async function verifyPassphrase(hmacKey: CryptoKey, storedVerifierBase64: string): Promise<boolean> {
  const enc = new TextEncoder();
  try {
    const signature = base64ToArrayBuffer(storedVerifierBase64);
    const isValid = await crypto.subtle.verify(
      'HMAC',
      hmacKey,
      signature,
      enc.encode(VERIFIER_MESSAGE)
    );
    return isValid;
  } catch {
    return false;
  }
}

export async function encryptData(aesKey: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    aesKey,
    enc.encode(plaintext)
  );

  const ivBase64 = arrayBufferToBase64(iv.buffer);
  const cipherBase64 = arrayBufferToBase64(ciphertext);

  return `enc.v1.${ivBase64}.${cipherBase64}`;
}

export async function decryptData(aesKey: CryptoKey, encryptedPayload: string): Promise<string> {
  const parts = encryptedPayload.split('.');
  if (parts.length !== 4 || parts[0] !== 'enc' || parts[1] !== 'v1') {
    throw new Error('Invalid encrypted payload format. Expected enc.v1.<iv>.<ciphertext>');
  }

  const iv = base64ToArrayBuffer(parts[2]);
  const ciphertext = base64ToArrayBuffer(parts[3]);

  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(iv)
      },
      aesKey,
      ciphertext
    );

    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (err) {
    throw new Error('Decryption failed: incorrect key or corrupted data', { cause: err });
  }
}
