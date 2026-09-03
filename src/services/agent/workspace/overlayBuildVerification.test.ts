import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db, type FileItem } from '../../../db';
import { AgentWorkspaceOverlay } from './overlay';
import { verifyBuildFromOverlay, verifyProjectBuild } from '../../bundler/buildRunner';
import { _setBundlerWorkerForTesting } from '../../bundler/bundler';
import { executeAgentTool } from '../tools';

interface PostedBuildMessage {
  id: string;
  files: Array<{ path: string; content: string }>;
  entryPoint: string;
}

describe('WorkspaceOverlay Build Verification Pipeline (Requirements A-H)', () => {
  const projectId = 'test-proj-build-verif';
  let postedBuilds: PostedBuildMessage[] = [];

  class TestMockWorker {
    constructor() {
      setTimeout(() => this.onmessage?.({ data: { type: 'READY' } } as MessageEvent), 0);
    }
    onmessage: ((e: MessageEvent) => void) | null = null;
    terminate = vi.fn();
    postMessage(data: any) {
      if (data.type === 'BUILD') {
        postedBuilds.push({
          id: data.id,
          files: data.files,
          entryPoint: data.entryPoint
        });

        const hasSyntaxError = data.files.some((f: any) =>
          f.content.includes('SYNTAX_ERROR_BROKEN_CODE')
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
      }
    }
  }

  beforeEach(async () => {
    postedBuilds = [];
    _setBundlerWorkerForTesting(null);
    vi.stubGlobal('Worker', TestMockWorker);
    await db.files.clear();
    await db.projects.clear();
  });

  async function seedCanonicalProject(): Promise<FileItem[]> {
    const timestamp = Date.now();
    const files: FileItem[] = [
      {
        id: 'f-pkg',
        projectId,
        path: '/package.json',
        content: JSON.stringify({
          name: 'test-app',
          dependencies: { react: '^18.2.0' }
        }),
        updatedAt: timestamp
      },
      {
        id: 'f-main',
        projectId,
        path: '/src/main.tsx',
        content: 'export const title = "Canonical Original";',
        updatedAt: timestamp
      },
      {
        id: 'f-helper',
        projectId,
        path: '/src/helper.ts',
        content: 'export const helperValue = 42;',
        updatedAt: timestamp
      }
    ];

    await db.files.bulkAdd(files);
    return files;
  }

  // Requirement A: Build sees overlay changes
  it('A. Build sees overlay changes: verifies candidate modifications in overlay, not canonical', async () => {
    const canonicalFiles = await seedCanonicalProject();
    const overlay = new AgentWorkspaceOverlay(projectId, canonicalFiles);

    // Modify source ONLY in the overlay
    await overlay.write('/src/main.tsx', 'export const title = "Overlay Candidate Modification";');

    const result = await verifyBuildFromOverlay(overlay);

    expect(result.success).toBe(true);
    expect(postedBuilds).toHaveLength(1);

    const builtFiles = postedBuilds[0].files;
    const builtMain = builtFiles.find(f => f.path === '/src/main.tsx');
    expect(builtMain).toBeDefined();
    expect(builtMain?.content).toBe('export const title = "Overlay Candidate Modification";');
  });

  // Requirement B: Build does NOT see canonical mutation
  it('B. Build does NOT see canonical mutation: canonical VFS content remains unchanged', async () => {
    const canonicalFiles = await seedCanonicalProject();
    const overlay = new AgentWorkspaceOverlay(projectId, canonicalFiles);

    await overlay.write('/src/main.tsx', 'export const title = "Modified In Overlay";');
    await verifyBuildFromOverlay(overlay);

    // Canonical VFS must still have the exact original content
    const canonicalMain = await db.files.where({ projectId, path: '/src/main.tsx' }).first();
    expect(canonicalMain).toBeDefined();
    expect(canonicalMain?.content).toBe('export const title = "Canonical Original";');
  });

  // Requirement C: Broken overlay fails build
  it('C. Broken overlay fails build: invalid candidate code fails verification while canonical VFS remains unchanged', async () => {
    const canonicalFiles = await seedCanonicalProject();
    const overlay = new AgentWorkspaceOverlay(projectId, canonicalFiles);

    // Write syntactically invalid code into the candidate overlay
    await overlay.write('/src/main.tsx', 'SYNTAX_ERROR_BROKEN_CODE = <<??');

    const result = await verifyBuildFromOverlay(overlay);

    expect(result.success).toBe(false);
    expect(result.error).toContain('SyntaxError: Unexpected token');
    expect(result.output).toContain('Build verification failed');

    // Canonical VFS remains completely untouched
    const canonicalMain = await db.files.where({ projectId, path: '/src/main.tsx' }).first();
    expect(canonicalMain?.content).toBe('export const title = "Canonical Original";');
  });

  // Requirement D: Unmodified project still builds
  it('D. Unmodified project still builds: existing valid canonical project with no overlay edits compiles successfully', async () => {
    const canonicalFiles = await seedCanonicalProject();
    const overlay = new AgentWorkspaceOverlay(projectId, canonicalFiles);

    expect(overlay.diff()).toHaveLength(0);

    const result = await verifyBuildFromOverlay(overlay);

    expect(result.success).toBe(true);
    expect(postedBuilds).toHaveLength(1);
    expect(postedBuilds[0].entryPoint).toBe('/src/main.tsx');
    const builtMain = postedBuilds[0].files.find(f => f.path === '/src/main.tsx');
    expect(builtMain?.content).toBe('export const title = "Canonical Original";');
  });

  // Requirement E: Candidate deletion is respected
  it('E. Candidate deletion is respected: deleted file in overlay is absent in candidate build and not resurrected', async () => {
    const canonicalFiles = await seedCanonicalProject();
    const overlay = new AgentWorkspaceOverlay(projectId, canonicalFiles);

    // Delete /src/helper.ts in overlay
    await overlay.delete('/src/helper.ts', 'Remove obsolete helper');

    const result = await verifyBuildFromOverlay(overlay);

    expect(result.success).toBe(true);
    expect(postedBuilds).toHaveLength(1);

    const builtFiles = postedBuilds[0].files;
    const builtHelper = builtFiles.find(f => f.path === '/src/helper.ts');
    expect(builtHelper).toBeUndefined(); // Absent from candidate compilation!

    // Canonical VFS must still contain /src/helper.ts
    const canonicalHelper = await db.files.where({ projectId, path: '/src/helper.ts' }).first();
    expect(canonicalHelper).toBeDefined();
    expect(canonicalHelper?.content).toBe('export const helperValue = 42;');
  });

  // Requirement F: Same overlay instance across operations
  it('F. Same overlay instance: build verification operates on the exact overlay passed in execution context', async () => {
    const canonicalFiles = await seedCanonicalProject();
    const overlay = new AgentWorkspaceOverlay(projectId, canonicalFiles);
    const materializeSpy = vi.spyOn(overlay, 'materialize');

    const context = { overlay };

    // 1. Tool write_file
    const writeRes = await executeAgentTool(
      'write_file',
      JSON.stringify({
        path: '/src/Feature.tsx',
        type: 'create',
        newContent: 'export const Feature = () => <div>Feature</div>;',
        rationale: 'Add feature'
      }),
      projectId,
      context
    );
    expect(writeRes).toContain('Successfully queued patch for /src/Feature.tsx');

    // 2. Tool build_project
    const buildRes = await executeAgentTool('build_project', '{}', projectId, context);
    expect(buildRes).toContain('Build verification succeeded');

    // Verify overlay.materialize was called on the EXACT instance
    expect(materializeSpy).toHaveBeenCalledTimes(1);

    // Verify candidate compiled contains the new file
    const builtFiles = postedBuilds[0].files;
    const builtFeature = builtFiles.find(f => f.path === '/src/Feature.tsx');
    expect(builtFeature).toBeDefined();
    expect(builtFeature?.content).toBe('export const Feature = () => <div>Feature</div>;');

    // Canonical VFS still has no Feature.tsx
    const canonicalFeature = await db.files.where({ projectId, path: '/src/Feature.tsx' }).first();
    expect(canonicalFeature).toBeUndefined();
  });

  // Requirement G: Multiple sequential edits
  it('G. Multiple sequential edits: build verification sees all accumulated overlay edits together', async () => {
    const canonicalFiles = await seedCanonicalProject();
    const overlay = new AgentWorkspaceOverlay(projectId, canonicalFiles);

    await overlay.write('/src/ComponentA.tsx', 'export const A = 1;');
    await overlay.write('/src/ComponentB.tsx', 'export const B = 2;');
    await overlay.write('/src/main.tsx', 'import { A } from "./ComponentA"; import { B } from "./ComponentB";');

    const result = await verifyBuildFromOverlay(overlay);

    expect(result.success).toBe(true);
    expect(postedBuilds).toHaveLength(1);

    const paths = postedBuilds[0].files.map(f => f.path);
    expect(paths).toContain('/src/ComponentA.tsx');
    expect(paths).toContain('/src/ComponentB.tsx');
    expect(paths).toContain('/src/main.tsx');

    const mainFile = postedBuilds[0].files.find(f => f.path === '/src/main.tsx');
    expect(mainFile?.content).toContain('import { A } from "./ComponentA"');
  });

  // Requirement H: Canonical isolation
  it('H. Canonical isolation: canonical project is byte-for-byte identical before and after build verification', async () => {
    const canonicalFiles = await seedCanonicalProject();
    const beforeSnapshot = JSON.stringify(canonicalFiles.sort((a, b) => a.path.localeCompare(b.path)));

    const overlay = new AgentWorkspaceOverlay(projectId, canonicalFiles);

    // Perform massive mutations in overlay
    await overlay.write('/src/main.tsx', 'console.log("Candidate edit");');
    await overlay.write('/src/brandNew.ts', 'export const brandNew = true;');
    await overlay.delete('/src/helper.ts', 'Deleted helper');

    // Run build verification
    const result = await verifyBuildFromOverlay(overlay);
    expect(result.success).toBe(true);

    // Re-query canonical VFS and verify byte-for-byte immutability
    const currentCanonical = await db.files.where({ projectId }).toArray();
    const afterSnapshot = JSON.stringify(currentCanonical.sort((a, b) => a.path.localeCompare(b.path)));

    expect(afterSnapshot).toBe(beforeSnapshot);
  });

  // Fail-Closed Rule
  it('Fail-Closed Rule: executeAgentTool build_project fails explicitly when context.overlay is missing', async () => {
    await seedCanonicalProject();

    // Context without overlay
    const result = await executeAgentTool('build_project', '{}', projectId, {});

    expect(result).toContain('Error: Build verification failed');
    expect(result).toContain('Missing active WorkspaceOverlay');
    expect(postedBuilds).toHaveLength(0); // Never invoked the compiler!
  });

  // Deterministic error when no entry point found
  it('Entry Point Resolution: returns deterministic error when no entry point can be determined', async () => {
    const files: FileItem[] = [
      {
        id: 'f-pkg',
        projectId,
        path: '/package.json',
        content: JSON.stringify({ dependencies: { react: '^18.2.0' } }),
        updatedAt: Date.now()
      },
      {
        id: 'f-random',
        projectId,
        path: '/src/random_module.ts',
        content: 'export const x = 10;',
        updatedAt: Date.now()
      }
    ];

    const overlay = new AgentWorkspaceOverlay(projectId, files);
    const result = await verifyBuildFromOverlay(overlay);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No valid entry point found');
    expect(result.output).toContain('Build verification failed: No valid entry point found');
    expect(postedBuilds).toHaveLength(0);
  });

  // Tool alias: verify_build executes the exact same path
  it('Tool Alias: verify_build executes the build verification tool identically', async () => {
    const canonicalFiles = await seedCanonicalProject();
    const overlay = new AgentWorkspaceOverlay(projectId, canonicalFiles);

    const result = await executeAgentTool('verify_build', '{}', projectId, { overlay });
    expect(result).toContain('Build verification succeeded');
    expect(postedBuilds).toHaveLength(1);
  });
});
