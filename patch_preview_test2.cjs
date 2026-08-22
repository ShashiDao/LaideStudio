const fs = require('fs');
let code = fs.readFileSync('src/components/PreviewPanel.test.tsx', 'utf-8');

code = code.replace(
  "const finalHtml = buildBundledHtml(bundledCode, indexHtml);",
  "const finalHtml = buildBundledHtml(escapeScriptClosingTags(bundledCode), indexHtml);"
);

fs.writeFileSync('src/components/PreviewPanel.test.tsx', code);
