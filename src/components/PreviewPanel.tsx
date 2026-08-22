import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Play, AlertCircle, Loader2, Sparkles, Eye, Check } from 'lucide-react';
import type { FileItem } from '../db';
import { useAppStore } from '../store';
import { SUGGESTION_PROMPTS } from '../services/agent/prompts';
import { detectBundledProject } from '../services/bundler/entryDetection';
import { injectCaptureScriptIntoHtml, captureIframeScreenshot } from '../services/bundler/previewCapture';
import { stripTailwindDirectives } from '../services/bundler/esbuild.worker';
import { escapeScriptClosingTags } from '../services/bundler/bundler';

export function buildBundledHtml(code: string, indexHtmlContent?: string): string {
  let finalHtml = '';

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

export function injectTailwindScriptIntoHtml(html: string): string {
  if (html.includes('cdn.tailwindcss.com')) return html;
  if (html.includes('<head>')) {
    return html.replace('<head>', '<head>\n    <script src="https://cdn.tailwindcss.com"></script>');
  }
  if (html.includes('<html>')) {
    return html.replace('<html>', '<html><head><script src="https://cdn.tailwindcss.com"></script></head>');
  }
  return `<script src="https://cdn.tailwindcss.com"></script>\n` + html;
}

interface PreviewPanelProps {
  files: FileItem[];
}

function resolvePath(base: string, relative: string): string {
  if (relative.startsWith('/')) return relative;
  if (relative.startsWith('./')) relative = relative.slice(2);
  const parts = base.split('/');
  parts.pop();
  const dir = parts.join('/');
  return (dir ? dir + '/' : '/') + relative;
}

export function PreviewPanel({ files }: PreviewPanelProps) {
  const { 
    setLastBuildError, 
    setActiveTab, 
    setQueuedPrompt,
    setLastPreviewScreenshot,
    setAttachPreviewVision,
    autoVisionOnPatch
  } = useAppStore();
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [justCaptured, setJustCaptured] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleCapture = async () => {
    if (!iframeRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const screenshot = await captureIframeScreenshot(iframeRef.current);
      if (screenshot) {
        setLastPreviewScreenshot(screenshot);
        setAttachPreviewVision(true);
        setJustCaptured(true);
        setTimeout(() => setJustCaptured(false), 2000);
      }
    } catch (e) {
      console.warn('Screenshot capture failed', e);
    } finally {
      setIsCapturing(false);
    }
  };

  useEffect(() => {
    let active = true;

    const cleanup = () => {
      
    };

    
    setError(null);
    setStatus('Building preview...');

    async function build() {
      // 1. Detect bundled project vs static project
      const projectInfo = detectBundledProject(files);

      if (projectInfo.isBundled) {
        if (!projectInfo.entryPoint) {
          if (!active) return;
          const msg = `Bundled project detected but no entry point found — expected one of: ${projectInfo.expectedEntries.join(', ')}`;
          setError(msg);
          setLastBuildError(msg);
          setStatus(null);
          setPreviewHtml(null);
          return;
        }

        try {
          setStatus('Loading bundler...');
          const { bundle } = await import('../services/bundler/bundler');
          if (!active) return;

          setStatus('Preparing compiler...');
          const code = await bundle(files, projectInfo.entryPoint, (stageStatus) => {
            if (active) {
              setStatus(stageStatus);
            }
          });
          if (!active) return;
          
          const indexFile = files.find(f => f.path === '/index.html');
          let finalHtml = buildBundledHtml(code, indexFile?.content);
          
          finalHtml = injectCaptureScriptIntoHtml(finalHtml);
          const hasTailwind = files.some(f => f.path.endsWith('.css') && stripTailwindDirectives(f.content).hasTailwind);
          if (hasTailwind) {
            finalHtml = injectTailwindScriptIntoHtml(finalHtml);
          }
          
          
          if (!active) return;
          setStatus(null);
          setPreviewHtml(finalHtml);
          setLastBuildError(null);
        } catch (err: any) {
          if (!active) return;
          const msg = err.message || 'Bundling failed';
          setError(msg);
          setLastBuildError(msg);
          setStatus(null);
        }
        return;
      }

      // Static fallback
      const indexFile = files.find(f => f.path === '/index.html' || f.path === '/public/index.html');
      if (!indexFile) {
        if (!active) return;
        const msg = 'No index.html found. Create one to see the preview.';
        setError(msg);
        setStatus(null);
        setPreviewHtml(null);
        return;
      }

      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(indexFile.content, 'text/html');

        const links = doc.querySelectorAll('link[rel="stylesheet"]');
        links.forEach(link => {
          const href = link.getAttribute('href');
          if (href && !href.startsWith('http') && !href.startsWith('data:') && !href.startsWith('//')) {
            const targetPath = resolvePath(indexFile.path, href);
            const targetFile = files.find(f => f.path === targetPath);
            if (targetFile) {
              const styleEl = doc.createElement('style');
              styleEl.textContent = targetFile.content;
              link.replaceWith(styleEl);
            }
          }
        });

        const scripts = doc.querySelectorAll('script[src]');
        scripts.forEach(script => {
          const src = script.getAttribute('src');
          if (src && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('//')) {
            const targetPath = resolvePath(indexFile.path, src);
            const targetFile = files.find(f => f.path === targetPath);
            if (targetFile) {
              let mimeType = 'application/javascript';
              if (script.getAttribute('type') === 'module') {
                mimeType = 'text/javascript';
              }
              const inlineScript = doc.createElement('script');
              if (script.getAttribute('type') === 'module') {
                inlineScript.setAttribute('type', 'module');
              }
              const sanitizedContent = escapeScriptClosingTags(targetFile.content);
              inlineScript.textContent = sanitizedContent;
              script.replaceWith(inlineScript);
            }
          }
        });

        let finalHtml = doc.documentElement.outerHTML;
        const doctype = doc.doctype;
        if (doctype) {
          finalHtml = `<!DOCTYPE ${doctype.name}>\n` + finalHtml;
        } else {
          finalHtml = `<!DOCTYPE html>\n` + finalHtml;
        }

        finalHtml = injectCaptureScriptIntoHtml(finalHtml);
        const hasTailwind = files.some(f => f.path.endsWith('.css') && stripTailwindDirectives(f.content).hasTailwind);
        if (hasTailwind) {
          finalHtml = injectTailwindScriptIntoHtml(finalHtml);
        }
        
        
        if (!active) return;
        setStatus(null);
        setPreviewHtml(finalHtml);
        setLastBuildError(null);
      } catch (err: any) {
        if (!active) return;
        const msg = err.message || 'Failed to generate preview';
        setError(msg);
        setLastBuildError(msg);
        setStatus(null);
      }
    }

    build();

    return () => {
      active = false;
      
    };
  }, [files, refreshKey]);

  // Handle auto-capture after preview loads when enabled
  const handleIframeLoad = () => {
    if (autoVisionOnPatch && iframeRef.current) {
      setTimeout(async () => {
        try {
          const screenshot = await captureIframeScreenshot(iframeRef.current, 2500);
          if (screenshot) {
            setLastPreviewScreenshot(screenshot);
          }
        } catch (e) {
          // ignore background capture errors
        }
      }, 350);
    }
  };

  const isPreviewable = Boolean(previewHtml && !error);

  return (
    <div className="flex-1 flex flex-col h-full bg-bg relative">
      <div className="h-10 shrink-0 flex items-center justify-between px-4 bg-surface border-b border-border">
        <div className="flex items-center gap-2 text-accent font-sans text-xs">
          <Play size={14} />
          <span>Preview</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCapture}
            disabled={!isPreviewable || isCapturing}
            className={`p-1.5 rounded transition-colors flex items-center gap-1.5 text-xs font-mono cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              justCaptured 
                ? 'bg-moss/20 text-moss border border-moss/30' 
                : 'text-accent bg-accent/10 border border-accent/20 hover:bg-accent/20'
            }`}
            title="Capture current preview for AI vision feedback"
          >
            {isCapturing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : justCaptured ? (
              <Check size={12} className="text-moss" />
            ) : (
              <Eye size={12} />
            )}
            <span>{justCaptured ? 'Vision Ready' : 'Let AI See'}</span>
          </button>
          <button 
            type="button"
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={!isPreviewable}
            className="p-1.5 text-muted hover:text-text hover:bg-surface rounded transition-colors flex items-center gap-1.5 text-xs font-mono disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border border-border"
            title="Refresh Preview"
          >
            <RefreshCw size={12} />
            <span>Reload</span>
          </button>
        </div>
      </div>
      
      <div className="flex-1 relative bg-white overflow-hidden">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center bg-bg canvas-grid-pattern">
            <div className="flex flex-col items-center gap-3 text-oxide font-sans text-sm border border-oxide/30 bg-surface/90 p-6 rounded-lg max-w-sm overflow-auto corner-ticks shadow-sm">
              <AlertCircle size={24} className="shrink-0 text-oxide" />
              <p className="whitespace-pre-wrap text-left break-all font-mono text-xs">{error}</p>
              {error.includes('No index.html found') && (
                <button
                  type="button"
                  onClick={() => {
                    setQueuedPrompt(SUGGESTION_PROMPTS.ADD_INDEX_HTML);
                    setActiveTab('chat');
                  }}
                  className="mt-2 w-full py-2.5 px-3 bg-accent text-accent-text-on font-mono font-bold text-xs rounded flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors cursor-pointer shadow-xs"
                >
                  <Sparkles size={14} />
                  <span>{SUGGESTION_PROMPTS.ADD_INDEX_HTML}</span>
                </button>
              )}
            </div>
          </div>
        ) : previewHtml ? (
          <iframe
            ref={iframeRef}
            key={refreshKey}
            srcDoc={previewHtml}
            onLoad={handleIframeLoad}
            className="w-full h-full border-0"
            title="Preview"
            sandbox="allow-scripts allow-modals allow-forms"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center bg-bg canvas-grid-pattern">
            <div className="flex items-center gap-3 text-muted font-mono text-xs bg-surface border border-border px-4 py-2 rounded-lg shadow-xs">
              <Loader2 size={16} className="animate-spin text-accent" />
              <span>{status || 'Building preview...'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
