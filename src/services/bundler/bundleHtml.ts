import type { FileItem } from '../../db';
import { stripTailwindDirectives } from './esbuild.worker';

export function buildBundledHtml(code: string, indexHtmlContent?: string): string {
  let finalHtml: string;

  if (indexHtmlContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(indexHtmlContent, 'text/html');

    // Remove existing script modules (vite injects them)
    const scripts = doc.querySelectorAll('script[type="module"]');
    scripts.forEach(s => s.remove());

    const scriptEl = doc.createElement('script');
    scriptEl.type = 'module';
    scriptEl.textContent = code;
    doc.body.appendChild(scriptEl);

    finalHtml = doc.documentElement.outerHTML;
    const doctype = doc.doctype;
    if (doctype) {
      finalHtml = `<!DOCTYPE ${doctype.name}>\n` + finalHtml;
    } else {
      finalHtml = `<!DOCTYPE html>\n` + finalHtml;
    }
  } else {
    finalHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module">${code}</script></body></html>`;
  }

  return finalHtml;
}

export function detectProjectTailwindVersion(files: Pick<FileItem, 'path' | 'content'>[]): 'v3' | 'v4' | null {
  const cssFiles = files.filter(f => f.path.endsWith('.css'));
  let detected: 'v3' | 'v4' | null = null;
  for (const f of cssFiles) {
    const { hasTailwind, version } = stripTailwindDirectives(f.content);
    if (hasTailwind && version) {
      if (version === 'v4') return 'v4';
      detected = version;
    }
  }
  return detected;
}

export function injectTailwindScriptIntoHtml(html: string, version: 'v3' | 'v4' = 'v3'): string {
  const scriptUrl = version === 'v4'
    ? 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4'
    : 'https://cdn.tailwindcss.com';

  if (html.includes(scriptUrl)) return html;
  if (html.includes('<head>')) {
    return html.replace('<head>', `<head>\n    <script src="${scriptUrl}"></script>`);
  }
  if (html.includes('<html>')) {
    return html.replace('<html>', `<html><head><script src="${scriptUrl}"></script></head>`);
  }
  return `<script src="${scriptUrl}"></script>\n` + html;
}
