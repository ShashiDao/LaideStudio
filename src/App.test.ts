// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
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
    it(`renders Files header cleanly with streamlined actions menu at ${width}px width`, async () => {
      // Set viewport width
      window.innerWidth = width;
      window.dispatchEvent(new Event('resize'));

      render(React.createElement(App));

      await waitFor(() => {
        expect(screen.getByText('Test Project Mobile')).toBeDefined();
      });

      // Verify project controls exist in the compact header
      expect(screen.getByLabelText('Select active workspace project')).toBeDefined();
      expect(screen.getByLabelText('Create new project')).toBeDefined();
      
      // Verify actions menu trigger is present
      const actionsMenuBtn = screen.getByLabelText('Workspace actions menu');
      expect(actionsMenuBtn).toBeDefined();

      // Open the actions menu
      fireEvent.click(actionsMenuBtn);

      // Verify action options are present inside the menu
      expect(screen.getByText('Import from GitHub')).toBeDefined();
      expect(screen.getByText('Push to GitHub')).toBeDefined();
      expect(screen.getByText('Upload ZIP or File')).toBeDefined();
      expect(screen.getByText('Export Project ZIP')).toBeDefined();
      expect(screen.getByText('Delete Project')).toBeDefined();
    });
  });

  it('opens Select Template modal when clicking the + new project button and creates template project', async () => {
    render(React.createElement(App));

    await waitFor(() => {
      expect(screen.getByText('Test Project Mobile')).toBeDefined();
    });

    const createBtn = screen.getByLabelText('Create new project');
    fireEvent.click(createBtn);

    // Modal should be open with template options
    expect(screen.getByText('Create New Project')).toBeDefined();
    expect(screen.getByText('React TypeScript')).toBeDefined();
    expect(screen.getByText('Tailwind CSS')).toBeDefined();
    expect(screen.getByText('Empty Project')).toBeDefined();

    // Select Tailwind CSS template
    const tailwindBtn = screen.getByText('Tailwind CSS').closest('button')!;
    fireEvent.click(tailwindBtn);

    // Click Create Project
    const submitBtn = screen.getByText('Create Project');
    fireEvent.click(submitBtn);

    await waitFor(async () => {
      const allProjects = await db.projects.toArray();
      expect(allProjects.length).toBe(2);
      expect(allProjects.some(p => p.name.includes('Tailwind'))).toBe(true);
    });
  });
});
