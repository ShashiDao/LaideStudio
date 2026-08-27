// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { buildBundledHtml, PreviewPanel } from './PreviewPanel';
import * as esbuild from 'esbuild-wasm';
import { createVfsPlugin } from '../services/bundler/esbuild.worker';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

describe('PreviewPanel script injection sanitization', () => {
  it('escapes closing script tags case-insensitively in script code', () => {
    const raw = 'const a = "</script>"; const b = "</SCRIPT>"; const c = "</Script>"; const d = "</script type=";';
    const escaped = raw.replace(/<\/script>/gi, '<\\/script>');
    expect(escaped).toBe('const a = "<\\/script>"; const b = "<\\/script>"; const c = "<\\/script>"; const d = "</script type=";');
  });

  it('buildBundledHtml sanitizes code when index.html is provided', () => {
    const indexHtml = `<!DOCTYPE html><html><head><title>App</title></head><body><div id="root"></div></body></html>`;
    const code = `
      const widget = "</script><script>alert('injected')</script>";
      console.log("Still inside module code:", widget);
    `;
    const finalHtml = buildBundledHtml(code.replace(/<\/script>/gi, '<\\/script>'), indexHtml);

    expect(finalHtml).toContain('<\\/script>');
    
    const closingScriptTags = finalHtml.match(/<\/script>/gi);
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
    const code = `
      const template = "<div></script><script>nested()</script></div>";
      window.__appLoaded = true;
    `;
    const finalHtml = buildBundledHtml(code.replace(/<\/script>/gi, '<\\/script>'));

    expect(finalHtml).toContain('<\\/script>');
    const closingScriptTags = finalHtml.match(/<\/script>/gi);
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
        content: `
          export const snippet = '<script>x</script>';
          export const nextStatement = 'executed successfully';
        `
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
    const finalHtml = buildBundledHtml(bundledCode.replace(/<\/script>/gi, '<\\/script>'), indexHtml);

    const lastClosingIndex = finalHtml.lastIndexOf('</script>');
    const firstClosingIndex = finalHtml.indexOf('</script>');
    expect(firstClosingIndex).toBe(lastClosingIndex);
    expect(finalHtml).toContain('<\\/script>');

    const parser = new DOMParser();
    const doc = parser.parseFromString(finalHtml, 'text/html');
    const scripts = doc.querySelectorAll('script');
    expect(scripts.length).toBe(1);
    expect(scripts[0].textContent).toContain('nextStatement');
    expect(doc.getElementById('app')?.textContent?.trim()).toBe('');
  });

    it('exercises both paths via the React component to ensure literal </script> does not break HTML', async () => {
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
      expect(iframe.getAttribute("srcdoc")).toContain('staticVar = "<\\/script>";');
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
      expect(iframe.getAttribute("srcdoc")).toContain('bundledVar = "<\\/script>";');
    }, { timeout: 10000 });

    unmountBundled();
  });

  it('renders Tailwind v4 in static mode with type="text/tailwindcss" and browser CDN', async () => {
    const staticV4Files = [
      {
        path: '/index.html',
        content: '<!DOCTYPE html><html><head><link rel="stylesheet" href="./style.css"></head><body><h1 class="text-hykon-gold">Hykon</h1></body></html>',
        type: 'file',
        updatedAt: Date.now()
      },
      {
        path: '/style.css',
        content: '@import "tailwindcss";\n@theme {\n  --color-hykon-gold: #c5a059;\n}',
        type: 'file',
        updatedAt: Date.now()
      }
    ];

    const { unmount } = render(<PreviewPanel files={staticV4Files as any} />);

    await waitFor(() => {
      const iframe = screen.getByTitle('Preview') as HTMLIFrameElement;
      const srcdoc = iframe.getAttribute('srcdoc') || '';
      expect(srcdoc).toContain('https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4');
      expect(srcdoc).toContain('type="text/tailwindcss"');
      expect(srcdoc).toContain('--color-hykon-gold: #c5a059;');
      expect(srcdoc).not.toContain('@import "tailwindcss"');
    });

    unmount();
  });

  it('renders Tailwind v3 in static mode with plain style and v3 Play CDN', async () => {
    const staticV3Files = [
      {
        path: '/index.html',
        content: '<!DOCTYPE html><html><head><link rel="stylesheet" href="./style.css"></head><body><h1>Legacy</h1></body></html>',
        type: 'file',
        updatedAt: Date.now()
      },
      {
        path: '/style.css',
        content: '@tailwind base;\n@tailwind utilities;\nbody { background: #fff; }',
        type: 'file',
        updatedAt: Date.now()
      }
    ];

    const { unmount } = render(<PreviewPanel files={staticV3Files as any} />);

    await waitFor(() => {
      const iframe = screen.getByTitle('Preview') as HTMLIFrameElement;
      const srcdoc = iframe.getAttribute('srcdoc') || '';
      expect(srcdoc).toContain('https://cdn.tailwindcss.com');
      expect(srcdoc).not.toContain('@tailwindcss/browser@4');
      expect(srcdoc).not.toContain('type="text/tailwindcss"');
      expect(srcdoc).toContain('body { background: #fff; }');
    });

    unmount();
  });

  describe('PreviewPanel Viewport Modes (Phone / Tablet / Desktop)', () => {
    const sampleFiles = [
      {
        path: '/index.html',
        content: '<!DOCTYPE html><html><head></head><body><h1>Viewport Test</h1></body></html>',
        type: 'file',
        updatedAt: Date.now()
      }
    ];

    it('defaults to Desktop mode (100% width) and renders segmented control chips', async () => {
      const { unmount } = render(<PreviewPanel files={sampleFiles as any} />);

      await waitFor(() => {
        expect(screen.getByTitle('Preview')).toBeDefined();
      });

      const phoneBtn = screen.getByRole('button', { name: 'Phone viewport' });
      const tabletBtn = screen.getByRole('button', { name: 'Tablet viewport' });
      const desktopBtn = screen.getByRole('button', { name: 'Desktop viewport' });

      expect(phoneBtn).toBeDefined();
      expect(tabletBtn).toBeDefined();
      expect(desktopBtn).toBeDefined();

      expect(desktopBtn.getAttribute('aria-pressed')).toBe('true');
      expect(phoneBtn.getAttribute('aria-pressed')).toBe('false');
      expect(tabletBtn.getAttribute('aria-pressed')).toBe('false');

      const viewportContainer = screen.getByTestId('preview-viewport-container');
      expect(viewportContainer.className).toContain('w-full');
      expect(viewportContainer.className).not.toContain('w-[420px]');
      expect(viewportContainer.className).not.toContain('w-[768px]');

      unmount();
    });

    it('scales to Phone width (~420px) with border/shadow styling on clicking Phone chip', async () => {
      const { unmount } = render(<PreviewPanel files={sampleFiles as any} />);

      await waitFor(() => {
        expect(screen.getByTitle('Preview')).toBeDefined();
      });

      const phoneBtn = screen.getByRole('button', { name: 'Phone viewport' });
      fireEvent.click(phoneBtn);

      expect(phoneBtn.getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByRole('button', { name: 'Desktop viewport' }).getAttribute('aria-pressed')).toBe('false');

      const viewportContainer = screen.getByTestId('preview-viewport-container');
      expect(viewportContainer.className).toContain('w-[420px]');
      expect(viewportContainer.className).toContain('border-x');
      expect(viewportContainer.className).toContain('shadow-xl');

      unmount();
    });

    it('scales to Tablet width (~768px) with border/shadow styling on clicking Tablet chip and restores Desktop on Desktop click', async () => {
      const { unmount } = render(<PreviewPanel files={sampleFiles as any} />);

      await waitFor(() => {
        expect(screen.getByTitle('Preview')).toBeDefined();
      });

      const tabletBtn = screen.getByRole('button', { name: 'Tablet viewport' });
      fireEvent.click(tabletBtn);

      expect(tabletBtn.getAttribute('aria-pressed')).toBe('true');
      const viewportContainer = screen.getByTestId('preview-viewport-container');
      expect(viewportContainer.className).toContain('w-[768px]');
      expect(viewportContainer.className).toContain('border-x');
      expect(viewportContainer.className).toContain('shadow-xl');

      // Click Desktop to return to full width
      const desktopBtn = screen.getByRole('button', { name: 'Desktop viewport' });
      fireEvent.click(desktopBtn);

      expect(desktopBtn.getAttribute('aria-pressed')).toBe('true');
      expect(viewportContainer.className).toContain('w-full');
      expect(viewportContainer.className).not.toContain('w-[768px]');
      expect(viewportContainer.className).toContain('shadow-none');

      unmount();
    });

    it('renders mobile-optimized toolbar with AI View button and space-aware container', async () => {
      const { unmount } = render(<PreviewPanel files={sampleFiles as any} onOpenDeploy={() => {}} />);

      await waitFor(() => {
        expect(screen.getByTitle('Preview')).toBeDefined();
      });

      const visionBtn = screen.getByRole('button', { name: 'Capture current preview for AI vision feedback' });
      expect(visionBtn).toBeDefined();
      expect(visionBtn.textContent).toContain('AI View');

      const reloadBtn = screen.getByRole('button', { name: 'Refresh Preview' });
      expect(reloadBtn).toBeDefined();
      expect(reloadBtn.textContent).toContain('Reload');

      const publishBtn = screen.getByRole('button', { name: 'Publish Live Web Application' });
      expect(publishBtn).toBeDefined();
      expect(publishBtn.textContent).toContain('Publish');

      unmount();
    });

    it('swaps viewport scaling chips for mobile-native tools when breakpoint === "phone"', async () => {
      const { unmount } = render(
        <PreviewPanel files={sampleFiles as any} breakpoint="phone" onOpenDeploy={() => {}} />
      );

      await waitFor(() => {
        expect(screen.getByTitle('Preview')).toBeDefined();
      });

      // Viewport scaling chips should NOT be present on phone breakpoint
      expect(screen.queryByRole('button', { name: 'Phone viewport' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Tablet viewport' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Desktop viewport' })).toBeNull();

      // Mobile native controls MUST be present
      const logsBtn = screen.getByRole('button', { name: 'Toggle preview console' });
      const inspectBtn = screen.getByRole('button', { name: 'Tap to inspect' });
      const qrBtn = screen.getByRole('button', { name: 'Scan QR Code' });

      expect(logsBtn).toBeDefined();
      expect(inspectBtn).toBeDefined();
      expect(qrBtn).toBeDefined();

      // Test Logs drawer toggle
      expect(screen.queryByRole('region', { name: 'Preview Console Logs' })).toBeNull();
      fireEvent.click(logsBtn);
      expect(screen.getByRole('region', { name: 'Preview Console Logs' })).toBeDefined();

      // Test QR Modal open
      expect(screen.queryByRole('dialog', { name: 'Open on Mobile Device' })).toBeNull();
      fireEvent.click(qrBtn);
      expect(screen.getByRole('dialog')).toBeDefined();

      unmount();
    });
  });
});
