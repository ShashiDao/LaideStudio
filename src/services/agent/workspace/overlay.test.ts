import { describe, it, expect } from 'vitest';
import { AgentWorkspaceOverlay } from './overlay';
import type { FileItem } from '../../../db';

describe('AgentWorkspaceOverlay', () => {
  const projectId = 'test-project';
  const baseFiles: FileItem[] = [
    { id: '1', projectId, path: '/index.ts', content: 'console.log("Hello");', updatedAt: 1 },
    { id: '2', projectId, path: '/utils.ts', content: 'export const add = (a, b) => a + b;', updatedAt: 1 }
  ];

  it('reads from base files', async () => {
    const overlay = new AgentWorkspaceOverlay(projectId, baseFiles);
    expect(await overlay.read('/index.ts')).toBe('console.log("Hello");');
    expect(await overlay.read('/missing.ts')).toBeNull();
  });

  it('writes and reads modified files, isolating base from modifications', async () => {
    const overlay = new AgentWorkspaceOverlay(projectId, baseFiles);
    await overlay.write('/index.ts', 'console.log("Modified");');
    
    expect(await overlay.read('/index.ts')).toBe('console.log("Modified");');
    // Ensure baseFiles are not mutated
    expect(baseFiles[0].content).toBe('console.log("Hello");');
  });

  it('deletes files', async () => {
    const overlay = new AgentWorkspaceOverlay(projectId, baseFiles);
    await overlay.delete('/index.ts');
    
    expect(await overlay.read('/index.ts')).toBeNull();
  });

  it('lists files properly', async () => {
    const overlay = new AgentWorkspaceOverlay(projectId, baseFiles);
    await overlay.write('/newFile.ts', 'new');
    await overlay.delete('/utils.ts');

    const files = await overlay.list('/');
    expect(files).toContain('/index.ts');
    expect(files).toContain('/newFile.ts');
    expect(files).not.toContain('/utils.ts');
  });

  it('generates a deterministic diff', async () => {
    const overlay = new AgentWorkspaceOverlay(projectId, baseFiles);
    await overlay.write('/index.ts', 'console.log("Modified");');
    await overlay.write('/new.ts', 'new file');
    await overlay.delete('/utils.ts');

    const diff = overlay.diff();
    expect(diff).toHaveLength(3);
    
    // Sort order should be deterministic by path (/index.ts, /new.ts, /utils.ts)
    expect(diff[0].path).toBe('/index.ts');
    expect(diff[0].type).toBe('replace');
    
    expect(diff[1].path).toBe('/new.ts');
    expect(diff[1].type).toBe('create');
    
    expect(diff[2].path).toBe('/utils.ts');
    expect(diff[2].type).toBe('delete');
  });
});
