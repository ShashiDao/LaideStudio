// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { GithubImportModal } from './GithubImportModal';
import { db } from '../db';
import { useAppStore } from '../store';
import { deriveKeys, encryptData } from '../services/crypto';
import { listFiles, createFile } from '../services/fs/vfs';

describe('GithubImportModal', () => {
  const originalFetch = globalThis.fetch;
  const projectId = 'test-proj-import';
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
      name: 'Import Test Project',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const salt = crypto.getRandomValues(new Uint8Array(16));
    keys = await deriveKeys('test-master-passphrase', salt);
    useAppStore.getState().setKeys(keys);

    const encryptedPat = await encryptData(keys.aesKey, 'ghp_mock_token_123');
    localStorage.setItem('xiom_github_pat', encryptedPat);
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('imports files into correct VFS paths with leading slashes', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    const mockRepoData = { default_branch: 'main' };
    const mockTreeData = {
      tree: [
        { path: 'src/main.ts', type: 'blob' },
        { path: 'package.json', type: 'blob' },
        { path: 'README.md', type: 'blob' }
      ]
    };

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/repos/octocat/hello-world/git/trees/main')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockTreeData
        } as any;
      }
      if (url.includes('/repos/octocat/hello-world/contents/src/main.ts')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            type: 'file',
            encoding: 'base64',
            content: btoa('console.log("imported main");')
          })
        } as any;
      }
      if (url.includes('/repos/octocat/hello-world/contents/package.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            type: 'file',
            encoding: 'base64',
            content: btoa('{"name": "hello-world"}')
          })
        } as any;
      }
      if (url.includes('/repos/octocat/hello-world/contents/README.md')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            type: 'file',
            encoding: 'base64',
            content: btoa('# Hello World')
          })
        } as any;
      }
      if (url.includes('/repos/octocat/hello-world')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockRepoData
        } as any;
      }
      return { ok: false, status: 404, json: async () => ({ message: 'Not found' }) } as any;
    });

    render(React.createElement(GithubImportModal, { projectId, onClose, onSuccess }));

    const input = screen.getByPlaceholderText('https://github.com/owner/repo');
    fireEvent.change(input, { target: { value: 'https://github.com/octocat/hello-world' } });

    const submitBtn = screen.getByRole('button', { name: /import repository/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });

    const files = await listFiles(projectId);
    expect(files).toHaveLength(3);

    const mainFile = files.find(f => f.path === '/src/main.ts');
    expect(mainFile).toBeDefined();
    expect(mainFile?.content).toBe('console.log("imported main");');

    const pkgFile = files.find(f => f.path === '/package.json');
    expect(pkgFile).toBeDefined();
    expect(pkgFile?.content).toBe('{"name": "hello-world"}');

    const readmeFile = files.find(f => f.path === '/README.md');
    expect(readmeFile).toBeDefined();
    expect(readmeFile?.content).toBe('# Hello World');

    const syncInfo = JSON.parse(localStorage.getItem(`xiom_github_sync_${projectId}`) || '{}');
    expect(syncInfo.owner).toBe('octocat');
    expect(syncInfo.repo).toBe('hello-world');
    expect(syncInfo.branch).toBe('main');
  });

  it('overwrites existing files in VFS and creates new ones', async () => {
    // Pre-populate an existing file in VFS
    await createFile(projectId, '/src/main.ts', 'old pre-existing content');

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/git/trees/main')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            tree: [
              { path: 'src/main.ts', type: 'blob' },
              { path: 'src/new-file.ts', type: 'blob' }
            ]
          })
        } as any;
      }
      if (url.includes('/contents/src/main.ts')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            type: 'file',
            encoding: 'base64',
            content: btoa('newly overwritten content')
          })
        } as any;
      }
      if (url.includes('/contents/src/new-file.ts')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            type: 'file',
            encoding: 'base64',
            content: btoa('freshly created content')
          })
        } as any;
      }
      if (url.includes('/repos/org/repo')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ default_branch: 'main' })
        } as any;
      }
      return { ok: false, status: 404, json: async () => ({}) } as any;
    });

    render(React.createElement(GithubImportModal, { projectId, onClose, onSuccess }));

    const input = screen.getByPlaceholderText('https://github.com/owner/repo');
    fireEvent.change(input, { target: { value: 'https://github.com/org/repo' } });

    fireEvent.click(screen.getByRole('button', { name: /import repository/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });

    const files = await listFiles(projectId);
    expect(files).toHaveLength(2);

    const overwritten = files.find(f => f.path === '/src/main.ts');
    expect(overwritten?.content).toBe('newly overwritten content');

    const created = files.find(f => f.path === '/src/new-file.ts');
    expect(created?.content).toBe('freshly created content');
  });

  it('surfaces readable "Repository not found or no access" on 404 without crashing', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ message: 'Not Found' })
    } as any);

    render(React.createElement(GithubImportModal, { projectId, onClose, onSuccess }));

    const input = screen.getByPlaceholderText('https://github.com/owner/repo');
    fireEvent.change(input, { target: { value: 'https://github.com/private-org/secret-repo' } });

    fireEvent.click(screen.getByRole('button', { name: /import repository/i }));

    await waitFor(() => {
      expect(screen.getByText('Repository not found or no access')).toBeDefined();
    });

    expect(onSuccess).not.toHaveBeenCalled();
    const files = await listFiles(projectId);
    expect(files).toHaveLength(0);
  });

  it('surfaces network/server errors cleanly without crashing', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ message: 'Server explosion' })
    } as any);

    render(React.createElement(GithubImportModal, { projectId, onClose, onSuccess }));

    const input = screen.getByPlaceholderText('https://github.com/owner/repo');
    fireEvent.change(input, { target: { value: 'https://github.com/org/failing-repo' } });

    fireEvent.click(screen.getByRole('button', { name: /import repository/i }));

    await waitFor(() => {
      expect(screen.getByText(/GitHub API error: 500/i)).toBeDefined();
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('shows error on invalid repository URL format', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(React.createElement(GithubImportModal, { projectId, onClose, onSuccess }));

    const input = screen.getByPlaceholderText('https://github.com/owner/repo');
    fireEvent.change(input, { target: { value: 'not-a-valid-url' } });

    fireEvent.click(screen.getByRole('button', { name: /import repository/i }));

    await waitFor(() => {
      expect(screen.getByText(/Please enter a valid GitHub repository URL/i)).toBeDefined();
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });
});
