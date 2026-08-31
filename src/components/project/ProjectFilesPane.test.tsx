// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { ProjectFilesPane } from './ProjectFilesPane';
import type { Project, FileItem } from '../../db';

vi.mock('../../store', () => ({
  useAppStore: {
    getState: () => ({
      addToast: vi.fn(),
    }),
  },
}));

vi.mock('../shared/FileTree', () => ({
  FileTree: () => <div data-testid="file-tree">File Tree</div>,
}));

describe('ProjectFilesPane Component', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const mockProject: Project = {
    id: 'proj-1',
    name: 'Test Project',
    createdAt: 1000,
    updatedAt: 1000,
  };

  const defaultProps = {
    projects: [mockProject],
    activeProject: mockProject,
    files: [{ id: 'f1', projectId: 'proj-1', path: 'src/App.tsx', content: '', updatedAt: 1000 }] as FileItem[],
    breakpoint: 'desktop' as const,
    onSelectProjectId: vi.fn(),
    onCreateBlankProject: vi.fn(),
    onRefreshFiles: vi.fn(),
    onOpenProjectSearch: vi.fn(),
    onOpenDeploy: vi.fn(),
    onOpenGithubImport: vi.fn(),
    onOpenGithubPush: vi.fn(),
    onOpenBisect: vi.fn(),
    onOpenTrustReport: vi.fn(),
    onOpenCreateProjectModal: vi.fn(),
    onOpenRenameModal: vi.fn(),
    onArchiveProject: vi.fn(),
    onPromptDeleteProject: vi.fn(),
    onFileUpload: vi.fn(),
    onIncomingFiles: vi.fn(),
    activeProjectMetadata: { totalLines: 150, dominantLanguage: 'TypeScript' },
    showProjectStats: false,
    setShowProjectStats: vi.fn(),
  };

  it('renders project header controls and file tree', () => {
    render(<ProjectFilesPane {...defaultProps} />);

    expect(screen.getByLabelText('Create new project')).toBeDefined();
    expect(screen.getByLabelText('Archive Project')).toBeDefined();
    expect(screen.getByTestId('file-tree')).toBeDefined();
  });

  it('calls onCreateBlankProject and onArchiveProject when clicked', () => {
    render(<ProjectFilesPane {...defaultProps} />);

    const createBtn = screen.getByLabelText('Create new project');
    fireEvent.click(createBtn);
    expect(defaultProps.onCreateBlankProject).toHaveBeenCalledTimes(1);

    const archiveBtn = screen.getByLabelText('Archive Project');
    fireEvent.click(archiveBtn);
    expect(defaultProps.onArchiveProject).toHaveBeenCalledWith(mockProject);
  });

  it('ensures Create New Project and Archive buttons meet the 44x44px minimum hit area requirement', () => {
    render(<ProjectFilesPane {...defaultProps} />);

    const createBtn = screen.getByLabelText('Create new project');
    const archiveBtn = screen.getByLabelText('Archive Project');

    expect(createBtn.className).toContain('min-w-[44px]');
    expect(createBtn.className).toContain('min-h-[44px]');

    expect(archiveBtn.className).toContain('min-w-[44px]');
    expect(archiveBtn.className).toContain('min-h-[44px]');
  });
});
