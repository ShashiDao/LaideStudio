const fs = require('fs');
let content = fs.readFileSync('src/components/PreviewPanel.test.ts', 'utf-8');

const additionalImports = `
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { PreviewPanel } from './PreviewPanel';
import { vi } from 'vitest';
`;

content = content.replace("import { createVfsPlugin } from '../services/bundler/esbuild.worker';", "import { createVfsPlugin } from '../services/bundler/esbuild.worker';\n" + additionalImports);

const newTest = `
  it('exercises both paths via the React component to ensure literal </script> does not break the HTML', async () => {
    let createdHtml = '';
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      if (blob.type === 'text/html') {
        blob.text().then((text: string) => { createdHtml = text; });
      }
      return 'blob:fake-url';
    });

    // 1. Static fallback path
    const staticFiles = [
      {
        path: '/index.html',
        content: '<!DOCTYPE html><html><head></head><body><script>const staticVar = "</script>";</script></body></html>',
        type: 'file',
        updatedAt: Date.now()
      }
    ];
    const { unmount } = render(<PreviewPanel files={staticFiles as any} />);
    
    await waitFor(() => {
      expect(createdHtml).toContain('<\\\\/script>');
    });
    
    let closingTags = createdHtml.match(/<\\\\/script/gi);
    expect(closingTags?.length).toBe(1);
    unmount();

    createdHtml = ''; // Reset

    // 2. Bundled path
    const bundledFiles = [
      {
        path: '/package.json',
        content: '{"dependencies": {}}',
        type: 'file',
        updatedAt: Date.now()
      },
      {
        path: '/index.html',
        content: '<!DOCTYPE html><html><head></head><body><div id="root"></div><script type="module" src="/src/main.ts"></script></body></html>',
        type: 'file',
        updatedAt: Date.now()
      },
      {
        path: '/src/main.ts',
        content: 'const bundledVar = "</script>"; console.log(bundledVar);',
        type: 'file',
        updatedAt: Date.now()
      }
    ];

    render(<PreviewPanel files={bundledFiles as any} />);
    
    await waitFor(() => {
      expect(createdHtml).toContain('<\\\\/script>');
    }, { timeout: 5000 });

    closingTags = createdHtml.match(/<\\\\/script/gi);
    expect(closingTags?.length).toBe(1);

    URL.createObjectURL = originalCreateObjectURL;
  });
`;

content = content.replace(/}\);\s*$/, newTest + "\n});\n");
fs.writeFileSync('src/components/PreviewPanel.test.ts', content);
