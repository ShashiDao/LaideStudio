const fs = require('fs');

const testContent = `// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { escapeScriptClosingTags, buildBundledHtml, PreviewPanel } from './PreviewPanel';
import * as esbuild from 'esbuild-wasm';
import { createVfsPlugin } from '../services/bundler/esbuild.worker';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

describe('PreviewPanel script injection sanitization', () => {
  it('escapes closing script tags case-insensitively in script code', () => {
    const raw = 'const a = "</script>"; const b = "</SCRIPT>"; const c = "</Script>"; const d = "</script type=";';
    const escaped = escapeScriptClosingTags(raw);
    expect(escaped).toBe('const a = "<\\\\/script>"; const b = "<\\\\/script>"; const c = "<\\\\/script>"; const d = "<\\\\/script type=";');
  });

  it('buildBundledHtml sanitizes code when index.html is provided', () => {
    const indexHtml = \`<!DOCTYPE html><html><head><title>App</title></head><body><div id="root"></div></body></html>\`;
    const code = \`
      const widget = "</script><script>alert('injected')</script>";
      console.log("Still inside module code:", widget);
    \`;
    const finalHtml = buildBundledHtml(code, indexHtml);

    expect(finalHtml).toContain('<\\\\/script>');
    
    const closingScriptTags = finalHtml.match(/<\\/script>/gi);
    expect(closingScriptTags?.length).toBe(1);

    const parser = new DOMParser();
    const doc = parser.parseFromString(finalHtml, 'text/html');
    const scripts = doc.querySelectorAll('script');
    expect(scripts.length).toBe(1);
    expect(scripts[0].getAttribute('type')).toBe('module');
    expect(scripts[0].textContent).toContain('Still inside module code:');
    expect(doc.getElementById('root')?.textContent?.trim()).toBe('');
  });

  it('buildBundledHtml sanitizes code when fallback index is used (no index.html)', () => {
    const code = \`
      const template = "<div></script><script>nested()</script></div>";
      window.__appLoaded = true;
    \`;
    const finalHtml = buildBundledHtml(code);

    expect(finalHtml).toContain('<\\\\/script>');
    const closingScriptTags = finalHtml.match(/<\\/script>/gi);
    expect(closingScriptTags?.length).toBe(1);

    const parser = new DOMParser();
    const doc = parser.parseFromString(finalHtml, 'text/html');
    const scripts = doc.querySelectorAll('script');
    expect(scripts.length).toBe(1);
    expect(scripts[0].textContent).toContain('window.__appLoaded = true;');
    expect(doc.getElementById('root')?.textContent?.trim()).toBe('');
  });

  it('regression test: bundles a fixture whose source contains literal "<script>x</script>" and builds safe finalHtml', async () => {
    const files = [
      {
        path: '/src/main.ts',
        content: \`
          export const snippet = '<script>x</script>';
          export const nextStatement = 'executed successfully';
        \`
      }
    ];

    const vfsPlugin = createVfsPlugin({
      files,
      entryPoint: '/src/main.ts'
    });

    const buildResult = await esbuild.build({
      entryPoints: ['/src/main.ts'],
      bundle: true,
      write: false,
      plugins: [vfsPlugin],
      format: 'esm'
    });

    expect(buildResult.errors.length).toBe(0);
    const bundledCode = buildResult.outputFiles![0].text;

    const indexHtml = '<!DOCTYPE html><html><head></head><body><div id="app"></div></body></html>';
    const finalHtml = buildBundledHtml(bundledCode, indexHtml);

    const lastClosingIndex = finalHtml.lastIndexOf('</script>');
    const firstClosingIndex = finalHtml.indexOf('</script>');
    expect(firstClosingIndex).toBe(lastClosingIndex);
    expect(finalHtml).toContain('<\\\\/script>');

    const parser = new DOMParser();
    const doc = parser.parseFromString(finalHtml, 'text/html');
    const scripts = doc.querySelectorAll('script');
    expect(scripts.length).toBe(1);
    expect(scripts[0].textContent).toContain('nextStatement');
    expect(doc.getElementById('app')?.textContent?.trim()).toBe('');
  });

  it('exercises both paths via the React component to ensure literal </script> does not break HTML', async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    let blobTexts: string[] = [];
    
    URL.createObjectURL = vi.fn((blob: Blob) => {
      // In a real environment blob.text() returns a promise. We can mock it.
      // But happy-dom might not support blob.text() fully. Let's just read it via FileReader or assume it works.
      blob.text().then((t: string) => blobTexts.push(t)).catch(() => {});
      return 'blob:fake-url-' + Math.random();
    });

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
      expect(blobTexts.some(t => t.includes('const staticVar = "<\\\\/script>";'))).toBe(true);
    });
    
    unmountStatic();
    blobTexts = [];

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
      expect(blobTexts.some(t => t.includes('const bundledVar = "<\\\\/script>";'))).toBe(true);
    }, { timeout: 10000 });

    unmountBundled();

    URL.createObjectURL = originalCreateObjectURL;
  });
});
`;

fs.writeFileSync('src/components/PreviewPanel.test.tsx', testContent);
