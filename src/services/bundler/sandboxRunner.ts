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
            const runner = new Function('console', 'env', 'files', '"use strict";\\n' + codeToRun);
            const evalResult = runner(fakeConsole, env, files);
            if (evalResult !== undefined) {
              capturedLogs.push(typeof evalResult === 'object' ? JSON.stringify(evalResult, null, 2) : String(evalResult));
            }
            self.postMessage({ type: 'DONE', logs: capturedLogs });
          } catch (err) {
            self.postMessage({ type: 'ERROR', logs: capturedLogs, error: err.message || String(err) });
          }
        };
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
