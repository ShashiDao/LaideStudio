const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf-8');

// Add import
content = content.replace(
  "import { TopStrip } from './components/TopStrip';",
  "import { TopStrip } from './components/TopStrip';\nimport { ErrorBoundary } from './components/ErrorBoundary';"
);

// Wrap PreviewPanel
content = content.replace(
  "{activeTab === 'preview' && (\n            <PreviewPanel files={files} />\n          )}",
  "{activeTab === 'preview' && (\n            <ErrorBoundary resetKey={activeProject?.id}>\n              <PreviewPanel files={files} />\n            </ErrorBoundary>\n          )}"
);

fs.writeFileSync('src/App.tsx', content);
