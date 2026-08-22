import { describe, it, expect } from 'vitest';
import { detectBundledProject, DEFAULT_EXPECTED_ENTRIES } from './entryDetection';
import type { FileItem } from '../../db';

function makeFiles(records: Array<{ path: string; content?: string }>): FileItem[] {
  return records.map((r, i) => ({
    id: `file-${i}`,
    projectId: 'test-project',
    path: r.path,
    content: r.content ?? '',
    updatedAt: Date.now()
  }));
}

describe('detectBundledProject', () => {
  it('identifies static projects with no bundler dependencies', () => {
    const files = makeFiles([
      { path: '/index.html', content: '<h1>Hello</h1>' },
      { path: '/styles.css', content: 'body { margin: 0; }' }
    ]);
    const info = detectBundledProject(files);
    expect(info.isBundled).toBe(false);
    expect(info.entryPoint).toBeNull();
  });

  it('detects React / Vite projects and resolves standard entry', () => {
    const files = makeFiles([
      {
        path: '/package.json',
        content: JSON.stringify({
          dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
          devDependencies: { vite: '^5.0.0' }
        })
      },
      { path: '/src/main.tsx', content: 'console.log("react app");' },
      { path: '/index.html', content: '<div id="root"></div>' }
    ]);
    const info = detectBundledProject(files);
    expect(info.isBundled).toBe(true);
    expect(info.entryPoint).toBe('/src/main.tsx');
  });

  it('detects Vue projects and resolves entry point', () => {
    const files = makeFiles([
      {
        path: '/package.json',
        content: JSON.stringify({
          dependencies: { vue: '^3.4.0' }
        })
      },
      { path: '/src/main.js', content: 'import { createApp } from "vue";' }
    ]);
    const info = detectBundledProject(files);
    expect(info.isBundled).toBe(true);
    expect(info.entryPoint).toBe('/src/main.js');
  });

  it('detects Svelte projects via dependencies', () => {
    const files = makeFiles([
      {
        path: '/package.json',
        content: JSON.stringify({
          devDependencies: { svelte: '^4.0.0', '@sveltejs/vite-plugin-svelte': '^3.0.0' }
        })
      },
      { path: '/src/main.svelte', content: '<script></script>' }
    ]);
    const info = detectBundledProject(files);
    expect(info.isBundled).toBe(true);
    expect(info.entryPoint).toBe('/src/main.svelte');
  });

  it('detects Solid-js projects via dependencies', () => {
    const files = makeFiles([
      {
        path: '/package.json',
        content: JSON.stringify({
          dependencies: { 'solid-js': '^1.8.0' },
          devDependencies: { 'vite-plugin-solid': '^2.8.0' }
        })
      },
      { path: '/src/index.tsx', content: 'import { render } from "solid-js/web";' }
    ]);
    const info = detectBundledProject(files);
    expect(info.isBundled).toBe(true);
    expect(info.entryPoint).toBe('/src/index.tsx');
  });

  it('detects Vite config file presence even without package.json', () => {
    const files = makeFiles([
      { path: '/vite.config.ts', content: 'export default {}' },
      { path: '/src/main.ts', content: 'console.log("vite");' }
    ]);
    const info = detectBundledProject(files);
    expect(info.isBundled).toBe(true);
    expect(info.entryPoint).toBe('/src/main.ts');
  });

  it('parses explicit build.rollupOptions.input from vite.config.ts', () => {
    const files = makeFiles([
      {
        path: '/vite.config.ts',
        content: `
          import { defineConfig } from 'vite';
          export default defineConfig({
            build: {
              rollupOptions: {
                input: '/custom/entry-point.tsx'
              }
            }
          });
        `
      },
      { path: '/custom/entry-point.tsx', content: 'console.log("custom entry");' }
    ]);
    const info = detectBundledProject(files);
    expect(info.isBundled).toBe(true);
    expect(info.entryPoint).toBe('/custom/entry-point.tsx');
  });

  it('parses explicit input object map in vite.config.js', () => {
    const files = makeFiles([
      {
        path: '/vite.config.js',
        content: `
          export default {
            build: {
              rollupOptions: {
                input: {
                  app: './src/custom-app.js'
                }
              }
            }
          }
        `
      },
      { path: '/src/custom-app.js', content: 'console.log("custom app");' }
    ]);
    const info = detectBundledProject(files);
    expect(info.isBundled).toBe(true);
    expect(info.entryPoint).toBe('/src/custom-app.js');
  });

  it('resolves explicit root and entry in vite.config.ts', () => {
    const files = makeFiles([
      {
        path: '/vite.config.ts',
        content: `
          export default {
            root: 'client',
            build: {
              rollupOptions: {
                input: 'main.ts'
              }
            }
          }
        `
      },
      { path: '/client/main.ts', content: 'console.log("client main");' }
    ]);
    const info = detectBundledProject(files);
    expect(info.isBundled).toBe(true);
    expect(info.entryPoint).toBe('/client/main.ts');
  });

  it('resolves entry point referenced by script module in index.html', () => {
    const files = makeFiles([
      {
        path: '/package.json',
        content: JSON.stringify({ dependencies: { react: '^18.0.0' } })
      },
      {
        path: '/index.html',
        content: '<!DOCTYPE html><html><body><script type="module" src="/src/app-bootstrap.tsx"></script></body></html>'
      },
      { path: '/src/app-bootstrap.tsx', content: 'console.log("bootstrap");' }
    ]);
    const info = detectBundledProject(files);
    expect(info.isBundled).toBe(true);
    expect(info.entryPoint).toBe('/src/app-bootstrap.tsx');
  });

  it('returns isBundled: true and entryPoint: null when bundled project has no valid entry point', () => {
    const files = makeFiles([
      {
        path: '/package.json',
        content: JSON.stringify({ dependencies: { react: '^18.0.0' } })
      },
      { path: '/README.md', content: '# Project' }
    ]);
    const info = detectBundledProject(files);
    expect(info.isBundled).toBe(true);
    expect(info.entryPoint).toBeNull();
    expect(info.expectedEntries).toEqual(DEFAULT_EXPECTED_ENTRIES);
  });
});
