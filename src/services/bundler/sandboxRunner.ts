import type { FileItem } from '../../db';

export async function runNodeCodeSandbox(code: string, env: Record<string, string>, files: FileItem[]): Promise<{ outputText: string; outputType: 'stdout' | 'stderr' }> {
  return new Promise((resolve) => {
    let worker: Worker | null = null;
    let blobUrl = '';

    const cleanup = () => {
      if (worker) {
        try { worker.terminate(); } catch { /* ignore */ }
        worker = null;
      }
      if (blobUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
        try { URL.revokeObjectURL(blobUrl); } catch { /* ignore */ }
      }
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve({ outputType: 'stderr', outputText: 'Error: Execution timed out after 30 seconds.' });
    }, 30000);

    try {
      const workerCode = `
        (function() {
          const rawPostMessage = typeof self !== 'undefined' && self.postMessage ? self.postMessage.bind(self) : null;

          function createSecurityTrap(apiName) {
            const err = function() {
              throw new Error('SecurityError: Access to ' + apiName + ' is disabled in this sandboxed environment.');
            };
            return new Proxy(err, {
              get: function(_target, prop) {
                if (prop === Symbol.toPrimitive || prop === 'toString' || prop === 'valueOf') {
                  return function() {
                    return '[SecurityDisabled: ' + apiName + ']';
                  };
                }
                throw new Error('SecurityError: Access to ' + apiName + ' is disabled in this sandboxed environment.');
              },
              apply: function() {
                throw new Error('SecurityError: Access to ' + apiName + ' is disabled in this sandboxed environment.');
              },
              construct: function() {
                throw new Error('SecurityError: Access to ' + apiName + ' is disabled in this sandboxed environment.');
              },
              set: function() {
                throw new Error('SecurityError: Modifying ' + apiName + ' is disabled in this sandboxed environment.');
              },
              defineProperty: function() {
                throw new Error('SecurityError: Defining properties on ' + apiName + ' is disabled in this sandboxed environment.');
              },
              deleteProperty: function() {
                throw new Error('SecurityError: Deleting properties on ' + apiName + ' is disabled in this sandboxed environment.');
              }
            });
          }

          const DANGEROUS_APIS = [
            'indexedDB',
            'fetch',
            'caches',
            'importScripts',
            'XMLHttpRequest',
            'WebSocket',
            'EventSource',
            'BroadcastChannel',
            'Worker',
            'SharedWorker',
            'postMessage',
            'openDatabase'
          ];

          function neutralizeApi(target, name) {
            if (!target) return;
            const trap = createSecurityTrap(name);
            const desc = {
              get: function() { return trap; },
              set: function() {
                throw new Error('SecurityError: Modifying ' + name + ' is disabled in this sandboxed environment.');
              },
              configurable: false,
              enumerable: false
            };
            try {
              Object.defineProperty(target, name, desc);
            } catch (_) {}
          }

          for (let i = 0; i < DANGEROUS_APIS.length; i++) {
            const api = DANGEROUS_APIS[i];
            if (typeof self !== 'undefined') neutralizeApi(self, api);
            if (typeof globalThis !== 'undefined') neutralizeApi(globalThis, api);
            if (typeof WorkerGlobalScope !== 'undefined' && WorkerGlobalScope.prototype) {
              neutralizeApi(WorkerGlobalScope.prototype, api);
            }
            if (typeof DedicatedWorkerGlobalScope !== 'undefined' && DedicatedWorkerGlobalScope.prototype) {
              neutralizeApi(DedicatedWorkerGlobalScope.prototype, api);
            }
          }

          if (typeof navigator !== 'undefined' && navigator) {
            neutralizeApi(navigator, 'serviceWorker');
          }

          const scopedTraps = {};
          for (let i = 0; i < DANGEROUS_APIS.length; i++) {
            scopedTraps[DANGEROUS_APIS[i]] = createSecurityTrap(DANGEROUS_APIS[i]);
          }

          const sanitizedScope = new Proxy(typeof self !== 'undefined' ? self : {}, {
            get: function(target, prop) {
              if (typeof prop === 'string' && scopedTraps[prop]) {
                return scopedTraps[prop];
              }
              if (prop === 'self' || prop === 'globalThis' || prop === 'window') {
                return sanitizedScope;
              }
              return target[prop];
            },
            set: function(target, prop, value) {
              if (typeof prop === 'string' && scopedTraps[prop]) {
                throw new Error('SecurityError: Modifying ' + prop + ' is disabled in this sandboxed environment.');
              }
              target[prop] = value;
              return true;
            }
          });

          self.onmessage = function(e) {
            const { codeToRun, env, files } = e.data;
            const capturedLogs = [];
            const fakeConsole = {
              log: (...msgs) => capturedLogs.push(msgs.map(m => typeof m === 'object' ? JSON.stringify(m, null, 2) : String(m)).join(' ')),
              warn: (...msgs) => capturedLogs.push('[warn] ' + msgs.join(' ')),
              error: (...msgs) => capturedLogs.push('[error] ' + msgs.join(' ')),
              info: (...msgs) => capturedLogs.push('[info] ' + msgs.join(' '))
            };

            try {
              const runner = new Function(
                'console',
                'env',
                'files',
                'self',
                'globalThis',
                'window',
                'indexedDB',
                'fetch',
                'caches',
                'importScripts',
                'XMLHttpRequest',
                'WebSocket',
                'EventSource',
                'BroadcastChannel',
                'Worker',
                'SharedWorker',
                'postMessage',
                '"use strict";\\n' + codeToRun
              );
              const evalResult = runner(
                fakeConsole,
                env,
                files,
                sanitizedScope,
                sanitizedScope,
                sanitizedScope,
                scopedTraps.indexedDB,
                scopedTraps.fetch,
                scopedTraps.caches,
                scopedTraps.importScripts,
                scopedTraps.XMLHttpRequest,
                scopedTraps.WebSocket,
                scopedTraps.EventSource,
                scopedTraps.BroadcastChannel,
                scopedTraps.Worker,
                scopedTraps.SharedWorker,
                scopedTraps.postMessage
              );
              if (evalResult !== undefined) {
                capturedLogs.push(typeof evalResult === 'object' ? JSON.stringify(evalResult, null, 2) : String(evalResult));
              }
              if (rawPostMessage) {
                rawPostMessage({ type: 'DONE', logs: capturedLogs });
              }
            } catch (err) {
              if (rawPostMessage) {
                rawPostMessage({ type: 'ERROR', logs: capturedLogs, error: (err && err.message) ? err.message : String(err) });
              }
            }
          };
        })();
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      blobUrl = URL.createObjectURL(blob);
      worker = new Worker(blobUrl);

      worker.onmessage = (e) => {
        clearTimeout(timeout);
        cleanup();
        if (e.data && e.data.type === 'DONE') {
          const out = e.data.logs.join('\n') || '[Process completed with exit code 0]';
          resolve({ outputType: 'stdout', outputText: out });
        } else if (e.data && e.data.type === 'ERROR') {
          const prefix = e.data.logs.length > 0 ? e.data.logs.join('\n') + '\n' : '';
          resolve({ outputType: 'stderr', outputText: prefix + 'Error: ' + e.data.error });
        }
      };

      worker.onerror = (e) => {
        clearTimeout(timeout);
        cleanup();
        resolve({ outputType: 'stderr', outputText: 'Worker Error: ' + (e.message || 'Unknown error') });
      };

      worker.postMessage({ codeToRun: code, env, files });
    } catch (err) {
      clearTimeout(timeout);
      cleanup();
      resolve({ outputType: 'stderr', outputText: 'Failed to initialize sandbox: ' + (err instanceof Error ? err.message : String(err)) });
    }
  });
}


