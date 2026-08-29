// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SettingsPanel } from './SettingsPanel';

const mockSetTheme = vi.fn();
const mockSetThemeContrast = vi.fn();

// Mock dependencies
vi.mock('../../store', () => ({
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

vi.mock('../../db', () => ({
  db: {
    connectionProfiles: {
      toArray: vi.fn().mockResolvedValue([]),
      put: vi.fn().mockResolvedValue('1'),
      delete: vi.fn(),
      get: vi.fn()
    },
    projects: { toArray: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    files: { toArray: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
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

  describe('Navigation & Category Routing', () => {
    it('renders all 5 category items in wide rail layout by default', () => {
      render(React.createElement(SettingsPanel));

      const rail = screen.getByTestId('settings-category-rail');
      expect(rail).toBeTruthy();

      expect(screen.getByRole('button', { name: /Appearance/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /AI & Providers/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Integrations/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Security & Vault/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Advanced/i })).toBeTruthy();
    });

    it('switches between categories when clicking rail items', () => {
      render(React.createElement(SettingsPanel));

      // Default is Appearance
      expect(screen.getByText('Display Contrast')).toBeTruthy();

      // Click AI & Providers
      const aiBtn = screen.getByRole('button', { name: /AI & Providers/i });
      fireEvent.click(aiBtn);
      expect(screen.getByText('Connection Profiles')).toBeTruthy();
      expect(screen.getByText('Dual-LLM Ensemble Mode')).toBeTruthy();
      expect(screen.getByText('Custom Instructions')).toBeTruthy();

      // Click Integrations
      const intBtn = screen.getByRole('button', { name: /Integrations/i });
      fireEvent.click(intBtn);
      expect(screen.getByText('GitHub Integration')).toBeTruthy();
      expect(screen.getByText('1-Click Live Deploy Tokens')).toBeTruthy();
      expect(screen.getByText('Model Context Protocol (MCP) Servers')).toBeTruthy();

      // Click Security & Vault
      const secBtn = screen.getByRole('button', { name: /Security & Vault/i });
      fireEvent.click(secBtn);
      expect(screen.getByText('Encrypted Vault Backup')).toBeTruthy();
      expect(screen.getAllByText('Lock Vault').length).toBeGreaterThanOrEqual(1);

      // Click Advanced
      const advBtn = screen.getByRole('button', { name: /Advanced/i });
      fireEvent.click(advBtn);
      expect(screen.getByText('System Diagnostics & Context')).toBeTruthy();
      expect(screen.getByText('Dependency Cache')).toBeTruthy();
      expect(screen.getByText('Keyboard Shortcuts')).toBeTruthy();
    });

    it('supports single-column drill-down and back navigation on narrow widths (<700px)', () => {
      const origGetBoundingClientRect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = vi.fn().mockReturnValue({ width: 500, height: 800, top: 0, left: 0, bottom: 800, right: 500 });
      
      try {
        render(React.createElement(SettingsPanel));
        
        // In narrow mode, category list is rendered
        const categoryList = screen.getByTestId('settings-category-list');
        expect(categoryList).toBeTruthy();

        // Tap on Security & Vault category card
        const secCard = screen.getByRole('button', { name: /Security & Vault/i });
        fireEvent.click(secCard);

        // Detail view should now be rendered
        expect(screen.getByTestId('settings-category-detail')).toBeTruthy();
        expect(screen.getByText('Encrypted Vault Backup')).toBeTruthy();

        // Back button should be visible in header
        const backBtn = screen.getByRole('button', { name: /Back to Settings categories/i });
        expect(backBtn).toBeTruthy();
        fireEvent.click(backBtn);

        // Should return to category list
        expect(screen.getByTestId('settings-category-list')).toBeTruthy();
      } finally {
        Element.prototype.getBoundingClientRect = origGetBoundingClientRect;
      }
    });
  });

  describe('AI & Providers Category', () => {
    it('prefills OpenRouter base URL when selected in Connection Profiles', () => {
      render(React.createElement(SettingsPanel));
      
      // Navigate to AI & Providers
      const aiBtn = screen.getByRole('button', { name: /AI & Providers/i });
      fireEvent.click(aiBtn);

      // Select OpenRouter card directly from grid
      const openRouterOption = screen.getByText('400+ Models').closest('button')!;
      fireEvent.click(openRouterOption);

      // Verify Base URL input is prefilled
      const baseUrlInputs = screen.getAllByPlaceholderText('https://openrouter.ai/api/v1') as HTMLInputElement[];
      expect(baseUrlInputs.length).toBeGreaterThan(0);
      expect(baseUrlInputs[0].value).toBe('https://openrouter.ai/api/v1');
    });

    it('does not prefill base URL for openai-compatible', () => {
      render(React.createElement(SettingsPanel));
      
      // Navigate to AI & Providers
      const aiBtn = screen.getByRole('button', { name: /AI & Providers/i });
      fireEvent.click(aiBtn);

      // Select OpenAI Compatible / Ollama card directly from grid
      const compatibleOption = screen.getByText('Ollama / Local').closest('button')!;
      fireEvent.click(compatibleOption);

      // Verify Base URL input exists but is empty
      const baseUrlInputs = screen.getAllByPlaceholderText('https://openrouter.ai/api/v1') as HTMLInputElement[];
      expect(baseUrlInputs.length).toBeGreaterThan(0);
      expect(baseUrlInputs[0].value).toBe('');
    });
  });

  describe('Theme Contrast Slider & Appearance', () => {
    it('renders the contrast slider with current contrast value and labels', () => {
      render(React.createElement(SettingsPanel));

      expect(screen.getByText('Display Contrast')).toBeTruthy();
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

      const softBtn = screen.getByRole('button', { name: /^Soft$/i });
      fireEvent.click(softBtn);
      expect(mockSetThemeContrast).toHaveBeenCalledWith(75);

      const highBtn = screen.getByRole('button', { name: /^High$/i });
      fireEvent.click(highBtn);
      expect(mockSetThemeContrast).toHaveBeenCalledWith(125);
    });

    it('allows switching between OLED and Paper theme modes', () => {
      render(React.createElement(SettingsPanel));

      const paperBtn = screen.getByRole('button', { name: /Paper \/ Blueprint/i });
      fireEvent.click(paperBtn);

      expect(mockSetTheme).toHaveBeenCalledWith('paper');
    });

    it('renders the live theme palette swatch row with clean padding', () => {
      render(React.createElement(SettingsPanel));

      expect(screen.getByText('Palette')).toBeTruthy();
      expect(screen.getByTitle(/^Background:/i)).toBeTruthy();
      expect(screen.getByTitle(/^Surface:/i)).toBeTruthy();
      expect(screen.getByTitle(/^Border:/i)).toBeTruthy();
      expect(screen.getByTitle(/^Ink:/i)).toBeTruthy();
      expect(screen.getByTitle(/^Accent:/i)).toBeTruthy();
    });
  });

  describe('Keyboard Shortcuts Collapsible Dropdown (in Advanced category)', () => {
    it('is collapsed by default and expands when clicked', () => {
      render(React.createElement(SettingsPanel));

      // Navigate to Advanced category
      const advBtn = screen.getByRole('button', { name: /Advanced/i });
      fireEvent.click(advBtn);

      // Shortcuts list items should not be visible by default
      expect(screen.queryByText('Toggle Files tab')).toBeNull();
      expect(screen.queryByText('Toggle Terminal')).toBeNull();

      // Click on the Keyboard Shortcuts accordion toggle
      const shortcutsToggle = screen.getByRole('button', { name: /Keyboard Shortcuts/i });
      fireEvent.click(shortcutsToggle);

      // Now shortcuts should be visible in the dropdown
      expect(screen.getByText('Toggle Files tab')).toBeTruthy();
      expect(screen.getByText('Toggle Terminal')).toBeTruthy();
      expect(screen.getByText('Quick Open & Search')).toBeTruthy();
      expect(screen.getByText('Find in File')).toBeTruthy();
      expect(screen.getByText('Open Preview')).toBeTruthy();
      expect(screen.getAllByText('Lock Vault').length).toBeGreaterThanOrEqual(1);

      // Clicking again collapses it
      fireEvent.click(shortcutsToggle);
      expect(screen.queryByText('Toggle Files tab')).toBeNull();
    });
  });
});
