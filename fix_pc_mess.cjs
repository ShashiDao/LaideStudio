const fs = require('fs');

let pc = fs.readFileSync('src/services/passkeyCrypto.ts', 'utf8');

// The error was: 
// src/services/passkeyCrypto.ts(127,20): error TS2304: Cannot find name 'base64ToArrayBuffer'.
// Let's inject it into unlockWithPasskey again! Wait, I tried before, it didn't match.

pc = pc.replace(
  "export async function unlockWithPasskey(passkeyData: PasskeyData): Promise<Uint8Array | null> {",
  "export async function unlockWithPasskey(passkeyData: PasskeyData): Promise<Uint8Array | null> {\n  const { base64ToArrayBuffer } = await import('./crypto');"
);
// And let's replace arrayBufferToBase64 in enrollPasskey. Wait, did I inject it correctly?
pc = pc.replace(
  "export async function enrollPasskey(masterKeyBytes: Uint8Array): Promise<PasskeyData | null> {",
  "export async function enrollPasskey(masterKeyBytes: Uint8Array): Promise<PasskeyData | null> {\n  const { arrayBufferToBase64 } = await import('./crypto');"
);

fs.writeFileSync('src/services/passkeyCrypto.ts', pc);

