const fs = require('fs');

// 2. passkeyCrypto.ts
let pc = fs.readFileSync('src/services/passkeyCrypto.ts', 'utf8');
pc = pc.replace(
  "export async function unlockWithPasskey(passkeyData: PasskeyData): Promise<ArrayBuffer | null> {",
  "export async function unlockWithPasskey(passkeyData: PasskeyData): Promise<ArrayBuffer | null> {\n  const { base64ToArrayBuffer } = await import('./crypto');"
);
fs.writeFileSync('src/services/passkeyCrypto.ts', pc);

// 3. recovery.ts
let rec = fs.readFileSync('src/services/recovery.ts', 'utf8');
rec = rec.replace(
  /export async function createRecoveryBundle\([\s\S]*?\) \{/,
  "$&" + "\n  const { deriveKeys, generateVerifier, arrayBufferToBase64, exportMasterKey } = await import('./crypto');"
);
rec = rec.replace(
  /export async function unlockWithRecoveryPhrase\([\s\S]*?\) \{/,
  "$&" + "\n  const { deriveKeys, verifyPassphrase, base64ToArrayBuffer } = await import('./crypto');"
);
fs.writeFileSync('src/services/recovery.ts', rec);

