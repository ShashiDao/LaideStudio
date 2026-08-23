const fs = require('fs');

let rec = fs.readFileSync('src/services/recovery.ts', 'utf8');

// Fix the mess at the end of recovery.ts
rec = rec.replace(
  "    if (!isValid) {  const { deriveKeys, verifyPassphrase, base64ToArrayBuffer } = await import('./crypto');  const { deriveKeys, generateVerifier, arrayBufferToBase64, exportMasterKey } = await import('./crypto');",
  "    if (!isValid) {"
);

// Inject wrapMasterKey
rec = rec.replace(
  "export async function wrapMasterKey(wrappingAesKey: CryptoKey, masterKeyBytes: Uint8Array): Promise<string> {",
  "export async function wrapMasterKey(wrappingAesKey: CryptoKey, masterKeyBytes: Uint8Array): Promise<string> {\n  const { arrayBufferToBase64 } = await import('./crypto');"
);

// Inject unwrapMasterKey
rec = rec.replace(
  "export async function unwrapMasterKey(wrappingAesKey: CryptoKey, wrappedPayload: string): Promise<Uint8Array> {",
  "export async function unwrapMasterKey(wrappingAesKey: CryptoKey, wrappedPayload: string): Promise<Uint8Array> {\n  const { base64ToArrayBuffer } = await import('./crypto');"
);

// Inject createRecoveryBundle
rec = rec.replace(
  "export async function createRecoveryBundle(\n  masterKeyBytes: Uint8Array,\n  recoveryPhrase: string\n): Promise<RecoveryData> {",
  "export async function createRecoveryBundle(\n  masterKeyBytes: Uint8Array,\n  recoveryPhrase: string\n): Promise<RecoveryData> {\n  const { deriveKeys, generateVerifier, arrayBufferToBase64 } = await import('./crypto');"
);

// Inject unlockWithRecoveryPhrase
rec = rec.replace(
  "export async function unlockWithRecoveryPhrase(\n  recoveryData: RecoveryData,\n  recoveryPhrase: string\n): Promise<Uint8Array | null> {",
  "export async function unlockWithRecoveryPhrase(\n  recoveryData: RecoveryData,\n  recoveryPhrase: string\n): Promise<Uint8Array | null> {\n  const { deriveKeys, verifyPassphrase, base64ToArrayBuffer } = await import('./crypto');"
);

fs.writeFileSync('src/services/recovery.ts', rec);

