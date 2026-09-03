import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, type FileItem } from '../../../db';
import * as vfsModule from '../../fs/vfs';
import { executeAgentTool, type ToolExecutionContext } from '../tools';
import { AgentWorkspaceOverlay } from './overlay';
import { verifyBuildFromOverlay } from '../../bundler/buildRunner';
import { runTestsFromOverlay, runTestsDetailedFromOverlay } from '../../bundler/testRunner';
import { _setBundlerWorkerForTesting } from '../../bundler/bundler';

describe('WorkspaceOverlay Verification Consistency & Fail-Closed Audit', () => {
  const projectId = 'test-proj-audit-1';
  let lastBundledFiles: Array<{ path: string; content: string }> = [];

  class AuditMockWorker {
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;
    terminate = vi.fn();

    constructor(public url?: string) {
      setTimeout(() => {
        this.onmessage?.({ data: { type: 'READY' } } as MessageEvent);
      }, 0);
    }

    postMessage(data: any) {
      if (data && data.type === 'BUILD') {
        lastBundledFiles = data.files || [];
        const hasSyntaxError = data.files.some((f: any) =>
          f.content.includes('<divBroken') || f.content.includes('SYNTAX_ERROR')
        );

        setTimeout(() => {
          if (hasSyntaxError) {
            this.onmessage?.({
              data: {
                id: data.id,
                type: 'ERROR',
                error: 'SyntaxError: Unexpected token in candidate file'
              }
            } as MessageEvent);
          } else {
            const bundledCode = `/* BUNDLED [${data.entryPoint}] */\n` +
              data.files.map((f: any) => `// ${f.path}\n${f.content}`).join('\n');
            this.onmessage?.({
              data: {
                id: data.id,
                type: 'SUCCESS',
                code: bundledCode
              }
            } as MessageEvent);
          }
        }, 0);
      } else if (data && data.moduleUrl) {
        // Test runner worker
        const hasBrokenTest = lastBundledFiles.some((f: any) =>
          f.content.includes('always fails in canonical')
        );
        const hasMultiTest = lastBundledFiles.some((f: any) =>
          f.content.includes('multi-function tests')
        );
        const hasCandidateCalc = lastBundledFiles.some((f: any) =>
          f.content.includes('candidate calc tests')
        );

        let passed = 1;
        let failed = 0;
        const results: string[] = [];

        if (hasBrokenTest) {
          passed = 0;
          failed = 1;
          results.push('✕ obsolete test > always fails in canonical');
        } else if (hasMultiTest) {
          passed = 2;
          failed = 0;
          results.push('✓ multi-function tests > adds numbers', '✓ multi-function tests > multiplies numbers');
        } else if (hasCandidateCalc) {
          passed = 1;
          failed = 0;
          results.push('✓ candidate calc tests > verifies scaled calculation in overlay');
        } else {
          results.push('✓ calc tests > adds numbers correctly');
        }

        setTimeout(() => {
          this.onmessage?.({
            data: {
              type: 'DONE',
              data: {
                passed,
                failed,
                results
              }
            }
          } as MessageEvent);
        }, 0);
      }
    }
  }

  const baseFiles: FileItem[] = [
    {
      id: 'f-pkg',
      projectId,
      path: '/package.json',
      content: JSON.stringify({
        name: 'test-app',
        dependencies: {
          'react': '^18.3.1',
          'react-dom': '^18.3.1'
        }
      }),
      updatedAt: 1000
    },
    {
      id: 'f-main',
      projectId,
      path: '/src/main.tsx',
      content: `import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { add } from './calc';

export function mount() {
  const root = createRoot(document.getElementById('root')!);
  root.render(<App />);
  return add(1, 2);
}
mount();`,
      updatedAt: 1000
    },
    {
      id: 'f-app',
      projectId,
      path: '/src/App.tsx',
      content: `import React from 'react';
export function App() {
  return <div>Canonical App</div>;
}`,
      updatedAt: 1000
    },
    {
      id: 'f-calc',
      projectId,
      path: '/src/calc.ts',
      content: `export function add(a: number, b: number): number {
  return a + b;
}`,
      updatedAt: 1000
    },
    {
      id: 'f-test',
      projectId,
      path: '/src/calc.test.ts',
      content: `import { describe, it, expect } from 'vitest';
import { add } from './calc';

describe('calc tests', () => {
  it('adds numbers correctly', () => {
    expect(add(2, 3)).toBe(5);
  });
});`,
      updatedAt: 1000
    }
  ];

  const originalWorker = globalThis.Worker;
  const originalCreateObjectURL = globalThis.URL?.createObjectURL;
  const originalRevokeObjectURL = globalThis.URL?.revokeObjectURL;

  beforeEach(async () => {
    lastBundledFiles = [];
    _setBundlerWorkerForTesting(null);
    vi.stubGlobal('Worker', AuditMockWorker);
    globalThis.URL.createObjectURL = vi.fn((_blob: Blob) => `blob:mock-${Math.random()}`);
    globalThis.URL.revokeObjectURL = vi.fn();
    await db.files.clear();
    await db.projects.clear();
    await db.files.bulkAdd(baseFiles.map(f => ({ ...f })));
  });

  afterEach(() => {
    _setBundlerWorkerForTesting(null);
    if (originalWorker !== undefined) {
      globalThis.Worker = originalWorker;
    } else {
      // @ts-expect-error cleanup
      delete globalThis.Worker;
    }
    globalThis.URL.createObjectURL = originalCreateObjectURL;
    globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  // 1. Tests see overlay modifications rather than canonical content
  it('Requirement 1: run_tests evaluates candidate overlay modifications rather than canonical VFS', async () => {
    // Canonical VFS has calc.ts returning a + b.
    // In overlay, agent updates calc.ts to break the function or change behavior,
    // and updates calc.test.ts to test candidate behavior.
    const overlay = new AgentWorkspaceOverlay(projectId, await vfsModule.listFiles(projectId));
    const context: ToolExecutionContext = { overlay };

    // Update calc.ts in overlay
    await executeAgentTool('write_file', JSON.stringify({
      path: '/src/calc.ts',
      type: 'replace',
      newContent: `export function add(a: number, b: number): number {
  return (a + b) * 10;
}`,
      rationale: 'Scale calculation in candidate'
    }), projectId, context);

    // Update calc.test.ts in overlay to expect the scaled result
    await executeAgentTool('write_file', JSON.stringify({
      path: '/src/calc.test.ts',
      type: 'replace',
      newContent: `import { describe, it, expect } from 'vitest';
import { add } from './calc';

describe('candidate calc tests', () => {
  it('verifies scaled calculation in overlay', () => {
    expect(add(2, 3)).toBe(50);
  });
});`,
      rationale: 'Update test to match candidate logic'
    }), projectId, context);

    // Run tests through agent verification tool
    const testResult = await executeAgentTool('run_tests', '{}', projectId, context);
    expect(testResult).toContain('Passed: 1');
    expect(testResult).toContain('candidate calc tests');

    // Canonical VFS is completely unchanged
    const canonicalCalc = await db.files.where({ projectId, path: '/src/calc.ts' }).first();
    expect(canonicalCalc?.content).toBe(`export function add(a: number, b: number): number {
  return a + b;
}`);
    const canonicalTest = await db.files.where({ projectId, path: '/src/calc.test.ts' }).first();
    expect(canonicalTest?.content).toContain('expect(add(2, 3)).toBe(5);');
  });

  // 2. Build sees overlay modifications rather than canonical content
  it('Requirement 2: build_project compiles candidate overlay modifications rather than canonical VFS', async () => {
    // Break canonical App.tsx in canonical VFS
    await db.files.where({ projectId, path: '/src/App.tsx' }).modify({
      content: 'export function App() { return <divBroken JSX syntax'
    });

    const overlay = new AgentWorkspaceOverlay(projectId, await vfsModule.listFiles(projectId));
    const context: ToolExecutionContext = { overlay };

    // Overlay writes a valid, fixed App component
    await executeAgentTool('write_file', JSON.stringify({
      path: '/src/App.tsx',
      type: 'replace',
      newContent: `import React from 'react';
export function App() {
  return <div>Repaired Component in Candidate Overlay</div>;
}`,
      rationale: 'Fix broken component syntax in candidate overlay'
    }), projectId, context);

    // Verify build through agent tool succeeds against candidate overlay
    const buildResult = await executeAgentTool('build_project', '{}', projectId, context);
    expect(buildResult).toContain('Build verification succeeded');
    expect(buildResult).toContain('/src/main.tsx');

    // Canonical VFS still contains the broken JSX syntax
    const canonicalApp = await db.files.where({ projectId, path: '/src/App.tsx' }).first();
    expect(canonicalApp?.content).toBe('export function App() { return <divBroken JSX syntax');
  });

  // 3. Tests and build both observe the same sequential candidate state
  it('Requirement 3: run_tests and build_project both evaluate the exact same accumulated candidate state', async () => {
    const overlay = new AgentWorkspaceOverlay(projectId, await vfsModule.listFiles(projectId));
    const context: ToolExecutionContext = { overlay };

    // Sequential Write 1: Add new utility to calc.ts
    await executeAgentTool('write_file', JSON.stringify({
      path: '/src/calc.ts',
      type: 'replace',
      newContent: `export function add(a: number, b: number): number {
  return a + b;
}
export function multiply(a: number, b: number): number {
  return a * b;
}`,
      rationale: 'Add multiply utility'
    }), projectId, context);

    // Sequential Write 2: Add test asserting multiply works
    await executeAgentTool('write_file', JSON.stringify({
      path: '/src/calc.test.ts',
      type: 'replace',
      newContent: `import { describe, it, expect } from 'vitest';
import { add, multiply } from './calc';

describe('multi-function tests', () => {
  it('adds numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
  it('multiplies numbers', () => {
    expect(multiply(3, 4)).toBe(12);
  });
});`,
      rationale: 'Test add and multiply'
    }), projectId, context);

    // Sequential Write 3: Import and use multiply in App.tsx
    await executeAgentTool('write_file', JSON.stringify({
      path: '/src/App.tsx',
      type: 'replace',
      newContent: `import React from 'react';
import { multiply } from './calc';

export function App() {
  return <div>Result: {multiply(3, 4)}</div>;
}`,
      rationale: 'Render multiply result in App'
    }), projectId, context);

    // 1. Build verification against candidate
    const buildRes = await executeAgentTool('build_project', '{}', projectId, context);
    expect(buildRes).toContain('Build verification succeeded');

    // 2. Test verification against candidate
    const testRes = await executeAgentTool('run_tests', '{}', projectId, context);
    expect(testRes).toContain('Passed: 2');
    expect(testRes).toContain('multiplies numbers');

    // Canonical VFS has NONE of the 3 sequential changes
    const canonicalCalc = await db.files.where({ projectId, path: '/src/calc.ts' }).first();
    expect(canonicalCalc?.content).not.toContain('multiply');
    const canonicalApp = await db.files.where({ projectId, path: '/src/App.tsx' }).first();
    expect(canonicalApp?.content).not.toContain('multiply');
  });

  // 4. Overlay deletions are respected by both tests and build
  it('Requirement 4: deletions in candidate overlay are respected by both tests and build', async () => {
    // Add an obsolete broken test file and obsolete file to canonical VFS
    const brokenTestFile: FileItem = {
      id: 'f-obsolete-test',
      projectId,
      path: '/src/obsolete.test.ts',
      content: `import { describe, it, expect } from 'vitest';
describe('obsolete test', () => {
  it('always fails in canonical', () => {
    expect(1).toBe(2);
  });
});`,
      updatedAt: 1000
    };
    await db.files.add(brokenTestFile);

    const overlay = new AgentWorkspaceOverlay(projectId, await vfsModule.listFiles(projectId));
    const context: ToolExecutionContext = { overlay };

    // Delete obsolete test file in candidate overlay
    await executeAgentTool('write_file', JSON.stringify({
      path: '/src/obsolete.test.ts',
      type: 'delete',
      newContent: '',
      rationale: 'Remove obsolete failing test'
    }), projectId, context);

    // Test verification: obsolete test is NOT executed
    const testRes = await executeAgentTool('run_tests', '{}', projectId, context);
    expect(testRes).toContain('Passed: 1');
    expect(testRes).not.toContain('always fails in canonical');

    // Build verification: bundling succeeds with deleted file omitted
    const buildRes = await executeAgentTool('build_project', '{}', projectId, context);
    expect(buildRes).toContain('Build verification succeeded');

    // Canonical VFS still holds the obsolete file
    const canonicalObsolete = await db.files.where({ projectId, path: '/src/obsolete.test.ts' }).first();
    expect(canonicalObsolete).toBeDefined();
    expect(canonicalObsolete?.content).toContain('always fails in canonical');
  });

  // 5. Canonical VFS remains strictly byte-for-byte identical before and after verification
  it('Requirement 5: canonical VFS records remain byte-for-byte identical across verification calls', async () => {
    const beforeRecords = await db.files.where({ projectId }).toArray();
    const beforeSerialized = JSON.stringify(beforeRecords.sort((a, b) => a.path.localeCompare(b.path)));

    const overlay = new AgentWorkspaceOverlay(projectId, await vfsModule.listFiles(projectId));
    const context: ToolExecutionContext = { overlay };

    // Perform writes to overlay
    await executeAgentTool('write_file', JSON.stringify({
      path: '/src/App.tsx',
      type: 'replace',
      newContent: 'export const App = () => <div>New Candidate</div>;',
      rationale: 'Modify app in overlay'
    }), projectId, context);

    // Perform both verification operations
    await executeAgentTool('build_project', '{}', projectId, context);
    await executeAgentTool('run_tests', '{}', projectId, context);

    const afterRecords = await db.files.where({ projectId }).toArray();
    const afterSerialized = JSON.stringify(afterRecords.sort((a, b) => a.path.localeCompare(b.path)));

    expect(afterSerialized).toBe(beforeSerialized);
  });

  // 6. The exact same WorkspaceOverlay instance is passed through the agent verification path
  it('Requirement 6: exact same WorkspaceOverlay instance is passed to all tool calls in context', async () => {
    const overlay = new AgentWorkspaceOverlay(projectId, await vfsModule.listFiles(projectId));
    const context: ToolExecutionContext = { overlay };

    const materializeSpy = vi.spyOn(overlay, 'materialize');

    await executeAgentTool('build_project', '{}', projectId, context);
    await executeAgentTool('run_tests', '{}', projectId, context);

    // materialize must have been called on this exact overlay instance for both verification tools
    expect(materializeSpy).toHaveBeenCalledTimes(2);
  });

  // 7. Missing overlay fails closed for every agent-facing verification path
  it('Requirement 7: fail-closed enforcement rejects missing overlay context across all verification paths', async () => {
    // run_tests without overlay
    const testResult1 = await executeAgentTool('run_tests', '{}', projectId, {});
    expect(testResult1).toContain('Error: Test verification failed. Missing active WorkspaceOverlay in execution context.');

    // verify_tests alias without overlay
    const testResult2 = await executeAgentTool('verify_tests', '{}', projectId, {});
    expect(testResult2).toContain('Error: Test verification failed. Missing active WorkspaceOverlay in execution context.');

    // build_project without overlay
    const buildResult1 = await executeAgentTool('build_project', '{}', projectId, {});
    expect(buildResult1).toContain('Error: Build verification failed. Missing active WorkspaceOverlay in execution context.');

    // verify_build alias without overlay
    const buildResult2 = await executeAgentTool('verify_build', '{}', projectId, {});
    expect(buildResult2).toContain('Error: Build verification failed. Missing active WorkspaceOverlay in execution context.');

    // Direct helper functions also fail closed
    // @ts-expect-error missing overlay test
    await expect(runTestsFromOverlay(null)).rejects.toThrow('Missing WorkspaceOverlay: runTestsFromOverlay requires a valid WorkspaceOverlay instance.');
    // @ts-expect-error missing overlay test
    await expect(runTestsDetailedFromOverlay(null)).rejects.toThrow('Missing WorkspaceOverlay: runTestsDetailedFromOverlay requires a valid WorkspaceOverlay instance.');
    // @ts-expect-error missing overlay test
    await expect(verifyBuildFromOverlay(null)).rejects.toThrow('Missing WorkspaceOverlay: verifyBuildFromOverlay requires a valid WorkspaceOverlay instance.');
  });

  // 8. No verification path falls back to listFiles(projectId)
  it('Requirement 8: verification tools never fall back to listFiles(projectId)', async () => {
    const listFilesSpy = vi.spyOn(vfsModule, 'listFiles');

    const overlay = new AgentWorkspaceOverlay(projectId, await vfsModule.listFiles(projectId));
    listFilesSpy.mockClear();

    const context: ToolExecutionContext = { overlay };

    // Execute build verification with overlay
    await executeAgentTool('build_project', '{}', projectId, context);
    expect(listFilesSpy).not.toHaveBeenCalled();

    // Execute test verification with overlay
    await executeAgentTool('run_tests', '{}', projectId, context);
    expect(listFilesSpy).not.toHaveBeenCalled();

    // Execute aliases with overlay
    await executeAgentTool('verify_build', '{}', projectId, context);
    expect(listFilesSpy).not.toHaveBeenCalled();

    await executeAgentTool('verify_tests', '{}', projectId, context);
    expect(listFilesSpy).not.toHaveBeenCalled();

    // Execute all without overlay (fail-closed)
    await executeAgentTool('build_project', '{}', projectId, {});
    await executeAgentTool('run_tests', '{}', projectId, {});
    await executeAgentTool('verify_build', '{}', projectId, {});
    await executeAgentTool('verify_tests', '{}', projectId, {});

    // listFiles must NEVER have been called during any verification attempt
    expect(listFilesSpy).not.toHaveBeenCalled();
  });
});
