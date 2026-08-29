// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ModelPickerModal, formatContextWindow } from './ModelPickerModal';
import type { DiscoveredModel } from '../../services/llm/modelDiscovery';

const mockModels: DiscoveredModel[] = [
  {
    id: 'anthropic/claude-3.7-sonnet',
    name: 'Claude 3.7 Sonnet',
    description: 'Most intelligent model',
    contextWindow: 200000
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    description: 'Flagship omni model',
    contextWindow: 128000
  },
  {
    id: 'google/gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    description: 'Next gen multimodal',
    contextWindow: 1000000
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B',
    description: 'Open weights powerhouse',
    contextWindow: 131072
  }
];

describe('ModelPickerModal', () => {
  afterEach(() => {
    cleanup();
  });

  it('formats context window tokens correctly', () => {
    expect(formatContextWindow(200000)).toBe('200k ctx');
    expect(formatContextWindow(1000000)).toBe('1M ctx');
    expect(formatContextWindow(1500000)).toBe('1.5M ctx');
    expect(formatContextWindow(32000)).toBe('32k ctx');
    expect(formatContextWindow(undefined)).toBe('32k ctx');
  });

  it('renders model list and handles selection', () => {
    const onSelectModel = vi.fn();
    const onClose = vi.fn();

    render(
      <ModelPickerModal
        isOpen={true}
        onClose={onClose}
        models={mockModels}
        selectedModel="anthropic/claude-3.7-sonnet"
        onSelectModel={onSelectModel}
        provider="openrouter"
      />
    );

    expect(screen.getByText('Select Model')).toBeDefined();
    expect(screen.getAllByText('anthropic/claude-3.7-sonnet').length).toBeGreaterThan(0);
    expect(screen.getByText('openai/gpt-4o')).toBeDefined();

    // Click on GPT-4o
    const gpt4oBtn = screen.getByText('openai/gpt-4o').closest('button');
    expect(gpt4oBtn).toBeDefined();
    fireEvent.click(gpt4oBtn!);

    expect(onSelectModel).toHaveBeenCalledWith('openai/gpt-4o');
    expect(onClose).toHaveBeenCalled();
  });

  it('filters models via search input', () => {
    render(
      <ModelPickerModal
        isOpen={true}
        onClose={vi.fn()}
        models={mockModels}
        selectedModel=""
        onSelectModel={vi.fn()}
        provider="openrouter"
      />
    );

    const searchInput = screen.getByPlaceholderText(/Filter models/i);
    fireEvent.change(searchInput, { target: { value: 'gemini' } });

    expect(screen.getByText('google/gemini-2.0-flash')).toBeDefined();
    expect(screen.queryByText('openai/gpt-4o')).toBeNull();
  });

  it('allows manual entry of custom model ID', () => {
    const onSelectModel = vi.fn();
    const onClose = vi.fn();

    render(
      <ModelPickerModal
        isOpen={true}
        onClose={onClose}
        models={mockModels}
        selectedModel=""
        onSelectModel={onSelectModel}
        provider="openrouter"
      />
    );

    const searchInput = screen.getByPlaceholderText(/Filter models/i);
    fireEvent.change(searchInput, { target: { value: 'custom/my-fine-tuned-model' } });

    const manualBtn = screen.getByText(/Use "custom\/my-fine-tuned-model" as custom model/i);
    expect(manualBtn).toBeDefined();
    fireEvent.click(manualBtn);

    expect(onSelectModel).toHaveBeenCalledWith('custom/my-fine-tuned-model');
    expect(onClose).toHaveBeenCalled();
  });
});
