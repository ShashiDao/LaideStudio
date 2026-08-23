const fs = require('fs');
let content = fs.readFileSync('src/components/SettingsPanel.tsx', 'utf8');

// Replace import
content = content.replace("import { encryptData, decryptData } from '../services/crypto';\n", '');

// handleGithubSave
content = content.replace(
  "const handleGithubSave = async (e: React.FormEvent) => {",
  "const handleGithubSave = async (e: React.FormEvent) => {\n    const { encryptData } = await import('../services/crypto');"
);

// loadGithub
content = content.replace(
  "async function loadGithub() {",
  "async function loadGithub() {\n      const { decryptData } = await import('../services/crypto');"
);

// handleProviderSubmit
content = content.replace(
  "const handleProviderSubmit = async (e: React.FormEvent) => {",
  "const handleProviderSubmit = async (e: React.FormEvent) => {\n    const { encryptData } = await import('../services/crypto');"
);

// loadApiKeys
content = content.replace(
  "async function loadApiKeys() {",
  "async function loadApiKeys() {\n      const { decryptData } = await import('../services/crypto');"
);

fs.writeFileSync('src/components/SettingsPanel.tsx', content);
