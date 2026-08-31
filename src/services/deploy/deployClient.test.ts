// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  buildDeployPackage, 
  deployToNetlify, 
  deployToVercel,
  deployToCloudflarePages,
  saveDeployToken, 
  getDeployToken, 
  deleteDeployToken, 
  getDeployHistory, 
  saveDeployHistory, 
  clearDeployHistory, 
  type DeployResult 
} from './deployClient';
import type { FileItem } from '../../db';

describe('deployClient service', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('buildDeployPackage', () => {
    it('packages static files with _redirects and vercel.json for SPA routing', async () => {
      const files: FileItem[] = [
        {
          id: '1',
          projectId: 'p1',
          path: '/index.html',
          content: '<!DOCTYPE html><html><body><h1>Hello World</h1></body></html>',
          updatedAt: Date.now()
        },
        {
          id: '2',
          projectId: 'p1',
          path: '/style.css',
          content: 'body { color: red; }',
          updatedAt: Date.now()
        }
      ];

      const pkg = await buildDeployPackage(files);
      expect(pkg.isBundled).toBe(false);
      expect(pkg.zipBlob).toBeInstanceOf(Blob);
      expect(pkg.staticFiles.some(f => f.file === 'index.html')).toBe(true);
      expect(pkg.staticFiles.some(f => f.file === '_redirects')).toBe(true);
      expect(pkg.staticFiles.some(f => f.file === 'vercel.json')).toBe(true);
    });

    it('falls back to /public/index.html when root index.html is missing in static project', async () => {
      const files: FileItem[] = [
        {
          id: '1',
          projectId: 'p1',
          path: '/public/index.html',
          content: '<html><body>Public Page</body></html>',
          updatedAt: Date.now()
        }
      ];

      const pkg = await buildDeployPackage(files);
      expect(pkg.staticFiles.some(f => f.file === 'index.html')).toBe(true);
      const indexFile = pkg.staticFiles.find(f => f.file === 'index.html');
      expect(indexFile?.data).toBe('<html><body>Public Page</body></html>');
    });
  });

  describe('deployToNetlify', () => {
    it('deploys zip blob to Netlify REST API and returns formatted live result', async () => {
      const fakeBlob = new Blob(['dummy zip content'], { type: 'application/zip' });
      
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'dep_12345',
          name: 'laide-site-test',
          url: 'http://laide-site-test.netlify.app',
          ssl_url: 'https://laide-site-test.netlify.app',
          admin_url: 'https://app.netlify.com/sites/laide-site-test'
        })
      });
      globalThis.fetch = mockFetch;

      const progressLogs: string[] = [];
      const result = await deployToNetlify({
        token: 'nfp_test_123',
        siteName: 'laide-site-test',
        projectId: 'project-100',
        zipBlob: fakeBlob,
        onProgress: (s) => progressLogs.push(s)
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.netlify.com/api/v1/sites?name=laide-site-test',
        expect.objectContaining({
          method: 'POST',
          body: fakeBlob
        })
      );

      expect(result.liveUrl).toBe('https://laide-site-test.netlify.app');
      expect(result.provider).toBe('netlify');
      expect(result.siteName).toBe('laide-site-test');
      expect(progressLogs.length).toBeGreaterThan(0);

      // Verify it was recorded in deploy history
      const history = getDeployHistory('project-100');
      expect(history.length).toBe(1);
      expect(history[0].id).toBe('dep_12345');
    });

    it('throws descriptive error on Netlify API failure', async () => {
      const fakeBlob = new Blob(['test']);
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: async () => ({ message: 'Subdomain is already taken' })
      });

      await expect(
        deployToNetlify({
          token: 'nfp_test_123',
          siteName: 'taken-subdomain',
          projectId: 'project-100',
          zipBlob: fakeBlob
        })
      ).rejects.toThrow('Subdomain is already taken');
    });
  });

  describe('deployToVercel', () => {
    it('deploys files to Vercel API and returns live URL', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'dpl_vercel_123',
            name: 'my-cool-project',
            url: 'my-cool-project.vercel.app',
            readyState: 'READY'
          })
        });
      globalThis.fetch = mockFetch;

      const result = await deployToVercel({
        token: 'vck_valid_token',
        projectName: 'My Cool Project!',
        projectId: 'proj-vercel',
        files: [
          { file: 'index.html', data: '<h1>Hello Vercel</h1>' }
        ]
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.vercel.com/v13/deployments',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer vck_valid_token'
          })
        })
      );

      expect(result.liveUrl).toBe('https://my-cool-project.vercel.app');
      expect(result.provider).toBe('vercel');
      expect(result.siteName).toBe('my-cool-project');
    });

    it('requires a non-empty token for Vercel deploy', async () => {
      await expect(
        deployToVercel({
          token: '',
          projectName: 'app',
          projectId: 'p1',
          files: []
        })
      ).rejects.toThrow('Vercel API Token is required');
    });
  });

  describe('deployToCloudflarePages', () => {
    it('deploys files to Cloudflare Pages API and returns live URL', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: false }) // projectExists check fails
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // create project
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            result: {
              id: 'cf_dep_123',
              url: 'https://my-cool-project.pages.dev',
              latest_stage: { status: 'success' }
            }
          })
        });
      globalThis.fetch = mockFetch;

      const result = await deployToCloudflarePages({
        apiToken: 'cf_token_123',
        accountId: 'cf_acc_123',
        projectName: 'My Cool Project!',
        projectId: 'proj-cf',
        files: [
          { file: 'index.html', data: '<h1>Hello Cloudflare</h1>' }
        ]
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/cf_acc_123/pages/projects/my-cool-project/deployments',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData)
        })
      );

      expect(result.liveUrl).toBe('https://my-cool-project.pages.dev');
      expect(result.provider).toBe('cloudflare');
      expect(result.siteName).toBe('my-cool-project');
    });

    it('requires API token and account ID for Cloudflare deploy', async () => {
      await expect(
        deployToCloudflarePages({
          apiToken: '',
          accountId: '123',
          projectName: 'app',
          projectId: 'p1',
          files: []
        })
      ).rejects.toThrow('Cloudflare API Token is required');

      await expect(
        deployToCloudflarePages({
          apiToken: '123',
          accountId: '',
          projectName: 'app',
          projectId: 'p1',
          files: []
        })
      ).rejects.toThrow('Cloudflare Account ID is required');
    });
  });

  describe('Deploy Token Storage & History Management', () => {
    it('saves and retrieves deploy token with mock keys', async () => {
      const mockKeys = { 
        aesKey: {} as CryptoKey, 
        hmacKey: {} as CryptoKey, 
        masterKeyBytes: new Uint8Array(32) 
      };
      const cryptoMock = await import('../security/crypto');
      vi.spyOn(cryptoMock, 'encryptData').mockResolvedValue('encrypted_tok_val');
      vi.spyOn(cryptoMock, 'decryptData').mockResolvedValue('raw_tok_val');

      await saveDeployToken(mockKeys, 'netlify', 'raw_tok_val');
      const { db } = await import('../../db');
      expect((await db.secureTokens.get('netlify_token'))?.encryptedValue).toBe('encrypted_tok_val');

      const retrieved = await getDeployToken(mockKeys, 'netlify');
      expect(retrieved).toBe('raw_tok_val');

      await saveDeployToken(mockKeys, 'cloudflare', 'cf_token', 'cf_account');
      expect((await db.secureTokens.get('cloudflare_token'))?.encryptedValue).toBe('encrypted_tok_val');
      expect((await db.secureTokens.get('cloudflare_account_id'))?.encryptedValue).toBe('encrypted_tok_val');

      const cfRetrieved = await getDeployToken(mockKeys, 'cloudflare');
      expect(cfRetrieved).toEqual({ token: 'raw_tok_val', accountId: 'raw_tok_val' });
    });

    it('saves and clears deploy history per project', () => {
      const item: DeployResult = {
        id: 'd-1',
        provider: 'netlify',
        siteName: 'demo-site',
        url: 'https://demo-site.netlify.app',
        liveUrl: 'https://demo-site.netlify.app',
        deployedAt: new Date().toISOString(),
        projectId: 'project-history'
      };

      saveDeployHistory('project-history', item);
      expect(getDeployHistory('project-history')).toHaveLength(1);
      expect(getDeployHistory('project-history')[0].siteName).toBe('demo-site');

      clearDeployHistory('project-history');
      expect(getDeployHistory('project-history')).toHaveLength(0);
    });

    it('deletes deploy tokens correctly from IndexedDB', async () => {
      const { db } = await import('../../db');
      await db.secureTokens.put({ key: 'netlify_token', encryptedValue: 'sample' });
      await db.secureTokens.put({ key: 'vercel_token', encryptedValue: 'sample' });
      await db.secureTokens.put({ key: 'cloudflare_token', encryptedValue: 'sample' });
      await db.secureTokens.put({ key: 'cloudflare_account_id', encryptedValue: 'sample' });

      await deleteDeployToken('netlify');
      expect(await db.secureTokens.get('netlify_token')).toBeUndefined();
      expect((await db.secureTokens.get('vercel_token'))?.encryptedValue).toBe('sample');

      await deleteDeployToken('cloudflare');
      expect(await db.secureTokens.get('cloudflare_token')).toBeUndefined();
      expect(await db.secureTokens.get('cloudflare_account_id')).toBeUndefined();

      await deleteDeployToken('vercel');
      expect(await db.secureTokens.get('vercel_token')).toBeUndefined();
    });
  });
});
