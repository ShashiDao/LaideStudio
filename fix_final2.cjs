const fs = require('fs');

// 1. passkeyCrypto.ts
let pc = fs.readFileSync('src/services/passkeyCrypto.ts', 'utf8');
pc = pc.replace(
  "export async function unlockWithPasskey(passkeyData: PasskeyData): Promise<ArrayBuffer | null> {\n  try {",
  "export async function unlockWithPasskey(passkeyData: PasskeyData): Promise<ArrayBuffer | null> {\n  const { base64ToArrayBuffer } = await import('./crypto');\n  try {"
);
fs.writeFileSync('src/services/passkeyCrypto.ts', pc);

// 2. recovery.ts
let rec = fs.readFileSync('src/services/recovery.ts', 'utf8');
rec = rec.replace(
  "export async function createRecoveryBundle(\n  masterKey: KeyMaterial\n): Promise<{ phrase: string, data: RecoveryData }> {\n  const phrase = generateRecoveryPhrase();",
  "export async function createRecoveryBundle(\n  masterKey: KeyMaterial\n): Promise<{ phrase: string, data: RecoveryData }> {\n  const { deriveKeys, generateVerifier, arrayBufferToBase64, exportMasterKey } = await import('./crypto');\n  const phrase = generateRecoveryPhrase();"
);
rec = rec.replace(
  "export async function unlockWithRecoveryPhrase(\n  recoveryData: RecoveryData,\n  phrase: string\n): Promise<ArrayBuffer | null> {\n  if (!validateRecoveryPhrase(phrase)) {",
  "export async function unlockWithRecoveryPhrase(\n  recoveryData: RecoveryData,\n  phrase: string\n): Promise<ArrayBuffer | null> {\n  const { deriveKeys, verifyPassphrase, base64ToArrayBuffer } = await import('./crypto');\n  if (!validateRecoveryPhrase(phrase)) {"
);
fs.writeFileSync('src/services/recovery.ts', rec);

