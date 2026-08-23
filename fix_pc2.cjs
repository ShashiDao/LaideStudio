const fs = require('fs');
let pc = fs.readFileSync('src/services/passkeyCrypto.ts', 'utf8');

pc = pc.replace(
  "export async function unlockWithPasskey(passkeyData: PasskeyData): Promise<Uint8Array | null> {",
  "export async function unlockWithPasskey(passkeyData: PasskeyData): Promise<Uint8Array | null> {\n  const { base64ToArrayBuffer } = await import('./crypto');"
);

fs.writeFileSync('src/services/passkeyCrypto.ts', pc);
