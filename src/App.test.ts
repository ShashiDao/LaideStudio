// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import App from './App';
import { db } from './db';
import { useAppStore } from './store';
import { deriveKeys } from './services/crypto';
import { createFile } from './services/fs/vfs';

describe('App Files-tab Header Layout on narrow widths', () => {
  const originalFetch = globalThis.fetch;
  const projectId = 'test-proj-app';
  let keys: any;

  beforeEach(async () => {
    vi.restoreAllMocks();
    cleanup();
    await db.projects.clear();
    await db.files.clear();
    await db.snapshots.clear();
    localStorage.clear();
    sessionStorage.clear();

    await db.projects.add({
      id: projectId,
      name: 'Test Project Mobile',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const salt = crypto.getRandomValues(new Uint8Array(16));
    keys = await deriveKeys('test-master-passphrase', salt);
    useAppStore.getState().setKeys(keys);
    useAppStore.getState().setActiveProjectId(projectId);
    useAppStore.getState().setActiveTab('files');

    await createFile(projectId, '/src/index.ts', 'console.log("hello");');
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  const widths = [360, 390, 412, 480];

  widths.forEach(width => {
    it(`renders Files header cleanly with wrapping support at ${width}px width`, async () => {
      // Set viewport width
      window.innerWidth = width;
      window.dispatchEvent(new Event('resize'));

      render(React.createElement(App));

      await waitFor(() => {
        expect(screen.getByText('Test Project Mobile')).toBeDefined();
      });

      // Verify all project controls and action buttons exist
      expect(screen.getByLabelText('Select active workspace project')).toBeDefined();
      expect(screen.getByLabelText('Create new project')).toBeDefined();
      expect(screen.getByLabelText('Delete project Test Project Mobile')).toBeDefined();
      expect(screen.getByLabelText('Import from GitHub')).toBeDefined();
      expect(screen.getByLabelText('Push to GitHub')).toBeDefined();
      expect(screen.getByLabelText('Upload file or .zip')).toBeDefined();
      expect(screen.getByLabelText('Download project')).toBeDefined();

      // Check header container has flex-wrap to prevent visual crowding / overlapping on narrow viewports
      const headerRow = screen.getByLabelText('Select active workspace project').closest('.flex-wrap');
      expect(headerRow).not.toBeNull();
      expect(headerRow?.className).toContain('flex-wrap');
      expect(headerRow?.className).toContain('justify-between');
    });
  });
});
