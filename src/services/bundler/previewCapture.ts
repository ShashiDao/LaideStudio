import type { PreviewScreenshot } from '../../store';

export const INJECTED_PREVIEW_CAPTURE_SCRIPT = `
(function installStorageShim(name) {
  try {
    var probe = window[name];
    var testKey = '__laide_probe__';
    probe.setItem(testKey, '1');
    probe.removeItem(testKey);
    return; // real storage works fine, leave it alone
  } catch (e) {
    var store = Object.create(null);
    var keys = [];
    var memoryStorage = {
      getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function(k, v) { if (!(k in store)) keys.push(k); store[k] = String(v); },
      removeItem: function(k) { delete store[k]; keys = keys.filter(function(x) { return x !== k; }); },
      clear: function() { store = Object.create(null); keys = []; },
      key: function(i) { return keys[i] || null; },
      get length() { return keys.length; }
    };
    try {
      Object.defineProperty(window, name, { value: memoryStorage, configurable: true, writable: false });
    } catch (e2) { /* give up silently, better than crashing */ }
  }
})('localStorage');
(function installStorageShim(name) {
  try {
    var probe = window[name];
    var testKey = '__laide_probe__';
    probe.setItem(testKey, '1');
    probe.removeItem(testKey);
    return; // real storage works fine, leave it alone
  } catch (e) {
    var store = Object.create(null);
    var keys = [];
    var memoryStorage = {
      getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function(k, v) { if (!(k in store)) keys.push(k); store[k] = String(v); },
      removeItem: function(k) { delete store[k]; keys = keys.filter(function(x) { return x !== k; }); },
      clear: function() { store = Object.create(null); keys = []; },
      key: function(i) { return keys[i] || null; },
      get length() { return keys.length; }
    };
    try {
      Object.defineProperty(window, name, { value: memoryStorage, configurable: true, writable: false });
    } catch (e2) { /* give up silently, better than crashing */ }
  }
})('sessionStorage');

function showPreviewErrorBanner(message, stack) {
  if (document.getElementById('xiom-error-banner')) return;
  var banner = document.createElement('div');
  banner.id = 'xiom-error-banner';
  banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#1e1e24;color:#f87171;font-family:monospace;font-size:12px;padding:12px;z-index:999999;border-top:1px solid #f87171;max-height:50vh;overflow-y:auto;';
  var msgEl = document.createElement('div');
  msgEl.style.fontWeight = 'bold';
  msgEl.textContent = 'Runtime Error: ' + message;
  banner.appendChild(msgEl);
  if (stack) {
    var details = document.createElement('details');
    details.style.marginTop = '8px';
    var summary = document.createElement('summary');
    summary.style.cursor = 'pointer';
    summary.style.color = '#9ca3af';
    summary.textContent = 'View Stack Trace';
    details.appendChild(summary);
    var pre = document.createElement('pre');
    pre.style.marginTop = '8px';
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.wordBreak = 'break-all';
    pre.style.color = '#d1d5db';
    pre.textContent = stack;
    details.appendChild(pre);
    banner.appendChild(details);
  }
  document.body ? document.body.appendChild(banner) : document.documentElement.appendChild(banner);
}

window.addEventListener('error', function(e) {
  showPreviewErrorBanner(e.message, e.error && e.error.stack);
  try {
    window.parent.postMessage({ type: 'LAIDE_PREVIEW_RUNTIME_ERROR', message: e.message, stack: e.error && e.error.stack }, '*');
    window.parent.postMessage({ type: 'LAIDE_PREVIEW_CONSOLE_LOG', logType: 'error', args: [e.message] }, '*');
  } catch (_) {}
});
window.addEventListener('unhandledrejection', function(e) {
  var msg = e.reason && e.reason.message ? e.reason.message : String(e.reason);
  showPreviewErrorBanner(msg, e.reason && e.reason.stack);
  try {
    window.parent.postMessage({ type: 'LAIDE_PREVIEW_RUNTIME_ERROR', message: msg, stack: e.reason && e.reason.stack }, '*');
    window.parent.postMessage({ type: 'LAIDE_PREVIEW_CONSOLE_LOG', logType: 'error', args: [msg] }, '*');
  } catch (_) {}
});

// Intercept console.log, console.warn, console.error, console.info for in-preview console
(function setupConsoleProxy() {
  ['log', 'warn', 'error', 'info', 'debug'].forEach(function(method) {
    var original = console[method];
    console[method] = function() {
      var args = Array.prototype.slice.call(arguments).map(function(arg) {
        if (arg === null) return 'null';
        if (arg === undefined) return 'undefined';
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      });
      try {
        window.parent.postMessage({
          type: 'LAIDE_PREVIEW_CONSOLE_LOG',
          logType: method,
          args: args,
          timestamp: Date.now()
        }, '*');
      } catch (_) {}
      if (typeof original === 'function') {
        original.apply(console, arguments);
      }
    };
  });
})();

// Tap to Inspect UI mode
(function setupInspectMode() {
  var inspectEnabled = false;
  var highlightOverlay = null;

  function createOverlay() {
    if (highlightOverlay) return highlightOverlay;
    highlightOverlay = document.createElement('div');
    highlightOverlay.id = '__laide_inspect_overlay__';
    highlightOverlay.style.cssText = 'position:fixed;pointer-events:none;z-index:9999999;border:2px solid #3b82f6;background:rgba(59,130,246,0.15);transition:all 0.05s ease;display:none;box-sizing:border-box;border-radius:4px;';
    var badge = document.createElement('div');
    badge.id = '__laide_inspect_badge__';
    badge.style.cssText = 'position:absolute;top:-22px;left:0;background:#3b82f6;color:#ffffff;font-size:10px;font-family:monospace;padding:2px 6px;border-radius:3px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.3);';
    highlightOverlay.appendChild(badge);
    document.documentElement.appendChild(highlightOverlay);
    return highlightOverlay;
  }

  function handlePointerMove(e) {
    if (!inspectEnabled) return;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === highlightOverlay || el.id === '__laide_inspect_overlay__' || el.id === '__laide_inspect_badge__') return;

    var rect = el.getBoundingClientRect();
    var overlay = createOverlay();
    overlay.style.display = 'block';
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    var tagName = el.tagName.toLowerCase();
    var idStr = el.id ? '#' + el.id : '';
    var classStr = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/)[0] : '';
    var dims = Math.round(rect.width) + 'x' + Math.round(rect.height);
    var badge = overlay.querySelector('#__laide_inspect_badge__');
    if (badge) {
      badge.textContent = '<' + tagName + idStr + classStr + '> ' + dims;
    }
  }

  function handleClick(e) {
    if (!inspectEnabled) return;
    e.preventDefault();
    e.stopPropagation();

    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el.id === '__laide_inspect_overlay__' || el.id === '__laide_inspect_badge__') return;

    var tagName = el.tagName.toLowerCase();
    var id = el.id || null;
    var className = typeof el.className === 'string' ? el.className : null;
    var textContent = (el.textContent || '').trim().slice(0, 100);
    var rect = el.getBoundingClientRect();

    try {
      window.parent.postMessage({
        type: 'LAIDE_PREVIEW_INSPECT_RESULT',
        element: {
          tagName: tagName,
          id: id,
          className: className,
          text: textContent,
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      }, '*');
    } catch (_) {}
  }

  window.addEventListener('message', function(e) {
    if (!e.data) return;
    if (e.data.type === 'LAIDE_TOGGLE_INSPECT_MODE' || e.data.type === 'XIOM_TOGGLE_INSPECT_MODE') {
      inspectEnabled = Boolean(e.data.enabled);
      if (!inspectEnabled && highlightOverlay) {
        highlightOverlay.style.display = 'none';
      }
    }
  });

  document.addEventListener('mousemove', handlePointerMove, true);
  document.addEventListener('touchstart', function(e) {
    if (inspectEnabled && e.touches.length > 0) {
      handlePointerMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
    }
  }, true);
  document.addEventListener('click', handleClick, true);
})();

(function() {
  if (window.__LAIDE_CAPTURE_INITIALIZED__ || (window as any).__XIOM_CAPTURE_INITIALIZED__) return;
  (window as any).__LAIDE_CAPTURE_INITIALIZED__ = true;

  window.addEventListener('message', async function(e) {
    if (!e.data || (e.data.type !== 'LAIDE_CAPTURE_SCREENSHOT_REQUEST' && e.data.type !== 'XIOM_CAPTURE_SCREENSHOT_REQUEST')) return;
    var reqId = e.data.id;
    try {
      var width = Math.max(document.documentElement.scrollWidth, window.innerWidth || 800);
      var height = Math.max(document.documentElement.scrollHeight, window.innerHeight || 600);

      var clone = document.documentElement.cloneNode(true);

      // Inline stylesheets to preserve all computed / Tailwind styles inside SVG
      var cssText = '';
      try {
        for (var i = 0; i < document.styleSheets.length; i++) {
          var sheet = document.styleSheets[i];
          try {
            var rules = sheet.cssRules || sheet.rules;
            if (rules) {
              for (var j = 0; j < rules.length; j++) {
                cssText += rules[j].cssText + '\\n';
              }
            }
          } catch (err) {}
        }
      } catch (err) {}

      if (cssText) {
        var styleEl = document.createElement('style');
        styleEl.textContent = cssText;
        var headEl = clone.querySelector('head');
        if (headEl) {
          headEl.appendChild(styleEl);
        } else {
          clone.appendChild(styleEl);
        }
      }

      var serialized = new XMLSerializer().serializeToString(clone);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
        '<foreignObject width="100%" height="100%">' +
        serialized +
        '</foreignObject></svg>';

      var blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var img = new Image();

      await new Promise(function(resolve, reject) {
        img.onload = resolve;
        img.onerror = function() { reject(new Error('Failed to load foreignObject SVG image')); };
        img.src = url;
      });
      URL.revokeObjectURL(url);

      // Downscale to max dimension 800px to balance visual fidelity with LLM token budget
      var maxDim = 800;
      var targetW = width;
      var targetH = height;
      if (targetW > maxDim || targetH > maxDim) {
        if (targetW >= targetH) {
          targetH = Math.round((targetH * maxDim) / targetW);
          targetW = maxDim;
        } else {
          targetW = Math.round((targetW * maxDim) / targetH);
          targetH = maxDim;
        }
      }
      targetW = Math.max(1, targetW);
      targetH = Math.max(1, targetH);

      var canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      var ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context not available');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);

      var dataUrl = canvas.toDataURL('image/png');
      var base64Data = dataUrl.split(',')[1] || '';

      window.parent.postMessage({
        type: 'LAIDE_CAPTURE_SCREENSHOT_RESPONSE',
        id: reqId,
        success: true,
        dataUrl: dataUrl,
        base64: base64Data,
        width: targetW,
        height: targetH
      }, '*');
    } catch (err) {
      window.parent.postMessage({
        type: 'LAIDE_CAPTURE_SCREENSHOT_RESPONSE',
        id: reqId,
        success: false,
        error: String(err && (err as any).message ? (err as any).message : err)
      }, '*');
    }
  });

  window.parent.postMessage({ type: 'LAIDE_PREVIEW_READY' }, '*');
})();
`;

export function injectCaptureScriptIntoHtml(html: string): string {
  const scriptTag = `<script id="laide-preview-capture-helper">${INJECTED_PREVIEW_CAPTURE_SCRIPT}</script>`;
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch) {
    return html.slice(0, headMatch.index! + headMatch[0].length) + scriptTag + html.slice(headMatch.index! + headMatch[0].length);
  }
  const htmlMatch = html.match(/<html[^>]*>/i);
  if (htmlMatch) {
    return html.slice(0, htmlMatch.index! + htmlMatch[0].length) + scriptTag + html.slice(htmlMatch.index! + htmlMatch[0].length);
  }
  const bodyMatch = html.match(/<body[^>]*>/i);
  if (bodyMatch) {
    return html.slice(0, bodyMatch.index! + bodyMatch[0].length) + scriptTag + html.slice(bodyMatch.index! + bodyMatch[0].length);
  }
  return scriptTag + html;
}

export async function captureIframeScreenshot(
  iframe: HTMLIFrameElement | null,
  timeoutMs: number = 3000
): Promise<PreviewScreenshot | null> {
  if (!iframe || !iframe.contentWindow) return null;
  const contentWindow = iframe.contentWindow;

  const reqId = 'req_' + Math.random().toString(36).slice(2) + Date.now();
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handleMsg);
        resolve(null);
      }
    }, timeoutMs);

    const handleMsg = (e: MessageEvent) => {
      if (e.data && (e.data.type === 'LAIDE_CAPTURE_SCREENSHOT_RESPONSE' || e.data.type === 'XIOM_CAPTURE_SCREENSHOT_RESPONSE') && e.data.id === reqId) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          window.removeEventListener('message', handleMsg);
          if (e.data.success && e.data.base64) {
            resolve({
              data: e.data.base64,
              mediaType: 'image/png',
              dataUrl: e.data.dataUrl,
              timestamp: Date.now(),
              width: e.data.width,
              height: e.data.height
            });
          } else {
            resolve(null);
          }
        }
      }
    };

    window.addEventListener('message', handleMsg);
    try {
      contentWindow.postMessage({ type: 'LAIDE_CAPTURE_SCREENSHOT_REQUEST', id: reqId }, '*');
    } catch {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        window.removeEventListener('message', handleMsg);
        resolve(null);
      }
    }
  });
}
