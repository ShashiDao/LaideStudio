import fs from 'fs';

const replacement = `let errStr = \`\${res.status} \${res.statusText || ''}\`.trim();
      try {
        const text = await res.text();
        try {
          const errObj = JSON.parse(text);
          errStr += \` - \${JSON.stringify(errObj.error || errObj)}\`;
        } catch {
          errStr += text ? \` - \${text}\` : '';
        }
      } catch {}`;

const search = `let errStr = res.statusText;
      try { const errObj = await res.json(); errStr = JSON.stringify(errObj.error || errObj); } catch {}`;

const files = [
  'src/services/llm/providers/openaiCompatible.ts',
  'src/services/llm/providers/google.ts',
  'src/services/llm/providers/anthropic.ts',
  'src/services/llm/providers/openai.ts'
];

for (const file of files) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    // Using simple replacement without complex regex because formatting is consistent
    content = content.replaceAll(search, replacement);
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
  }
}
