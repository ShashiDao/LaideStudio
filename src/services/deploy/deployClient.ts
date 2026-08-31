import JSZip from 'jszip';
import type { FileItem } from '../../db';
import type { KeyMaterial } from '../security/crypto';
import { binaryExtensions } from '../fs/zipExport';
import { detectBundledProject } from '../bundler/entryDetection';
import { buildBundledHtml, detectProjectTailwindVersion, injectTailwindScriptIntoHtml } from '../bundler/bundleHtml';

export interface DeployFile {
  file: string;
  data: string;
  encoding?: 'utf-8' | 'base64';
}

export interface DeployPackage {
  zipBlob: Blob;
  staticFiles: DeployFile[];
  isBundled: boolean;
  entryPoint?: string;
}

export interface DeployResult {
  id: string;
  provider: 'netlify' | 'vercel' | 'cloudflare';
  siteName: string;
  url: string;
  liveUrl: string;
  adminUrl?: string;
  deployedAt: string;
  projectId: string;
}

// Netlify standard SPA redirect rule
const NETLIFY_REDIRECTS = `/*    /index.html   200\n`;

// Vercel standard SPA configuration
const VERCEL_CONFIG = JSON.stringify({
  routes: [
    { handle: "filesystem" },
    { src: "/(.*)", dest: "/index.html" }
  ]
}, null, 2);


/**
 * Builds a standalone static deploy package (Zip and individual file list)
 * from project files, automatically bundling React/TypeScript if needed.
 */
export async function buildDeployPackage(
  files: FileItem[],
  onProgress?: (status: string) => void
): Promise<DeployPackage> {
  const projectInfo = detectBundledProject(files);
  const zip = new JSZip();
  const staticFiles: DeployFile[] = [];

  if (projectInfo.isBundled && projectInfo.entryPoint) {
    onProgress?.('Bundling TypeScript / React application...');
    const { bundle } = await import('../bundler/bundler');
    const bundledCode = await bundle(files, projectInfo.entryPoint, onProgress);

    onProgress?.('Compiling standalone HTML & assets...');
    const indexFile = files.find(f => f.path === '/index.html' || f.path === '/public/index.html');
    
    let finalHtml = buildBundledHtml(bundledCode, indexFile?.content);
    
    const tailwindVersion = detectProjectTailwindVersion(files);
    if (tailwindVersion) {
      finalHtml = injectTailwindScriptIntoHtml(finalHtml, tailwindVersion);
    }

    // Add standalone index.html
    zip.file('index.html', finalHtml);
    staticFiles.push({ file: 'index.html', data: finalHtml, encoding: 'utf-8' });

    // Add static assets from public/ or root (images, icons, styles, fonts)
    for (const file of files) {
      const path = file.path.startsWith('/') ? file.path.substring(1) : file.path;
      // Skip source files that are compiled into bundle, but keep public assets and static files
      const isSrcCode = path.startsWith('src/') || path === 'package.json' || path === 'tsconfig.json' || path === 'index.html';
      if (!isSrcCode) {
        const isBinary = binaryExtensions.some(ext => path.toLowerCase().endsWith(ext));
        if (isBinary) {
          zip.file(path, file.content, { base64: true });
          staticFiles.push({ file: path, data: file.content, encoding: 'base64' });
        } else {
          zip.file(path, file.content);
          staticFiles.push({ file: path, data: file.content, encoding: 'utf-8' });
        }
      }
    }

    // Add SPA Routing Redirects for Netlify & Vercel
    zip.file('_redirects', NETLIFY_REDIRECTS);
    staticFiles.push({ file: '_redirects', data: NETLIFY_REDIRECTS, encoding: 'utf-8' });

    zip.file('vercel.json', VERCEL_CONFIG);
    staticFiles.push({ file: 'vercel.json', data: VERCEL_CONFIG, encoding: 'utf-8' });

    onProgress?.('Generating deployment archive...');
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    return {
      zipBlob,
      staticFiles,
      isBundled: true,
      entryPoint: projectInfo.entryPoint
    };
  }

  // Static Project Packaging
  onProgress?.('Packaging static files...');
  let hasIndexHtml = false;

  for (const file of files) {
    const path = file.path.startsWith('/') ? file.path.substring(1) : file.path;
    if (path === 'index.html') hasIndexHtml = true;

    const isBinary = binaryExtensions.some(ext => path.toLowerCase().endsWith(ext));
    if (isBinary) {
      zip.file(path, file.content, { base64: true });
      staticFiles.push({ file: path, data: file.content, encoding: 'base64' });
    } else {
      zip.file(path, file.content);
      staticFiles.push({ file: path, data: file.content, encoding: 'utf-8' });
    }
  }

  if (!hasIndexHtml) {
    // If no root index.html exists, check /public/index.html or generate a basic landing
    const pubIndex = files.find(f => f.path === '/public/index.html');
    if (pubIndex) {
      zip.file('index.html', pubIndex.content);
      staticFiles.push({ file: 'index.html', data: pubIndex.content, encoding: 'utf-8' });
    }
  }

  zip.file('_redirects', NETLIFY_REDIRECTS);
  staticFiles.push({ file: '_redirects', data: NETLIFY_REDIRECTS, encoding: 'utf-8' });

  zip.file('vercel.json', VERCEL_CONFIG);
  staticFiles.push({ file: 'vercel.json', data: VERCEL_CONFIG, encoding: 'utf-8' });

  onProgress?.('Generating deployment archive...');
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  return {
    zipBlob,
    staticFiles,
    isBundled: false
  };
}

/**
 * Deploys a zipped static site to Netlify via the Netlify REST API.
 */
export async function deployToNetlify({
  token,
  siteName,
  projectId,
  zipBlob,
  onProgress
}: {
  token?: string;
  siteName?: string;
  projectId: string;
  zipBlob: Blob;
  onProgress?: (status: string) => void;
}): Promise<DeployResult> {
  onProgress?.('Connecting to Netlify...');

  const headers = new Headers();
  headers.set('Content-Type', 'application/zip');
  if (token) {
    headers.set('Authorization', `Bearer ${token.trim()}`);
  }

  let endpoint = 'https://api.netlify.com/api/v1/sites';
  if (siteName && siteName.trim()) {
    endpoint += `?name=${encodeURIComponent(siteName.trim())}`;
  }

  onProgress?.('Uploading project bundle to Netlify...');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: zipBlob
  });

  if (!response.ok) {
    let errorMsg = `Netlify deployment failed (${response.status} ${response.statusText})`;
    try {
      const errData = await response.json();
      if (errData.message) {
        errorMsg = errData.message;
      } else if (errData.errors) {
        errorMsg = Object.entries(errData.errors)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join('; ');
      }
    } catch {
      // Ignore JSON parse errors
    }
    throw new Error(errorMsg);
  }

  onProgress?.('Finalizing Netlify deployment...');
  const data = await response.json();

  const rawUrl = data.ssl_url || data.url || data.deploy_ssl_url || (data.subdomain ? `https://${data.subdomain}.netlify.app` : '');
  const siteId = data.id || data.site_id || '';
  const finalSiteName = data.name || siteName || 'netlify-site';
  const adminUrl = data.admin_url || (siteId ? `https://app.netlify.com/sites/${finalSiteName}` : undefined);

  const result: DeployResult = {
    id: data.deploy_id || data.id || crypto.randomUUID(),
    provider: 'netlify',
    siteName: finalSiteName,
    url: rawUrl,
    liveUrl: rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`,
    adminUrl,
    deployedAt: new Date().toISOString(),
    projectId
  };

  saveDeployHistory(projectId, result);
  return result;
}

/**
 * Deploys static files to Vercel via the Vercel REST API.
 */
export async function deployToVercel({
  token,
  projectName,
  projectId,
  files,
  onProgress
}: {
  token: string;
  projectName: string;
  projectId: string;
  files: DeployFile[];
  onProgress?: (status: string) => void;
}): Promise<DeployResult> {
  if (!token || !token.trim()) {
    throw new Error('Vercel API Token is required');
  }

  const sanitizedName = projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 52) || 'laide-app';

  onProgress?.('Packaging files for Vercel...');

  const vercelFiles = files.map(f => ({
    file: f.file,
    data: f.data,
    encoding: f.encoding || 'utf-8'
  }));

  const payload = {
    name: sanitizedName,
    files: vercelFiles,
    projectSettings: {
      framework: null
    }
  };

  onProgress?.('Uploading to Vercel edge deployment...');
  const response = await fetch('https://api.vercel.com/v13/deployments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token.trim()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let errorMsg = `Vercel deployment failed (${response.status} ${response.statusText})`;
    try {
      const errData = await response.json();
      if (errData.error?.message) {
        errorMsg = errData.error.message;
      }
    } catch {
      // Ignore JSON parse errors
    }
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const deploymentId = data.id;
  const rawUrl = data.url;

  // Poll for ready status if in building/initializing state
  if (data.readyState !== 'READY' && data.readyState !== 'ERROR' && deploymentId) {
    onProgress?.('Waiting for Vercel deployment to go live...');
    const maxAttempts = 15;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, 1500));
      try {
        const checkRes = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}`, {
          headers: { 'Authorization': `Bearer ${token.trim()}` }
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.readyState === 'READY') {
            break;
          }
          if (checkData.readyState === 'ERROR') {
            throw new Error(checkData.errorMessage || 'Vercel build failed');
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('build failed')) throw err;
      }
    }
  }

  const liveUrl = `https://${rawUrl}`;
  const dashboardUrl = `https://vercel.com`;

  const result: DeployResult = {
    id: deploymentId || crypto.randomUUID(),
    provider: 'vercel',
    siteName: sanitizedName,
    url: rawUrl,
    liveUrl,
    adminUrl: dashboardUrl,
    deployedAt: new Date().toISOString(),
    projectId
  };

  saveDeployHistory(projectId, result);
  return result;
}

/**
 * Deploys static files to Cloudflare Pages via the Cloudflare REST API.
 */
export async function deployToCloudflarePages({
  apiToken,
  accountId,
  projectName,
  projectId,
  files,
  onProgress
}: {
  apiToken: string;
  accountId: string;
  projectName: string;
  projectId: string;
  files: DeployFile[];
  onProgress?: (status: string) => void;
}): Promise<DeployResult> {
  if (!apiToken || !apiToken.trim()) {
    throw new Error('Cloudflare API Token is required');
  }
  if (!accountId || !accountId.trim()) {
    throw new Error('Cloudflare Account ID is required');
  }

  const sanitizedName = projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 58) || 'laide-app';

  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId.trim()}/pages/projects`;
  const headers = { 'Authorization': `Bearer ${apiToken.trim()}` };

  onProgress?.('Checking Cloudflare Pages project...');
  let projectExists = false;
  try {
    const projRes = await fetch(`${baseUrl}/${sanitizedName}`, { headers });
    if (projRes.ok) projectExists = true;
  } catch {
    // Ignore fetch errors here
  }

  if (!projectExists) {
    onProgress?.('Creating Cloudflare Pages project...');
    const createRes = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: sanitizedName,
        production_branch: 'main'
      })
    });

    if (!createRes.ok) {
      let errorMsg = `Cloudflare project creation failed (${createRes.status})`;
      try {
        const errData = await createRes.json();
        if (errData.errors?.[0]?.message) {
          errorMsg = errData.errors[0].message;
        }
      } catch {
        // Ignore JSON parse errors
      }
      throw new Error(errorMsg);
    }
  }

  onProgress?.('Packaging files for Cloudflare Pages...');
  const formData = new FormData();
  for (const f of files) {
    let blob: Blob;
    if (f.encoding === 'base64') {
      const byteCharacters = atob(f.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      blob = new Blob([new Uint8Array(byteNumbers)]);
    } else {
      blob = new Blob([f.data]);
    }
    const path = f.file.startsWith('/') ? f.file.substring(1) : f.file;
    formData.append(path, blob, path);
  }

  onProgress?.('Uploading to Cloudflare Pages deployment...');
  const uploadRes = await fetch(`${baseUrl}/${sanitizedName}/deployments`, {
    method: 'POST',
    headers, // Let browser set Content-Type with boundary for FormData
    body: formData
  });

  if (!uploadRes.ok) {
    let errorMsg = `Cloudflare deployment failed (${uploadRes.status})`;
    try {
      const errData = await uploadRes.json();
      if (errData.errors?.[0]?.message) {
        errorMsg = errData.errors[0].message;
      }
    } catch {
      // Ignore JSON parse errors
    }
    throw new Error(errorMsg);
  }

  const uploadData = await uploadRes.json();
  const deploymentId = uploadData.result?.id;
  const rawUrl = uploadData.result?.url;

  if (deploymentId && uploadData.result?.latest_stage?.status !== 'success' && uploadData.result?.latest_stage?.status !== 'failure') {
    onProgress?.('Waiting for Cloudflare Pages deployment to go live...');
    const maxAttempts = 15;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, 1500));
      try {
        const checkRes = await fetch(`${baseUrl}/${sanitizedName}/deployments/${deploymentId}`, { headers });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          const status = checkData.result?.latest_stage?.status;
          if (status === 'success') {
            break;
          }
          if (status === 'failure' || status === 'canceled') {
            throw new Error('Cloudflare build failed');
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('build failed')) throw err;
      }
    }
  }

  const liveUrl = rawUrl || `https://${sanitizedName}.pages.dev`;
  
  const result: DeployResult = {
    id: deploymentId || crypto.randomUUID(),
    provider: 'cloudflare',
    siteName: sanitizedName,
    url: rawUrl?.replace(/^https?:\/\//, '') || `${sanitizedName}.pages.dev`,
    liveUrl,
    adminUrl: `https://dash.cloudflare.com/${accountId.trim()}/pages/view/${sanitizedName}`,
    deployedAt: new Date().toISOString(),
    projectId
  };

  saveDeployHistory(projectId, result);
  return result;
}

// Vault Token helpers
export async function saveDeployToken(
  keys: KeyMaterial,
  provider: 'netlify' | 'vercel' | 'cloudflare',
  token: string,
  accountId?: string
): Promise<void> {
  const { encryptData } = await import('../security/crypto');
  const { db } = await import('../../db');
  
  if (provider === 'cloudflare') {
    if (!token.trim()) {
      await db.secureTokens.delete('cloudflare_token');
      await db.secureTokens.delete('cloudflare_account_id');
      return;
    }
    const encToken = await encryptData(keys.aesKey, token.trim());
    await db.secureTokens.put({ key: 'cloudflare_token', encryptedValue: encToken });
    if (accountId?.trim()) {
      const encAccount = await encryptData(keys.aesKey, accountId.trim());
      await db.secureTokens.put({ key: 'cloudflare_account_id', encryptedValue: encAccount });
    } else {
      await db.secureTokens.delete('cloudflare_account_id');
    }
    return;
  }

  const dbKey = provider === 'netlify' ? 'netlify_token' : 'vercel_token';
  if (!token.trim()) {
    await db.secureTokens.delete(dbKey);
    return;
  }
  const enc = await encryptData(keys.aesKey, token.trim());
  await db.secureTokens.put({ key: dbKey, encryptedValue: enc });
}

export async function getDeployToken(
  keys: KeyMaterial | null,
  provider: 'netlify' | 'vercel' | 'cloudflare'
): Promise<string | { token: string; accountId: string } | null> {
  if (!keys) return null;
  const { db } = await import('../../db');
  
  if (provider === 'cloudflare') {
    const tokenRec = await db.secureTokens.get('cloudflare_token');
    const accountRec = await db.secureTokens.get('cloudflare_account_id');
    if (!tokenRec?.encryptedValue) return null;
    
    try {
      const { decryptData } = await import('../security/crypto');
      const token = await decryptData(keys.aesKey, tokenRec.encryptedValue);
      let accountId = '';
      if (accountRec?.encryptedValue) {
        accountId = await decryptData(keys.aesKey, accountRec.encryptedValue);
      }
      return { token, accountId };
    } catch {
      return null;
    }
  }

  const dbKey = provider === 'netlify' ? 'netlify_token' : 'vercel_token';
  const record = await db.secureTokens.get(dbKey);
  const enc = record?.encryptedValue;
  if (!enc) return null;
  try {
    const { decryptData } = await import('../security/crypto');
    return await decryptData(keys.aesKey, enc);
  } catch {
    return null;
  }
}

export async function deleteDeployToken(provider: 'netlify' | 'vercel' | 'cloudflare'): Promise<void> {
  const { db } = await import('../../db');
  if (provider === 'cloudflare') {
    await db.secureTokens.delete('cloudflare_token');
    await db.secureTokens.delete('cloudflare_account_id');
    return;
  }
  const dbKey = provider === 'netlify' ? 'netlify_token' : 'vercel_token';
  await db.secureTokens.delete(dbKey);
}

// Deploy History helpers
export function getDeployHistory(projectId: string): DeployResult[] {
  try {
    const raw = localStorage.getItem(`laide_deploy_history_${projectId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveDeployHistory(projectId: string, result: DeployResult): void {
  try {
    const existing = getDeployHistory(projectId);
    const updated = [result, ...existing.filter(i => i.id !== result.id)].slice(0, 10);
    localStorage.setItem(`laide_deploy_history_${projectId}`, JSON.stringify(updated));
  } catch {
    // Ignore localStorage write error
  }
}

export function clearDeployHistory(projectId: string): void {
  localStorage.removeItem(`laide_deploy_history_${projectId}`);
}
