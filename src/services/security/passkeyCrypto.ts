
import { arrayBufferToBase64, base64ToArrayBuffer } from './crypto';

export interface PasskeyData {
  credentialId: string;
  prfSalt: string;
  wrappedMasterKey: string;
}

/**
 * The WebAuthn PRF extension isn't yet part of TypeScript's DOM lib typings,
 * so we define its shape locally rather than casting through `any`.
 */
interface PrfExtensionResults {
  prf?: {
    enabled?: boolean;
    results?: {
      first?: ArrayBuffer;
      second?: ArrayBuffer;
    };
  };
}

export async function isPasskeyPrfSupported(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  try {
    const isAvailable = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return isAvailable;
  } catch {
    return false;
  }
}

async function deriveWrappingKey(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode('passkey-wrap')
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function enrollPasskey(masterKeyBytes: Uint8Array): Promise<PasskeyData | null> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return null;
  }

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const prfSalt = crypto.getRandomValues(new Uint8Array(32));

    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'LAIDE Studio', id: window.location.hostname },
        user: {
          id: userId,
          name: 'user@laide.local',
          displayName: 'LAIDE User'
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 }
        ],
        authenticatorSelection: {
          userVerification: 'required',
          residentKey: 'required',
          authenticatorAttachment: 'platform'
        },
        extensions: {
          prf: {
            eval: { first: prfSalt }
          }
        }
      }
    }) as PublicKeyCredential | null;

    if (!cred) return null;

    const extResults = cred.getClientExtensionResults() as PrfExtensionResults;
    if (!extResults.prf || !extResults.prf.enabled) {
      return null;
    }

    let prfOutput: ArrayBuffer;
    if (extResults.prf.results && extResults.prf.results.first) {
      prfOutput = extResults.prf.results.first;
    } else {
      // Some authenticators do not evaluate PRF on creation; we must assert to get the PRF output.
      const assertCred = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ id: cred.rawId, type: 'public-key' }],
          userVerification: 'required',
          extensions: { prf: { eval: { first: prfSalt } } }
        }
      }) as PublicKeyCredential | null;

      if (!assertCred) return null;
      const assertExt = assertCred.getClientExtensionResults() as PrfExtensionResults;
      if (!assertExt.prf || !assertExt.prf.results || !assertExt.prf.results.first) {
        return null;
      }
      prfOutput = assertExt.prf.results.first;
    }

    const wrappingKey = await deriveWrappingKey(prfOutput);
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      wrappingKey,
      masterKeyBytes
    );

    return {
      credentialId: arrayBufferToBase64(cred.rawId),
      prfSalt: arrayBufferToBase64(prfSalt.buffer),
      wrappedMasterKey: `enc.v1.${arrayBufferToBase64(iv.buffer)}.${arrayBufferToBase64(ciphertext)}`
    };
  } catch (e) {
    console.warn('Passkey enrollment failed or not supported:', e);
    return null;
  }
}

export async function unlockWithPasskey(passkeyData: PasskeyData): Promise<Uint8Array | null> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return null;
  }

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const credId = base64ToArrayBuffer(passkeyData.credentialId);
    const prfSalt = base64ToArrayBuffer(passkeyData.prfSalt);

    const cred = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: credId, type: 'public-key' }],
        userVerification: 'required',
        extensions: {
          prf: { eval: { first: prfSalt } }
        }
      }
    }) as PublicKeyCredential | null;

    if (!cred) return null;

    const extResults = cred.getClientExtensionResults() as PrfExtensionResults;
    if (!extResults.prf || !extResults.prf.results || !extResults.prf.results.first) {
      return null;
    }

    const wrappingKey = await deriveWrappingKey(extResults.prf.results.first);

    const parts = passkeyData.wrappedMasterKey.split('.');
    if (parts.length !== 4 || parts[0] !== 'enc' || parts[1] !== 'v1') {
      return null;
    }

    const iv = base64ToArrayBuffer(parts[2]);
    const ciphertext = base64ToArrayBuffer(parts[3]);

    const masterKeyBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      wrappingKey,
      ciphertext
    );

    return new Uint8Array(masterKeyBytes);
  } catch (e) {
    console.warn('Passkey unlock failed:', e);
    return null;
  }
}
