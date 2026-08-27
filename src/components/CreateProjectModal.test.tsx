// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { CreateProjectModal } from './CreateProjectModal';

describe('CreateProjectModal Component', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <CreateProjectModal
        isOpen={false}
        onClose={() => {}}
        onCreateProject={async () => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders template options with responsive bottom-sheet framing and drag handle', () => {
    const { container } = render(
      <CreateProjectModal
        isOpen={true}
        onClose={() => {}}
        onCreateProject={async () => {}}
        existingProjectCount={2}
      />
    );

    expect(screen.getByText('Create New Project')).toBeDefined();
    expect(screen.getByText('React TypeScript')).toBeDefined();
    expect(screen.getByText('Tailwind CSS')).toBeDefined();
    expect(screen.getByText('Empty Project')).toBeDefined();
    expect(screen.getByText('Vanilla HTML / JS')).toBeDefined();

    // Verify dialog container responsive bottom-sheet classes
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeDefined();
    const modalBox = dialog?.firstElementChild as HTMLElement;
    expect(modalBox.className).toContain('fixed inset-x-0 bottom-0');
    expect(modalBox.className).toContain('rounded-t-2xl');
    expect(modalBox.className).toContain('sm:inset-auto');
    expect(modalBox.className).toContain('sm:max-w-lg');
    expect(modalBox.className).toContain('sm:rounded-2xl');

    // Verify mobile drag handle indicator
    const dragHandle = modalBox.querySelector('.bg-border.rounded-full');
    expect(dragHandle).toBeDefined();

    // Default prefilled project name
    const input = screen.getByLabelText('Project Name') as HTMLInputElement;
    expect(input.value).toBe('React TS App 3');
  });

  it('switches active template, triggers haptic feedback, and updates default name', () => {
    const vibrateSpy = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateSpy,
      writable: true,
      configurable: true,
    });

    render(
      <CreateProjectModal
        isOpen={true}
        onClose={() => {}}
        onCreateProject={async () => {}}
        existingProjectCount={0}
      />
    );

    const input = screen.getByLabelText('Project Name') as HTMLInputElement;
    expect(input.value).toBe('React TS App');

    // Click Tailwind CSS template
    const tailwindBtn = screen.getByText('Tailwind CSS').closest('button')!;
    fireEvent.click(tailwindBtn);
    expect(input.value).toBe('Tailwind App');
    expect(vibrateSpy).toHaveBeenCalledWith(10);

    // Click Empty Project template
    const emptyBtn = screen.getByText('Empty Project').closest('button')!;
    fireEvent.click(emptyBtn);
    expect(input.value).toBe('Empty Workspace');
  });

  it('toggles skeleton file preview list when requested', () => {
    render(
      <CreateProjectModal
        isOpen={true}
        onClose={() => {}}
        onCreateProject={async () => {}}
      />
    );

    const toggleBtn = screen.getByText(/View files included in/);
    expect(toggleBtn).toBeDefined();

    fireEvent.click(toggleBtn);
    expect(screen.getByText(/Skeleton Structure/)).toBeDefined();
    expect(screen.getByText('/src/App.tsx')).toBeDefined();
    expect(screen.getByText('/package.json')).toBeDefined();

    // Toggle back to hide
    const hideBtn = screen.getByText(/Hide skeleton files/);
    fireEvent.click(hideBtn);
    expect(screen.queryByText('/src/App.tsx')).toBeNull();
  });

  it('validates project name and calls onCreateProject on submit', async () => {
    const onCreateProject = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <CreateProjectModal
        isOpen={true}
        onClose={onClose}
        onCreateProject={onCreateProject}
      />
    );

    const input = screen.getByLabelText('Project Name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'My Production App' } });

    const submitBtn = screen.getByText('Create Project');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onCreateProject).toHaveBeenCalledWith('My Production App', 'react-ts');
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows error message if submitted with empty name', async () => {
    const onCreateProject = vi.fn();
    render(
      <CreateProjectModal
        isOpen={true}
        onClose={() => {}}
        onCreateProject={onCreateProject}
      />
    );

    const input = screen.getByLabelText('Project Name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });

    const form = input.closest('form')!;
    fireEvent.submit(form);

    expect(screen.getByText('Project Name cannot be empty', { exact: false })).toBeDefined();
    expect(onCreateProject).not.toHaveBeenCalled();
  });

  it('closes when pressing Escape or clicking Cancel button', () => {
    const onClose = vi.fn();
    render(
      <CreateProjectModal
        isOpen={true}
        onClose={onClose}
        onCreateProject={async () => {}}
      />
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
