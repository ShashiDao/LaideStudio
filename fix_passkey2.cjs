const fs = require('fs');
let content = fs.readFileSync('src/services/passkeyCrypto.ts', 'utf8');

content = content.replace(
  "export async function enrollPasskey(masterKeyBytes: Uint8Array): Promise<PasskeyData | null> {",
  "export async function enrollPasskey(masterKeyBytes: Uint8Array): Promise<PasskeyData | null> {\n  const { arrayBufferToBase64 } = await import('./crypto');"
);

fs.writeFileSync('src/services/passkeyCrypto.ts', content);
