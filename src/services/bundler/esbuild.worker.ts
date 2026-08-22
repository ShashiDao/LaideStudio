import * as esbuild from 'esbuild-wasm';
import type { FileItem } from '../../db';

const CACHE_NAME = 'xiom-esm-dep-cache-v1';

let initialized = false;
let initPromise: Promise<void> | null = null;

async function ensureEsbuildInitialized(wasmUrl?: string): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (wasmUrl) {
        const wasmRes = await fetch(wasmUrl);
        if (!wasmRes.ok) {
          throw new Error(`Failed to fetch wasm binary from ${wasmUrl} (${wasmRes.status} ${wasmRes.statusText})`);
        }
        const wasmBytes = await wasmRes.arrayBuffer();
        const wasmModule = await WebAssembly.compile(wasmBytes);
        await esbuild.initialize({ wasmModule, worker: false });
      } else {
        await esbuild.initialize({ worker: false });
      }
    } catch (initErr) {
      console.warn('Direct wasmModule compilation failed, trying fallback with wasmURL:', initErr);
      await esbuild.initialize({ wasmURL: wasmUrl, worker: false });
    }
    initialized = true;
  })();

  try {
    await initPromise;
  } catch (err) {
    initPromise = null; // allow a later call to retry from scratch
    throw err;
  }
}

function normalizePath(path: string) {
  const parts = path.split('/');
  const stack = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return '/' + stack.join('/');
}

// Open Cache Storage safely
async function getDepCache(): Promise<Cache | null> {
  if (typeof caches !== 'undefined') {
    try {
      return await caches.open(CACHE_NAME);
    } catch (e) {
      console.warn('Cache Storage unavailable:', e);
    }
  }
  return null;
}

export function stripTailwindDirectives(css: string): { stripped: string; hasTailwind: boolean } {
  const tailwindRegex = /(?:@import\s+(?:url\()?['"]tailwindcss(?:\/[^'")]*)?['"]\)?\s*;?|@tailwind\s+(?:base|components|utilities|screens|variants)\s*;?)/g;
  const hasTailwind = tailwindRegex.test(css);
  const stripped = css.replace(tailwindRegex, '');
  return { stripped, hasTailwind };
}

export function createCssJsSnippet(cssContent: string, hasTailwind: boolean, sourcePath?: string): string {
  return `
const css = ${JSON.stringify(cssContent)};
if (typeof document !== 'undefined') {
  ${hasTailwind ? `
  if (!document.querySelector('script[src="https://cdn.tailwindcss.com"]')) {
    const twScript = document.createElement('script');
    twScript.src = 'https://cdn.tailwindcss.com';
    document.head.appendChild(twScript);
  }
  ` : ''}
  const style = document.createElement('style');
  ${sourcePath ? `style.setAttribute('data-vfs-css', ${JSON.stringify(sourcePath)});` : ''}
  style.textContent = css;
  document.head.appendChild(style);
}
export default css;
`;
}

export function extractDependenciesFromFiles(files: (Pick<FileItem, 'path' | 'content'> & Partial<FileItem>)[]): Record<string, string> {
  const pkgFile = files.find(f => f.path === '/package.json' || f.path === 'package.json');
  if (!pkgFile || !pkgFile.content) return {};
  try {
    const pkg = JSON.parse(pkgFile.content);
    return {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
      ...(pkg.peerDependencies || {})
    };
  } catch (e) {
    console.warn('Failed to parse package.json for dependency resolution:', e);
    return {};
  }
}

export function parsePackageSpecifier(importPath: string): { packageName: string; subpath: string } {
  if (importPath.startsWith('@')) {
    const parts = importPath.split('/');
    if (parts.length >= 2) {
      const packageName = `${parts[0]}/${parts[1]}`;
      const subpath = parts.slice(2).join('/');
      return { packageName, subpath: subpath ? `/${subpath}` : '' };
    }
  }
  const parts = importPath.split('/');
  const packageName = parts[0];
  const subpath = parts.slice(1).join('/');
  return { packageName, subpath: subpath ? `/${subpath}` : '' };
}

export interface VfsPluginOptions {
  files: (Pick<FileItem, 'path' | 'content'> & Partial<FileItem>)[];
  entryPoint: string;
  wasmUrl?: string;
  cache?: Cache | null;
  activeNetworkFetches?: Set<string>;
  onStatus?: (status: string) => void;
}

export function createVfsPlugin(options: VfsPluginOptions): esbuild.Plugin {
  const { files, entryPoint, wasmUrl, cache, activeNetworkFetches, onStatus } = options;
  const deps = extractDependenciesFromFiles(files);

  return {
    name: 'vfs',
    setup(build) {
      build.onResolve({ filter: /.*/ }, args => {
        // Never route compiler WASM binary or wasmUrl through VFS/unpkg dependency resolution
        if (args.path.endsWith('.wasm') || (wasmUrl && args.path === wasmUrl) || args.path.includes('esbuild.wasm')) {
          return { path: args.path, external: true };
        }

        // Externalize data: and blob: URIs so they pass through untouched (e.g. background-image SVGs in CSS)
        if (args.path.startsWith('data:') || args.path.startsWith('blob:')) {
          return { path: args.path, external: true };
        }

        // Intercept Vite-only virtual modules (e.g., virtual:pwa-register, virtual:pwa-register/react, virtual:*)
        if (args.path.startsWith('virtual:') || args.path.startsWith('\0virtual:') || args.path.includes('virtual:')) {
          return { path: args.path, namespace: 'virtual-module-stub' };
        }

        if (args.path === 'vitest') {
          return { path: '/_vitest_shim.ts', namespace: 'vfs' };
        }

        if (args.path === entryPoint) return { path: args.path, namespace: 'vfs' };
        
        if (args.namespace === 'unpkg-url') {
           return { path: new URL(args.path, args.importer).href, namespace: 'unpkg-url' };
        }
        
        if (args.path.startsWith('http://') || args.path.startsWith('https://')) {
           return { path: args.path, namespace: 'unpkg-url' };
        }
        
        if (args.path.startsWith('.') || args.path.startsWith('/')) {
           let resolvePath = args.path;
           if (args.path.startsWith('.')) {
              const parts = args.importer.split('/');
              parts.pop();
              const dir = parts.join('/');
              resolvePath = normalizePath((dir ? dir + '/' : '/') + args.path);
           }
           
           let matchedFile = files.find(f => f.path === resolvePath);
           if (!matchedFile) {
             const exts = ['.ts', '.tsx', '.js', '.jsx', '.css', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
             for (const ext of exts) {
               matchedFile = files.find(f => f.path === resolvePath + ext);
               if (matchedFile) {
                 resolvePath = resolvePath + ext;
                 break;
               }
             }
           }
           
           return { path: resolvePath, namespace: 'vfs' };
        }
        
        const { packageName, subpath } = parsePackageSpecifier(args.path);
        const version = deps[packageName];
        if (version) {
          return { path: `https://esm.sh/${packageName}@${version}${subpath}`, namespace: 'unpkg-url' };
        }

        return { path: `https://esm.sh/${args.path}`, namespace: 'unpkg-url' };
      });
      
      build.onLoad({ filter: /.*/, namespace: 'virtual-module-stub' }, args => {
        return {
          contents: `
            // Virtual module stub (${args.path}): not available in in-browser preview
            export function useRegisterSW(options) {
              return {
                offlineReady: [false, function() {}],
                needRefresh: [false, function() {}],
                updateServiceWorker: async function() {},
              };
            }
            export function registerSW(options) {
              return async function() {};
            }
            export default {
              useRegisterSW: function(options) {
                return {
                  offlineReady: [false, function() {}],
                  needRefresh: [false, function() {}],
                  updateServiceWorker: async function() {},
                };
              },
              registerSW: function(options) {
                return async function() {};
              }
            };
          `,
          loader: 'js'
        };
      });

      build.onLoad({ filter: /.*/, namespace: 'vfs' }, args => {
         const file = files.find(f => f.path === args.path);
         if (!file) return { errors: [{ text: `File not found in VFS: ${args.path}` }] };
         
         if (args.path.endsWith('.css')) {
           const { stripped, hasTailwind } = stripTailwindDirectives(file.content);
           return {
             contents: createCssJsSnippet(stripped, hasTailwind, args.path),
             loader: 'js'
           };
         }

         const ext = args.path.split('.').pop();
         let loader: esbuild.Loader = 'js';
         if (ext === 'tsx' || ext === 'ts' || ext === 'jsx' || ext === 'json') {
            loader = ext as esbuild.Loader;
         }
         
         return { contents: file.content, loader };
      });
      
      build.onLoad({ filter: /.*/, namespace: 'unpkg-url' }, async (args) => {
         const url = args.path;
         const cleanPath = url.split('?')[0];
         const isCss = cleanPath.endsWith('.css');

         const getLoaderForUrl = (targetUrl: string): esbuild.Loader => {
           const clean = targetUrl.split('?')[0];
           if (clean.endsWith('.json')) return 'json';
           if (clean.endsWith('.ts')) return 'ts';
           if (clean.endsWith('.tsx')) return 'tsx';
           if (clean.endsWith('.jsx')) return 'jsx';
           return 'js';
         };

         const handleCssContent = (cssText: string) => {
           const { stripped, hasTailwind } = stripTailwindDirectives(cssText);
           return {
             contents: createCssJsSnippet(stripped, hasTailwind, url),
             loader: 'js' as const
           };
         };

         // 1. Try Cache Storage first
         if (cache) {
           try {
             const cachedRes = await cache.match(url);
             if (cachedRes) {
               const contents = await cachedRes.text();
               if (isCss) {
                 return handleCssContent(contents);
               }
               return { contents, loader: getLoaderForUrl(url) };
             }
           } catch (e) {
             console.warn('Error reading from cache for', url, e);
           }
         }

         // 2. Not cached - check if offline
         const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
         if (isOffline) {
           return {
             errors: [{
               text: `This dependency isn't cached (${url}) — connect to the internet once to preview this project.`
             }]
           };
         }

         // 3. Notify main thread of active network fetch
         activeNetworkFetches?.add(url);
         const cleanName = url.replace('https://esm.sh/', '').split('?')[0];
         const pendingCount = activeNetworkFetches?.size || 1;
         onStatus?.(`Fetching dependency: ${cleanName} (${pendingCount} pending)...`);

         try {
            const res = await fetch(url);
            if (!res.ok) {
              throw new Error(`Failed to fetch ${url} (Status: ${res.status})`);
            }
            
            // Store in cache for future offline/faster rebuilds
            if (cache) {
              try {
                await cache.put(url, res.clone());
              } catch (cachePutErr) {
                console.warn('Failed to cache response for', url, cachePutErr);
              }
            }

            const contents = await res.text();
            if (isCss) {
              return handleCssContent(contents);
            }
            return { contents, loader: getLoaderForUrl(url) };
         } catch (err: unknown) {
            // If fetch failed due to offline/network failure
            const isNetworkFailure = typeof navigator !== 'undefined' && navigator.onLine === false;
            const errMsg = err instanceof Error ? err.message : String(err);
            const errName = err instanceof Error ? err.name : '';
            if (isNetworkFailure || errMsg.includes('Failed to fetch') || errName === 'TypeError') {
              return {
                errors: [{
                  text: `This dependency isn't cached (${url}) — connect to the internet once to preview this project.`
                }]
              };
            }
            return { errors: [{ text: errMsg }] };
         } finally {
            activeNetworkFetches?.delete(url);
            if (activeNetworkFetches && activeNetworkFetches.size > 0) {
              onStatus?.(`Fetching dependencies (${activeNetworkFetches.size} pending)...`);
            } else {
              onStatus?.('Compiling project with esbuild...');
            }
         }
      });
    }
  };
}

if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = async (e: MessageEvent) => {
    const { type, id, files, entryPoint, wasmUrl } = e.data;

    if (type === 'CLEAR_CACHE') {
      try {
        if (typeof caches !== 'undefined') {
          const deleted = await caches.delete(CACHE_NAME);
          self.postMessage({ id, type: 'CLEAR_CACHE_SUCCESS', deleted });
        } else {
          self.postMessage({ id, type: 'CLEAR_CACHE_SUCCESS', deleted: false });
        }
      } catch (err: unknown) {
        self.postMessage({ id, type: 'CLEAR_CACHE_ERROR', error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    if (type === 'GET_CACHE_INFO') {
      try {
        if (typeof caches !== 'undefined') {
          const cache = await getDepCache();
          if (cache) {
            const keys = await cache.keys();
            self.postMessage({ id, type: 'CACHE_INFO', count: keys.length });
            return;
          }
        }
        self.postMessage({ id, type: 'CACHE_INFO', count: 0 });
      } catch {
        // Fallback to 0 if cache reading fails
        self.postMessage({ id, type: 'CACHE_INFO', count: 0 });
      }
      return;
    }
    
    if (type === 'BUILD') {
      try {
                if (!initialized) {
          self.postMessage({ id, type: 'STATUS', status: 'Initializing compiler...' });
        }
        await ensureEsbuildInitialized(wasmUrl);
        
        const cache = await getDepCache();
        const activeNetworkFetches = new Set<string>();

        const vfsPlugin = createVfsPlugin({
          files,
          entryPoint,
          wasmUrl,
          cache,
          activeNetworkFetches,
          onStatus: (status) => self.postMessage({ id, type: 'STATUS', status })
        });

        self.postMessage({ id, type: 'STATUS', status: 'Compiling project with esbuild...' });

        const result = await esbuild.build({
          entryPoints: [entryPoint],
          bundle: true,
          write: false,
          plugins: [vfsPlugin],
          define: {
            'process.env.NODE_ENV': '"development"',
            'global': 'window'
          },
          format: 'esm',
        });
        
        const code = result.outputFiles?.[0]?.text;
        
        if (!result.outputFiles?.length || typeof result.outputFiles[0].text !== 'string' || result.outputFiles[0].text.trim() === '') {
          throw new Error('Build produced no output. Check that your entry point file exists and exports/renders something.');
        }
        
        self.postMessage({ id, type: 'SUCCESS', code });
      } catch (error: unknown) {
        console.error(error);
        const errMsg = error instanceof Error ? error.message : 'Build failed';
        self.postMessage({ id, type: 'ERROR', error: errMsg });
      }
    }
  };
}
