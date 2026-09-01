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

  it('getRepoArchive(): calls GET /repos/{owner}/{repo}/zipball/{ref} with auth and returns Blob', async () => {
    const mockBlob = new Blob(['mock-zip-binary-data'], { type: 'application/zip' });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => mockBlob
    } as any);

    const blob = await client.getRepoArchive('acme', 'my-project', 'main');
    expect(blob).toBe(mockBlob);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/acme/my-project/zipball/main',
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

  it('createRepo(): calls POST /user/repos when org is not specified and sends auto_init: true', async () => {
    const mockCreatedRepo = {
      name: 'new-cool-repo',
      html_url: 'https://github.com/user/new-cool-repo',
      default_branch: 'main',
      private: true,
      owner: { login: 'octocat' }
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => mockCreatedRepo
    } as any);

    const result = await client.createRepo('new-cool-repo', {
      description: 'A brand new repository',
      private: true
    });

    expect(result.name).toBe('new-cool-repo');
    expect(result.owner.login).toBe('octocat');
    expect(result.default_branch).toBe('main');
    expect(result.html_url).toBe('https://github.com/user/new-cool-repo');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.github.com/user/repos',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'new-cool-repo',
          description: 'A brand new repository',
          private: true,
          auto_init: true
        })
      })
    );
  });

  it('createRepo(): calls POST /orgs/{org}/repos when org is provided', async () => {
    const mockCreatedRepo = {
      name: 'org-repo',
      html_url: 'https://github.com/my-org/org-repo',
      default_branch: 'main',
      private: false,
      owner: { login: 'my-org' }
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => mockCreatedRepo
    } as any);

    const result = await client.createRepo('org-repo', {
      description: 'Org repository description',
      private: false,
      org: 'my-org'
    });

    expect(result.owner.login).toBe('my-org');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.github.com/orgs/my-org/repos',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'org-repo',
          description: 'Org repository description',
          private: false,
          auto_init: true
        })
      })
    );
  });

  it('createRepo(): throws GitHub API error when status is 422 (e.g. repo name already exists)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({ message: 'Repository creation failed.' })
    } as any);

    await expect(
      client.createRepo('existing-repo', { private: true })
    ).rejects.toThrow('GitHub API error: 422 Unprocessable Entity');
  });
});
