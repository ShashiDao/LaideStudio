import { describe, it, expect } from 'vitest';
import { injectCaptureScriptIntoHtml, INJECTED_PREVIEW_CAPTURE_SCRIPT } from './previewCapture';

describe('previewCapture', () => {
  it('injects capture script immediately after opening head tag', () => {
    const html = '<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hello</h1></body></html>';
    const result = injectCaptureScriptIntoHtml(html);
    expect(result).toContain('xiom-preview-capture-helper');
    expect(result).toContain(INJECTED_PREVIEW_CAPTURE_SCRIPT);
    expect(result.indexOf('xiom-preview-capture-helper')).toBeGreaterThan(result.indexOf('<head>'));
    expect(result.indexOf('xiom-preview-capture-helper')).toBeLessThan(result.indexOf('<title>'));
  });

  it('injects capture script immediately after opening html tag if no head tag', () => {
    const html = '<!DOCTYPE html><html><body><h1>Hello</h1></body></html>';
    const result = injectCaptureScriptIntoHtml(html);
    expect(result).toContain('xiom-preview-capture-helper');
    expect(result.indexOf('xiom-preview-capture-helper')).toBeGreaterThan(result.indexOf('<html>'));
    expect(result.indexOf('xiom-preview-capture-helper')).toBeLessThan(result.indexOf('<body>'));
  });

  it('prepends capture script if no structural tags exist', () => {
    const html = '<div>Fragment</div>';
    const result = injectCaptureScriptIntoHtml(html);
    expect(result).toContain('xiom-preview-capture-helper');
    expect(result.indexOf('xiom-preview-capture-helper')).toBeLessThan(result.indexOf('<div>Fragment</div>'));
  });
  
  it('includes the storage-shim and error-listener logic in the injected script', () => {
    expect(INJECTED_PREVIEW_CAPTURE_SCRIPT).toContain('installStorageShim');
    expect(INJECTED_PREVIEW_CAPTURE_SCRIPT).toContain('showPreviewErrorBanner');
    expect(INJECTED_PREVIEW_CAPTURE_SCRIPT).toContain('window.addEventListener(\'error\'');
    expect(INJECTED_PREVIEW_CAPTURE_SCRIPT).toContain('window.addEventListener(\'unhandledrejection\'');
  });

  it('injects helper script before other scripts in head', () => {
    const html = '<!DOCTYPE html><html><head><script src="other.js"></script></head><body></body></html>';
    const result = injectCaptureScriptIntoHtml(html);
    expect(result.indexOf('xiom-preview-capture-helper')).toBeLessThan(result.indexOf('other.js'));
  });
});
