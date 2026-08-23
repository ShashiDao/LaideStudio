const fs = require('fs');

// SettingsPanel.tsx
let sp = fs.readFileSync('src/components/SettingsPanel.tsx', 'utf8');
sp = sp.replace(
  "const handleRemoveMcpServer = async (url: string) => {\n    const { encryptData } = await import('../services/crypto');",
  "const handleRemoveMcpServer = async (url: string) => {"
);
sp = sp.replace(
  "const enc = await encryptData(keys.aesKey, JSON.stringify(newServers));\n        localStorage.setItem('xiom_mcp_servers', enc);",
  "const { encryptData } = await import('../services/crypto');\n        const enc = await encryptData(keys.aesKey, JSON.stringify(newServers));\n        localStorage.setItem('xiom_mcp_servers', enc);"
);
// 327
sp = sp.replace(
  "const decrypted = await decryptData(keys.aesKey, p.encryptedApiKey);",
  "const { decryptData } = await import('../services/crypto');\n        const decrypted = await decryptData(keys.aesKey, p.encryptedApiKey);"
);
// 346
sp = sp.replace(
  "finalEncryptedKey = await encryptData(keys.aesKey, apiKey);",
  "const { encryptData } = await import('../services/crypto');\n      finalEncryptedKey = await encryptData(keys.aesKey, apiKey);"
);
// 394
sp = sp.replace(
  "const rawKey = await decryptData(keys.aesKey, p.encryptedApiKey);",
  "const { decryptData } = await import('../services/crypto');\n      const rawKey = await decryptData(keys.aesKey, p.encryptedApiKey);"
);
fs.writeFileSync('src/components/SettingsPanel.tsx', sp);

// githubClient.ts
let gc = fs.readFileSync('src/services/github/githubClient.ts', 'utf8');
gc = gc.replace(
  "async function getGitHubPat(keys: KeyMaterial): Promise<string | null> {",
  "async function getGitHubPat(keys: KeyMaterial): Promise<string | null> {\n  const { decryptData } = await import('../crypto');"
);
fs.writeFileSync('src/services/github/githubClient.ts', gc);

