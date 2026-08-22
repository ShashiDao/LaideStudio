const fs = require('fs');
let code = fs.readFileSync('src/components/PreviewPanel.test.tsx', 'utf-8');

// 1. Fix imports
code = code.replace("import { escapeScriptClosingTags, buildBundledHtml, PreviewPanel } from './PreviewPanel';", "import { buildBundledHtml, PreviewPanel } from './PreviewPanel';\nimport { escapeScriptClosingTags } from '../services/bundler/bundler';");

// 2. Fix the buildBundledHtml tests
code = code.replace(
  "const finalHtml = buildBundledHtml(code, indexHtml);",
  "const finalHtml = buildBundledHtml(escapeScriptClosingTags(code), indexHtml);"
);

code = code.replace(
  "const finalHtml = buildBundledHtml(code);",
  "const finalHtml = buildBundledHtml(escapeScriptClosingTags(code));"
);

fs.writeFileSync('src/components/PreviewPanel.test.tsx', code);
