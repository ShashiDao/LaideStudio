import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bundle, _setBundlerWorkerForTesting } from './bundler';

describe('bundler dependency cache & progress', () => {
  beforeEach(() => {
    _setBundlerWorkerForTesting(null);
    vi.restoreAllMocks();
  });

  it('bundle escapes literal </script> strings to prevent preview HTML breakage', async () => {
    class MockWorker {
      constructor() {
        setTimeout(() => this.onmessage?.({ data: { type: "READY" } } as any), 0);
      }
      onmessage: ((e: MessageEvent) => void) | null = null;
      terminate = vi.fn();
      postMessage(data: any) {
        if (data.type === 'BUILD') {
          setTimeout(() => {
            this.onmessage?.({
              data: { id: data.id, type: 'SUCCESS', code: 'const test = "</script>";' }
            } as MessageEvent);
          }, 0);
        }
      }
    }
    vi.stubGlobal('Worker', MockWorker);
    
    const promise = bundle([], '/src/main.tsx');
    const res = await promise;
    expect(res).toContain('<\\/script>');
  });
});
