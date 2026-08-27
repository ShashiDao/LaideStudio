// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { RenameProjectModal } from './RenameProjectModal';
import type { Project } from '../db';

const mockProject: Project = {
  id: 'proj-12345678',
  name: 'Original Project Name',
  createdAt: 1000,
  updatedAt: 1000
};

describe('RenameProjectModal Component', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <RenameProjectModal
        project={mockProject}
        isOpen={false}
        onClose={() => {}}
        onRename={async () => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal dialog with input populated with current name when open', () => {
    render(
      <RenameProjectModal
        project={mockProject}
        isOpen={true}
        onClose={() => {}}
        onRename={async () => {}}
      />
    );

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Rename Workspace')).toBeDefined();
    const input = screen.getByLabelText('Workspace Name') as HTMLInputElement;
    expect(input.value).toBe('Original Project Name');
  });

  it('submits valid new name and calls onRename and onClose', async () => {
    const onRename = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <RenameProjectModal
        project={mockProject}
        isOpen={true}
        onClose={onClose}
        onRename={onRename}
      />
    );

    const input = screen.getByLabelText('Workspace Name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Refactored WebApp' } });

    const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onRename).toHaveBeenCalledWith('proj-12345678', 'Refactored WebApp');
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows error validation when trying to submit empty name', async () => {
    const onRename = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <RenameProjectModal
        project={mockProject}
        isOpen={true}
        onClose={onClose}
        onRename={onRename}
      />
    );

    const input = screen.getByLabelText('Workspace Name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });

    const form = input.closest('form');
    if (form) fireEvent.submit(form);

    expect(screen.getByText(/cannot be empty/i)).toBeDefined();
    expect(onRename).not.toHaveBeenCalled();
  });

  it('calls onClose when Cancel or close button is clicked', () => {
    const onClose = vi.fn();

    render(
      <RenameProjectModal
        project={mockProject}
        isOpen={true}
        onClose={onClose}
        onRename={async () => {}}
      />
    );

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    const closeBtn = screen.getByLabelText('Close modal');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
