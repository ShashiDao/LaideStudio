// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { TopStrip } from './TopStrip';

const mockToggleTheme = vi.fn();
const mockLockVault = vi.fn();

vi.mock('../../store', () => ({
  useAppStore: () => ({
    pendingPatches: [],
    setKeys: vi.fn(),
    setChatHistory: vi.fn(),
    lockVault: mockLockVault,
    theme: 'oled',
    toggleTheme: mockToggleTheme,
  }),
}));

describe('TopStrip Component', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders clean branding with LAIDE Studio and no cluttered telemetry', () => {
    render(<TopStrip />);

    // Branding is rendered
    expect(screen.getByText('LAIDE')).toBeDefined();
    expect(screen.getByText('Studio')).toBeDefined();

    // Cluttered telemetry is removed from top bar
    expect(screen.queryByText(/DB:INIT/i)).toBeNull();
    expect(screen.queryByText(/DB:READY/i)).toBeNull();
    expect(screen.queryByText(/32k/i)).toBeNull();
  });

  it('provides quick theme toggle and lock actions', () => {
    render(<TopStrip />);

    const themeBtn = screen.getByLabelText(/Toggle theme/i);
    expect(themeBtn).toBeDefined();
    fireEvent.click(themeBtn);
    expect(mockToggleTheme).toHaveBeenCalledTimes(1);

    const lockBtn = screen.getByLabelText(/Lock Vault/i);
    expect(lockBtn).toBeDefined();
    fireEvent.click(lockBtn);
    expect(mockLockVault).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenShortcuts when keyboard shortcuts button is clicked', () => {
    const mockOnOpenShortcuts = vi.fn();
    render(<TopStrip onOpenShortcuts={mockOnOpenShortcuts} />);

    const shortcutsBtn = screen.getByLabelText('Keyboard shortcuts');
    expect(shortcutsBtn).toBeDefined();
    expect(shortcutsBtn.getAttribute('title')).toBe('Keyboard Shortcuts');

    fireEvent.click(shortcutsBtn);
    expect(mockOnOpenShortcuts).toHaveBeenCalledTimes(1);
  });
});
