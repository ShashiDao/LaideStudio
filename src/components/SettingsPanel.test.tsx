// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SettingsPanel } from './SettingsPanel';

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
    const providerBtn = screen.getByRole('button', { name: /Anthropic/i }); // Default is usually Anthropic
    fireEvent.click(providerBtn);

    // Select OpenAI Compatible
    const compatibleOption = screen.getByText('OpenAI Compatible (Local/Custom)');
    fireEvent.click(compatibleOption);

    // Verify Base URL input exists but is empty
    const baseUrlInputs = screen.getAllByPlaceholderText('https://openrouter.ai/api/v1') as HTMLInputElement[];
    expect(baseUrlInputs.length).toBeGreaterThan(0);
    expect(baseUrlInputs[0].value).toBe('');
  });
});
