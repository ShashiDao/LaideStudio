// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { TerminalDrawer } from './TerminalDrawer';
import type { FileItem } from '../../db';

describe('TerminalDrawer Component', () => {
  const mockFiles: FileItem[] = [];

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders collapsed state with toggle button and header', () => {
    const mockToggle = vi.fn();
    const mockClose = vi.fn();

    render(
      <TerminalDrawer
        isOpen={false}
        onToggle={mockToggle}
        onClose={mockClose}
        files={mockFiles}
      />
    );

    expect(screen.getByText('TERMINAL')).toBeDefined();
    expect(screen.getByText(/Click to expand/i)).toBeDefined();
    expect(screen.getByTitle('Open terminal')).toBeDefined();
  });

  it('invokes onToggle when header strip is clicked', () => {
    const mockToggle = vi.fn();
    const mockClose = vi.fn();

    render(
      <TerminalDrawer
        isOpen={false}
        onToggle={mockToggle}
        onClose={mockClose}
        files={mockFiles}
      />
    );

    const titleStrip = screen.getByText('TERMINAL');
    fireEvent.click(titleStrip);
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it('renders expanded terminal panel when isOpen is true', () => {
    const mockToggle = vi.fn();
    const mockClose = vi.fn();

    render(
      <TerminalDrawer
        isOpen={true}
        onToggle={mockToggle}
        onClose={mockClose}
        files={mockFiles}
      />
    );

    expect(screen.getByText(/Click to collapse/i)).toBeDefined();
    expect(screen.getByTitle('Collapse terminal')).toBeDefined();
    expect(screen.getByTitle('Close terminal drawer')).toBeDefined();
    expect(screen.getByRole('region', { name: 'Sandbox Terminal' })).toBeDefined();
  });

  it('invokes onClose when close button is clicked', () => {
    const mockToggle = vi.fn();
    const mockClose = vi.fn();

    render(
      <TerminalDrawer
        isOpen={true}
        onToggle={mockToggle}
        onClose={mockClose}
        files={mockFiles}
      />
    );

    const closeBtn = screen.getByTitle('Close terminal drawer');
    fireEvent.click(closeBtn);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
