const fs = require('fs');
let ls = fs.readFileSync('src/components/LockScreen.tsx', 'utf8');

ls = ls.replace(
  "const { deriveKeys, generateVerifier, arrayBufferToBase64 } = await import('../services/crypto');",
  "const { deriveKeys, generateVerifier } = await import('../services/crypto');"
);

fs.writeFileSync('src/components/LockScreen.tsx', ls);
