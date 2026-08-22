import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { executeAgentTool, AGENT_TOOLS, validateProjectPath } from './tools';
import { useAppStore } from '../../store';
import { db } from '../../db';

describe('Agent Tools & Path Validation', () => {
  const projectId = 'test-proj-tools-1';

  beforeEach(async () => {
    await db.files.clear();
    await db.projects.clear();
    useAppStore.getState().clearPendingPatches();
  });

  it('has valid schemas for all defined agent tools', () => {
    const toolNames = AGENT_TOOLS.map(t => t.name);
    expect(toolNames).toContain('list_directory');
    expect(toolNames).toContain('read_file');
    expect(toolNames).toContain('write_file');
    expect(toolNames).toContain('search_code');
  });

  describe('validateProjectPath', () => {
    it('accepts valid absolute paths within project root', () => {
      expect(validateProjectPath('/src/App.tsx').valid).toBe(true);
      expect(validateProjectPath('/package.json').valid).toBe(true);
      expect(validateProjectPath('/public/assets/logo.svg').valid).toBe(true);
      expect(validateProjectPath('/src/components/button.test.tsx').valid).toBe(true);
    });

    it('rejects relative paths and paths without leading slash', () => {
      expect(validateProjectPath('src/App.tsx').valid).toBe(false);
      expect(validateProjectPath('index.html').valid).toBe(false);
      expect(validateProjectPath('').valid).toBe(false);
    });

    it('rejects path traversal attempts containing ".." segments', () => {
      expect(validateProjectPath('/../secret.env').valid).toBe(false);
      expect(validateProjectPath('/src/../../escape.ts').valid).toBe(false);
      expect(validateProjectPath('/src/components/../..').valid).toBe(false);
      expect(validateProjectPath('/..').valid).toBe(false);
    });
  });

  it('write_file: rejects paths not starting with "/"', async () => {
    const invalidArgs = JSON.stringify({
      path: 'src/App.tsx', // Missing leading slash
      type: 'replace',
      newContent: 'console.log("hello")',
      rationale: 'Add log'
    });

    const result = await executeAgentTool('write_file', invalidArgs, projectId);
    expect(result).toContain("Error: Invalid path. Must start with '/'");
    expect(useAppStore.getState().pendingPatches).toHaveLength(0);
  });

  it('write_file: rejects path traversal attempts with ".." segments', async () => {
    const traversalArgs = JSON.stringify({
      path: '/src/../../etc/passwd',
      type: 'create',
      newContent: 'malicious',
      rationale: 'Escape attempt'
    });

    const result = await executeAgentTool('write_file', traversalArgs, projectId);
    expect(result).toContain("Error: Invalid path. Path traversal ('..') is not permitted.");
    expect(useAppStore.getState().pendingPatches).toHaveLength(0);
  });

  it('write_file: accepts valid absolute paths starting with "/" and queues pending patch', async () => {
    const validArgs = JSON.stringify({
      path: '/src/App.tsx',
      type: 'create',
      newContent: 'export const App = () => <div>Hello</div>;',
      rationale: 'Initial component creation'
    });

    const result = await executeAgentTool('write_file', validArgs, projectId);
    expect(result).toContain('Successfully queued patch for /src/App.tsx');
    
    const patches = useAppStore.getState().pendingPatches;
    expect(patches).toHaveLength(1);
    expect(patches[0].path).toBe('/src/App.tsx');
    expect(patches[0].type).toBe('create');
    expect(patches[0].newContent).toBe('export const App = () => <div>Hello</div>;');
  });

  it('write_file: automatically resolves oldContent from VFS for delete patches if omitted', async () => {
    await db.files.add({
      id: 'f-del-1',
      projectId,
      path: '/src/deprecated.ts',
      content: 'export const oldUtility = () => "legacy code";',
      updatedAt: Date.now()
    });

    const deleteArgs = JSON.stringify({
      path: '/src/deprecated.ts',
      type: 'delete',
      newContent: '',
      rationale: 'Remove obsolete utility'
    });

    const result = await executeAgentTool('write_file', deleteArgs, projectId);
    expect(result).toContain('Successfully queued patch for /src/deprecated.ts');

    const patches = useAppStore.getState().pendingPatches;
    expect(patches).toHaveLength(1);
    expect(patches[0].type).toBe('delete');
    expect(patches[0].oldContent).toBe('export const oldUtility = () => "legacy code";');
  });

  it('read_file and list_directory: interact properly with stored files', async () => {
    await db.files.add({
      id: 'f1',
      projectId,
      path: '/src/main.ts',
      content: 'const answer = 42;',
      updatedAt: Date.now()
    });

    const listResult = await executeAgentTool('list_directory', JSON.stringify({ path: '/' }), projectId);
    expect(listResult).toContain('src/');

    const readResult = await executeAgentTool('read_file', JSON.stringify({ path: '/src/main.ts' }), projectId);
    expect(readResult).toBe('const answer = 42;');

    const readMissing = await executeAgentTool('read_file', JSON.stringify({ path: '/missing.ts' }), projectId);
    expect(readMissing).toContain('Error: File not found');
  });

  it('search_code: searches file contents across project', async () => {
    await db.files.add({
      id: 'f1',
      projectId,
      path: '/src/index.ts',
      content: '// Entry point\nfunction start() {\n  console.log("target_query");\n}',
      updatedAt: Date.now()
    });

    const searchRes = await executeAgentTool('search_code', JSON.stringify({ query: 'target_query' }), projectId);
    expect(searchRes).toContain('/src/index.ts:3: console.log("target_query");');

    const searchNone = await executeAgentTool('search_code', JSON.stringify({ query: 'nonexistent_pattern' }), projectId);
    expect(searchNone).toContain('No matches found');
  });
});
