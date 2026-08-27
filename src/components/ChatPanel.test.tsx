// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ChatPanel } from './ChatPanel';

const mockSetActiveTab = vi.fn();
const mockSetChatHistory = vi.fn();
const mockSetTokenUsage = vi.fn();
const mockSetQueuedPrompt = vi.fn();
const mockSetAttachPreviewVision = vi.fn();
const mockSetPendingPatches = vi.fn();
const mockSetIsPatchReviewOpen = vi.fn();

let mockStoreState: any = {};

vi.mock('../store', () => ({
  useAppStore: Object.assign(
    (selector?: any) => (selector ? selector(mockStoreState) : mockStoreState),
    {
      getState: () => mockStoreState
    }
  )
}));

vi.mock('../db', () => ({
  db: {
    connectionProfiles: {
      toArray: vi.fn().mockResolvedValue([
        { id: 'prof-1', label: 'Claude 3.5 Sonnet', model: 'claude-3-5-sonnet', provider: 'anthropic' },
        { id: 'prof-2', label: 'GPT-4o', model: 'gpt-4o', provider: 'openai' }
      ]),
      get: vi.fn().mockImplementation((id: string) => {
        if (id === 'prof-1') {
          return Promise.resolve({ id: 'prof-1', label: 'Claude 3.5 Sonnet', model: 'claude-3-5-sonnet', provider: 'anthropic' });
        }
        return Promise.resolve(null);
      })
    }
  }
}));

vi.mock('../services/fs/vfs', () => ({
  listFiles: vi.fn().mockResolvedValue([])
}));

vi.mock('gpt-tokenizer', () => ({
  encode: vi.fn().mockReturnValue([])
}));

describe('ChatPanel Controls & Collapsed Summary Chip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState = {
      chatHistory: [],
      setChatHistory: mockSetChatHistory,
      activeProfileId: null,
      setActiveTab: mockSetActiveTab,
      keys: { aesKey: 'mock-key' },
      tokenUsage: { system: 0, codebase: 0, chat: 0, max: 32000, isEstimate: false },
      setTokenUsage: mockSetTokenUsage,
      sessionUsageRecords: [],
      pendingPatches: [],
      isPatchReviewOpen: false,
      setIsPatchReviewOpen: mockSetIsPatchReviewOpen,
      lastBuildError: null,
      queuedPrompt: null,
      setQueuedPrompt: mockSetQueuedPrompt,
      customInstructions: '',
      temperature: 0.2,
      maxOutputTokens: 4096,
      maxAgentSteps: 10,
      manifestExcludePatterns: [],
      lastPreviewScreenshot: null,
      attachPreviewVision: false,
      setAttachPreviewVision: mockSetAttachPreviewVision,
      ensembleModeEnabled: false,
      ensembleCandidateBProfileId: null,
      setPendingPatches: mockSetPendingPatches
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('renders prominent uncollapsed warning banner when no profile is selected', () => {
    mockStoreState.activeProfileId = null;

    render(React.createElement(ChatPanel, { projectId: 'proj-1' }));

    const warningBtn = screen.getByRole('button', { name: /No profile selected/i });
    expect(warningBtn).toBeDefined();
    expect(warningBtn.textContent).toContain('No profile selected — Tap to configure');

    fireEvent.click(warningBtn);
    expect(mockSetActiveTab).toHaveBeenCalledWith('settings');

    // Detail popup should not be present
    expect(screen.queryByRole('region', { name: 'Session control details' })).toBeNull();
  });

  it('renders collapsed summary chip when profile is selected with model, vision, and cost', async () => {
    mockStoreState.activeProfileId = 'prof-1';
    mockStoreState.attachPreviewVision = false;
    mockStoreState.sessionUsageRecords = [
      {
        id: 'rec-1',
        projectId: 'proj-1',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        timestamp: Date.now(),
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        estimatedCostUsd: 0.045
      }
    ];

    render(React.createElement(ChatPanel, { projectId: 'proj-1' }));

    // Wait for profile get promise resolution
    await waitFor(() => {
      const summaryChip = screen.getByRole('button', { name: 'Model and session details' });
      expect(summaryChip.textContent).toContain('Claude 3.5 Sonnet');
      expect(summaryChip.textContent).toContain('Vision off');
      expect(summaryChip.textContent).toContain('$0.045');
    });

    // Detail panel should be collapsed initially
    expect(screen.queryByRole('region', { name: 'Session control details' })).toBeNull();
  });

  it('shows ensemble dot and label in summary chip when ensemble mode is enabled', async () => {
    mockStoreState.activeProfileId = 'prof-1';
    mockStoreState.ensembleModeEnabled = true;

    render(React.createElement(ChatPanel, { projectId: 'proj-1' }));

    await waitFor(() => {
      const summaryChip = screen.getByRole('button', { name: 'Model and session details' });
      expect(summaryChip.textContent).toContain('Ensemble');
      expect(summaryChip.querySelector('.animate-pulse')).not.toBeNull();
    });
  });

  it('expands detail panel on chip tap and exposes profile switch, vision toggle, and ensemble controls', async () => {
    mockStoreState.activeProfileId = 'prof-1';
    mockStoreState.ensembleModeEnabled = true;
    mockStoreState.lastPreviewScreenshot = {
      dataUrl: 'data:image/png;base64,mock',
      mediaType: 'image/png',
      data: 'mock'
    };
    mockStoreState.attachPreviewVision = true;

    render(React.createElement(ChatPanel, { projectId: 'proj-1' }));

    const summaryChip = await screen.findByRole('button', { name: 'Model and session details' });
    
    // Expand detail panel
    fireEvent.click(summaryChip);

    const detailPanel = screen.getByRole('region', { name: 'Session control details' });
    expect(detailPanel).toBeDefined();

    // Check vision toggle in expanded panel
    const visionBtn = screen.getByRole('button', { name: /Vision Attached/i });
    expect(visionBtn).toBeDefined();

    fireEvent.click(visionBtn);
    expect(mockSetAttachPreviewVision).toHaveBeenCalledWith(false);

    // Check profile switch in expanded panel
    const profileBtn = screen.getByRole('button', { name: 'Manage connection profile in Settings' });
    expect(profileBtn).toBeDefined();

    fireEvent.click(profileBtn);
    expect(mockSetActiveTab).toHaveBeenCalledWith('settings');

    // Detail panel closes after navigation
    expect(screen.queryByRole('region', { name: 'Session control details' })).toBeNull();
  });

  it('closes detail panel when clicking outside', async () => {
    mockStoreState.activeProfileId = 'prof-1';

    render(React.createElement(ChatPanel, { projectId: 'proj-1' }));

    const summaryChip = await screen.findByRole('button', { name: 'Model and session details' });
    fireEvent.click(summaryChip);

    expect(screen.getByRole('region', { name: 'Session control details' })).toBeDefined();

    // Click outside
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('region', { name: 'Session control details' })).toBeNull();
  });
});
