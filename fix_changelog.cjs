const fs = require('fs');
let content = fs.readFileSync('AI_CHANGELOG.md', 'utf8');

content = content.replace(
  "- Phase: HOTFIX-30",
  "- Phase: HOTFIX-31"
);

const logEntry = `### [HOTFIX-31] Lazy-load crypto.ts, bundler.ts, and gpt-tokenizer for Vite code-splitting — 2026-08-23
Prompt: Change crypto.ts and bundler.ts to be dynamically imported everywhere to fix Vite chunk-splitting warnings. Lazy-load gpt-tokenizer in ChatPanel to prevent it from blocking the main chunk.
Files touched:
- \`src/App.tsx\` (modified)
- \`src/components/ChatPanel.tsx\` (modified)
- \`src/components/LockScreen.tsx\` (modified)
- \`src/components/SettingsPanel.tsx\` (modified)
- \`src/components/TerminalPanel.tsx\` (modified)
- \`src/components/PreviewPanel.tsx\` (modified)
- \`src/components/PreviewPanel.test.tsx\` (modified)
- \`src/services/bundler/testRunner.ts\` (modified)
- \`src/services/github/githubClient.ts\` (modified)
- \`src/services/llm/factory.ts\` (modified)
- \`src/services/passkeyCrypto.ts\` (modified)
- \`src/services/recovery.ts\` (modified)
Changed:
- Changed static imports of \`bundler.ts\` functions to dynamic \`await import\` across TerminalPanel and testRunner.
- Moved \`escapeScriptClosingTags\` implementation into PreviewPanel directly to remove the synchronous bundler import.
- Changed static imports of \`crypto.ts\` to dynamic \`await import\` in LockScreen, SettingsPanel, githubClient, llm/factory, passkeyCrypto, and recovery.
- Replaced the static \`gpt-tokenizer\` import in ChatPanel with a lazy \`await import\` in its async token updater.
Decisions: Made all production imports of these heavy dependencies dynamic so Vite correctly splits them into isolated manual chunks rather than inlining them into the main React bundle.
Deviations: none
Verified: \`npm run build\` output shows these modules and vendor chunks are correctly split. \`npm run lint\` passes. \`npm test\` passes.
Open questions: none

`;

content = content.replace("## Log\n", "## Log\n\n" + logEntry);
fs.writeFileSync('AI_CHANGELOG.md', content);
