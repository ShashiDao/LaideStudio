import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GithubClient } from './githubClient';

describe('GithubClient', () => {
  const originalFetch = globalThis.fetch;
  const token = 'ghp_mock_token_123';
  let client: GithubClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new GithubClient(token);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('getRepo(): calls GET /repos/{owner}/{repo} and returns repository data', async () => {
    const mockRepoData = {
      name: 'my-project',
      full_name: 'acme/my-project',
      default_branch: 'master',
      private: false
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockRepoData
    } as any);

    const data = await client.getRepo('acme', 'my-project');
    expect(data.default_branch).toBe('master');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/acme/my-project',
      expect.objectContaining({
        headers: expect.any(Headers)
      })
    );
  });

  it('getRepoTree(): uses specified branch parameter (e.g. master)', async () => {
    const mockTreeData = {
      sha: 'tree123',
      tree: [
        { path: 'README.md', type: 'blob', mode: '100644', sha: 'blob1' }
      ]
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockTreeData
    } as any);

    const data = await client.getRepoTree('acme', 'my-project', 'master');
    expect(data.tree).toHaveLength(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/acme/my-project/git/trees/master?recursive=1',
      expect.any(Object)
    );
  });

  it('getFileContent(): passes ref branch parameter and decodes base64 content', async () => {
    const rawContent = 'console.log("Hello from master");\n';
    const base64Content = btoa(rawContent);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        type: 'file',
        encoding: 'base64',
        content: base64Content
      })
    } as any);

    const content = await client.getFileContent('acme', 'my-project', 'src/index.ts', 'master');
    expect(content).toBe(rawContent);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/acme/my-project/contents/src/index.ts?ref=master',
      expect.any(Object)
    );
  });

  it('getFileContent(): properly decodes non-ASCII UTF-8 text from base64', async () => {
    const rawContent = 'Hello 世界! 🚀';
    // Manually encode to base64 properly matching utf-8 bytes
    const encoder = new TextEncoder();
    const bytes = encoder.encode(rawContent);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Content = btoa(binary);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        type: 'file',
        encoding: 'base64',
        content: base64Content
      })
    } as any);

    const content = await client.getFileContent('acme', 'my-project', 'src/hello.txt', 'master');
    expect(content).toBe(rawContent);
  });

  it('getFileContent(): returns raw base64 string for binary file extensions without decoding', async () => {
    const rawBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        type: 'file',
        encoding: 'base64',
        // simulate GitHub adding newlines
        content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKm\nMIQAAAABJRU5ErkJggg==\n'
      })
    } as any);

    const content = await client.getFileContent('acme', 'my-project', 'src/image.png', 'master');
    // For binary extensions (.png), we expect the cleaned base64, without decoding
    expect(content).toBe(rawBase64);
  });

  it('throws clear "Repository not found or no access" on 404 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ message: 'Not Found' })
    } as any);

    await expect(client.getRepo('unknown', 'non-existent')).rejects.toThrow(
      'Repository not found or no access'
    );
  });

  it('throws generic error for other non-ok HTTP status codes', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ message: 'Server Error' })
    } as any);

    await expect(client.getRepo('acme', 'error-repo')).rejects.toThrow(
      'GitHub API error: 500 Internal Server Error'
    );
  });

  it('sets Content-Type: application/json on POST requests with a body (e.g. createBlob, createTree, createCommit, createBranch)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ sha: 'mock_sha', ref: 'mock_ref' })
    } as any);

    await client.createBlob('acme', 'my-project', 'test content');
    await client.createTree('acme', 'my-project', 'base_sha', []);
    await client.createCommit('acme', 'my-project', 'msg', 'tree_sha', 'parent_sha');
    await client.createBranch('acme', 'my-project', 'new-branch', 'sha');

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls.length).toBe(4);

    for (const call of fetchMock.mock.calls) {
      const headers = call[1]?.headers as Headers;
      expect(headers).toBeDefined();
      expect(headers.get('Content-Type')).toBe('application/json');
    }
  });
});
