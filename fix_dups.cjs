const fs = require('fs');
let pc = fs.readFileSync('src/services/passkeyCrypto.ts', 'utf8');
pc = pc.replace("  const { arrayBufferToBase64 } = await import('./crypto');\n  const { arrayBufferToBase64 } = await import('./crypto');", "  const { arrayBufferToBase64 } = await import('./crypto');");
pc = pc.replace("  const { base64ToArrayBuffer } = await import('./crypto');\n  const { base64ToArrayBuffer } = await import('./crypto');", "  const { base64ToArrayBuffer } = await import('./crypto');");
fs.writeFileSync('src/services/passkeyCrypto.ts', pc);

let rec = fs.readFileSync('src/services/recovery.ts', 'utf8');
rec = rec.replace("  const { deriveKeys, generateVerifier, arrayBufferToBase64 } = await import('./crypto');\n  const { deriveKeys, generateVerifier, arrayBufferToBase64 } = await import('./crypto');", "  const { deriveKeys, generateVerifier, arrayBufferToBase64 } = await import('./crypto');");
rec = rec.replace("  const { deriveKeys, verifyPassphrase, base64ToArrayBuffer } = await import('./crypto');\n  const { deriveKeys, verifyPassphrase, base64ToArrayBuffer } = await import('./crypto');", "  const { deriveKeys, verifyPassphrase, base64ToArrayBuffer } = await import('./crypto');");
fs.writeFileSync('src/services/recovery.ts', rec);

