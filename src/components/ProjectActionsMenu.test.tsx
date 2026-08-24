// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { ProjectActionsMenu } from './ProjectActionsMenu';
import type { Project } from '../db';

const mockProject: Project = {
  id: 'p-1',
  name: 'Demo Project',
  createdAt: 1000,
  updatedAt: 2000
};

describe('ProjectActionsMenu Component', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders nothing when project is null', () => {
    const { container } = render(
      <ProjectActionsMenu
        project={null}
        fileCount={0}
        onOpenGithubImport={() => {}}
        onOpenGithubPush={() => {}}
        onUploadClick={() => {}}
        onExportClick={() => {}}
        onDeleteClick={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders actions trigger button when project is provided', () => {
    render(
      <ProjectActionsMenu
        project={mockProject}
        fileCount={12}
        onOpenGithubImport={() => {}}
        onOpenGithubPush={() => {}}
        onUploadClick={() => {}}
        onExportClick={() => {}}
        onDeleteClick={() => {}}
      />
    );

    const btn = screen.getByLabelText('Workspace actions menu');
    expect(btn).toBeDefined();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens bottom sheet modal with backdrop and grouped sections on button click', () => {
    render(
      <ProjectActionsMenu
        project={mockProject}
        fileCount={12}
        onOpenGithubImport={() => {}}
        onOpenGithubPush={() => {}}
        onUploadClick={() => {}}
        onExportClick={() => {}}
        onDeleteClick={() => {}}
        onRenameClick={() => {}}
        onOpenAnalytics={() => {}}
        onOpenBisect={() => {}}
      />
    );

    const btn = screen.getByLabelText('Workspace actions menu');
    fireEvent.click(btn);

    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Demo Project')).toBeDefined();
    expect(screen.getByText('12 files')).toBeDefined();

    // Section headers
    expect(screen.getByText('Workspace')).toBeDefined();
    expect(screen.getByText('GitHub')).toBeDefined();
    expect(screen.getByText('Files')).toBeDefined();
    expect(screen.getByText('Danger Zone')).toBeDefined();

    // Action items across sections
    expect(screen.getByText('Rename Project')).toBeDefined();
    expect(screen.getByText('Project Analytics')).toBeDefined();
    expect(screen.getByText('Find What Broke This')).toBeDefined();
    expect(screen.getByText('Import from GitHub')).toBeDefined();
    expect(screen.getByText('Push to GitHub')).toBeDefined();
    expect(screen.getByText('Upload ZIP or File')).toBeDefined();
    expect(screen.getByText('Export Project ZIP')).toBeDefined();
    expect(screen.getByText('Delete Project')).toBeDefined();
  });

  it('invokes appropriate callbacks when action items are clicked and closes menu', () => {
    const onOpenGithubImport = vi.fn();
    const onOpenGithubPush = vi.fn();
    const onUploadClick = vi.fn();
    const onExportClick = vi.fn();
    const onDeleteClick = vi.fn();
    const onRenameClick = vi.fn();
    const onOpenAnalytics = vi.fn();
    const onOpenBisect = vi.fn();

    render(
      <ProjectActionsMenu
        project={mockProject}
        fileCount={12}
        onOpenGithubImport={onOpenGithubImport}
        onOpenGithubPush={onOpenGithubPush}
        onUploadClick={onUploadClick}
        onExportClick={onExportClick}
        onDeleteClick={onDeleteClick}
        onRenameClick={onRenameClick}
        onOpenAnalytics={onOpenAnalytics}
        onOpenBisect={onOpenBisect}
      />
    );

    // Open menu
    fireEvent.click(screen.getByLabelText('Workspace actions menu'));

    // Click Rename
    fireEvent.click(screen.getByText('Rename Project'));
    expect(onRenameClick).toHaveBeenCalledTimes(1);

    // Re-open and click Analytics
    fireEvent.click(screen.getByLabelText('Workspace actions menu'));
    fireEvent.click(screen.getByText('Project Analytics'));
    expect(onOpenAnalytics).toHaveBeenCalledTimes(1);

    // Re-open and click Bisect
    fireEvent.click(screen.getByLabelText('Workspace actions menu'));
    fireEvent.click(screen.getByText('Find What Broke This'));
    expect(onOpenBisect).toHaveBeenCalledTimes(1);

    // Re-open and click Import
    fireEvent.click(screen.getByLabelText('Workspace actions menu'));
    fireEvent.click(screen.getByText('Import from GitHub'));
    expect(onOpenGithubImport).toHaveBeenCalledTimes(1);

    // Re-open and click Push
    fireEvent.click(screen.getByLabelText('Workspace actions menu'));
    fireEvent.click(screen.getByText('Push to GitHub'));
    expect(onOpenGithubPush).toHaveBeenCalledTimes(1);

    // Re-open and click Upload
    fireEvent.click(screen.getByLabelText('Workspace actions menu'));
    fireEvent.click(screen.getByText('Upload ZIP or File'));
    expect(onUploadClick).toHaveBeenCalledTimes(1);

    // Re-open and click Export
    fireEvent.click(screen.getByLabelText('Workspace actions menu'));
    fireEvent.click(screen.getByText('Export Project ZIP'));
    expect(onExportClick).toHaveBeenCalledTimes(1);

    // Re-open and click Delete
    fireEvent.click(screen.getByLabelText('Workspace actions menu'));
    fireEvent.click(screen.getByText('Delete Project'));
    expect(onDeleteClick).toHaveBeenCalledTimes(1);
  });

  it('triggers onExportMarkdownClick and onCopyMarkdownClick when provided', () => {
    const onExportMarkdownClick = vi.fn();
    const onCopyMarkdownClick = vi.fn();

    render(
      <ProjectActionsMenu
        project={mockProject}
        fileCount={5}
        onOpenGithubImport={() => {}}
        onOpenGithubPush={() => {}}
        onUploadClick={() => {}}
        onExportClick={() => {}}
        onExportMarkdownClick={onExportMarkdownClick}
        onCopyMarkdownClick={onCopyMarkdownClick}
        onDeleteClick={() => {}}
      />
    );

    // Open menu
    fireEvent.click(screen.getByLabelText('Workspace actions menu'));

    // Check visibility
    expect(screen.getByText('Export Markdown (.md)')).toBeDefined();
    expect(screen.getByText('Copy as Markdown')).toBeDefined();

    // Click Export Markdown
    fireEvent.click(screen.getByText('Export Markdown (.md)'));
    expect(onExportMarkdownClick).toHaveBeenCalledTimes(1);

    // Re-open and click Copy Markdown
    fireEvent.click(screen.getByLabelText('Workspace actions menu'));
    fireEvent.click(screen.getByText('Copy as Markdown'));
    expect(onCopyMarkdownClick).toHaveBeenCalledTimes(1);
  });

  it('triggers onNewProjectClick when New Project item is clicked', () => {
    const onNewProjectClick = vi.fn();
    render(
      <ProjectActionsMenu
        project={mockProject}
        fileCount={12}
        onOpenGithubImport={() => {}}
        onOpenGithubPush={() => {}}
        onUploadClick={() => {}}
        onExportClick={() => {}}
        onDeleteClick={() => {}}
        onNewProjectClick={onNewProjectClick}
      />
    );

    fireEvent.click(screen.getByLabelText('Workspace actions menu'));
    expect(screen.getByText('New Project...')).toBeDefined();

    fireEvent.click(screen.getByText('New Project...'));
    expect(onNewProjectClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes when clicking the backdrop', () => {
    render(
      <ProjectActionsMenu
        project={mockProject}
        fileCount={12}
        onOpenGithubImport={() => {}}
        onOpenGithubPush={() => {}}
        onUploadClick={() => {}}
        onExportClick={() => {}}
        onDeleteClick={() => {}}
      />
    );

    const btn = screen.getByLabelText('Workspace actions menu');
    fireEvent.click(btn);

    const dialogBackdrop = screen.getByRole('dialog');
    expect(dialogBackdrop).toBeDefined();

    fireEvent.click(dialogBackdrop);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes when pressing Escape key', () => {
    render(
      <ProjectActionsMenu
        project={mockProject}
        fileCount={12}
        onOpenGithubImport={() => {}}
        onOpenGithubPush={() => {}}
        onUploadClick={() => {}}
        onExportClick={() => {}}
        onDeleteClick={() => {}}
      />
    );

    const btn = screen.getByLabelText('Workspace actions menu');
    fireEvent.click(btn);
    expect(screen.getByRole('dialog')).toBeDefined();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes when clicking the close (X) button', () => {
    render(
      <ProjectActionsMenu
        project={mockProject}
        fileCount={12}
        onOpenGithubImport={() => {}}
        onOpenGithubPush={() => {}}
        onUploadClick={() => {}}
        onExportClick={() => {}}
        onDeleteClick={() => {}}
      />
    );

    const btn = screen.getByLabelText('Workspace actions menu');
    fireEvent.click(btn);
    expect(screen.getByRole('dialog')).toBeDefined();

    fireEvent.click(screen.getByLabelText('Close actions dialog'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
