const fs = require('fs');

// 1. TerminalPanel.tsx
let term = fs.readFileSync('src/components/TerminalPanel.tsx', 'utf8');
term = term.replace("import { bundle } from '../services/bundler/bundler';\n", '');
term = term.replace(
  "const bundleCode = await bundle(files, entryPoint, (status) => {",
  "const { bundle } = await import('../services/bundler/bundler');\n              const bundleCode = await bundle(files, entryPoint, (status) => {"
);
fs.writeFileSync('src/components/TerminalPanel.tsx', term);

// 2. testRunner.ts
let tr = fs.readFileSync('src/services/bundler/testRunner.ts', 'utf8');
tr = tr.replace("import { bundle } from './bundler';\n", '');
tr = tr.replace(
  "const bundledCode = await bundle(buildFiles, '/_tests_entry.ts');",
  "const { bundle } = await import('./bundler');\n    const bundledCode = await bundle(buildFiles, '/_tests_entry.ts');"
);
fs.writeFileSync('src/services/bundler/testRunner.ts', tr);

// 3. PreviewPanel.tsx
let pp = fs.readFileSync('src/components/PreviewPanel.tsx', 'utf8');
pp = pp.replace("import { escapeScriptClosingTags } from '../services/bundler/bundler';\n", '');
pp = pp.replace(
  "const sanitizedContent = escapeScriptClosingTags(targetFile.content);",
  "const sanitizedContent = targetFile.content.replace(/<\\/script>/gi, '<\\\\/script>');"
);
fs.writeFileSync('src/components/PreviewPanel.tsx', pp);

// 4. PreviewPanel.test.tsx
let ppt = fs.readFileSync('src/components/PreviewPanel.test.tsx', 'utf8');
ppt = ppt.replace("import { escapeScriptClosingTags } from '../services/bundler/bundler';\n", '');
ppt = ppt.replace(/escapeScriptClosingTags\((.*?)\)/g, "$1.replace(/<\\/script>/gi, '<\\\\/script>')");
fs.writeFileSync('src/components/PreviewPanel.test.tsx', ppt);

