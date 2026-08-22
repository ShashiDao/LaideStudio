import { describe, it, expect } from 'vitest';
import { 
  buildFileManifest, 
  buildSystemPrompt, 
  BASE_SYSTEM_PROMPT, 
  SUGGESTION_PROMPTS,
  DEFAULT_MANIFEST_EXCLUDE_PATTERNS,
  isPathExcludedFromManifest
} from './prompts';

describe('Agent Prompts & File Manifest', () => {
  it('contains expected suggestion prompts', () => {
    expect(SUGGESTION_PROMPTS.WHAT_IS_IN_PROJECT).toBeDefined();
    expect(SUGGESTION_PROMPTS.EXPLAIN_LAST_ERROR).toBeDefined();
    expect(SUGGESTION_PROMPTS.ADD_INDEX_HTML).toBeDefined();
  });

  it('contains expected default exclude patterns', () => {
    expect(DEFAULT_MANIFEST_EXCLUDE_PATTERNS).toContain('package-lock.json');
    expect(DEFAULT_MANIFEST_EXCLUDE_PATTERNS).toContain('bun.lock');
    expect(DEFAULT_MANIFEST_EXCLUDE_PATTERNS).toContain('yarn.lock');
    expect(DEFAULT_MANIFEST_EXCLUDE_PATTERNS).toContain('.gitignore');
    expect(DEFAULT_MANIFEST_EXCLUDE_PATTERNS).toContain('.env.example');
    expect(DEFAULT_MANIFEST_EXCLUDE_PATTERNS).toContain('.png');
    expect(DEFAULT_MANIFEST_EXCLUDE_PATTERNS).toContain('.zip');
  });

  it('correctly identifies excluded paths from manifest', () => {
    expect(isPathExcludedFromManifest('/package-lock.json')).toBe(true);
    expect(isPathExcludedFromManifest('/bun.lock')).toBe(true);
    expect(isPathExcludedFromManifest('/yarn.lock')).toBe(true);
    expect(isPathExcludedFromManifest('/.gitignore')).toBe(true);
    expect(isPathExcludedFromManifest('/.env.example')).toBe(true);
    expect(isPathExcludedFromManifest('/public/favicon.ico')).toBe(true);
    expect(isPathExcludedFromManifest('/assets/image.png')).toBe(true);
    expect(isPathExcludedFromManifest('/assets/audio.mp3')).toBe(true);
    expect(isPathExcludedFromManifest('/archive.zip')).toBe(true);

    // Regular source files must NOT be excluded
    expect(isPathExcludedFromManifest('/src/App.tsx')).toBe(false);
    expect(isPathExcludedFromManifest('/package.json')).toBe(false);
    expect(isPathExcludedFromManifest('/index.html')).toBe(false);
    expect(isPathExcludedFromManifest('/README.md')).toBe(false);
  });

  it('builds empty workspace manifest when no files exist', () => {
    const manifest = buildFileManifest([]);
    expect(manifest).toContain('<file_manifest>');
    expect(manifest).toContain('Empty workspace');
    expect(manifest).toContain('</file_manifest>');
  });

  it('builds lightweight file-tree manifest with paths and byte sizes only', () => {
    const sampleFiles = [
      { path: '/src/App.tsx', content: 'export default function App() { return <div>Hello</div>; }' },
      { path: '/package.json', content: '{"name": "test-app"}' },
      { path: '/index.html', content: '<!DOCTYPE html><html><body><div id="root"></div></body></html>' }
    ];

    const manifest = buildFileManifest(sampleFiles);
    expect(manifest).toContain('<file_manifest>');
    expect(manifest).toContain('</file_manifest>');

    // Must list paths and byte counts
    expect(manifest).toContain('/src/App.tsx');
    expect(manifest).toContain(`${new TextEncoder().encode(sampleFiles[0].content).length} bytes`);
    expect(manifest).toContain('/package.json');
    expect(manifest).toContain(`${new TextEncoder().encode(sampleFiles[1].content).length} bytes`);
    expect(manifest).toContain('/index.html');
    expect(manifest).toContain(`${new TextEncoder().encode(sampleFiles[2].content).length} bytes`);

    // Must NOT leak full contents inside the manifest
    expect(manifest).not.toContain('return <div>Hello</div>');
    expect(manifest).not.toContain('<!DOCTYPE html>');
  });

  it('builds complete system prompt with base instructions, custom instructions, and manifest', () => {
    const sampleFiles = [
      { path: '/src/index.ts', content: 'console.log("ready");' }
    ];

    const promptWithoutCustom = buildSystemPrompt(sampleFiles);
    expect(promptWithoutCustom).toContain(BASE_SYSTEM_PROMPT);
    expect(promptWithoutCustom).toContain('<file_manifest>');
    expect(promptWithoutCustom).toContain('/src/index.ts');
    expect(promptWithoutCustom).not.toContain('<custom_instructions>');

    const promptWithCustom = buildSystemPrompt(sampleFiles, 'Always use TypeScript strict mode.');
    expect(promptWithCustom).toContain(BASE_SYSTEM_PROMPT);
    expect(promptWithCustom).toContain('<custom_instructions>');
    expect(promptWithCustom).toContain('Always use TypeScript strict mode.');
    expect(promptWithCustom).toContain('<file_manifest>');
  });
});
