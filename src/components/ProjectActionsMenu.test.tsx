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

  it('opens dropdown menu on button click and renders action items', () => {
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

    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Demo Project')).toBeDefined();
    expect(screen.getByText('Import from GitHub')).toBeDefined();
    expect(screen.getByText('Push to GitHub')).toBeDefined();
    expect(screen.getByText('Upload ZIP or File')).toBeDefined();
    expect(screen.getByText('Export Project ZIP')).toBeDefined();
    expect(screen.getByText('Delete Project')).toBeDefined();
  });

  it('invokes appropriate callback when an action item is clicked', () => {
    const onOpenGithubImport = vi.fn();
    const onOpenGithubPush = vi.fn();
    const onUploadClick = vi.fn();
    const onExportClick = vi.fn();
    const onDeleteClick = vi.fn();
    const onRenameClick = vi.fn();

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
      />
    );

    // Open menu
    fireEvent.click(screen.getByLabelText('Workspace actions menu'));

    // Click Rename
    fireEvent.click(screen.getByText('Rename Project'));
    expect(onRenameClick).toHaveBeenCalledTimes(1);

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
});
