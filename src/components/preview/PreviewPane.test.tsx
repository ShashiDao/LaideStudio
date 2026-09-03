// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  detectSandpackTemplate,
  normalizeSandpackFiles,
  extractDependenciesFromPackageJson,
  PreviewPane
} from './PreviewPane';
import type { FileItem } from '../../db';

describe('PreviewPane unit tests', () => {
  describe('detectSandpackTemplate', () => {
    it('detects react-ts when tsx files are present', () => {
      const files: FileItem[] = [
        { id: '1', projectId: 'p1', path: '/src/App.tsx', content: 'export default () => <h1>Hello</h1>;', updatedAt: 1 },
        { id: '2', projectId: 'p1', path: '/src/main.ts', content: 'console.log("start");', updatedAt: 1 }
      ];
      expect(detectSandpackTemplate(files)).toBe('react-ts');
    });

    it('detects react when jsx files are present without typescript', () => {
      const files: FileItem[] = [
        { id: '1', projectId: 'p1', path: '/src/App.jsx', content: 'export default () => <h1>Hello</h1>;', updatedAt: 1 },
        { id: '2', projectId: 'p1', path: '/src/index.js', content: 'import App from "./App";', updatedAt: 1 }
      ];
      expect(detectSandpackTemplate(files)).toBe('react');
    });

    it('detects react when package.json includes react dependency', () => {
      const files: FileItem[] = [
        {
          id: '1',
          projectId: 'p1',
          path: '/package.json',
          content: JSON.stringify({ dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' } }),
          updatedAt: 1
        },
        { id: '2', projectId: 'p1', path: '/src/index.js', content: 'console.log("entry");', updatedAt: 1 }
      ];
      expect(detectSandpackTemplate(files)).toBe('react');
    });

    it('detects vanilla when package.json is present without react', () => {
      const files: FileItem[] = [
        {
          id: '1',
          projectId: 'p1',
          path: '/package.json',
          content: JSON.stringify({ dependencies: { lodash: '^4.17.21' } }),
          updatedAt: 1
        },
        { id: '2', projectId: 'p1', path: '/index.js', content: 'console.log("vanilla");', updatedAt: 1 }
      ];
      expect(detectSandpackTemplate(files)).toBe('vanilla');
    });

    it('detects static for pure HTML and CSS files', () => {
      const files: FileItem[] = [
        { id: '1', projectId: 'p1', path: '/index.html', content: '<h1>Simple</h1>', updatedAt: 1 },
        { id: '2', projectId: 'p1', path: '/style.css', content: 'body { color: red; }', updatedAt: 1 }
      ];
      expect(detectSandpackTemplate(files)).toBe('static');
    });
  });

  describe('normalizeSandpackFiles', () => {
    it('prepends leading slash if missing and preserves existing leading slashes', () => {
      const files: FileItem[] = [
        { id: '1', projectId: 'p1', path: 'src/App.tsx', content: 'code 1', updatedAt: 1 },
        { id: '2', projectId: 'p1', path: '/package.json', content: 'code 2', updatedAt: 1 },
        { id: '3', projectId: 'p1', path: 'style.css', content: 'code 3', updatedAt: 1 }
      ];

      const normalized = normalizeSandpackFiles(files);
      expect(normalized['/src/App.tsx']).toEqual({ code: 'code 1' });
      expect(normalized['/package.json']).toEqual({ code: 'code 2' });
      expect(normalized['/style.css']).toEqual({ code: 'code 3' });
    });
  });

  describe('extractDependenciesFromPackageJson', () => {
    it('extracts combined dependencies and devDependencies', () => {
      const files: FileItem[] = [
        {
          id: '1',
          projectId: 'p1',
          path: '/package.json',
          content: JSON.stringify({
            dependencies: { zod: '^3.0.0' },
            devDependencies: { typescript: '^5.0.0' }
          }),
          updatedAt: 1
        }
      ];

      const deps = extractDependenciesFromPackageJson(files);
      expect(deps).toEqual({
        zod: '^3.0.0',
        typescript: '^5.0.0'
      });
    });

    it('returns empty object when package.json is missing or invalid', () => {
      expect(extractDependenciesFromPackageJson([])).toEqual({});
      expect(extractDependenciesFromPackageJson([
        { id: '1', projectId: 'p1', path: '/package.json', content: 'not valid json', updatedAt: 1 }
      ])).toEqual({});
    });
  });

  describe('PreviewPane component rendering', () => {
    it('renders the Sandpack preview container', () => {
      const files: FileItem[] = [
        { id: '1', projectId: 'p1', path: '/index.html', content: '<h1>Hello</h1>', updatedAt: 1 }
      ];

      render(<PreviewPane files={files} />);
      const container = screen.getByTestId('sandpack-preview-pane');
      expect(container).toBeDefined();
    });
  });
});
