// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SettingsPanel } from './SettingsPanel';

const mockSetTheme = vi.fn();
const mockSetThemeContrast = vi.fn();

// Mock dependencies
vi.mock('../store', () => ({
  useAppStore: () => ({
    keys: { aesKey: {} },
    setKeys: vi.fn(),
    setChatHistory: vi.fn(),
    lockVault: vi.fn(),
    pendingPatches: [],
    activeProfileId: null,
    setActiveProfileId: vi.fn(),
    mcpServers: [],
    setMcpServers: vi.fn(),
    customInstructions: '',
    setCustomInstructions: vi.fn(),
    tokenUsage: { max: 32000, chat: 0, codebase: 0, system: 0 },
    theme: 'oled',
    setTheme: mockSetTheme,
    themeContrast: 100,
    setThemeContrast: mockSetThemeContrast,
    ensembleModeEnabled: false,
    setEnsembleModeEnabled: vi.fn(),
    ensembleCandidateBProfileId: null,
    setEnsembleCandidateBProfileId: vi.fn(),
    sessionUsageRecords: [],
    clearSessionUsage: vi.fn(),
  })
}));

vi.mock('../db', () => ({
  db: {
    connectionProfiles: {
      toArray: vi.fn().mockResolvedValue([]),
      put: vi.fn().mockResolvedValue('1'),
      delete: vi.fn(),
      get: vi.fn()
    },
    projects: { toArray: vi.fn().mockResolvedValue([]) },
    files: { toArray: vi.fn().mockResolvedValue([]) },
    snapshots: { toArray: vi.fn().mockResolvedValue([]) },
  }
}));

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('prefills OpenRouter base URL when selected', () => {
    render(React.createElement(SettingsPanel));
    
    // Open the new profile form if not open
    const addBtn = screen.queryByText('Add Profile');
    if (addBtn) fireEvent.click(addBtn);

    // Open provider dropdown
    const providerBtn = screen.getByRole('button', { name: /Anthropic/i });
    fireEvent.click(providerBtn);

    // Select OpenRouter
    const openRouterOption = screen.getByText('OpenRouter');
    fireEvent.click(openRouterOption);

    // Verify Base URL input is prefilled
    const baseUrlInputs = screen.getAllByPlaceholderText('https://openrouter.ai/api/v1') as HTMLInputElement[];
    expect(baseUrlInputs.length).toBeGreaterThan(0);
    expect(baseUrlInputs[0].value).toBe('https://openrouter.ai/api/v1');
  });

  it('does not prefill base URL for openai-compatible', () => {
    render(React.createElement(SettingsPanel));
    
    // Open provider dropdown
    const providerBtn = screen.getByRole('button', { name: /Anthropic/i });
    fireEvent.click(providerBtn);

    // Select OpenAI Compatible
    const compatibleOption = screen.getByText('OpenAI Compatible (Local/Custom)');
    fireEvent.click(compatibleOption);

    // Verify Base URL input exists but is empty
    const baseUrlInputs = screen.getAllByPlaceholderText('https://openrouter.ai/api/v1') as HTMLInputElement[];
    expect(baseUrlInputs.length).toBeGreaterThan(0);
    expect(baseUrlInputs[0].value).toBe('');
  });

  describe('Theme Contrast Slider & Appearance', () => {
    it('renders the contrast slider with current contrast value and labels', () => {
      render(React.createElement(SettingsPanel));

      expect(screen.getByText('Theme Contrast')).toBeTruthy();
      expect(screen.getByText('100%')).toBeTruthy();
      expect(screen.getByText('(Standard)')).toBeTruthy();

      const slider = screen.getByLabelText('Theme contrast level') as HTMLInputElement;
      expect(slider).toBeTruthy();
      expect(slider.value).toBe('100');
      expect(slider.min).toBe('60');
      expect(slider.max).toBe('140');
    });

    it('triggers setThemeContrast when slider is moved', () => {
      render(React.createElement(SettingsPanel));

      const slider = screen.getByLabelText('Theme contrast level') as HTMLInputElement;
      fireEvent.change(slider, { target: { value: '125' } });

      expect(mockSetThemeContrast).toHaveBeenCalledWith(125);
    });

    it('triggers preset buttons when clicked', () => {
      render(React.createElement(SettingsPanel));

      const softBtn = screen.getByRole('button', { name: /Soft \(75%\)/i });
      fireEvent.click(softBtn);
      expect(mockSetThemeContrast).toHaveBeenCalledWith(75);

      const highBtn = screen.getByRole('button', { name: /High \(125%\)/i });
      fireEvent.click(highBtn);
      expect(mockSetThemeContrast).toHaveBeenCalledWith(125);
    });

    it('allows switching between OLED and Paper theme modes', () => {
      render(React.createElement(SettingsPanel));

      const paperBtn = screen.getByRole('button', { name: /Paper \/ Blueprint/i });
      fireEvent.click(paperBtn);

      expect(mockSetTheme).toHaveBeenCalledWith('paper');
    });
  });
});
