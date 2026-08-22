import fs from 'fs';
const files = [
  'src/components/SettingsPanel.tsx',
  'src/services/llm/providers/anthropic.ts',
  'src/services/llm/providers/anthropic.test.ts',
  'src/services/llm/modelDiscovery.ts',
  'src/services/llm/modelDiscovery.test.ts'
];

for (const f of files) {
  let content = fs.readFileSync(f, 'utf8');
  content = content.replace(/claude-3-5-sonnet-20241022/g, 'claude-3-7-sonnet-20250219');
  fs.writeFileSync(f, content);
}
