const fs = require('fs');
let content = fs.readFileSync('src/services/passkeyCrypto.ts', 'utf8');

content = content.replace("import { arrayBufferToBase64, base64ToArrayBuffer } from './crypto';\n", '');

content = content.replace(
  "export async function enrollPasskey(masterKey: KeyMaterial): Promise<PasskeyData | null> {",
  "export async function enrollPasskey(masterKey: KeyMaterial): Promise<PasskeyData | null> {\n  const { arrayBufferToBase64 } = await import('./crypto');"
);

content = content.replace(
  "export async function unlockWithPasskey(passkeyData: PasskeyData): Promise<ArrayBuffer | null> {",
  "export async function unlockWithPasskey(passkeyData: PasskeyData): Promise<ArrayBuffer | null> {\n  const { base64ToArrayBuffer } = await import('./crypto');"
);

fs.writeFileSync('src/services/passkeyCrypto.ts', content);
