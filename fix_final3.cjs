const fs = require('fs');

// 1. LockScreen.tsx
let ls = fs.readFileSync('src/components/LockScreen.tsx', 'utf8');
ls = ls.replace(
  "const finalizeSetup = async (passkeyData: PasskeyData | null) => {\n    if (!pendingSetup) return;",
  "const finalizeSetup = async (passkeyData: PasskeyData | null) => {\n    const { arrayBufferToBase64 } = await import('../services/crypto');\n    if (!pendingSetup) return;"
);
fs.writeFileSync('src/components/LockScreen.tsx', ls);

// 2. passkeyCrypto.ts
let pc = fs.readFileSync('src/services/passkeyCrypto.ts', 'utf8');
pc = pc.replace(
  "export async function unlockWithPasskey(passkeyData: PasskeyData): Promise<ArrayBuffer | null> {",
  "export async function unlockWithPasskey(passkeyData: PasskeyData): Promise<ArrayBuffer | null> {\n  const { base64ToArrayBuffer } = await import('./crypto');"
);
fs.writeFileSync('src/services/passkeyCrypto.ts', pc);

// 3. recovery.ts
let rec = fs.readFileSync('src/services/recovery.ts', 'utf8');
rec = rec.replace(
  "export async function createRecoveryBundle(masterKey: KeyMaterial): Promise<{ phrase: string, data: RecoveryData }> {",
  "export async function createRecoveryBundle(masterKey: KeyMaterial): Promise<{ phrase: string, data: RecoveryData }> {\n  const { deriveKeys, generateVerifier, arrayBufferToBase64, exportMasterKey } = await import('./crypto');"
);
rec = rec.replace(
  "export async function unlockWithRecoveryPhrase(recoveryData: RecoveryData, phrase: string): Promise<ArrayBuffer | null> {",
  "export async function unlockWithRecoveryPhrase(recoveryData: RecoveryData, phrase: string): Promise<ArrayBuffer | null> {\n  const { deriveKeys, verifyPassphrase, base64ToArrayBuffer } = await import('./crypto');"
);
fs.writeFileSync('src/services/recovery.ts', rec);

