import type { FileItem } from '../../db';

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

export async function runProjectTests(files: FileItem[]): Promise<string> {
  const testFiles = files.filter(f => 
    f.path.endsWith('.test.ts') || 
    f.path.endsWith('.test.tsx') || 
    f.path.endsWith('.spec.ts') || 
    f.path.endsWith('.spec.tsx') ||
    f.path.endsWith('.test.js') ||
    f.path.endsWith('.test.jsx')
  );

  if (testFiles.length === 0) {
    return 'No test files found.';
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
    const { bundle } = await import('./bundler');
    const bundledCode = await bundle(buildFiles, '/_tests_entry.ts');

    return new Promise((resolve, _reject) => {
      const blob = new Blob([bundledCode], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url, { type: 'module' });

      const timeout = setTimeout(() => {
        worker.terminate();
        resolve('Tests timed out after 30 seconds.');
      }, 30000);

      worker.onmessage = (e) => {
        if (e.data && e.data.type === 'DONE') {
          clearTimeout(timeout);
          worker.terminate();
          const { passed, failed, results } = e.data.data;
          let output = `Tests run: ${passed + failed}, Passed: ${passed}, Failed: ${failed}\n\n`;
          output += results.join('\n');
          resolve(output);
        } else if (e.data && e.data.type === 'ERROR') {
          clearTimeout(timeout);
          worker.terminate();
          resolve(`Test execution error: ${e.data.error}`);
        }
      };

      worker.onerror = (e) => {
        clearTimeout(timeout);
        worker.terminate();
        resolve(`Worker error: ${e.message}`);
      };
    });

  } catch (err: any) {
    return `Failed to bundle tests: ${err.message || String(err)}`;
  }
}

