// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { Toaster } from './Toaster';
import { useAppStore } from '../store';

describe('Toaster Component', () => {
  beforeEach(() => {
    useAppStore.setState({ toasts: [] });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders nothing when toasts array is empty', () => {
    const { container } = render(<Toaster />);
    expect(container.firstChild).toBeNull();
  });

  it('renders opaque success notification with crisp shadow and message', () => {
    useAppStore.setState({
      toasts: [
        {
          id: 'toast-1',
          message: 'Successfully loaded 164 files into "My Project"',
          type: 'success'
        }
      ]
    });

    render(<Toaster />);

    const toastEl = screen.getByRole('status');
    expect(toastEl).toBeDefined();
    expect(screen.getByText('Successfully loaded 164 files into "My Project"')).toBeDefined();

    // Verify solid opaque background and drop shadow classes
    expect(toastEl.className).toContain('bg-surface-elevated');
    expect(toastEl.className).toContain('shadow-2xl');
    expect(toastEl.className).toContain('border-moss/60');
  });

  it('removes toast when dismiss button is clicked', () => {
    useAppStore.setState({
      toasts: [
        {
          id: 'toast-1',
          message: 'Project created',
          type: 'info'
        }
      ]
    });

    render(<Toaster />);

    const dismissBtn = screen.getByRole('button', { name: /Dismiss notification/i });
    fireEvent.click(dismissBtn);

    expect(useAppStore.getState().toasts).toHaveLength(0);
  });
});
