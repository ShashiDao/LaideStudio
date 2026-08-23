const fs = require('fs');
let content = fs.readFileSync('src/services/recovery.ts', 'utf8');

content = content.replace(
  "import {\n  deriveKeys,\n  exportMasterKey,\n  importMasterKey,\n  arrayBufferToBase64,\n  base64ToArrayBuffer\n} from './crypto';",
  ""
);

content = content.replace(
  "export async function createRecoveryBundle(masterKey: KeyMaterial): Promise<{ phrase: string, data: RecoveryData }> {",
  "export async function createRecoveryBundle(masterKey: KeyMaterial): Promise<{ phrase: string, data: RecoveryData }> {\n  const { deriveKeys, exportMasterKey, arrayBufferToBase64 } = await import('./crypto');"
);

content = content.replace(
  "export async function unlockWithRecoveryPhrase(recoveryData: RecoveryData, phrase: string): Promise<ArrayBuffer | null> {",
  "export async function unlockWithRecoveryPhrase(recoveryData: RecoveryData, phrase: string): Promise<ArrayBuffer | null> {\n  const { deriveKeys, base64ToArrayBuffer } = await import('./crypto');"
);

fs.writeFileSync('src/services/recovery.ts', content);
