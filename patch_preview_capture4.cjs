const fs = require('fs');
let content = fs.readFileSync('src/services/bundler/previewCapture.ts', 'utf-8');

const shimAndErrorHandler = `(function installStorageShim(name) {
  try {
    var probe = window[name];
    var testKey = '__xiom_probe__';
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
    var testKey = '__xiom_probe__';
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
    window.parent.postMessage({ type: 'XIOM_PREVIEW_RUNTIME_ERROR', message: e.message, stack: e.error && e.error.stack }, '*');
  } catch (_) {}
});
window.addEventListener('unhandledrejection', function(e) {
  var msg = e.reason && e.reason.message ? e.reason.message : String(e.reason);
  showPreviewErrorBanner(msg, e.reason && e.reason.stack);
  try {
    window.parent.postMessage({ type: 'XIOM_PREVIEW_RUNTIME_ERROR', message: msg, stack: e.reason && e.reason.stack }, '*');
  } catch (_) {}
});
`;

content = content.replace(
  "export const INJECTED_PREVIEW_CAPTURE_SCRIPT = `\n(function() {\n  if (window.__XIOM_CAPTURE_INITIALIZED__) return;",
  "export const INJECTED_PREVIEW_CAPTURE_SCRIPT = `\n" + shimAndErrorHandler + "\n(function() {\n  if (window.__XIOM_CAPTURE_INITIALIZED__) return;"
);
fs.writeFileSync('src/services/bundler/previewCapture.ts', content);
