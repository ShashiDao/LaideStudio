const fs = require('fs');
let content = fs.readFileSync('src/components/LockScreen.tsx', 'utf8');

// Replace import
content = content.replace(
  "import { deriveKeys, generateVerifier, verifyPassphrase, importMasterKey, arrayBufferToBase64, base64ToArrayBuffer, type KeyMaterial } from '../services/crypto';",
  "import type { KeyMaterial } from '../services/crypto';"
);

// handlePasskeyUnlock
content = content.replace(
  "const handlePasskeyUnlock = async (c: LockConfig) => {",
  "const handlePasskeyUnlock = async (c: LockConfig) => {\n    const { importMasterKey } = await import('../services/crypto');"
);

// handleStartSetup
content = content.replace(
  "const handleStartSetup = async (e: React.FormEvent) => {",
  "const handleStartSetup = async (e: React.FormEvent) => {\n    const { deriveKeys, generateVerifier, arrayBufferToBase64 } = await import('../services/crypto');"
);

// handlePassphraseUnlock
content = content.replace(
  "const handlePassphraseUnlock = async (e: React.FormEvent) => {",
  "const handlePassphraseUnlock = async (e: React.FormEvent) => {\n    const { base64ToArrayBuffer, deriveKeys, verifyPassphrase } = await import('../services/crypto');"
);

// handleRecoveryUnlock
content = content.replace(
  "const handleRecoveryUnlock = async (e: React.FormEvent) => {",
  "const handleRecoveryUnlock = async (e: React.FormEvent) => {\n    const { importMasterKey } = await import('../services/crypto');"
);

fs.writeFileSync('src/components/LockScreen.tsx', content);
