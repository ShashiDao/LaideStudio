// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ProjectSelector } from './ProjectSelector';
import type { Project } from '../../db';
import { db } from '../../db';

const mockProjects: Project[] = [
  {
    id: 'proj-1',
    name: 'Alpha Project',
    createdAt: 1000,
    updatedAt: 2000,
  },
  {
    id: 'proj-2',
    name: 'Beta Studio App',
    createdAt: 1100,
    updatedAt: 2100,
  },
  {
    id: 'proj-3',
    name: 'Gamma Tools',
    createdAt: 1200,
    updatedAt: 2200,
  },
];

describe('ProjectSelector', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    try {
      await db.files.clear();
      await db.files.bulkPut([
        { id: 'f1', projectId: 'proj-1', path: 'src/main.ts', content: 'console.log(1)', updatedAt: 100 },
        { id: 'f2', projectId: 'proj-1', path: 'src/App.tsx', content: 'export default () => {}', updatedAt: 100 },
        { id: 'f3', projectId: 'proj-2', path: 'index.html', content: '<html/>', updatedAt: 100 },
      ]);
    } catch {
      // test db setup
    }
  });

  it('renders custom amber trigger button with active project name and chevron', () => {
    render(
      <ProjectSelector
        projects={mockProjects}
        activeProject={mockProjects[0]}
        onSelectProjectId={vi.fn()}
      />
    );

    const triggerBtn = screen.getByRole('button', { name: /Select active workspace project/i });
    expect(triggerBtn).toBeDefined();
    expect(screen.getByText('Alpha Project')).toBeDefined();
    expect(triggerBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens custom dropdown popover when clicked and shows all projects with file count subtext', async () => {
    render(
      <ProjectSelector
        projects={mockProjects}
        activeProject={mockProjects[0]}
        activeFilesCount={2}
        onSelectProjectId={vi.fn()}
      />
    );

    const triggerBtn = screen.getByRole('button', { name: /Select active workspace project/i });
    fireEvent.click(triggerBtn);

    expect(triggerBtn.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Switch Project')).toBeDefined();
    expect(screen.getByText('(3)')).toBeDefined();

    // Verify all project names are present
    expect(screen.getAllByText('Alpha Project').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Beta Studio App')).toBeDefined();
    expect(screen.getByText('Gamma Tools')).toBeDefined();

    // Verify file count displays
    await waitFor(() => {
      expect(screen.getAllByText(/files/i).length).toBeGreaterThan(0);
    });
  });

  it('calls onSelectProjectId and closes popover when a project item is clicked', () => {
    const handleSelect = vi.fn();
    render(
      <ProjectSelector
        projects={mockProjects}
        activeProject={mockProjects[0]}
        onSelectProjectId={handleSelect}
      />
    );

    const triggerBtn = screen.getByRole('button', { name: /Select active workspace project/i });
    fireEvent.click(triggerBtn);

    const betaOption = screen.getByText('Beta Studio App');
    fireEvent.click(betaOption);

    expect(handleSelect).toHaveBeenCalledWith('proj-2');
    expect(screen.queryByText('Switch Project')).toBeNull();
  });

  it('closes dropdown when Escape key is pressed', () => {
    render(
      <ProjectSelector
        projects={mockProjects}
        activeProject={mockProjects[0]}
        onSelectProjectId={vi.fn()}
      />
    );

    const triggerBtn = screen.getByRole('button', { name: /Select active workspace project/i });
    fireEvent.click(triggerBtn);
    expect(screen.getByText('Switch Project')).toBeDefined();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Switch Project')).toBeNull();
  });

  it('supports keyboard navigation with ArrowDown, ArrowUp, and Enter', () => {
    const handleSelect = vi.fn();
    render(
      <ProjectSelector
        projects={mockProjects}
        activeProject={mockProjects[0]}
        onSelectProjectId={handleSelect}
      />
    );

    const triggerBtn = screen.getByRole('button', { name: /Select active workspace project/i });
    fireEvent.click(triggerBtn);

    // Initial focused is index 0 (Alpha). Press ArrowDown to move to index 1 (Beta)
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    // Press Enter to select
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(handleSelect).toHaveBeenCalledWith('proj-2');
    expect(screen.queryByText('Switch Project')).toBeNull();
  });

  it('invokes onCreateBlankProject when Create New Project button in dropdown is clicked', () => {
    const handleCreate = vi.fn();
    render(
      <ProjectSelector
        projects={mockProjects}
        activeProject={mockProjects[0]}
        onSelectProjectId={vi.fn()}
        onCreateBlankProject={handleCreate}
      />
    );

    const triggerBtn = screen.getByRole('button', { name: /Select active workspace project/i });
    fireEvent.click(triggerBtn);

    const createBtn = screen.getByRole('button', { name: /Create New Project/i });
    fireEvent.click(createBtn);

    expect(handleCreate).toHaveBeenCalled();
    expect(screen.queryByText('Switch Project')).toBeNull();
  });

  it('handles empty projects list gracefully', () => {
    render(
      <ProjectSelector
        projects={[]}
        activeProject={null}
        onSelectProjectId={vi.fn()}
      />
    );

    expect(screen.getByText('No Projects')).toBeDefined();
    const triggerBtn = screen.getByRole('button', { name: /Select active workspace project/i });
    fireEvent.click(triggerBtn);

    expect(screen.getByText('No projects available')).toBeDefined();
  });
});
