const fs = require('fs');
let content = fs.readFileSync('src/services/llm/factory.ts', 'utf8');

content = content.replace(
  "import { decryptData } from '../crypto';",
  ""
);

content = content.replace(
  "export async function createLLMAdapter(profile: ConnectionProfile, aesKey: CryptoKey): Promise<LLMAdapter> {",
  "export async function createLLMAdapter(profile: ConnectionProfile, aesKey: CryptoKey): Promise<LLMAdapter> {\n  const { decryptData } = await import('../crypto');"
);

fs.writeFileSync('src/services/llm/factory.ts', content);
