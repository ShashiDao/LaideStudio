const fs = require('fs');
let content = fs.readFileSync('AI_CHANGELOG.md', 'utf-8');

const newLog = `### [HOTFIX-26] Move script tag sanitization to bundler — 2026-08-22
Prompt: Move the </script> sanitization from PreviewPanel.tsx into src/services/bundler/bundler.ts, at the single point where bundle() returns its compiled code string — right before the return statement.
Files touched:
- \`src/services/bundler/bundler.ts\` (modified)
- \`src/components/PreviewPanel.tsx\` (modified)
- \`src/components/PreviewPanel.test.tsx\` (modified)
- \`src/services/bundler/bundler.test.ts\` (modified)
Changed:
- Moved \`escapeScriptClosingTags\` to \`bundler.ts\` and applied it directly to the output string of \`bundle()\`.
- Refactored \`PreviewPanel.tsx\` to remove its local instance of \`escapeScriptClosingTags\`.
- Adjusted \`PreviewPanel.test.tsx\` to handle the refactored code without assuming sanitization inside \`buildBundledHtml\`.
- Added unit tests in \`bundler.test.ts\` to verify that literal \`</script>\` tags in source code are properly escaped before the string is returned.
Decisions: Moving sanitization to the bundler guarantees that any downstream consumer of \`bundle()\` is protected against XSS-like structural breaking.
Deviations: None.
Verified: All tests passed (\`PreviewPanel.test.tsx\` and \`bundler.test.ts\`).

`;

content = content.replace("## Log\n\n", "## Log\n\n" + newLog);
fs.writeFileSync('AI_CHANGELOG.md', content);
