const fs = require('fs');
let ls = fs.readFileSync('src/components/LockScreen.tsx', 'utf8');
ls = ls.replace(
  "const handleSetupConfirm = async () => {\n    if (!pendingSetup) return;",
  "const handleSetupConfirm = async () => {\n    if (!pendingSetup) return;\n    const { arrayBufferToBase64 } = await import('../services/crypto');"
);
fs.writeFileSync('src/components/LockScreen.tsx', ls);
