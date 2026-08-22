const fs = require('fs');

let content = fs.readFileSync('src/services/bundler/bundler.test.ts', 'utf-8');

// I'll append the new tests inside the describe block
const newTests = `
  it('bundle rejects with timeout message when worker never calls back', async () => {
    vi.useFakeTimers();
    class MockWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      terminate = vi.fn();
      postMessage(data: { type: string; id: number }) {
        // Do nothing, simulate hang
      }
    }
    vi.stubGlobal('Worker', MockWorker);
    
    const promise = bundle([], '/src/main.tsx');
    vi.advanceTimersByTime(45000);
    
    await expect(promise).rejects.toThrow(/Build timed out after 45s/);
    vi.useRealTimers();
  });

  it('bundle rejects when worker.onerror fires', async () => {
    class MockWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      postMessage(data: { type: string; id: number }) {
        if (data.type === 'BUILD') {
          setTimeout(() => {
            this.onerror?.();
          }, 0);
        }
      }
    }
    vi.stubGlobal('Worker', MockWorker);
    
    const promise = bundle([], '/src/main.tsx');
    await expect(promise).rejects.toThrow(/crashed unexpectedly/);
  });
`;

content = content.replace('});\n', newTests + '});\n');
fs.writeFileSync('src/services/bundler/bundler.test.ts', content);
const fs2 = require('fs');
let content2 = fs2.readFileSync('src/services/bundler/bundler.test.ts', 'utf-8');

const newTest2 = `
  it('bundle handles two builds sent back to back gracefully', async () => {
    class MockWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      postMessage(data: { type: string; id: number }) {
        if (data.type === 'BUILD') {
          setTimeout(() => {
            this.onmessage?.({
              data: { id: data.id, type: 'SUCCESS', code: 'export const test = ' + data.id + ';' }
            } as MessageEvent);
          }, Math.random() * 50);
        }
      }
    }
    vi.stubGlobal('Worker', MockWorker);
    
    const p1 = bundle([], '/src/main.tsx');
    const p2 = bundle([], '/src/main.tsx');
    
    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1).toContain('export const test =');
    expect(res2).toContain('export const test =');
  });
`;

content2 = content2.replace('});\n', newTest2 + '});\n');
fs2.writeFileSync('src/services/bundler/bundler.test.ts', content2);
