import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runProjectTestsDetailed, runTestsFromOverlay, runTestsDetailedFromOverlay } from './testRunner';
import type { FileItem } from '../../db';
import { AgentWorkspaceOverlay } from '../agent/workspace/overlay';

vi.mock('./bundler', () => ({
  bundle: vi.fn().mockResolvedValue('console.log("mock bundled tests");')
}));

describe('testRunner sandboxed execution', () => {
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

    async postMessage(_data: { moduleUrl?: string }) {
      const blob = blobContentMap.get(this.blobUrl);
      let bootstrapCode = '';
      if (blob) {
        bootstrapCode = await blob.text();
      }

      // Verify that SANDBOX_GUARD_PREAMBLE is in bootstrapCode
      expect(bootstrapCode).toContain('SecurityDisabled');
      expect(bootstrapCode).toContain('indexedDB');
      expect(bootstrapCode).toContain('sendBeacon');

      if (this.onmessage) {
        this.onmessage({
          data: {
            type: 'DONE',
            data: {
              passed: 2,
              failed: 0,
              results: ['✓ test 1', '✓ test 2']
            }
          }
        } as MessageEvent);
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

  it('runs tests inside the sandboxed bootstrap worker with security guard', async () => {
    const files: FileItem[] = [
      {
        id: 'f1',
        projectId: 'p1',
        path: '/src/math.test.ts',
        content: `
          import { describe, it, expect } from 'vitest';
          describe('math', () => {
            it('adds', () => {
              expect(1 + 1).toBe(2);
            });
          });
        `,
        updatedAt: Date.now()
      }
    ];

    const result = await runProjectTestsDetailed(files);
    expect(result.status).toBe('passed');
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.output).toContain('Passed: 2');
  });

  it('runTestsFromOverlay and runTestsDetailedFromOverlay execute tests against candidate overlay', async () => {
    const overlay = new AgentWorkspaceOverlay('p1', [
      {
        id: 'f1',
        projectId: 'p1',
        path: '/src/math.test.ts',
        content: `
          import { describe, it, expect } from 'vitest';
          describe('math', () => {
            it('adds', () => {
              expect(1 + 1).toBe(2);
            });
          });
        `,
        updatedAt: Date.now()
      }
    ]);

    const strResult = await runTestsFromOverlay(overlay);
    expect(strResult).toContain('Passed: 2');

    const detailedResult = await runTestsDetailedFromOverlay(overlay);
    expect(detailedResult.status).toBe('passed');
    expect(detailedResult.passed).toBe(2);
  });

  it('runTestsFromOverlay fails closed when overlay is missing or invalid', async () => {
    // @ts-expect-error test missing overlay
    await expect(runTestsFromOverlay(null)).rejects.toThrow('Missing WorkspaceOverlay');
    // @ts-expect-error test invalid overlay
    await expect(runTestsDetailedFromOverlay({})).rejects.toThrow('Missing WorkspaceOverlay');
  });
});

