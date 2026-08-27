// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { ActivityRail } from './ActivityRail';

describe('ActivityRail Component', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders all workspace tabs (files, chat, preview, terminal, settings)', () => {
    const mockOnSelectTab = vi.fn();
    render(<ActivityRail activeTab="files" onSelectTab={mockOnSelectTab} />);

    expect(screen.getByLabelText(/Files/i)).toBeDefined();
    expect(screen.getByLabelText(/Chat/i)).toBeDefined();
    expect(screen.getByLabelText(/Preview/i)).toBeDefined();
    expect(screen.getByLabelText(/Terminal/i)).toBeDefined();
    expect(screen.getByLabelText(/Settings/i)).toBeDefined();
  });

  it('highlights the active tab with aria-selected="true"', () => {
    const mockOnSelectTab = vi.fn();
    const { rerender } = render(<ActivityRail activeTab="chat" onSelectTab={mockOnSelectTab} />);

    const chatButton = screen.getByLabelText(/Chat/i);
    expect(chatButton.getAttribute('aria-selected')).toBe('true');

    const filesButton = screen.getByLabelText(/Files/i);
    expect(filesButton.getAttribute('aria-selected')).toBe('false');

    rerender(<ActivityRail activeTab="terminal" onSelectTab={mockOnSelectTab} />);
    const terminalButton = screen.getByLabelText(/Terminal/i);
    expect(terminalButton.getAttribute('aria-selected')).toBe('true');
  });

  it('invokes onSelectTab when clicking a tab button', () => {
    const mockOnSelectTab = vi.fn();
    render(<ActivityRail activeTab="files" onSelectTab={mockOnSelectTab} />);

    const previewButton = screen.getByLabelText(/Preview/i);
    previewButton.click();
    expect(mockOnSelectTab).toHaveBeenCalledWith('preview');
  });
});
