import React, { useState, useEffect, useRef } from 'react';
import { 
  RefreshCw, 
  Play, 
  AlertCircle, 
  Loader2, 
  Sparkles, 
  Eye, 
  Check, 
  Rocket, 
  Smartphone, 
  Tablet, 
  Monitor, 
  Terminal, 
  Crosshair, 
  QrCode, 
  ChevronDown, 
  ChevronUp, 
  Trash2,
  X
} from 'lucide-react';
import type { FileItem } from '../db';
import type { ShellBreakpoint } from '../hooks/useShellBreakpoint';
import { useAppStore } from '../store';
import { SUGGESTION_PROMPTS } from '../services/agent/prompts';
import { detectBundledProject } from '../services/bundler/entryDetection';
import { injectCaptureScriptIntoHtml, captureIframeScreenshot } from '../services/bundler/previewCapture';
import { stripTailwindDirectives } from '../services/bundler/esbuild.worker';
import { EmptyState } from './EmptyState';
import { QRCodeModal } from './QRCodeModal';

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

export interface PreviewConsoleEntry {
  id: string;
  type: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: string[];
  timestamp: number;
}

export interface InspectedElementInfo {
  tagName: string;
  id: string | null;
  className: string | null;
  text: string;
  width: number;
  height: number;
}

interface PreviewPanelProps {
  files: FileItem[];
  breakpoint?: ShellBreakpoint;
  onOpenDeploy?: () => void;
}

function resolvePath(base: string, relative: string): string {
  if (relative.startsWith('/')) return relative;
  if (relative.startsWith('./')) relative = relative.slice(2);
  const parts = base.split('/');
  parts.pop();
  const dir = parts.join('/');
  return (dir ? dir + '/' : '/') + relative;
}

export function PreviewPanel({ files, breakpoint, onOpenDeploy }: PreviewPanelProps) {
  const { 
    setLastBuildError, 
    setActiveTab, 
    setQueuedPrompt,
    setLastPreviewScreenshot,
    setAttachPreviewVision,
    autoVisionOnPatch
  } = useAppStore();
  const [viewportMode, setViewportMode] = useState<'desktop' | 'tablet' | 'phone'>('desktop');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<{ message: string; stack?: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [justCaptured, setJustCaptured] = useState(false);
  
  // Mobile-native inspection, console and QR state
  const [showConsoleDrawer, setShowConsoleDrawer] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<PreviewConsoleEntry[]>([]);
  const [isInspectMode, setIsInspectMode] = useState(false);
  const [inspectedElement, setInspectedElement] = useState<InspectedElementInfo | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Clear logs or notify iframe when refresh happens
  useEffect(() => {
    const timer = setTimeout(() => {
      setConsoleLogs([]);
      setInspectedElement(null);
      setIsInspectMode(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshKey, files]);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!e.data) return;
      if (e.data.type === 'XIOM_PREVIEW_RUNTIME_ERROR') {
        setRuntimeError({ message: e.data.message, stack: e.data.stack });
      } else if (e.data.type === 'XIOM_PREVIEW_CONSOLE_LOG') {
        setConsoleLogs(prev => [
          ...prev.slice(-99),
          {
            id: 'log_' + Math.random().toString(36).slice(2) + Date.now(),
            type: e.data.logType || 'log',
            args: e.data.args || [],
            timestamp: e.data.timestamp || Date.now()
          }
        ]);
      } else if (e.data.type === 'XIOM_PREVIEW_INSPECT_RESULT') {
        setInspectedElement(e.data.element);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const toggleInspectMode = () => {
    const nextState = !isInspectMode;
    setIsInspectMode(nextState);
    if (!nextState) {
      setInspectedElement(null);
    }
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage({
          type: 'XIOM_TOGGLE_INSPECT_MODE',
          enabled: nextState
        }, '*');
      } catch {
        // ignore
      }
    }
  };

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

    async function build() {
      if (!active) return;
      setError(null);
      setRuntimeError(null);
      setStatus('Building preview...');

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
          const tailwindVersion = detectProjectTailwindVersion(files);
          if (tailwindVersion) {
            finalHtml = injectTailwindScriptIntoHtml(finalHtml, tailwindVersion);
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
              const { stripped, hasTailwind, version } = stripTailwindDirectives(targetFile.content);
              const styleEl = doc.createElement('style');
              if (hasTailwind && version === 'v4') {
                styleEl.setAttribute('type', 'text/tailwindcss');
              }
              styleEl.textContent = stripped;
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
              const inlineScript = doc.createElement('script');
              if (script.getAttribute('type') === 'module') {
                inlineScript.setAttribute('type', 'module');
              }
              const sanitizedContent = targetFile.content.replace(/<\/script>/gi, '<\\/script>');
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
        const tailwindVersion = detectProjectTailwindVersion(files);
        if (tailwindVersion) {
          finalHtml = injectTailwindScriptIntoHtml(finalHtml, tailwindVersion);
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
  }, [files, refreshKey, setLastBuildError]);

  // Handle auto-capture after preview loads when enabled
  const handleIframeLoad = () => {
    if (isInspectMode && iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage({
          type: 'XIOM_TOGGLE_INSPECT_MODE',
          enabled: true
        }, '*');
      } catch {}
    }

    if (autoVisionOnPatch && iframeRef.current) {
      setTimeout(async () => {
        try {
          const screenshot = await captureIframeScreenshot(iframeRef.current, 2500);
          if (screenshot) {
            setLastPreviewScreenshot(screenshot);
          }
        } catch (_e) {
          // ignore background capture errors
        }
      }, 350);
    }
  };

  const isPreviewable = Boolean(previewHtml && !error);
  const isPhoneScreen = breakpoint === 'phone';

  const errorCount = consoleLogs.filter(l => l.type === 'error').length;
  const warnCount = consoleLogs.filter(l => l.type === 'warn').length;

  return (
    <div className="flex-1 flex flex-col h-full bg-bg relative">
      <div className="h-10 shrink-0 flex justify-between items-center gap-2 px-3 w-full overflow-x-auto sb-hidden bg-surface border-b border-border">
        <div className="flex items-center gap-1.5 sm:gap-2 text-accent font-sans text-xs shrink-0 select-none">
          <Play size={14} />
          <span className="font-medium">Preview</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onOpenDeploy && (
            <button
              type="button"
              onClick={onOpenDeploy}
              className="p-1.5 px-2 rounded transition-colors flex items-center gap-1.5 text-xs font-mono cursor-pointer text-accent bg-accent/10 border border-accent/30 hover:bg-accent/20 active:scale-95 shadow-xs shrink-0"
              title="Publish Live Web Application (Netlify / Vercel)"
              aria-label="Publish Live Web Application"
            >
              <Rocket size={12} className="text-accent" />
              <span className="font-bold hidden sm:inline">Publish</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCapture}
            disabled={!isPreviewable || isCapturing}
            className={`p-1.5 px-2 rounded transition-colors flex items-center gap-1.5 text-xs font-mono cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
              justCaptured 
                ? 'bg-moss/20 text-moss border border-moss/30' 
                : 'text-accent bg-accent/10 border border-accent/20 hover:bg-accent/20'
            }`}
            title="Capture current preview for AI vision feedback"
            aria-label="Capture current preview for AI vision feedback"
          >
            {isCapturing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : justCaptured ? (
              <Check size={12} className="text-moss" />
            ) : (
              <Eye size={12} />
            )}
            <span className="hidden sm:inline">{justCaptured ? 'Vision Ready' : 'AI View'}</span>
          </button>
          
          {/* Mobile-Native Tools when breakpoint === 'phone' */}
          {isPhoneScreen ? (
            <div 
              className="flex items-center rounded bg-surface-elevated border border-border p-0.5 shrink-0 gap-0.5" 
              role="group" 
              aria-label="Mobile preview tools"
            >
              {/* In-preview Console Toggle */}
              <button
                type="button"
                onClick={() => setShowConsoleDrawer(prev => !prev)}
                className={`p-1 px-1.5 sm:px-2 rounded text-[11px] font-mono flex items-center gap-1 transition-colors cursor-pointer ${
                  showConsoleDrawer
                    ? 'bg-accent/20 border border-accent/30 text-accent font-semibold shadow-xs'
                    : 'text-muted hover:text-text border border-transparent'
                }`}
                title="Toggle in-preview console logs"
                aria-label="Toggle preview console"
                aria-pressed={showConsoleDrawer}
              >
                <Terminal size={12} />
                <span className="font-mono text-[10px]">
                  Logs
                  {consoleLogs.length > 0 && ` (${consoleLogs.length})`}
                </span>
                {errorCount > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-oxide animate-pulse" />
                )}
              </button>

              {/* Tap to Inspect UI mode */}
              <button
                type="button"
                onClick={toggleInspectMode}
                className={`p-1 px-1.5 sm:px-2 rounded text-[11px] font-mono flex items-center gap-1 transition-colors cursor-pointer ${
                  isInspectMode
                    ? 'bg-accent text-accent-text-on font-semibold shadow-xs'
                    : 'text-muted hover:text-text border border-transparent'
                }`}
                title="Tap-to-inspect UI mode"
                aria-label="Tap to inspect"
                aria-pressed={isInspectMode}
              >
                <Crosshair size={12} />
                <span className="font-mono text-[10px]">Inspect</span>
              </button>

              {/* Scan QR Code button */}
              <button
                type="button"
                onClick={() => setShowQRModal(true)}
                className="p-1 px-1.5 sm:px-2 rounded text-[11px] font-mono flex items-center gap-1 text-muted hover:text-text border border-transparent hover:bg-surface transition-colors cursor-pointer"
                title="Scan QR to open preview on another device"
                aria-label="Scan QR Code"
              >
                <QrCode size={12} />
                <span className="font-mono text-[10px]">QR</span>
              </button>
            </div>
          ) : (
            /* Viewport size segmented control for Tablet & Desktop breakpoints */
            <div 
              className="flex items-center rounded bg-surface-elevated border border-border p-0.5 shrink-0" 
              role="group" 
              aria-label="Viewport size"
            >
              <button
                type="button"
                onClick={() => setViewportMode('phone')}
                className={`p-1 px-1.5 sm:px-2 rounded text-[11px] font-mono flex items-center gap-1 transition-colors cursor-pointer ${
                  viewportMode === 'phone'
                    ? 'bg-accent/15 border border-accent/30 text-accent font-semibold shadow-xs'
                    : 'text-muted hover:text-text border border-transparent'
                }`}
                title="Phone view (~420px)"
                aria-label="Phone viewport"
                aria-pressed={viewportMode === 'phone'}
              >
                <Smartphone size={12} />
                <span className="hidden sm:inline">Phone</span>
              </button>
              <button
                type="button"
                onClick={() => setViewportMode('tablet')}
                className={`p-1 px-1.5 sm:px-2 rounded text-[11px] font-mono flex items-center gap-1 transition-colors cursor-pointer ${
                  viewportMode === 'tablet'
                    ? 'bg-accent/15 border border-accent/30 text-accent font-semibold shadow-xs'
                    : 'text-muted hover:text-text border border-transparent'
                }`}
                title="Tablet view (~768px)"
                aria-label="Tablet viewport"
                aria-pressed={viewportMode === 'tablet'}
              >
                <Tablet size={12} />
                <span className="hidden sm:inline">Tablet</span>
              </button>
              <button
                type="button"
                onClick={() => setViewportMode('desktop')}
                className={`p-1 px-1.5 sm:px-2 rounded text-[11px] font-mono flex items-center gap-1 transition-colors cursor-pointer ${
                  viewportMode === 'desktop'
                    ? 'bg-accent/15 border border-accent/30 text-accent font-semibold shadow-xs'
                    : 'text-muted hover:text-text border border-transparent'
                }`}
                title="Desktop view (100%)"
                aria-label="Desktop viewport"
                aria-pressed={viewportMode === 'desktop'}
              >
                <Monitor size={12} />
                <span className="hidden sm:inline">Desktop</span>
              </button>
            </div>
          )}

          <button 
            type="button"
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={!isPreviewable}
            className="p-1.5 px-2 text-muted hover:text-text hover:bg-surface-elevated rounded transition-colors flex items-center gap-1.5 text-xs font-mono disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border border-border shrink-0"
            title="Refresh Preview"
            aria-label="Refresh Preview"
          >
            <RefreshCw size={12} />
            <span className="hidden sm:inline">Reload</span>
          </button>
        </div>
      </div>
      
      {/* Inspected Element Banner (when Inspect mode is active and user tapped an element) */}
      {isPhoneScreen && isInspectMode && inspectedElement && (
        <div className="px-3 py-1.5 bg-accent/15 border-b border-accent/30 flex items-center justify-between gap-2 text-xs font-mono shrink-0 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
            <span className="font-bold text-accent">
              &lt;{inspectedElement.tagName}
              {inspectedElement.id ? `#${inspectedElement.id}` : ''}
              {inspectedElement.className ? `.${inspectedElement.className.trim().split(/\s+/)[0]}` : ''}
              &gt;
            </span>
            <span className="text-[10px] text-muted shrink-0">
              {inspectedElement.width}×{inspectedElement.height}px
            </span>
            {inspectedElement.text && (
              <span className="text-[10px] text-text/80 truncate italic">
                "{inspectedElement.text}"
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setInspectedElement(null)}
            className="p-0.5 text-muted hover:text-text rounded cursor-pointer"
            aria-label="Dismiss inspected element"
          >
            <X size={13} />
          </button>
        </div>
      )}

      <div className={`flex-1 relative overflow-hidden ${isPhoneScreen || viewportMode === 'desktop' ? 'bg-white' : 'bg-bg/60 canvas-grid-pattern'}`}>
        {error || runtimeError ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center bg-bg canvas-grid-pattern">
            {error && error.includes('No index.html found') ? (
              <EmptyState
                icon={<AlertCircle size={20} className="text-oxide" />}
                badge="Entry Point Missing"
                title="No index.html found"
                description="The workspace preview requires an entry HTML file with a root element and script entry."
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setQueuedPrompt(SUGGESTION_PROMPTS.ADD_INDEX_HTML);
                      setActiveTab('chat');
                    }}
                    className="w-full py-2.5 px-3 bg-accent text-accent-text-on font-mono font-bold text-xs rounded flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors cursor-pointer shadow-xs"
                  >
                    <Sparkles size={14} />
                    <span>{SUGGESTION_PROMPTS.ADD_INDEX_HTML}</span>
                  </button>
                }
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-oxide font-sans text-sm border border-oxide/30 bg-surface/90 p-6 rounded-lg max-w-sm overflow-auto corner-ticks shadow-sm">
                <AlertCircle size={24} className="shrink-0 text-oxide" />
                {error ? (
                  <p className="whitespace-pre-wrap text-left break-all font-mono text-xs">{error}</p>
                ) : (
                  <div className="text-left w-full">
                    <p className="font-bold text-xs font-mono text-oxide mb-2">Runtime Error:</p>
                    <p className="whitespace-pre-wrap break-all font-mono text-xs mb-2">{runtimeError?.message}</p>
                    {runtimeError?.stack && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-muted text-xs hover:text-oxide transition-colors">View Stack Trace</summary>
                        <pre className="mt-2 whitespace-pre-wrap break-all text-[10px] text-muted/80">{runtimeError.stack}</pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : previewHtml ? (
          <div className="w-full h-full flex items-center justify-center overflow-hidden">
            <div 
              data-testid="preview-viewport-container"
              className={`h-full mx-auto transition-all duration-200 ease-in-out flex flex-col ${
                isPhoneScreen
                  ? 'w-full shadow-none bg-white'
                  : viewportMode === 'phone'
                  ? 'w-[420px] max-w-full border-x border-border shadow-xl bg-white'
                  : viewportMode === 'tablet'
                  ? 'w-[768px] max-w-full border-x border-border shadow-xl bg-white'
                  : 'w-full shadow-none bg-white'
              }`}
            >
              <iframe
                ref={iframeRef}
                key={refreshKey}
                srcDoc={previewHtml}
                onLoad={handleIframeLoad}
                className="w-full h-full border-0"
                title="Preview"
                sandbox="allow-scripts allow-modals allow-forms"
              />
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center bg-bg canvas-grid-pattern">
            <div className="flex items-center gap-3 text-muted font-mono text-xs bg-surface border border-border px-4 py-2 rounded-lg shadow-xs">
              <Loader2 size={16} className="animate-spin text-accent" />
              <span>{status || 'Building preview...'}</span>
            </div>
          </div>
        )}

        {/* In-preview Console Drawer (Mobile) */}
        {isPhoneScreen && showConsoleDrawer && (
          <div 
            className="absolute inset-x-0 bottom-0 max-h-[50%] min-h-[140px] bg-surface/95 backdrop-blur-md border-t border-border flex flex-col shadow-2xl z-30 animate-in slide-in-from-bottom-2 duration-150"
            role="region"
            aria-label="Preview Console Logs"
          >
            {/* Console Header */}
            <div className="h-8 px-3 bg-surface-elevated border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-xs font-mono">
                <Terminal size={12} className="text-accent" />
                <span className="font-semibold text-text">Preview Console</span>
                <span className="text-[10px] text-muted">
                  {consoleLogs.length} events
                </span>
                {errorCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded bg-oxide/15 text-oxide text-[9px] font-bold">
                    {errorCount} err
                  </span>
                )}
                {warnCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-500 text-[9px] font-bold">
                    {warnCount} warn
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setConsoleLogs([])}
                  className="p-1 text-muted hover:text-text rounded hover:bg-surface transition-colors cursor-pointer"
                  title="Clear Console"
                  aria-label="Clear Console"
                >
                  <Trash2 size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowConsoleDrawer(false)}
                  className="p-1 text-muted hover:text-text rounded hover:bg-surface transition-colors cursor-pointer"
                  title="Close Console"
                  aria-label="Close Console"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
            </div>

            {/* Console Body */}
            <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] space-y-1 divide-y divide-border/30">
              {consoleLogs.length === 0 ? (
                <div className="text-muted/70 italic text-center py-6 text-xs">
                  No console logs recorded yet.
                </div>
              ) : (
                consoleLogs.map((log) => (
                  <div 
                    key={log.id} 
                    className={`pt-1 flex items-start gap-2 ${
                      log.type === 'error' 
                        ? 'text-oxide bg-oxide/5' 
                        : log.type === 'warn' 
                        ? 'text-amber-500 bg-amber-500/5' 
                        : log.type === 'info' 
                        ? 'text-accent' 
                        : 'text-text'
                    }`}
                  >
                    <span className="text-[9px] uppercase px-1 rounded bg-surface-elevated text-muted border border-border/50 shrink-0 font-bold">
                      {log.type}
                    </span>
                    <div className="flex-1 whitespace-pre-wrap break-all leading-snug">
                      {log.args.join(' ')}
                    </div>
                    <span className="text-[9px] text-muted shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* QR Code Modal for Mobile testing */}
      <QRCodeModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
      />
    </div>
  );
}

