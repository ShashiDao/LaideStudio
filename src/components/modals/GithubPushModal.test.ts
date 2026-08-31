// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { GithubPushModal } from './GithubPushModal';
import { db } from '../../db';
import { useAppStore } from '../../store';
import { deriveKeys, encryptData } from '../../services/security/crypto';
import { createFile } from '../../services/fs/vfs';

// Compute expected git blob sha helper matching git format: "blob <byteLength>\0<content>"
async function getExpectedBlobSha(content: string): Promise<string> {
  const enc = new TextEncoder();
  const contentBuf = enc.encode(content);
  const prefix = enc.encode(`blob ${contentBuf.byteLength}\0`);
  const full = new Uint8Array(prefix.byteLength + contentBuf.byteLength);
  full.set(prefix, 0);
  full.set(contentBuf, prefix.byteLength);
  const hash = await crypto.subtle.digest('SHA-1', full);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

describe('GithubPushModal', () => {
  const originalFetch = globalThis.fetch;
  const projectId = 'test-proj-push';
  let keys: any;

  beforeEach(async () => {
    vi.restoreAllMocks();
    cleanup();
    await db.projects.clear();
    await db.files.clear();
    await db.snapshots.clear();
    localStorage.clear();
    sessionStorage.clear();

    await db.projects.add({
      id: projectId,
      name: 'Push Test Project',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const salt = crypto.getRandomValues(new Uint8Array(16));
    keys = await deriveKeys('test-master-passphrase', salt);
    useAppStore.getState().setKeys(keys);

    const encryptedPat = await encryptData(keys.aesKey, 'ghp_mock_token_push_123');
    await db.secureTokens.put({ key: 'github_pat', encryptedValue: encryptedPat });
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('blob-SHA diffing skips unchanged files and only uploads changed/new/deleted ones', async () => {
    const onClose = vi.fn();

    // 1. Setup local files in VFS
    const unchangedContent = 'console.log("I am completely unchanged");';
    const changedContent = 'console.log("I have local edits");';
    const newContent = 'export const newlyAdded = true;';

    await createFile(projectId, '/src/unchanged.ts', unchangedContent);
    await createFile(projectId, '/src/changed.ts', changedContent);
    await createFile(projectId, '/src/new.ts', newContent);

    // Compute expected remote SHAs
    const unchangedSha = await getExpectedBlobSha(unchangedContent);
    const oldChangedSha = 'old_remote_sha_different_1111111111111111';
    const deletedSha = 'remote_deleted_file_sha_2222222222222222';

    // Remote tree contains: unchanged.ts, changed.ts (old sha), and deleted.ts (not present in local VFS)
    const remoteTree = [
      { path: 'src/unchanged.ts', type: 'blob', sha: unchangedSha },
      { path: 'src/changed.ts', type: 'blob', sha: oldChangedSha },
      { path: 'src/deleted.ts', type: 'blob', sha: deletedSha }
    ];

    const createdBlobs: { content: string, encoding: string }[] = [];
    let createdTreeEntries: any[] = [];
    let createdCommitMessage = '';
    let createdBranchRef = '';

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, options: any = {}) => {
      if (url.includes('/repos/') && !url.includes('/git/')) {
        return { ok: true, status: 200, json: async () => ({ default_branch: 'main' }) } as any;
      }
      // 1. GET base branch ref
      if (url.includes('/git/ref/heads/main')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ object: { sha: 'base_commit_sha_123' } })
        } as any;
      }
      // 2. GET base commit
      if (url.includes('/git/commits/base_commit_sha_123')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ tree: { sha: 'base_tree_sha_456' } })
        } as any;
      }
      // 3. GET remote tree
      if (url.includes('/git/trees/main?recursive=1')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ tree: remoteTree })
        } as any;
      }
      // 4. POST createBlob
      if (url.includes('/git/blobs') && options.method === 'POST') {
        const body = JSON.parse(options.body);
        createdBlobs.push(body);
        return {
          ok: true,
          status: 201,
          json: async () => ({ sha: `created_blob_sha_${createdBlobs.length}` })
        } as any;
      }
      // 5. POST createTree
      if (url.includes('/git/trees') && options.method === 'POST') {
        const body = JSON.parse(options.body);
        createdTreeEntries = body.tree;
        return {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'new_tree_sha_789' })
        } as any;
      }
      // 6. POST createCommit
      if (url.includes('/git/commits') && options.method === 'POST') {
        const body = JSON.parse(options.body);
        createdCommitMessage = body.message;
        return {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'new_commit_sha_999' })
        } as any;
      }
      // 7. POST createBranch
      if (url.includes('/git/refs') && options.method === 'POST') {
        const body = JSON.parse(options.body);
        createdBranchRef = body.ref;
        return {
          ok: true,
          status: 201,
          json: async () => ({ ref: body.ref })
        } as any;
      }

      return { ok: false, status: 404, json: async () => ({ message: 'Not found' }) } as any;
    });

    render(React.createElement(GithubPushModal, { projectId, onClose }));

    // Fill in repository details
    fireEvent.change(screen.getByPlaceholderText('e.g. facebook'), { target: { value: 'testorg' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. react'), { target: { value: 'testrepo' } });
    fireEvent.change(screen.getByPlaceholderText('Update from LAIDE Studio'), { target: { value: 'Feat: push test' } });

    // Submit form
    const form = screen.getByRole('button', { name: /push to remote branch/i });
    fireEvent.click(form);

    await waitFor(() => {
      expect(screen.getByText('Branch Created!')).toBeDefined();
    });

    // Verify blob-SHA diffing behavior:
    // Only 2 blobs uploaded (changed.ts and new.ts), unchanged.ts was SKIPPED!
    expect(createdBlobs).toHaveLength(2);
    expect(createdBlobs.map(b => b.content)).toContain(changedContent);
    expect(createdBlobs.map(b => b.content)).toContain(newContent);
    expect(createdBlobs.map(b => b.content)).not.toContain(unchangedContent);

    // Verify tree entries submitted to GitHub:
    // Should have: changed.ts (new blob), new.ts (new blob), and deleted.ts (sha: null)
    expect(createdTreeEntries).toHaveLength(3);

    const changedEntry = createdTreeEntries.find(e => e.path === 'src/changed.ts');
    expect(changedEntry).toBeDefined();
    expect(changedEntry?.sha).toMatch(/^created_blob_sha_[12]$/);

    const newEntry = createdTreeEntries.find(e => e.path === 'src/new.ts');
    expect(newEntry).toBeDefined();
    expect(newEntry?.sha).toMatch(/^created_blob_sha_[12]$/);
    expect(changedEntry?.sha).not.toBe(newEntry?.sha);

    const deletedEntry = createdTreeEntries.find(e => e.path === 'src/deleted.ts');
    expect(deletedEntry).toBeDefined();
    expect(deletedEntry?.sha).toBeNull();

    // Ensure unchanged file is NOT included in tree changes (preserves GitHub base tree inheritance)
    const unchangedEntry = createdTreeEntries.find(e => e.path === 'src/unchanged.ts');
    expect(unchangedEntry).toBeUndefined();

    // Verify commit and branch
    expect(createdCommitMessage).toBe('Feat: push test');
    expect(createdBranchRef).toMatch(/^refs\/heads\/laide-/);
    expect(screen.getByText(/Open Pull Request/i)).toBeDefined();
  });

  it('handles non-ASCII UTF-8 and binary files correctly in diffing and uploading', async () => {
    const onClose = vi.fn();

    // Setup local files in VFS
    const utf8Content = 'Hello 世界! 🚀';
    const binaryBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    await createFile(projectId, '/src/utf8.txt', utf8Content);
    await createFile(projectId, '/src/image.png', binaryBase64);

    // Compute expected remote SHAs for comparison
    const utf8Sha = await getExpectedBlobSha(utf8Content);

    // Compute expected SHA for binary
    const binString = atob(binaryBase64);
    const contentBuffer = new Uint8Array(binString.length);
    for (let i = 0; i < binString.length; i++) {
      contentBuffer[i] = binString.charCodeAt(i);
    }
    const enc = new TextEncoder();
    const prefix = enc.encode(`blob ${contentBuffer.byteLength}\0`);
    const full = new Uint8Array(prefix.byteLength + contentBuffer.byteLength);
    full.set(prefix, 0);
    full.set(contentBuffer, prefix.byteLength);
    const hash = await crypto.subtle.digest('SHA-1', full);
    const binarySha = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Remote tree contains these files with different SHAs
    const remoteTree = [
      { path: 'src/utf8.txt', type: 'blob', sha: 'old_utf8_sha' },
      { path: 'src/image.png', type: 'blob', sha: 'old_png_sha' }
    ];

    const createdBlobs: { content: string, encoding: string }[] = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, options: any = {}) => {
      if (url.includes('/repos/') && !url.includes('/git/')) {
        return { ok: true, status: 200, json: async () => ({ default_branch: 'main' }) } as any;
      }
      if (url.includes('/git/ref/heads/main')) {
        return { ok: true, status: 200, json: async () => ({ object: { sha: 'base_commit_sha' } }) } as any;
      }
      if (url.includes('/git/commits/base_commit_sha')) {
        return { ok: true, status: 200, json: async () => ({ tree: { sha: 'base_tree_sha' } }) } as any;
      }
      if (url.includes('/git/trees/main?recursive=1')) {
        return { ok: true, status: 200, json: async () => ({ tree: remoteTree }) } as any;
      }
      if (url.includes('/git/blobs') && options.method === 'POST') {
        const body = JSON.parse(options.body);
        createdBlobs.push(body);
        return { ok: true, status: 201, json: async () => ({ sha: body.encoding === 'base64' ? binarySha : utf8Sha }) } as any;
      }
      if (url.includes('/git/trees') && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ sha: 'new_tree_sha' }) } as any;
      }
      if (url.includes('/git/commits') && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ sha: 'new_commit_sha' }) } as any;
      }
      if (url.includes('/git/refs') && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ ref: 'refs/heads/new-branch' }) } as any;
      }
      return { ok: false, status: 404, json: async () => ({ message: 'Not found' }) } as any;
    });

    render(React.createElement(GithubPushModal, { projectId, onClose }));

    fireEvent.change(screen.getByPlaceholderText('e.g. facebook'), { target: { value: 'testorg' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. react'), { target: { value: 'testrepo' } });
    
    fireEvent.click(screen.getByRole('button', { name: /push to remote branch/i }));

    await waitFor(() => {
      expect(screen.getByText('Branch Created!')).toBeDefined();
    });

    // Verify blob payload encoding logic: text is utf-8, binary is base64
    expect(createdBlobs).toHaveLength(2);
    
    const utf8Blob = createdBlobs.find(b => b.encoding === 'utf-8');
    expect(utf8Blob).toBeDefined();
    expect(utf8Blob?.content).toBe(utf8Content);

    const binaryBlob = createdBlobs.find(b => b.encoding === 'base64');
    expect(binaryBlob).toBeDefined();
    expect(binaryBlob?.content).toBe(binaryBase64);
  });

  it('fetches and defaults to the repo default_branch when no sync data is present', async () => {
    const onClose = vi.fn();
    
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/repos/testorg/testrepo')) {
        return { ok: true, status: 200, json: async () => ({ default_branch: 'master' }) } as any;
      }
      return { ok: false, status: 404, json: async () => ({ message: 'Not found' }) } as any;
    });

    render(React.createElement(GithubPushModal, { projectId, onClose }));

    // Verify initial state is "main"
    const baseBranchInput = screen.getByPlaceholderText('main') as HTMLInputElement;
    expect(baseBranchInput.value).toBe('main');

    // Enter owner and repo
    fireEvent.change(screen.getByPlaceholderText('e.g. facebook'), { target: { value: 'testorg' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. react'), { target: { value: 'testrepo' } });

    // The component debounces fetching the repo info by 800ms
    await waitFor(() => {
      expect(baseBranchInput.value).toBe('master');
    }, { timeout: 1500 });
  });

  it('surfaces error when no changes are detected between local VFS and remote tree', async () => {
    const onClose = vi.fn();
    const content = 'console.log("identical content");';
    await createFile(projectId, '/src/index.ts', content);

    const sha = await getExpectedBlobSha(content);

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/repos/') && !url.includes('/git/')) {
        return { ok: true, status: 200, json: async () => ({ default_branch: 'main' }) } as any;
      }
      if (url.includes('/git/ref/heads/main')) {
        return { ok: true, status: 200, json: async () => ({ object: { sha: 'commit_sha' } }) } as any;
      }
      if (url.includes('/git/commits/commit_sha')) {
        return { ok: true, status: 200, json: async () => ({ tree: { sha: 'tree_sha' } }) } as any;
      }
      if (url.includes('/git/trees/main?recursive=1')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            tree: [{ path: 'src/index.ts', type: 'blob', sha }]
          })
        } as any;
      }
      return { ok: false, status: 404, json: async () => ({}) } as any;
    });

    render(React.createElement(GithubPushModal, { projectId, onClose }));

    fireEvent.change(screen.getByPlaceholderText('e.g. facebook'), { target: { value: 'org' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. react'), { target: { value: 'repo' } });

    fireEvent.click(screen.getByRole('button', { name: /push to remote branch/i }));

    await waitFor(() => {
      expect(screen.getByText('No changes detected to push.')).toBeDefined();
    });
  });

  it('surfaces network and API failures during push', async () => {
    const onClose = vi.fn();
    await createFile(projectId, '/src/file.ts', 'some code');

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/repos/') && !url.includes('/git/')) {
        return { ok: true, status: 200, json: async () => ({ default_branch: 'main' }) } as any;
      }
      if (url.includes('/git/ref/heads/main')) {
        return {
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          json: async () => ({ message: 'Bad credentials or rate limit exceeded' })
        } as any;
      }
      return { ok: false, status: 404, json: async () => ({}) } as any;
    });

    render(React.createElement(GithubPushModal, { projectId, onClose }));

    fireEvent.change(screen.getByPlaceholderText('e.g. facebook'), { target: { value: 'org' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. react'), { target: { value: 'repo' } });

    fireEvent.click(screen.getByRole('button', { name: /push to remote branch/i }));

    await waitFor(() => {
      expect(screen.getByText(/GitHub API error: 403/i)).toBeDefined();
    });
  });
  it('handles 422 branch collision by auto-incrementing branch name and suggesting retry', async () => {
    const onClose = vi.fn();
    const content = 'new file content';
    await createFile(projectId, '/src/new.ts', content);

    let createBranchCount = 0;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, options: any = {}) => {
      if (url.includes('/repos/') && !url.includes('/git/')) {
        return { ok: true, status: 200, json: async () => ({ default_branch: 'main' }) } as any;
      }
      if (url.includes('/git/ref/heads/main')) {
        return { ok: true, status: 200, json: async () => ({ object: { sha: 'base_commit_sha' } }) } as any;
      }
      if (url.includes('/git/commits/base_commit_sha')) {
        return { ok: true, status: 200, json: async () => ({ tree: { sha: 'base_tree_sha' } }) } as any;
      }
      if (url.includes('/git/trees/main?recursive=1')) {
        return { ok: true, status: 200, json: async () => ({ tree: [] }) } as any; // Empty tree
      }
      if (url.includes('/git/blobs') && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ sha: 'blob_sha' }) } as any;
      }
      if (url.includes('/git/trees') && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ sha: 'new_tree_sha' }) } as any;
      }
      if (url.includes('/git/commits') && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ sha: 'new_commit_sha' }) } as any;
      }
      if (url.includes('/git/refs') && options.method === 'POST') {
        createBranchCount++;
        if (createBranchCount === 1) {
          // Simulate 422 Unprocessable Entity
          return { ok: false, status: 422, statusText: 'Unprocessable Entity', json: async () => ({ message: 'Reference already exists' }) } as any;
        } else {
          return { ok: true, status: 201, json: async () => ({ ref: 'refs/heads/branch-2' }) } as any;
        }
      }
      return { ok: false, status: 404, json: async () => ({ message: 'Not found' }) } as any;
    });

    render(React.createElement(GithubPushModal, { projectId, onClose }));

    fireEvent.change(screen.getByPlaceholderText('e.g. facebook'), { target: { value: 'testorg' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. react'), { target: { value: 'testrepo' } });
    
    // Type a branch name
    const newBranchInput = screen.getAllByRole('textbox').find(el => (el as HTMLInputElement).placeholder.includes('laide-')) as HTMLInputElement;
    fireEvent.change(newBranchInput, { target: { value: 'my-branch' } });
    
    let pushButton = screen.getByRole('button', { name: /push to remote branch/i });
    fireEvent.click(pushButton);

    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeDefined();
    });

    // Expect input value to be auto-incremented
    expect(newBranchInput.value).toBe('my-branch-2');
    
    // Click push again
    pushButton = screen.getByRole('button', { name: /push to remote branch/i });
    fireEvent.click(pushButton);
    
    await waitFor(() => {
      expect(screen.getByText('Branch Created!')).toBeDefined();
    });
  });

  it('switches between "Push to existing repository" and "Create new repository" modes', async () => {
    const onClose = vi.fn();
    render(React.createElement(GithubPushModal, { projectId, onClose }));

    // Default mode: existing repo
    expect(screen.getByPlaceholderText('e.g. facebook')).toBeDefined();
    expect(screen.getByPlaceholderText('e.g. react')).toBeDefined();
    expect(screen.queryByPlaceholderText('e.g. my-app')).toBeNull();

    // Switch to create new repository mode
    fireEvent.click(screen.getByRole('button', { name: 'Create new repository' }));

    expect(screen.getByPlaceholderText('e.g. my-app')).toBeDefined();
    expect(screen.getByPlaceholderText(/Project built with LAIDE Studio/i)).toBeDefined();
    expect(screen.getByPlaceholderText(/Leave blank for personal/i)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Private' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Public' })).toBeDefined();
    expect(screen.queryByPlaceholderText('e.g. facebook')).toBeNull();
    expect(screen.queryByPlaceholderText('e.g. react')).toBeNull();

    // Switch back to existing repository mode
    fireEvent.click(screen.getByRole('button', { name: 'Push to existing repository' }));
    expect(screen.getByPlaceholderText('e.g. facebook')).toBeDefined();
    expect(screen.getByPlaceholderText('e.g. react')).toBeDefined();
  });

  it('creates new repository and pushes branch successfully', async () => {
    const onClose = vi.fn();
    const content = 'export const app = () => "Hello World";';
    await createFile(projectId, '/src/App.tsx', content);

    const createdRepoPayload = {
      name: 'brand-new-project',
      description: 'Cool description',
      private: true,
      default_branch: 'main',
      html_url: 'https://github.com/testuser/brand-new-project',
      owner: { login: 'testuser' }
    };

    let createRepoCalled = false;
    let createRepoBody: any = null;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, options: any = {}) => {
      // POST create repository
      if (url === 'https://api.github.com/user/repos' && options.method === 'POST') {
        createRepoCalled = true;
        createRepoBody = JSON.parse(options.body);
        return { ok: true, status: 201, json: async () => createdRepoPayload } as any;
      }
      // Base branch ref
      if (url.includes('/git/ref/heads/main')) {
        return { ok: true, status: 200, json: async () => ({ object: { sha: 'base_sha_123' } }) } as any;
      }
      // Base commit
      if (url.includes('/git/commits/base_sha_123')) {
        return { ok: true, status: 200, json: async () => ({ tree: { sha: 'base_tree_sha_456' } }) } as any;
      }
      // Remote tree
      if (url.includes('/git/trees/main?recursive=1')) {
        return { ok: true, status: 200, json: async () => ({ tree: [] }) } as any;
      }
      // Create blob
      if (url.includes('/git/blobs') && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ sha: 'blob_sha_789' }) } as any;
      }
      // Create tree
      if (url.includes('/git/trees') && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ sha: 'new_tree_sha_101' }) } as any;
      }
      // Create commit
      if (url.includes('/git/commits') && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ sha: 'new_commit_sha_202' }) } as any;
      }
      // Create branch
      if (url.includes('/git/refs') && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ ref: 'refs/heads/feature-branch' }) } as any;
      }

      return { ok: false, status: 404, json: async () => ({ message: 'Not found' }) } as any;
    });

    render(React.createElement(GithubPushModal, { projectId, onClose }));

    // Switch to create new repository mode
    fireEvent.click(screen.getByRole('button', { name: 'Create new repository' }));

    fireEvent.change(screen.getByPlaceholderText('e.g. my-app'), { target: { value: 'brand-new-project' } });
    fireEvent.change(screen.getByPlaceholderText(/Project built with LAIDE Studio/i), { target: { value: 'Cool description' } });

    const pushButton = screen.getByRole('button', { name: /push to remote branch/i });
    fireEvent.click(pushButton);

    await waitFor(() => {
      expect(screen.getByText('Repository Created & Branch Pushed!')).toBeDefined();
    });

    expect(createRepoCalled).toBe(true);
    expect(createRepoBody).toEqual({
      name: 'brand-new-project',
      description: 'Cool description',
      private: true,
      auto_init: true
    });
    expect(screen.getByText('testuser/brand-new-project')).toBeDefined();
    expect(screen.getByRole('link', { name: /open pull request/i })).toBeDefined();
  });

  it('handles 422 repository already exists error with friendly message', async () => {
    const onClose = vi.fn();
    const content = 'export const app = () => "Hello";';
    await createFile(projectId, '/src/App.tsx', content);

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, options: any = {}) => {
      if (url === 'https://api.github.com/user/repos' && options.method === 'POST') {
        return {
          ok: false,
          status: 422,
          statusText: 'Unprocessable Entity',
          json: async () => ({ message: 'name already exists on this account' })
        } as any;
      }
      return { ok: false, status: 404, json: async () => ({ message: 'Not found' }) } as any;
    });

    render(React.createElement(GithubPushModal, { projectId, onClose }));

    // Switch to create new repository mode
    fireEvent.click(screen.getByRole('button', { name: 'Create new repository' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. my-app'), { target: { value: 'already-existing-repo' } });

    const pushButton = screen.getByRole('button', { name: /push to remote branch/i });
    fireEvent.click(pushButton);

    await waitFor(() => {
      expect(screen.getByText("A repository with this name already exists. Choose a different name or use 'push to existing repo' instead.")).toBeDefined();
    });
  });

  it('retries getBranch when newly created repo branch is not immediately queryable (404 race condition)', async () => {
    const onClose = vi.fn();
    const content = 'export const app = () => "Hello";';
    await createFile(projectId, '/src/App.tsx', content);

    const createdRepoPayload = {
      name: 'retry-project',
      description: '',
      private: true,
      default_branch: 'main',
      html_url: 'https://github.com/testuser/retry-project',
      owner: { login: 'testuser' }
    };

    let getBranchCallCount = 0;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, options: any = {}) => {
      // POST create repository
      if (url === 'https://api.github.com/user/repos' && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => createdRepoPayload } as any;
      }
      // Base branch ref
      if (url.includes('/git/ref/heads/main')) {
        getBranchCallCount++;
        if (getBranchCallCount === 1) {
          // First attempt: 404 not found
          return {
            ok: false,
            status: 404,
            statusText: 'Not Found',
            json: async () => ({ message: 'Not Found' })
          } as any;
        }
        // Subsequent attempts: succeed
        return { ok: true, status: 200, json: async () => ({ object: { sha: 'base_sha_123' } }) } as any;
      }
      // Base commit
      if (url.includes('/git/commits/base_sha_123')) {
        return { ok: true, status: 200, json: async () => ({ tree: { sha: 'base_tree_sha_456' } }) } as any;
      }
      // Remote tree
      if (url.includes('/git/trees/main?recursive=1')) {
        return { ok: true, status: 200, json: async () => ({ tree: [] }) } as any;
      }
      // Create blob
      if (url.includes('/git/blobs') && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ sha: 'blob_sha_789' }) } as any;
      }
      // Create tree
      if (url.includes('/git/trees') && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ sha: 'new_tree_sha_101' }) } as any;
      }
      // Create commit
      if (url.includes('/git/commits') && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ sha: 'new_commit_sha_202' }) } as any;
      }
      // Create branch
      if (url.includes('/git/refs') && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ ref: 'refs/heads/feature-branch' }) } as any;
      }

      return { ok: false, status: 404, json: async () => ({ message: 'Not found' }) } as any;
    });

    render(React.createElement(GithubPushModal, { projectId, onClose }));

    // Switch to create new repository mode
    fireEvent.click(screen.getByRole('button', { name: 'Create new repository' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. my-app'), { target: { value: 'retry-project' } });

    const pushButton = screen.getByRole('button', { name: /push to remote branch/i });
    fireEvent.click(pushButton);

    await waitFor(() => {
      expect(screen.getByText('Repository Created & Branch Pushed!')).toBeDefined();
    }, { timeout: 4000 });

    expect(getBranchCallCount).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('testuser/retry-project')).toBeDefined();
  });

  it('retries when newly created repo branch is queryable but getCommit throws 404', async () => {
    const onClose = vi.fn();
    const content = 'export const app = () => "Hello";';
    await createFile(projectId, '/src/App.tsx', content);

    const createdRepoPayload = {
      name: 'retry-commit-project',
      description: '',
      private: true,
      default_branch: 'main',
      html_url: 'https://github.com/testuser/retry-commit-project',
      owner: { login: 'testuser' }
    };

    let getCommitCallCount = 0;
    let getBranchCallCount = 0;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, options: any = {}) => {
      if (url === 'https://api.github.com/user/repos' && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => createdRepoPayload } as any;
      }
      if (url.includes('/git/ref/heads/main')) {
        getBranchCallCount++;
        return { ok: true, status: 200, json: async () => ({ object: { sha: 'base_sha_123' } }) } as any;
      }
      if (url.includes('/git/commits/base_sha_123')) {
        getCommitCallCount++;
        if (getCommitCallCount === 1) {
          // First attempt: 404 not found
          return {
            ok: false,
            status: 404,
            statusText: 'Not Found',
            json: async () => ({ message: 'Not Found' })
          } as any;
        }
        return { ok: true, status: 200, json: async () => ({ tree: { sha: 'base_tree_sha_456' } }) } as any;
      }
      if (url.includes('/git/trees/main?recursive=1')) {
        return { ok: true, status: 200, json: async () => ({ tree: [] }) } as any;
      }
      if (url.includes('/git/blobs') && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ sha: 'blob_sha_789' }) } as any;
      }
      if (url.includes('/git/trees') && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ sha: 'new_tree_sha_101' }) } as any;
      }
      if (url.includes('/git/commits') && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ sha: 'new_commit_sha_202' }) } as any;
      }
      if (url.includes('/git/refs') && options.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ ref: 'refs/heads/feature-branch' }) } as any;
      }

      return { ok: false, status: 404, json: async () => ({ message: 'Not found' }) } as any;
    });

    render(React.createElement(GithubPushModal, { projectId, onClose }));

    fireEvent.click(screen.getByRole('button', { name: 'Create new repository' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. my-app'), { target: { value: 'retry-commit-project' } });

    const pushButton = screen.getByRole('button', { name: /push to remote branch/i });
    fireEvent.click(pushButton);

    await waitFor(() => {
      expect(screen.getByText('Repository Created & Branch Pushed!')).toBeDefined();
    }, { timeout: 4000 });

    // Ensure it retried the entire sequence
    expect(getBranchCallCount).toBeGreaterThanOrEqual(2);
    expect(getCommitCallCount).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('testuser/retry-commit-project')).toBeDefined();
  });
});
