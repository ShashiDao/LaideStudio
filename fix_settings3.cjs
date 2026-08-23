const fs = require('fs');
let content = fs.readFileSync('src/components/SettingsPanel.tsx', 'utf8');

content = content.replace(
  "const handleAddMcpServer = async (e: React.FormEvent) => {",
  "const handleAddMcpServer = async (e: React.FormEvent) => {\n    const { encryptData } = await import('../services/crypto');"
);

content = content.replace(
  "const handleRemoveMcpServer = async (url: string) => {",
  "const handleRemoveMcpServer = async (url: string) => {\n    const { encryptData } = await import('../services/crypto');"
);

content = content.replace(
  "const handleProfileSave = async (e: React.FormEvent) => {",
  "const handleProfileSave = async (e: React.FormEvent) => {\n    const { encryptData } = await import('../services/crypto');"
);

content = content.replace(
  "const handleEditProfile = async (p: ConnectionProfile) => {",
  "const handleEditProfile = async (p: ConnectionProfile) => {\n    const { decryptData } = await import('../services/crypto');"
);

content = content.replace(
  "const handleTestProfile = async (p: ConnectionProfile) => {",
  "const handleTestProfile = async (p: ConnectionProfile) => {\n    const { decryptData } = await import('../services/crypto');"
);

content = content.replace(
  "onSubmit={async (e) => {",
  "onSubmit={async (e) => {\n          const { encryptData } = await import('../services/crypto');"
);

fs.writeFileSync('src/components/SettingsPanel.tsx', content);
