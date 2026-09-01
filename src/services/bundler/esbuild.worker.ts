import * as esbuild from 'esbuild-wasm';
import type { FileItem } from '../../db';
import {
  computeSha256,
  findLockfile,
  isVendoredSpecifier,
  serializeLockfile,
  type DependencyLockfile
} from './lockfile';

export const CACHE_NAME = 'laide-esm-dep-cache-v2';
export const LEGACY_CACHE_NAMES = ['xiom-esm-dep-cache-v1', 'laide-esm-dep-cache-v1'];

let legacyCachesCleaned = false;

export async function cleanLegacyCaches(): Promise<void> {
  if (legacyCachesCleaned) return;
  if (typeof caches !== 'undefined' && typeof caches.keys === 'function') {
    try {
      const keys = await caches.keys();
      for (const key of keys) {
        if (LEGACY_CACHE_NAMES.includes(key) || (key.startsWith('xiom-') && key !== CACHE_NAME)) {
          await caches.delete(key);
        }
      }
      legacyCachesCleaned = true;
    } catch (e) {
      console.warn('Failed to clean legacy cache storage:', e);
    }
  }
}

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
      await cleanLegacyCaches();
      return await caches.open(CACHE_NAME);
    } catch (e) {
      console.warn('Cache Storage unavailable:', e);
    }
  }
  return null;
}

export type TailwindVersion = 'v3' | 'v4' | null;

export function stripTailwindDirectives(css: string): { stripped: string; hasTailwind: boolean; version: TailwindVersion } {
  const v4Regex = /(?:@import\s+(?:url\()?['"]tailwindcss(?:\/[^'")]*)?['"]\)?\s*;?)/;
  const v3Regex = /(?:@tailwind\s+(?:base|components|utilities|screens|variants)\s*;?)/;

  const hasV4 = v4Regex.test(css);
  const hasV3 = v3Regex.test(css);

  if (!hasV4 && !hasV3) {
    return { stripped: css, hasTailwind: false, version: null };
  }

  const version: TailwindVersion = hasV4 ? 'v4' : 'v3';
  const combinedRegex = /(?:@import\s+(?:url\()?['"]tailwindcss(?:\/[^'")]*)?['"]\)?\s*;?|@tailwind\s+(?:base|components|utilities|screens|variants)\s*;?)/g;
  const stripped = css.replace(combinedRegex, '');

  return { stripped, hasTailwind: true, version };
}

export function createCssJsSnippet(cssContent: string, tailwindVersion: TailwindVersion | boolean, sourcePath?: string): string {
  const isV4 = tailwindVersion === 'v4';
  const isV3 = tailwindVersion === 'v3' || tailwindVersion === true;

  const scriptTag = isV4
    ? `
  if (!document.querySelector('script[src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"]')) {
    const twScript = document.createElement('script');
    twScript.src = 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4';
    document.head.appendChild(twScript);
  }`
    : isV3
    ? `
  if (!document.querySelector('script[src="https://cdn.tailwindcss.com"]')) {
    const twScript = document.createElement('script');
    twScript.src = 'https://cdn.tailwindcss.com';
    document.head.appendChild(twScript);
  }`
    : '';

  const styleTypeAttr = isV4 ? `style.setAttribute('type', 'text/tailwindcss');\n  ` : '';

  return `
const css = ${JSON.stringify(cssContent)};
if (typeof document !== 'undefined') {${scriptTag}
  const style = document.createElement('style');
  ${styleTypeAttr}${sourcePath ? `style.setAttribute('data-vfs-css', ${JSON.stringify(sourcePath)});` : ''}
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
  preBundledWorkers?: Map<string, string>;
  lockfile?: DependencyLockfile;
  onLockfileUpdated?: (updatedLockfile: DependencyLockfile) => void;
}

export function createVfsPlugin(options: VfsPluginOptions): esbuild.Plugin {
  const { files, entryPoint, wasmUrl, cache, activeNetworkFetches, onStatus, preBundledWorkers } = options;
  const deps = extractDependenciesFromFiles(files);
  const { lockfile: detectedLockfile } = findLockfile(files);
  const activeLockfile: DependencyLockfile = options.lockfile || detectedLockfile;

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
           return { path: new URL(args.path, args.importer).href, namespace: 'unpkg-url', pluginData: args.pluginData };
        }
        
        if (args.path.startsWith('http://') || args.path.startsWith('https://')) {
           return { path: args.path, namespace: 'unpkg-url', pluginData: { specifier: args.path } };
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

        // Check if package has been vendored locally into VFS (e.g. /vendor/lodash.js)
        const vendored = isVendoredSpecifier(args.path, files);
        if (vendored.isVendored && vendored.filePath) {
          return { path: vendored.filePath, namespace: 'vfs' };
        }
        
        const { packageName, subpath } = parsePackageSpecifier(args.path);
        const version = deps[packageName];

        // Check if lockfile already pinned a specific URL for this specifier
        const lockedEntry = activeLockfile.dependencies[args.path] || activeLockfile.dependencies[packageName];
        if (lockedEntry && lockedEntry.url) {
          return {
            path: lockedEntry.url,
            namespace: 'unpkg-url',
            pluginData: { specifier: args.path }
          };
        }

        if (version) {
          return { 
            path: `https://esm.sh/${packageName}@${version}${subpath}`, 
            namespace: 'unpkg-url',
            pluginData: { specifier: args.path }
          };
        }

        return { 
          path: `https://esm.sh/${args.path}`, 
          namespace: 'unpkg-url',
          pluginData: { specifier: args.path }
        };
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

      build.onLoad({ filter: /.*/, namespace: 'vfs' }, async args => {
         const file = files.find(f => f.path === args.path);
         if (!file) return { errors: [{ text: `File not found in VFS: ${args.path}` }] };
         
         if (args.path.endsWith('.css')) {
           const { stripped, version } = stripTailwindDirectives(file.content);
           return {
             contents: createCssJsSnippet(stripped, version, args.path),
             loader: 'js'
           };
         }

         const ext = args.path.split('.').pop();
         let loader: esbuild.Loader = 'js';
         if (ext === 'tsx' || ext === 'ts' || ext === 'jsx' || ext === 'json') {
            loader = ext as esbuild.Loader;
         }
         
          let contents = file.content;
         
         const workerPattern = /new\s+Worker\s*\(\s*new\s+URL\s*\(\s*(['"`])(.*?)\1\s*,\s*import\.meta\.url\s*\)\s*(?:,\s*(\{[^}]*\}))?\s*\)/g;
         if (workerPattern.test(contents)) {
           workerPattern.lastIndex = 0;
           
           let match;
           let rewrittenContents = '';
           let lastIndex = 0;
           
           while ((match = workerPattern.exec(contents)) !== null) {
             const fullMatch = match[0];
             const specifier = match[2];
             const optionsObj = match[3] || "{ type: 'module' }";
             
             let resolvePath = specifier;
             if (specifier.startsWith('.')) {
               const parts = args.path.split('/');
               parts.pop();
               const dir = parts.join('/');
               resolvePath = normalizePath((dir ? dir + '/' : '/') + specifier);
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
             
             if (matchedFile) {
               if (preBundledWorkers && preBundledWorkers.has(resolvePath)) {
                 const bundledWorkerCode = preBundledWorkers.get(resolvePath)!;
                 rewrittenContents += contents.substring(lastIndex, match.index);
                 rewrittenContents += `new Worker(URL.createObjectURL(new Blob([${JSON.stringify(bundledWorkerCode)}], { type: 'text/javascript' })), ${optionsObj})`;
                 lastIndex = workerPattern.lastIndex;
               } else {
                 rewrittenContents += contents.substring(lastIndex, match.index);
                 rewrittenContents += `/* nested/circular worker bundling isn't supported yet */ ${fullMatch}`;
                 lastIndex = workerPattern.lastIndex;
               }
             } else {
               rewrittenContents += contents.substring(lastIndex, match.index);
               rewrittenContents += fullMatch;
               lastIndex = workerPattern.lastIndex;
             }
           }
           
           rewrittenContents += contents.substring(lastIndex);
           contents = rewrittenContents;
         }
         
         return { contents, loader };
      });
      
      build.onLoad({ filter: /.*/, namespace: 'unpkg-url' }, async (args) => {
         const url = args.path;
         const cleanPath = url.split('?')[0];
         const isCss = cleanPath.endsWith('.css');
         const cleanName = url.replace('https://esm.sh/', '').split('?')[0];
         const specifierKey = (args.pluginData as { specifier?: string } | undefined)?.specifier || cleanName;

         const getLoaderForUrl = (targetUrl: string): esbuild.Loader => {
           const clean = targetUrl.split('?')[0];
           if (clean.endsWith('.json')) return 'json';
           if (clean.endsWith('.ts')) return 'ts';
           if (clean.endsWith('.tsx')) return 'tsx';
           if (clean.endsWith('.jsx')) return 'jsx';
           return 'js';
         };

         const handleCssContent = (cssText: string) => {
           const { stripped, version } = stripTailwindDirectives(cssText);
           return {
             contents: createCssJsSnippet(stripped, version, url),
             loader: 'js' as const
           };
         };

         const verifyAndLockDependency = async (text: string): Promise<{ error?: string }> => {
           const computedHash = await computeSha256(text);
           const lockedEntry = activeLockfile.dependencies[specifierKey] || activeLockfile.dependencies[cleanName] || activeLockfile.dependencies[url];

           if (lockedEntry && lockedEntry.integrity) {
             if (lockedEntry.integrity !== computedHash) {
               return {
                 error: `[SECURITY INTEGRITY MISMATCH] Dependency "${specifierKey}" (${url}) failed SHA-256 integrity verification!\n` +
                        `Expected hash: ${lockedEntry.integrity}\n` +
                        `Received hash: ${computedHash}\n` +
                        `Upstream content at esm.sh has changed or was tampered with. Build aborted to prevent untrusted code execution.\n` +
                        `To accept this update, run "npm update-lock ${specifierKey}" in the terminal or update /.laide/lockfile.json.`
               };
             }
           } else {
             activeLockfile.dependencies[specifierKey] = {
               specifier: specifierKey,
               url,
               integrity: computedHash,
               lockedAt: Date.now()
             };
             options.onLockfileUpdated?.(activeLockfile);
           }
           return {};
         };

         // 1. Try Cache Storage first
         if (cache) {
           try {
             const cachedRes = await cache.match(url);
             if (cachedRes) {
               const contents = await cachedRes.text();
               const { error: integrityErr } = await verifyAndLockDependency(contents);
               if (integrityErr) {
                 console.error(integrityErr);
                 return { errors: [{ text: integrityErr }] };
               }
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
         const pendingCount = activeNetworkFetches?.size || 1;
         onStatus?.(`Fetching dependency: ${cleanName} (${pendingCount} pending)...`);

         try {
            const res = await fetch(url);
            if (!res.ok) {
              throw new Error(`Failed to fetch ${url} (Status: ${res.status})`);
            }
            
            const contents = await res.text();

            const { error: integrityErr } = await verifyAndLockDependency(contents);
            if (integrityErr) {
              console.error(integrityErr);
              return { errors: [{ text: integrityErr }] };
            }

            // Store in cache for future offline/faster rebuilds
            if (cache) {
              try {
                await cache.put(url, new Response(contents, {
                  status: res.status,
                  statusText: res.statusText,
                  headers: res.headers
                }));
              } catch (cachePutErr) {
                console.warn('Failed to cache response for', url, cachePutErr);
              }
            }

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

        // 1. Walk VFS and find all worker specifiers
        const workerPattern = /new\s+Worker\s*\(\s*new\s+URL\s*\(\s*(['"`])(.*?)\1\s*,\s*import\.meta\.url\s*\)\s*(?:,\s*(\{[^}]*\}))?\s*\)/g;
        const workerPathsToBundle = new Set<string>();

        for (const file of files) {
           const contents = file.content;
           if (!contents) continue;
           let match;
           workerPattern.lastIndex = 0;
           while ((match = workerPattern.exec(contents)) !== null) {
              const specifier = match[2];
              let resolvePath = specifier;
              if (specifier.startsWith('.')) {
                const parts = file.path.split('/');
                parts.pop();
                const dir = parts.join('/');
                resolvePath = normalizePath((dir ? dir + '/' : '/') + specifier);
              }
              
              let matchedFile = files.find((f: FileItem) => f.path === resolvePath);
              if (!matchedFile) {
                const exts = ['.ts', '.tsx', '.js', '.jsx', '.css', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
                for (const ext of exts) {
                  matchedFile = files.find((f: FileItem) => f.path === resolvePath + ext);
                  if (matchedFile) {
                    resolvePath = resolvePath + ext;
                    break;
                  }
                }
              }
              
              if (matchedFile) {
                workerPathsToBundle.add(resolvePath);
              }
           }
        }

        // 2. Pre-bundle them sequentially, ensuring dependencies are bundled first
        const preBundledWorkers = new Map<string, string>();
        const nestedWorkerPaths = new Set<string>();

        const ensureWorkerBundled = async (resolvePath: string) => {
          if (preBundledWorkers.has(resolvePath) || nestedWorkerPaths.has(resolvePath)) return;
          nestedWorkerPaths.add(resolvePath);
          
          const file = files.find((f: FileItem) => f.path === resolvePath);
          if (file && file.content) {
            let match;
            workerPattern.lastIndex = 0;
            while ((match = workerPattern.exec(file.content)) !== null) {
              const specifier = match[2];
              let depPath = specifier;
              if (specifier.startsWith('.')) {
                const parts = file.path.split('/');
                parts.pop();
                const dir = parts.join('/');
                depPath = normalizePath((dir ? dir + '/' : '/') + specifier);
              }
              let matchedDep = files.find((f: FileItem) => f.path === depPath);
              if (!matchedDep) {
                const exts = ['.ts', '.tsx', '.js', '.jsx'];
                for (const ext of exts) {
                  matchedDep = files.find((f: FileItem) => f.path === depPath + ext);
                  if (matchedDep) {
                    depPath = depPath + ext;
                    break;
                  }
                }
              }
              if (matchedDep) {
                await ensureWorkerBundled(depPath);
              }
            }
          }

          self.postMessage({ id, type: 'STATUS', status: `Bundling worker module: ${resolvePath}` });
          try {
            const result = await esbuild.build({
              entryPoints: [resolvePath],
              bundle: true,
              write: false,
              format: 'esm',
              plugins: [createVfsPlugin({
                files,
                entryPoint: resolvePath,
                wasmUrl,
                cache,
                activeNetworkFetches,
                preBundledWorkers,
                onStatus: (status) => self.postMessage({ id, type: 'STATUS', status })
              })]
            });
            const code = result.outputFiles?.[0]?.text || '';
            preBundledWorkers.set(resolvePath, code);
          } catch (err) {
            console.error('Failed to pre-bundle worker:', err);
          }
          
          nestedWorkerPaths.delete(resolvePath);
        };

        for (const workerPath of workerPathsToBundle) {
          await ensureWorkerBundled(workerPath);
        }

        let finalLockfile: DependencyLockfile | null = null;

        const vfsPlugin = createVfsPlugin({
          files,
          entryPoint,
          wasmUrl,
          cache,
          activeNetworkFetches,
          preBundledWorkers,
          onLockfileUpdated: (lf) => { finalLockfile = lf; },
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
        
        self.postMessage({ 
          id, 
          type: 'SUCCESS', 
          code, 
          updatedLockfile: finalLockfile ? serializeLockfile(finalLockfile) : undefined 
        });
      } catch (error: unknown) {
        console.error(error);
        const errMsg = error instanceof Error ? error.message : 'Build failed';
        self.postMessage({ id, type: 'ERROR', error: errMsg });
      }
    }
  };
}
