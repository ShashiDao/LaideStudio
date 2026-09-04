import { describe, it, expect } from 'vitest';
import { scanFilesForSecrets } from './secretScan';

describe('scanFilesForSecrets', () => {
  it('detects .env and .env.* files regardless of content', () => {
    const files = [
      { path: '/.env', content: 'FOO=bar' },
      { path: '/config/.env.local', content: 'PORT=3000' },
      { path: '/src/main.ts', content: 'console.log("hello");' }
    ];

    const findings = scanFilesForSecrets(files);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toEqual({
      file: '/.env',
      line: 0,
      pattern: '.env file',
      preview: '(entire file)'
    });
    expect(findings[1]).toEqual({
      file: '/config/.env.local',
      line: 0,
      pattern: '.env file',
      preview: '(entire file)'
    });
  });

  it('detects Anthropic, OpenAI, Google, GitHub, and generic secret tokens', () => {
    const files = [
      {
        path: '/src/keys.ts',
        content: `
// Some keys
const anthropicKey = 'sk-ant-api03-1234567890abcdefghijklmnopprstuvwxyz';
const openaiKey = 'sk-proj-abcdefghijklmnopqwstuvwxyz123456';
const googleKey = 'AIzaSyA12345678901234567893495456789012';
const ghToken = 'ghp_123456789012345678901234567890123456';
const config = {
  API_KEY: "supersecrettoken1234567890",
  PRIVATE_TOKEN: 'anothertoken9876543210123'
};
`
      }
    ];

    const findings = scanFilesForSecrets(files);
    expect(findings.length).toBeGreaterThanOrEqual(5);

    const patterns = findings.map(f => f.pattern);
    expect(patterns).toContain('Anthropic API key');
    expect(patterns).toContain('OpenAI API key');
    expect(patterns).toContain('Google API key');
    expect(patterns).toContain('GitHub token');
    expect(patterns).toContain('Generic secret assignment');

    // Check previews are redacted
    for (const f of findings) {
      expect(f.preview).toContain('…');
      expect(f.preview.length).toBeLessThan(15);
    }
  });

  it('ignores safe files without secrets', () => {
    const files = [
      { path: '/src/App.tsx', content: 'export function App() { return <div>Hello</div>; }' },
      { path: '/package.json', content: '{"name": "my-app", "version": "1.0.0"}' }
    ];

    const findings = scanFilesForSecrets(files);
    expect(findings).toHaveLength(0);
  });
});
