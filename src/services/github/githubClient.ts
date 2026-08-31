import { binaryExtensions } from '../fs/zipExport';
import type { KeyMaterial } from '../security/crypto';

export interface GitTreeEntry {
  path: string;
  mode: '100644' | '100755' | '040000' | '160000' | '120000';
  type: 'blob' | 'tree' | 'commit';
  sha?: string | null;
  content?: string;
}

export interface GithubRepo {
  id?: number | string;
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
  owner: {
    login: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface GithubRef {
  object: { sha: string };
}

interface GithubCommit {
  tree: { sha: string };
  sha: string;
}

export interface GithubTreeResponse {
  sha: string;
  tree: GitTreeEntry[];
}

interface GithubBlob {
  sha: string;
}

interface GithubFileContent {
  type: string;
  encoding: string;
  content: string;
}

export interface GithubCreatedRepo {
  name: string;
  default_branch: string;
  html_url: string;
  owner: {
    login: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export class GithubClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/vnd.github.v3+json');
    headers.set('Authorization', `Bearer ${this.token}`);
    
    if (options.body) {
      headers.set('Content-Type', 'application/json');
    }
    
    const response = await fetch(`https://api.github.com${endpoint}`, {
      ...options,
      headers
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Repository not found or no access');
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  async createRepo(name: string, options: { description?: string; private: boolean; org?: string }): Promise<GithubCreatedRepo> {
    const org = options.org?.trim();
    const endpoint = org ? `/orgs/${encodeURIComponent(org)}/repos` : '/user/repos';
    return this.request<GithubCreatedRepo>(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        name,
        description: options.description,
        private: options.private,
        auto_init: true
      })
    });
  }

  async getRepo(owner: string, repo: string) {
    return this.request<GithubRepo>(`/repos/${owner}/${repo}`);
  }

  async listRepos() {
    return this.request<GithubRepo[]>('/user/repos?sort=updated&per_page=100');
  }

  async getRepoTree(owner: string, repo: string, branch: string = 'main') {
    return this.request<GithubTreeResponse>(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
  }

  async getFileContent(owner: string, repo: string, path: string, branch: string = 'main') {
    const data = await this.request<GithubFileContent>(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
    if (data.type !== 'file' || data.encoding !== 'base64') {
      throw new Error('Not a valid base64 file');
    }
    
    // Clean any newlines from GitHub's base64 response
    const base64Clean = data.content.replace(/\s/g, '');
    
    const isBinary = binaryExtensions.some(ext => path.toLowerCase().endsWith(ext));
    if (isBinary) {
      return base64Clean;
    }
    
    // Properly decode base64 to UTF-8
    const binaryString = atob(base64Clean);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  }

  async getBranch(owner: string, repo: string, branch: string) {
    return this.request<GithubRef>(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
  }

  async getCommit(owner: string, repo: string, commitSha: string) {
    return this.request<GithubCommit>(`/repos/${owner}/${repo}/git/commits/${commitSha}`);
  }

  async createBlob(owner: string, repo: string, content: string, encoding: 'utf-8' | 'base64' = 'utf-8') {
    return this.request<GithubBlob>(`/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content, encoding })
    });
  }

  async createTree(owner: string, repo: string, baseTreeSha: string | null, tree: GitTreeEntry[]) {
    return this.request<GithubTreeResponse>(`/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({
        ...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
        tree
      })
    });
  }

  async createCommit(owner: string, repo: string, message: string, treeSha: string, parentSha: string) {
    return this.request<GithubCommit>(`/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message,
        tree: treeSha,
        parents: [parentSha]
      })
    });
  }

  async createBranch(owner: string, repo: string, branch: string, sha: string) {
    return this.request(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha
      })
    });
  }
}

export async function createGithubClient(keys: KeyMaterial): Promise<GithubClient> {
  const { decryptData } = await import('../security/crypto');
  const { db } = await import('../../db');
  const record = await db.secureTokens.get('github_pat');
  const enc = record?.encryptedValue;
  if (!enc) {
    throw new Error('GitHub PAT not configured');
  }
  const token = await decryptData(keys.aesKey, enc);
  return new GithubClient(token);
}
