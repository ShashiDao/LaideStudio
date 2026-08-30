import { describe, it, expect, vi } from 'vitest';
import { runNodeCodeSandbox } from './sandboxRunner';
import type { FileItem } from '../../db';

describe('sandboxRunner', () => {
  it('should gracefully fail when Web Workers are unavailable', async () => {
    const originalWorker = globalThis.Worker;
    // @ts-expect-error Worker is undefined in happy-dom environment but we need to delete it
    delete globalThis.Worker;
    
    const result = await runNodeCodeSandbox('console.log("hello")', {}, []);
    expect(result.outputType).toBe('stderr');
    expect(result.outputText).toContain('Failed to initialize sandbox: Worker is not defined');
    
    if (originalWorker !== undefined) {
      globalThis.Worker = originalWorker;
    }
  });

  it('should evaluate code and return output via mock Worker', async () => {
    class MockWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: ((e: ErrorEvent) => void) | null = null;
      
      constructor(public url: string) {}
      
      postMessage(data: { codeToRun: string; env: Record<string, string>; files: FileItem[] }) {
        setTimeout(() => {
          if (this.onmessage) {
            this.onmessage({ data: { type: 'DONE', logs: ['hello from worker', data.codeToRun] } } as unknown as MessageEvent);
          }
        }, 10);
      }
      
      terminate() {}
    }
    
    const originalWorker = globalThis.Worker;
    globalThis.Worker = MockWorker as unknown as typeof Worker;
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
    globalThis.URL.revokeObjectURL = vi.fn();
    
    const result = await runNodeCodeSandbox('1+1', {}, []);
    expect(result.outputType).toBe('stdout');
    expect(result.outputText).toBe('hello from worker\n1+1');
    
    if (originalWorker !== undefined) {
      globalThis.Worker = originalWorker;
    } else {
      // @ts-expect-error Worker is undefined in happy-dom environment but we need to delete it
      delete globalThis.Worker;
    }
  });
});
