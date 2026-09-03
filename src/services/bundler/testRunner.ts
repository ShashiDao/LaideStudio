import type { FileItem, ProvenanceTestResult } from '../../db';
import { bundle } from './bundler';
import { SANDBOX_GUARD_PREAMBLE } from './sandboxGuard';
import type { WorkspaceOverlay } from '../agent/workspace/overlay';

const VITEST_SHIM = `
export const tests = [];
let currentDescribe = '';

export function describe(name, fn) {
  const prev = currentDescribe;
  currentDescribe = currentDescribe ? currentDescribe + ' > ' + name : name;
  try {
    fn();
  } finally {
    currentDescribe = prev;
  }
}

export function it(name, fn) {
  const fullName = currentDescribe ? currentDescribe + ' > ' + name : name;
  tests.push({ name: fullName, fn });
}
export const test = it;

export function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) throw new Error(\`Expected \${expected} but got \${actual}\`);
    },
    toEqual(expected) {
      const a = JSON.stringify(actual);
      const e = JSON.stringify(expected);
      if (a !== e) throw new Error(\`Expected \${e} but got \${a}\`);
    },
    toBeTruthy() {
      if (!actual) throw new Error(\`Expected truthy value but got \${actual}\`);
    },
    toBeFalsy() {
      if (actual) throw new Error(\`Expected falsy value but got \${actual}\`);
    },
    toBeDefined() {
      if (actual === undefined) throw new Error(\`Expected defined value but got \${actual}\`);
    },
    toBeNull() {
      if (actual !== null) throw new Error(\`Expected null but got \${actual}\`);
    },
    toContain(expected) {
      if (!actual || typeof actual.includes !== 'function' || !actual.includes(expected)) {
        throw new Error(\`Expected \${actual} to contain \${expected}\`);
      }
    }
  };
}

export const vi = {
  fn: (impl) => {
    const mockFn = function(...args) {
      mockFn.mock.calls.push(args);
      if (impl) return impl.apply(this, args);
    };
    mockFn.mock = { calls: [] };
    mockFn.mockReturnValue = (val) => {
      impl = () => val;
      return mockFn;
    };
    mockFn.mockImplementation = (newImpl) => {
      impl = newImpl;
      return mockFn;
    };
    mockFn.mockResolvedValue = (val) => {
      impl = () => Promise.resolve(val);
      return mockFn;
    };
    mockFn.mockRejectedValue = (err) => {
      impl = () => Promise.reject(err);
      return mockFn;
    };
    return mockFn;
  }
};

export const beforeAllHooks = [];
export const afterAllHooks = [];
export const beforeEachHooks = [];
export const afterEachHooks = [];

export const beforeEach = (fn) => beforeEachHooks.push(fn);
export const afterEach = (fn) => afterEachHooks.push(fn);
export const beforeAll = (fn) => beforeAllHooks.push(fn);
export const afterAll = (fn) => afterAllHooks.push(fn);
`;

export async function runProjectTestsDetailed(files: FileItem[]): Promise<ProvenanceTestResult> {
  const testFiles = files.filter(f => 
    f.path.endsWith('.test.ts') || 
    f.path.endsWith('.test.tsx') || 
    f.path.endsWith('.spec.ts') || 
    f.path.endsWith('.spec.tsx') ||
    f.path.endsWith('.test.js') ||
    f.path.endsWith('.test.jsx')
  );

  if (testFiles.length === 0) {
    return {
      passed: 0,
      failed: 0,
      total: 0,
      status: 'no_tests',
      output: 'No test files found.'
    };
  }

  const entryCode = `
import { tests, beforeAllHooks, afterAllHooks, beforeEachHooks, afterEachHooks } from 'vitest';
${testFiles.map((f, i) => `import * as t${i} from '${f.path.replace(/\.[^/.]+$/, '')}';`).join('\n')}

async function __laide_runAllTests() {
  const results = [];
  let passed = 0;
  let failed = 0;
  
  for (const hook of beforeAllHooks) await hook();

  for (const t of tests) {
    try {
      for (const hook of beforeEachHooks) await hook();
      await t.fn();
      for (const hook of afterEachHooks) await hook();
      results.push('✅ ' + t.name);
      passed++;
    } catch (e) {
      results.push('❌ ' + t.name + '\\n   ' + (e.message || e));
      failed++;
    }
  }
  
  for (const hook of afterAllHooks) await hook();

  return { passed, failed, results };
}

__laide_runAllTests().then(res => self.postMessage({ type: 'DONE', data: res })).catch(e => self.postMessage({ type: 'ERROR', error: e.message || String(e) }));
`;

  const buildFiles = [
    ...files,
    { path: '/_vitest_shim.ts', content: VITEST_SHIM, type: 'file' as const },
    { path: '/_tests_entry.ts', content: entryCode, type: 'file' as const }
  ];

  try {
    const bundledCode = await bundle(buildFiles, '/_tests_entry.ts');

    if (typeof Worker === 'undefined') {
      return {
        passed: 0,
        failed: 0,
        total: 0,
        status: 'error',
        error: 'Web Workers are not supported in this environment.',
        output: 'Web Workers are not supported in this environment.'
      };
    }

    return new Promise((resolve) => {
      let worker: Worker | null = null;
      let testBlobUrl = '';
      let bootstrapUrl = '';

      const cleanup = () => {
        if (worker) {
          try { worker.terminate(); } catch { /* ignore */ }
          worker = null;
        }
        if (testBlobUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
          try { URL.revokeObjectURL(testBlobUrl); } catch { /* ignore */ }
        }
        if (bootstrapUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
          try { URL.revokeObjectURL(bootstrapUrl); } catch { /* ignore */ }
        }
      };

      const timeout = setTimeout(() => {
        cleanup();
        resolve({
          passed: 0,
          failed: 0,
          total: 0,
          status: 'error',
          error: 'Tests timed out after 30 seconds.',
          output: 'Tests timed out after 30 seconds.'
        });
      }, 30000);

      try {
        const bootstrapScript = SANDBOX_GUARD_PREAMBLE + `
self.onmessage = function(e) {
  if (!e.data || !e.data.moduleUrl) return;
  import(e.data.moduleUrl).catch(function(err) {
    self.postMessage({ type: 'ERROR', error: (err && err.message) ? err.message : String(err) });
  });
};`;

        const testBlob = new Blob([bundledCode], { type: 'application/javascript' });
        testBlobUrl = URL.createObjectURL(testBlob);
        const bootstrapBlob = new Blob([bootstrapScript], { type: 'application/javascript' });
        bootstrapUrl = URL.createObjectURL(bootstrapBlob);

        worker = new Worker(bootstrapUrl);

        worker.onmessage = (e) => {
          clearTimeout(timeout);
          if (e.data && e.data.type === 'DONE') {
            cleanup();
            const { passed, failed, results } = e.data.data;
            const failedTests = (results as string[])
              .filter(r => r.startsWith('❌ '))
              .map(r => r.replace(/^❌\s*/, '').split('\n')[0].trim());
            const output = `Tests run: ${passed + failed}, Passed: ${passed}, Failed: ${failed}\n\n` + (results as string[]).join('\n');
            resolve({
              passed,
              failed,
              total: passed + failed,
              failedTests,
              status: failed > 0 ? 'failed' : 'passed',
              output
            });
          } else if (e.data && e.data.type === 'ERROR') {
            cleanup();
            resolve({
              passed: 0,
              failed: 0,
              total: 0,
              status: 'error',
              error: e.data.error,
              output: `Test execution error: ${e.data.error}`
            });
          }
        };

        worker.onerror = (e) => {
          clearTimeout(timeout);
          cleanup();
          resolve({
            passed: 0,
            failed: 0,
            total: 0,
            status: 'error',
            error: e.message || 'Worker execution error',
            output: `Worker error: ${e.message || 'Unknown error'}`
          });
        };

        worker.postMessage({ moduleUrl: testBlobUrl });
      } catch (err: unknown) {
        clearTimeout(timeout);
        cleanup();
        const msg = err instanceof Error ? err.message : String(err);
        resolve({
          passed: 0,
          failed: 0,
          total: 0,
          status: 'error',
          error: msg,
          output: `Failed to initialize test worker: ${msg}`
        });
      }
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      passed: 0,
      failed: 0,
      total: 0,
      status: 'error',
      error: msg,
      output: `Failed to bundle tests: ${msg}`
    };
  }
}

export async function runProjectTests(files: FileItem[]): Promise<string> {
  const result = await runProjectTestsDetailed(files);
  return result.output || result.error || 'No output from tests.';
}

/**
 * Runs test verification against candidate files materialized
 * from the active WorkspaceOverlay.
 * Guarantees that verification tests the candidate workspace
 * without mutating or falling back to canonical VFS.
 */
export async function runTestsFromOverlay(
  overlay: WorkspaceOverlay
): Promise<string> {
  if (!overlay || typeof overlay.materialize !== 'function') {
    throw new Error('Missing WorkspaceOverlay: runTestsFromOverlay requires a valid WorkspaceOverlay instance.');
  }
  const files = await overlay.materialize();
  return runProjectTests(files);
}

export async function runTestsDetailedFromOverlay(
  overlay: WorkspaceOverlay
): Promise<ProvenanceTestResult> {
  if (!overlay || typeof overlay.materialize !== 'function') {
    throw new Error('Missing WorkspaceOverlay: runTestsDetailedFromOverlay requires a valid WorkspaceOverlay instance.');
  }
  const files = await overlay.materialize();
  return runProjectTestsDetailed(files);
}

