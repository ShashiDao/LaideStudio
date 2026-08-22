import { describe, it, expect, beforeEach } from 'vitest';
import { getLanguageExtensionAsync, langExtensionCache } from './Editor';

describe('Editor lazy language extension loading', () => {
  beforeEach(() => {
    langExtensionCache.clear();
  });

  it('loads and caches javascript extension for .tsx and .js files', async () => {
    const ext1 = await getLanguageExtensionAsync('/src/App.tsx');
    expect(ext1).not.toBeNull();
    expect(langExtensionCache.has('javascript-true')).toBe(true);

    const ext2 = await getLanguageExtensionAsync('/src/index.js');
    expect(ext2).not.toBeNull();
    expect(langExtensionCache.has('javascript-false')).toBe(true);
  });

  it('loads HTML, CSS, JSON, and Markdown extensions per file type', async () => {
    const htmlExt = await getLanguageExtensionAsync('/index.html');
    expect(htmlExt).not.toBeNull();
    expect(langExtensionCache.has('html')).toBe(true);

    const cssExt = await getLanguageExtensionAsync('/src/index.css');
    expect(cssExt).not.toBeNull();
    expect(langExtensionCache.has('css')).toBe(true);

    const jsonExt = await getLanguageExtensionAsync('/package.json');
    expect(jsonExt).not.toBeNull();
    expect(langExtensionCache.has('json')).toBe(true);

    const mdExt = await getLanguageExtensionAsync('/README.md');
    expect(mdExt).not.toBeNull();
    expect(langExtensionCache.has('markdown')).toBe(true);
  });

  it('returns null for unknown file types without loading extensions', async () => {
    const ext = await getLanguageExtensionAsync('/unknown.bin');
    expect(ext).toBeNull();
  });
});
