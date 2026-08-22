import { describe, it, expect, vi } from 'vitest';
import * as esbuild from 'esbuild';
import { 
  stripTailwindDirectives, 
  createCssJsSnippet, 
  createVfsPlugin,
  extractDependenciesFromFiles,
  parsePackageSpecifier
} from './esbuild.worker';
import { injectTailwindScriptIntoHtml } from '../../components/PreviewPanel';

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
    it('strips @import "tailwindcss" and detects tailwind', () => {
      const input = `@import "tailwindcss";\n\nbody { color: #111; }`;
      const { stripped, hasTailwind } = stripTailwindDirectives(input);
      expect(hasTailwind).toBe(true);
      expect(stripped).not.toContain('@import "tailwindcss"');
      expect(stripped).toContain('body { color: #111; }');
    });

    it('strips single-quoted @import \'tailwindcss\' without semicolon', () => {
      const input = `@import 'tailwindcss'\n.btn { padding: 4px; }`;
      const { stripped, hasTailwind } = stripTailwindDirectives(input);
      expect(hasTailwind).toBe(true);
      expect(stripped).not.toContain('@import \'tailwindcss\'');
      expect(stripped).toContain('.btn { padding: 4px; }');
    });

    it('strips legacy @tailwind base/components/utilities directives', () => {
      const input = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\nh1 { font-size: 2rem; }`;
      const { stripped, hasTailwind } = stripTailwindDirectives(input);
      expect(hasTailwind).toBe(true);
      expect(stripped).not.toContain('@tailwind base');
      expect(stripped).not.toContain('@tailwind components');
      expect(stripped).not.toContain('@tailwind utilities');
      expect(stripped).toContain('h1 { font-size: 2rem; }');
    });

    it('leaves standard CSS rules untouched when no Tailwind directive exists', () => {
      const input = `body { margin: 0; background: red; }\n.header { display: flex; }`;
      const { stripped, hasTailwind } = stripTailwindDirectives(input);
      expect(hasTailwind).toBe(false);
      expect(stripped).toBe(input);
    });
  });

  describe('createCssJsSnippet', () => {
    it('wraps CSS into JS snippet creating style tag', () => {
      const snippet = createCssJsSnippet('body { color: blue; }', false, '/src/main.css');
      expect(snippet).toContain('const css = "body { color: blue; }";');
      expect(snippet).toContain('document.createElement(\'style\')');
      expect(snippet).toContain('style.setAttribute(\'data-vfs-css\', "/src/main.css")');
      expect(snippet).not.toContain('cdn.tailwindcss.com');
    });

    it('includes Tailwind Play CDN injection when hasTailwind is true', () => {
      const snippet = createCssJsSnippet('.btn { color: white; }', true);
      expect(snippet).toContain('https://cdn.tailwindcss.com');
      expect(snippet).toContain('document.querySelector(\'script[src="https://cdn.tailwindcss.com"]\')');
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

    it('builds clean with a CSS file containing @import "tailwindcss" without fetching from esm.sh', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const files = [
        {
          path: '/src/main.tsx',
          content: `import './index.css';\nexport function App() { return '<h1>Hello</h1>'; }`
        },
        {
          path: '/src/index.css',
          content: `@import "tailwindcss";\n\nbody {\n  margin: 0;\n  padding: 0;\n}`
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
      expect(output).toContain('https://cdn.tailwindcss.com');
      expect(output).toContain('margin: 0');
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

  describe('injectTailwindScriptIntoHtml in PreviewPanel', () => {
    it('injects tailwind CDN script tag into <head>', () => {
      const html = `<!DOCTYPE html><html><head><title>Test</title></head><body><div id="root"></div></body></html>`;
      const result = injectTailwindScriptIntoHtml(html);
      expect(result).toContain('<script src="https://cdn.tailwindcss.com"></script>');
      expect(result.indexOf('<script src="https://cdn.tailwindcss.com"></script>')).toBeGreaterThan(result.indexOf('<head>'));
    });

    it('does not duplicate tailwind CDN script tag if already present', () => {
      const html = `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body></body></html>`;
      const result = injectTailwindScriptIntoHtml(html);
      const matches = result.match(/https:\/\/cdn\.tailwindcss\.com/g);
      expect(matches?.length).toBe(1);
    });
  });
});
