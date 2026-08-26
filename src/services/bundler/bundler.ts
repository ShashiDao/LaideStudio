import type { FileItem } from '../../db';

let worker: Worker | null = null;
let currentId = 0;
const callbacks = new Map<number, { 
  resolve: (val: unknown) => void; 
  reject: (err: Error) => void;
  onProgress?: (status: string) => void;
}>();
const lastStatuses = new Map<number, string>();

export function _setBundlerWorkerForTesting(w: Worker | null) {
  worker = w;
}

export function getBundlerWorker() {
  if (!worker) {
    try {
      worker = new Worker(new URL('./esbuild.worker.ts', import.meta.url), { type: 'module' });
    } catch (_err) {
      throw new Error("In-browser preview isn't supported on this device/browser (module Web Workers are unavailable). Try updating your device's WebView/browser.", { cause: _err });
    }
    const handleFatal = (reason: string) => {
      for (const [, cb] of callbacks) {
        cb.reject(new Error(reason));
      }
      callbacks.clear();
      lastStatuses.clear();
      worker = null; // force a fresh worker on the next call — self-healing
    };
    worker.onerror = () => handleFatal('The bundler worker crashed unexpectedly. It has been restarted — try again.');
    worker.onmessageerror = () => handleFatal('The bundler worker sent an unreadable message and was restarted — try again.');
    worker.onmessage = (e) => {
      const { id, type, code, error, status, deleted, count } = e.data;
      const cb = callbacks.get(id);
      if (cb) {
        if (type === 'STATUS') {
          if (status) {
            lastStatuses.set(id, status);
          }
          if (cb.onProgress && status) {
            cb.onProgress(status);
          }
        } else if (type === 'SUCCESS') {
          cb.resolve(code);
          callbacks.delete(id);
          lastStatuses.delete(id);
        } else if (type === 'ERROR') {
          cb.reject(new Error(error));
          callbacks.delete(id);
          lastStatuses.delete(id);
        } else if (type === 'CLEAR_CACHE_SUCCESS') {
          cb.resolve(deleted);
          callbacks.delete(id);
          lastStatuses.delete(id);
        } else if (type === 'CLEAR_CACHE_ERROR') {
          cb.reject(new Error(error));
          callbacks.delete(id);
          lastStatuses.delete(id);
        } else if (type === 'CACHE_INFO') {
          cb.resolve({ count });
          callbacks.delete(id);
          lastStatuses.delete(id);
        }
      }
    };
  }
  return worker;
}

let cachedWasmUrl: string | null = null;

async function getWasmUrl(): Promise<string> {
  if (cachedWasmUrl) return cachedWasmUrl;
  try {
    const wasmMod = await import('esbuild-wasm/esbuild.wasm?url');
    const rawUrl = wasmMod.default;
    cachedWasmUrl = typeof window !== 'undefined'
      ? new URL(rawUrl, window.location.href).href
      : rawUrl;
    return cachedWasmUrl;
  } catch (err) {
    console.warn('Failed to dynamically resolve esbuild.wasm url:', err);
    return 'esbuild.wasm';
  }
}

export type BundlerInputFile = Pick<FileItem, 'path' | 'content'> & Partial<Omit<FileItem, 'path' | 'content'>>;

export function escapeScriptClosingTags(code: string): string {
  return code.replace(/<\/script/gi, '<\\/script');
}

export async function bundle(
  files: BundlerInputFile[], 
  entryPoint: string, 
  onProgress?: (status: string) => void
): Promise<string> {
  const [w, wasmUrl] = await Promise.all([
    getBundlerWorker(),
    getWasmUrl()
  ]);
  const id = ++currentId;
  const rawCode = await new Promise<string>((resolve, reject) => {
    const BUILD_TIMEOUT_MS = 45000;
    const timeoutHandle = setTimeout(() => {
      callbacks.delete(id);
      const lastStatus = lastStatuses.get(id) || 'Starting build...';
      lastStatuses.delete(id);
      if (typeof worker?.terminate === 'function') {
        worker.terminate();
      }
      worker = null;
      reject(new Error(`Build timed out after 45s while: "${lastStatus}". This can happen on a slow connection, an unusually large dependency, or — if this keeps happening on the same step — a real bug at that stage. Check your connection and try again.`));
    }, BUILD_TIMEOUT_MS);

    const safeResolve = (val: unknown) => {
      clearTimeout(timeoutHandle);
      resolve(val as string);
    };

    const safeReject = (err: Error) => {
      clearTimeout(timeoutHandle);
      reject(err);
    };

    callbacks.set(id, { resolve: safeResolve, reject: safeReject, onProgress });
    w.postMessage({
      type: 'BUILD',
      id,
      files,
      entryPoint,
      wasmUrl
    });
  });
  
  return escapeScriptClosingTags(rawCode);
}

export async function clearDependencyCache(): Promise<boolean> {
  // Also clear in main thread if available
  if (typeof caches !== 'undefined') {
    try {
      await caches.delete('xiom-esm-dep-cache-v1');
    } catch (e) {
      console.warn('Failed clearing cache directly on main thread:', e);
    }
  }

  const w = getBundlerWorker();
  const id = ++currentId;
  return new Promise<boolean>((resolve, reject) => {
    callbacks.set(id, { resolve: (val) => resolve(val as boolean), reject });
    w.postMessage({
      type: 'CLEAR_CACHE',
      id
    });
  });
}

export async function getDependencyCacheInfo(): Promise<{ count: number }> {
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open('xiom-esm-dep-cache-v1');
      const keys = await cache.keys();
      return { count: keys.length };
    } catch {
      // Fallback to worker message
    }
  }

  const w = getBundlerWorker();
  const id = ++currentId;
  return new Promise<{ count: number }>((resolve, reject) => {
    callbacks.set(id, { resolve: (val) => resolve(val as { count: number }), reject });
    w.postMessage({
      type: 'GET_CACHE_INFO',
      id
    });
  });
}

