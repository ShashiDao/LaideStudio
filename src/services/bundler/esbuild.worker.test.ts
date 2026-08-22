import { describe, it, expect, vi } from 'vitest';
import * as esbuild from 'esbuild';
import { 
  stripTailwindDirectives, 
  createCssJsSnippet, 
  createVfsPlugin,
  extractDependenciesFromFiles,
  parsePackageSpecifier
} from './esbuild.worker';
import { injectTailwindScriptIntoHtml, detectProjectTailwindVersion } from '../../components/PreviewPanel';

describe('esbuild.worker bundler plugins and loaders', () => {
  describe('extractDependenciesFromFiles', () => {
    it('extracts combined dependencies, devDependencies, and peerDependencies from package.json', () => {
      const files = [
        {
          path: '/package.json',
          content: JSON.stringify({
            dependencies: { 'lucide-react': '^0.300.0', react: '18.2.0' },
            devDependencies: { typescript: '^5.0.0' },
            peerDependencies: { 'react-dom': '18.2.0' }
          })
        }
      ];
      const deps = extractDependenciesFromFiles(files);
      expect(deps).toEqual({
        'lucide-react': '^0.300.0',
        react: '18.2.0',
        typescript: '^5.0.0',
        'react-dom': '18.2.0'
      });
    });

    it('returns empty object if package.json is missing or corrupted', () => {
      expect(extractDependenciesFromFiles([])).toEqual({});
      expect(extractDependenciesFromFiles([{ path: '/package.json', content: 'invalid json' }])).toEqual({});
    });
  });

  describe('parsePackageSpecifier', () => {
    it('parses regular packages without subpath', () => {
      expect(parsePackageSpecifier('react')).toEqual({ packageName: 'react', subpath: '' });
      expect(parsePackageSpecifier('lucide-react')).toEqual({ packageName: 'lucide-react', subpath: '' });
    });

    it('parses regular packages with subpaths', () => {
      expect(parsePackageSpecifier('lodash/cloneDeep')).toEqual({ packageName: 'lodash', subpath: '/cloneDeep' });
      expect(parsePackageSpecifier('date-fns/locale/en-US')).toEqual({ packageName: 'date-fns', subpath: '/locale/en-US' });
    });

    it('parses scoped packages with and without subpaths', () => {
      expect(parsePackageSpecifier('@heroicons/react')).toEqual({ packageName: '@heroicons/react', subpath: '' });
      expect(parsePackageSpecifier('@heroicons/react/24/outline')).toEqual({ packageName: '@heroicons/react', subpath: '/24/outline' });
      expect(parsePackageSpecifier('@tanstack/react-query/build/lib')).toEqual({ packageName: '@tanstack/react-query', subpath: '/build/lib' });
    });
  });
  describe('stripTailwindDirectives', () => {
    it('strips @import "tailwindcss" and detects tailwind v4', () => {
      const input = `@import "tailwindcss";\n\nbody { color: #111; }`;
      const { stripped, hasTailwind, version } = stripTailwindDirectives(input);
      expect(hasTailwind).toBe(true);
      expect(version).toBe('v4');
      expect(stripped).not.toContain('@import "tailwindcss"');
      expect(stripped).toContain('body { color: #111; }');
    });

    it('strips single-quoted @import \'tailwindcss\' without semicolon and detects v4', () => {
      const input = `@import 'tailwindcss'\n.btn { padding: 4px; }`;
      const { stripped, hasTailwind, version } = stripTailwindDirectives(input);
      expect(hasTailwind).toBe(true);
      expect(version).toBe('v4');
      expect(stripped).not.toContain('@import \'tailwindcss\'');
      expect(stripped).toContain('.btn { padding: 4px; }');
    });

    it('preserves @theme blocks for Tailwind v4 custom tokens (Hykon Trekkers pattern)', () => {
      const input = `@import "tailwindcss";\n\n@theme {\n  --color-hykon-gold: #c5a059;\n  --font-hykon-display: "Clash Display", sans-serif;\n}\n\n.card {\n  color: var(--color-hykon-gold);\n}`;
      const { stripped, hasTailwind, version } = stripTailwindDirectives(input);
      expect(hasTailwind).toBe(true);
      expect(version).toBe('v4');
      expect(stripped).not.toContain('@import "tailwindcss"');
      expect(stripped).toContain('@theme {');
      expect(stripped).toContain('--color-hykon-gold: #c5a059;');
      expect(stripped).toContain('--font-hykon-display: "Clash Display", sans-serif;');
      expect(stripped).toContain('.card {\n  color: var(--color-hykon-gold);\n}');
    });

    it('strips legacy @tailwind base/components/utilities directives and detects v3', () => {
      const input = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\nh1 { font-size: 2rem; }`;
      const { stripped, hasTailwind, version } = stripTailwindDirectives(input);
      expect(hasTailwind).toBe(true);
      expect(version).toBe('v3');
      expect(stripped).not.toContain('@tailwind base');
      expect(stripped).not.toContain('@tailwind components');
      expect(stripped).not.toContain('@tailwind utilities');
      expect(stripped).toContain('h1 { font-size: 2rem; }');
    });

    it('leaves standard CSS rules untouched when no Tailwind directive exists', () => {
      const input = `body { margin: 0; background: red; }\n.header { display: flex; }`;
      const { stripped, hasTailwind, version } = stripTailwindDirectives(input);
      expect(hasTailwind).toBe(false);
      expect(version).toBeNull();
      expect(stripped).toBe(input);
    });
  });

  describe('createCssJsSnippet', () => {
    it('wraps CSS into JS snippet creating style tag without Tailwind CDN when no Tailwind', () => {
      const snippet = createCssJsSnippet('body { color: blue; }', null, '/src/main.css');
      expect(snippet).toContain('const css = "body { color: blue; }";');
      expect(snippet).toContain('document.createElement(\'style\')');
      expect(snippet).toContain('style.setAttribute(\'data-vfs-css\', "/src/main.css")');
      expect(snippet).not.toContain('cdn.tailwindcss.com');
      expect(snippet).not.toContain('@tailwindcss/browser@4');
      expect(snippet).not.toContain("style.setAttribute('type', 'text/tailwindcss')");
    });

    it('includes Tailwind v3 Play CDN injection when version is v3', () => {
      const snippet = createCssJsSnippet('.btn { color: white; }', 'v3');
      expect(snippet).toContain('https://cdn.tailwindcss.com');
      expect(snippet).toContain('document.querySelector(\'script[src="https://cdn.tailwindcss.com"]\')');
      expect(snippet).not.toContain("style.setAttribute('type', 'text/tailwindcss')");
    });

    it('includes Tailwind v4 browser CDN and text/tailwindcss style type when version is v4', () => {
      const snippet = createCssJsSnippet('@theme { --color-brand: #ff0000; }', 'v4', '/src/index.css');
      expect(snippet).toContain('https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4');
      expect(snippet).toContain("document.querySelector('script[src=\"https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4\"]')");
      expect(snippet).toContain("style.setAttribute('type', 'text/tailwindcss')");
      expect(snippet).toContain('style.setAttribute(\'data-vfs-css\', "/src/index.css")');
      expect(snippet).not.toContain('cdn.tailwindcss.com');
    });
  });

  describe('createVfsPlugin & esbuild integration', () => {
    it('builds clean with a CSS file containing a data: URI without treating it as a bare package', async () => {
      const svgDataUri = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 2L2 22h20L12 2z'/%3E%3C/svg%3E";
      const files = [
        {
          path: '/src/main.ts',
          content: `import './styles.css';\nexport const appName = 'TestApp';`
        },
        {
          path: '/src/styles.css',
          content: `.icon {\n  background-image: url("${svgDataUri}");\n  display: inline-block;\n}`
        }
      ];

      const vfsPlugin = createVfsPlugin({
        files,
        entryPoint: '/src/main.ts'
      });

      const result = await esbuild.build({
        entryPoints: ['/src/main.ts'],
        bundle: true,
        write: false,
        plugins: [vfsPlugin],
        format: 'esm'
      });

      expect(result.errors.length).toBe(0);
      const output = result.outputFiles?.[0]?.text;
      expect(output).toBeDefined();
      expect(output).toContain('data:image/svg+xml');
      expect(output).toContain('appName');
      expect(output).not.toContain('https://esm.sh/data:');
    });

    it('builds clean with a CSS file containing @import "tailwindcss" (v4) with @theme tokens without fetching from esm.sh', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const files = [
        {
          path: '/src/main.tsx',
          content: `import './index.css';\nexport function App() { return '<h1 className="text-hykon-gold">Hykon Trekkers</h1>'; }`
        },
        {
          path: '/src/index.css',
          content: `@import "tailwindcss";\n\n@theme {\n  --color-hykon-gold: #c5a059;\n}\n\nbody {\n  margin: 0;\n  padding: 0;\n}`
        }
      ];

      const vfsPlugin = createVfsPlugin({
        files,
        entryPoint: '/src/main.tsx'
      });

      const result = await esbuild.build({
        entryPoints: ['/src/main.tsx'],
        bundle: true,
        write: false,
        plugins: [vfsPlugin],
        format: 'esm'
      });

      expect(result.errors.length).toBe(0);
      // Ensure fetch was never called for esm.sh/tailwindcss
      expect(mockFetch).not.toHaveBeenCalled();

      const output = result.outputFiles?.[0]?.text;
      expect(output).toBeDefined();
      expect(output).not.toContain('@import "tailwindcss"');
      expect(output).toContain('https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4');
      expect(output).toContain('style.setAttribute("type", "text/tailwindcss")');
      expect(output).toContain('--color-hykon-gold: #c5a059;');
      expect(output).toContain('margin: 0');
    });

    it('builds clean with a CSS file containing legacy @tailwind directives (v3)', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const files = [
        {
          path: '/src/main.tsx',
          content: `import './index.css';\nexport function App() { return '<h1>Legacy Tailwind v3</h1>'; }`
        },
        {
          path: '/src/index.css',
          content: `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\nbody {\n  background: #f0f0f0;\n}`
        }
      ];

      const vfsPlugin = createVfsPlugin({
        files,
        entryPoint: '/src/main.tsx'
      });

      const result = await esbuild.build({
        entryPoints: ['/src/main.tsx'],
        bundle: true,
        write: false,
        plugins: [vfsPlugin],
        format: 'esm'
      });

      expect(result.errors.length).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();

      const output = result.outputFiles?.[0]?.text;
      expect(output).toBeDefined();
      expect(output).not.toContain('@tailwind base');
      expect(output).toContain('https://cdn.tailwindcss.com');
      expect(output).not.toContain("style.setAttribute('type', 'text/tailwindcss')");
      expect(output).toContain('background: #f0f0f0;');
    });

    it('externalizes inline data: and blob: URIs during onResolve', async () => {
      const files = [
        {
          path: '/src/main.ts',
          content: `import img from 'data:image/png;base64,iVBORw0KGgo=';\nexport default img;`
        }
      ];

      const vfsPlugin = createVfsPlugin({
        files,
        entryPoint: '/src/main.ts'
      });

      const result = await esbuild.build({
        entryPoints: ['/src/main.ts'],
        bundle: true,
        write: false,
        plugins: [vfsPlugin],
        format: 'esm'
      });

      expect(result.errors.length).toBe(0);
      const output = result.outputFiles?.[0]?.text;
      expect(output).toContain('data:image/png;base64,iVBORw0KGgo=');
      expect(output).not.toContain('https://esm.sh/data:');
    });

    it('handles remote CSS imports from unpkg-url namespace with JS style wrapper', async () => {
      const mockCssContent = '.remote-btn { color: green; }';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(mockCssContent),
        clone: () => ({ text: () => Promise.resolve(mockCssContent) })
      });
      vi.stubGlobal('fetch', mockFetch);

      const files = [
        {
          path: '/src/main.ts',
          content: `import 'https://esm.sh/some-ui-library/dist/style.css';\nexport const ok = true;`
        }
      ];

      const vfsPlugin = createVfsPlugin({
        files,
        entryPoint: '/src/main.ts'
      });

      const result = await esbuild.build({
        entryPoints: ['/src/main.ts'],
        bundle: true,
        write: false,
        plugins: [vfsPlugin],
        format: 'esm'
      });

      expect(result.errors.length).toBe(0);
      const output = result.outputFiles?.[0]?.text;
      expect(output).toContain('.remote-btn { color: green; }');
      expect(output).toContain('document.createElement');
      expect(output).toContain('document.head.appendChild(style)');
    });
    it('resolves bare imports with version pinned in package.json', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url === 'https://esm.sh/lucide-react@^0.300.0') {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve('export const Github = "icon";'),
            clone: () => ({ text: () => Promise.resolve('export const Github = "icon";') })
          });
        }
        return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
      });
      vi.stubGlobal('fetch', mockFetch);

      const files = [
        {
          path: '/package.json',
          content: JSON.stringify({
            dependencies: {
              'lucide-react': '^0.300.0'
            }
          })
        },
        {
          path: '/src/main.ts',
          content: `import { Github } from 'lucide-react';\nexport const icon = Github;`
        }
      ];

      const vfsPlugin = createVfsPlugin({
        files,
        entryPoint: '/src/main.ts'
      });

      const result = await esbuild.build({
        entryPoints: ['/src/main.ts'],
        bundle: true,
        write: false,
        plugins: [vfsPlugin],
        format: 'esm'
      });

      expect(result.errors.length).toBe(0);
      expect(mockFetch).toHaveBeenCalledWith('https://esm.sh/lucide-react@^0.300.0');
    });

    it('resolves bare imports with subpaths and version pinned in package.json', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url === 'https://esm.sh/lodash@4.17.21/cloneDeep') {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve('export default function cloneDeep(x) { return x; }'),
            clone: () => ({ text: () => Promise.resolve('export default function cloneDeep(x) { return x; }') })
          });
        }
        return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
      });
      vi.stubGlobal('fetch', mockFetch);

      const files = [
        {
          path: '/package.json',
          content: JSON.stringify({
            dependencies: {
              'lodash': '4.17.21'
            }
          })
        },
        {
          path: '/src/main.ts',
          content: `import cloneDeep from 'lodash/cloneDeep';\nexport const copy = cloneDeep({ a: 1 });`
        }
      ];

      const vfsPlugin = createVfsPlugin({
        files,
        entryPoint: '/src/main.ts'
      });

      const result = await esbuild.build({
        entryPoints: ['/src/main.ts'],
        bundle: true,
        write: false,
        plugins: [vfsPlugin],
        format: 'esm'
      });

      expect(result.errors.length).toBe(0);
      expect(mockFetch).toHaveBeenCalledWith('https://esm.sh/lodash@4.17.21/cloneDeep');
    });

    it('falls back to unpinned URL if package is not listed in package.json', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url === 'https://esm.sh/unlisted-lib') {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve('export const unlisted = true;'),
            clone: () => ({ text: () => Promise.resolve('export const unlisted = true;') })
          });
        }
        return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
      });
      vi.stubGlobal('fetch', mockFetch);

      const files = [
        {
          path: '/package.json',
          content: JSON.stringify({
            dependencies: {
              'other-lib': '1.0.0'
            }
          })
        },
        {
          path: '/src/main.ts',
          content: `import { unlisted } from 'unlisted-lib';\nexport const status = unlisted;`
        }
      ];

      const vfsPlugin = createVfsPlugin({
        files,
        entryPoint: '/src/main.ts'
      });

      const result = await esbuild.build({
        entryPoints: ['/src/main.ts'],
        bundle: true,
        write: false,
        plugins: [vfsPlugin],
        format: 'esm'
      });

      expect(result.errors.length).toBe(0);
      expect(mockFetch).toHaveBeenCalledWith('https://esm.sh/unlisted-lib');
    });
  });

  describe('detectProjectTailwindVersion in PreviewPanel', () => {
    it('detects v4 when project has CSS with @import "tailwindcss"', () => {
      const files = [
        { path: '/src/index.css', content: '@import "tailwindcss";\n@theme { --color-brand: blue; }' },
        { path: '/src/main.tsx', content: 'console.log("app");' }
      ];
      expect(detectProjectTailwindVersion(files)).toBe('v4');
    });

    it('detects v3 when project has CSS with @tailwind directives', () => {
      const files = [
        { path: '/src/index.css', content: '@tailwind base;\n@tailwind utilities;' }
      ];
      expect(detectProjectTailwindVersion(files)).toBe('v3');
    });

    it('returns null when project has no tailwind directives in CSS', () => {
      const files = [
        { path: '/src/index.css', content: 'body { margin: 0; }' }
      ];
      expect(detectProjectTailwindVersion(files)).toBeNull();
    });

    it('prioritizes v4 if any CSS file in multi-CSS project uses v4', () => {
      const files = [
        { path: '/src/legacy.css', content: '@tailwind utilities;' },
        { path: '/src/modern.css', content: '@import "tailwindcss";' }
      ];
      expect(detectProjectTailwindVersion(files)).toBe('v4');
    });
  });

  describe('injectTailwindScriptIntoHtml in PreviewPanel', () => {
    it('injects tailwind v3 Play CDN script tag into <head> by default or when v3 is specified', () => {
      const html = `<!DOCTYPE html><html><head><title>Test</title></head><body><div id="root"></div></body></html>`;
      const result = injectTailwindScriptIntoHtml(html, 'v3');
      expect(result).toContain('<script src="https://cdn.tailwindcss.com"></script>');
      expect(result.indexOf('<script src="https://cdn.tailwindcss.com"></script>')).toBeGreaterThan(result.indexOf('<head>'));
    });

    it('injects tailwind v4 browser CDN script tag into <head> when v4 is specified', () => {
      const html = `<!DOCTYPE html><html><head><title>Test</title></head><body><div id="root"></div></body></html>`;
      const result = injectTailwindScriptIntoHtml(html, 'v4');
      expect(result).toContain('<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>');
      expect(result).not.toContain('cdn.tailwindcss.com');
      expect(result.indexOf('<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>')).toBeGreaterThan(result.indexOf('<head>'));
    });

    it('does not duplicate tailwind CDN script tag if already present', () => {
      const html = `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body></body></html>`;
      const result = injectTailwindScriptIntoHtml(html, 'v3');
      const matches = result.match(/https:\/\/cdn\.tailwindcss\.com/g);
      expect(matches?.length).toBe(1);

      const htmlV4 = `<!DOCTYPE html><html><head><script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script></head><body></body></html>`;
      const resultV4 = injectTailwindScriptIntoHtml(htmlV4, 'v4');
      const matchesV4 = resultV4.match(/https:\/\/cdn\.jsdelivr\.net\/npm\/@tailwindcss\/browser@4/g);
      expect(matchesV4?.length).toBe(1);
    });
  });
});
