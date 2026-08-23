const fs = require('fs');
let content = fs.readFileSync('src/services/github/githubClient.ts', 'utf8');

content = content.replace(
  "import { decryptData, type KeyMaterial } from '../crypto';",
  "import type { KeyMaterial } from '../crypto';"
);

content = content.replace(
  "async function getPat(keys: KeyMaterial): Promise<string | null> {",
  "async function getPat(keys: KeyMaterial): Promise<string | null> {\n  const { decryptData } = await import('../crypto');"
);

fs.writeFileSync('src/services/github/githubClient.ts', content);
