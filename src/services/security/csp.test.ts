import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function parseCsp(cspString: string): Record<string, string[]> {
  const directives: Record<string, string[]> = {};
  const parts = cspString.split(';').map(p => p.trim()).filter(Boolean);

  for (const part of parts) {
    const tokens = part.split(/\s+/).filter(Boolean);
    if (tokens.length > 0) {
      const name = tokens[0];
      const values = tokens.slice(1);
      directives[name] = values;
    }
  }

  return directives;
}

function getIndexHtmlCsp(): { raw: string; parsed: Record<string, string[]> } {
  const indexPath = path.resolve(process.cwd(), 'index.html');
  const content = fs.readFileSync(indexPath, 'utf-8');

  const match = content.match(/<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=(["'])([\s\S]*?)\1/i)
    || content.match(/<meta\s+content=(["'])([\s\S]*?)\1\s+http-equiv=["']Content-Security-Policy["']/i);

  if (!match) {
    throw new Error('Content-Security-Policy meta tag not found in index.html');
  }

  const raw = match[2];
  const parsed = parseCsp(raw);
  return { raw, parsed };
}

describe('Content Security Policy (CSP) in index.html', () => {
  it('defines a valid Content-Security-Policy meta tag in index.html', () => {
    const { raw, parsed } = getIndexHtmlCsp();
    expect(raw).toBeTruthy();
    expect(Object.keys(parsed).length).toBeGreaterThan(0);
  });

  it('enforces default-src as none', () => {
    const { parsed } = getIndexHtmlCsp();
    expect(parsed['default-src']).toBeDefined();
    expect(parsed['default-src']).toEqual(["'none'"]);
  });

  it('disallows unsafe-inline in script-src while preserving self, unsafe-eval, and blob:', () => {
    const { parsed } = getIndexHtmlCsp();
    const scriptSrc = parsed['script-src'];
    expect(scriptSrc).toBeDefined();

    // Must NOT contain 'unsafe-inline'
    expect(scriptSrc).not.toContain("'unsafe-inline'");

    // Must contain required sources for Vite modules, Worker eval sandbox, and blob workers
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("'unsafe-eval'");
    expect(scriptSrc).toContain('blob:');
  });

  it('restricts connect-src to expected trusted origins and local development endpoints', () => {
    const { parsed } = getIndexHtmlCsp();
    const connectSrc = parsed['connect-src'];
    expect(connectSrc).toBeDefined();

    // Must not allow universal wildcard origins
    expect(connectSrc).not.toContain('*');
    expect(connectSrc).not.toContain('https:');
    expect(connectSrc).not.toContain('http:');

    // Expected origins
    const expectedOrigins = [
      "'self'",
      'https://generativelanguage.googleapis.com',
      'https://api.anthropic.com',
      'https://api.openai.com',
      'https://openrouter.ai',
      'https://api.groq.com',
      'https://api.netlify.com',
      'https://api.vercel.com',
      'https://api.github.com',
      'https://esm.sh',
      'https://cdn.jsdelivr.net',
      'https://cdn.tailwindcss.com',
      'http://localhost:*',
      'http://127.0.0.1:*',
      'ws://localhost:*',
      'wss://localhost:*',
      'ws://127.0.0.1:*',
      'wss://127.0.0.1:*',
    ];

    expect(connectSrc).toEqual(expect.arrayContaining(expectedOrigins));
    expect(connectSrc.length).toBe(expectedOrigins.length);
  });

  it('defines required security controls for workers, frames, styles, and assets', () => {
    const { parsed } = getIndexHtmlCsp();

    expect(parsed['worker-src']).toEqual(["'self'", 'blob:']);
    expect(parsed['frame-src']).toEqual(["'self'", 'blob:', 'data:']);
    expect(parsed['manifest-src']).toEqual(["'self'"]);
    expect(parsed['img-src']).toEqual(["'self'", 'data:', 'blob:']);
  });
});
