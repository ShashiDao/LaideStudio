const fs = require('fs');

let content = fs.readFileSync('src/components/PreviewPanel.test.tsx', 'utf-8');

// I'll replace the last test with one that checks srcDoc instead of Blob
const newTest = `  it('exercises both paths via the React component to ensure literal </script> does not break HTML', async () => {
    // 1. Static fallback path
    const staticFiles = [
      {
        path: '/index.html',
        content: '<!DOCTYPE html><html><head></head><body><script src="./app.js"></script></body></html>',
        type: 'file',
        updatedAt: Date.now()
      },
      {
        path: '/app.js',
        content: 'const staticVar = "</script>";',
        type: 'file',
        updatedAt: Date.now()
      }
    ];
    
    const { unmount: unmountStatic } = render(<PreviewPanel files={staticFiles as any} />);
    
    await waitFor(() => {
      const iframe = screen.getByTitle('Preview') as HTMLIFrameElement;
      expect(iframe.srcDoc).toContain('const staticVar = "<\\\\/script>";');
    });
    
    unmountStatic();

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

    const { unmount: unmountBundled } = render(<PreviewPanel files={bundledFiles as any} />);
    
    await waitFor(() => {
      const iframe = screen.getByTitle('Preview') as HTMLIFrameElement;
      expect(iframe.srcDoc).toContain('const bundledVar = "<\\\\/script>";');
    }, { timeout: 10000 });

    unmountBundled();
  });`;

const regexToReplace = /it\('exercises both paths via the React component to ensure literal <\/script> does not break HTML', async \(\) => \{[\s\S]*?\}\);/g;

content = content.replace(regexToReplace, newTest);

fs.writeFileSync('src/components/PreviewPanel.test.tsx', content);
