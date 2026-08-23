const fs = require('fs');
let rec = fs.readFileSync('src/services/recovery.ts', 'utf8');

rec = rec.replace(/if \(\!isValid\) \{\s*const \{ deriveKeys, verifyPassphrase, base64ToArrayBuffer \} = await import\('\.\/crypto'\);\s*const \{ deriveKeys, generateVerifier, arrayBufferToBase64, exportMasterKey \} = await import\('\.\/crypto'\);/g, "if (!isValid) {");

fs.writeFileSync('src/services/recovery.ts', rec);

