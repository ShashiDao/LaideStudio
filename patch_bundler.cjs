const fs = require('fs');

let content = fs.readFileSync('src/services/bundler/bundler.ts', 'utf-8');

// Update getBundlerWorker
content = content.replace(
  `export function getBundlerWorker() {
  if (!worker) {
    worker = new Worker(new URL('./esbuild.worker.ts', import.meta.url), { type: 'module' });`,
  `export function getBundlerWorker() {
  if (!worker) {
    try {
      worker = new Worker(new URL('./esbuild.worker.ts', import.meta.url), { type: 'module' });
    } catch (err) {
      throw new Error("In-browser preview isn't supported on this device/browser (module Web Workers are unavailable). Try updating your device's WebView/browser.");
    }
    const handleFatal = (reason: string) => {
      for (const [, cb] of callbacks) {
        cb.reject(new Error(reason));
      }
      callbacks.clear();
      worker = null; // force a fresh worker on the next call — self-healing
    };
    worker.onerror = () => handleFatal('The bundler worker crashed unexpectedly. It has been restarted — try again.');
    worker.onmessageerror = () => handleFatal('The bundler worker sent an unreadable message and was restarted — try again.');`
);

// Update bundle to add timeout
content = content.replace(
  `  const rawCode = await new Promise<string>((resolve, reject) => {
    callbacks.set(id, { resolve, reject, onProgress });
    w.postMessage({
      type: 'BUILD',
      id,
      files,
      entryPoint,
      wasmUrl
    });
  });`,
  `  const rawCode = await new Promise<string>((resolve, reject) => {
    const BUILD_TIMEOUT_MS = 45000;
    const timeoutHandle = setTimeout(() => {
      callbacks.delete(id);
      if (typeof worker?.terminate === 'function') {
        worker.terminate();
      }
      worker = null;
      reject(new Error('Build timed out after 45s — this can happen on a slow connection while downloading a dependency for the first time, or if a dependency is unusually large. Check your connection and try again.'));
    }, BUILD_TIMEOUT_MS);

    const safeResolve = (val: any) => {
      clearTimeout(timeoutHandle);
      resolve(val);
    };

    const safeReject = (err: any) => {
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
  });`
);

fs.writeFileSync('src/services/bundler/bundler.ts', content);
