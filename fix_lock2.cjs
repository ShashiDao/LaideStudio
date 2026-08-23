const fs = require('fs');
let content = fs.readFileSync('src/components/LockScreen.tsx', 'utf8');

content = content.replace(
  "const handleSetupConfirm = async () => {",
  "const handleSetupConfirm = async () => {\n    const { arrayBufferToBase64 } = await import('../services/crypto');"
);

content = content.replace(
  "const handleUnlock = async (e: React.FormEvent) => {",
  "const handleUnlock = async (e: React.FormEvent) => {\n    const { base64ToArrayBuffer, deriveKeys, verifyPassphrase } = await import('../services/crypto');"
);

fs.writeFileSync('src/components/LockScreen.tsx', content);
