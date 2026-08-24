// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { ProjectMetadataPanel } from './ProjectMetadataPanel';
import type { FileItem, Project } from '../db';
import { useAppStore } from '../store';

// Mock recharts ResponsiveContainer to work properly in happy-dom / jsdom
vi.mock('recharts', async () => {
  const original = await vi.importActual<any>('recharts');
  return {
    ...original,
    ResponsiveContainer: ({ children }: any) => (
      <div data-testid="responsive-container" style={{ width: 400, height: 200 }}>
        {children}
      </div>
    )
  };
});

const mockProject: Project = {
  id: 'p-1',
  name: 'Studio App',
  createdAt: 1000,
  updatedAt: 2000
};

const mockFiles: FileItem[] = [
  {
    id: 'f-1',
    projectId: 'p-1',
    path: '/src/App.tsx',
    content: 'import React from "react";\n\nexport default function App() {\n  return <div>App</div>;\n}',
    updatedAt: 1000
  },
  {
    id: 'f-2',
    projectId: 'p-1',
    path: '/src/index.ts',
    content: 'console.log("ready");\nconsole.log("running");',
    updatedAt: 1000
  },
  {
    id: 'f-3',
    projectId: 'p-1',
    path: '/src/styles.css',
    content: 'body { margin: 0; }',
    updatedAt: 1000
  }
];

describe('ProjectMetadataPanel Component', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      sessionUsageRecords: []
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ProjectMetadataPanel
        project={mockProject}
        files={mockFiles}
        isOpen={false}
        onClose={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders detailed metadata cards and language analytics when open', () => {
    render(
      <ProjectMetadataPanel
        project={mockProject}
        files={mockFiles}
        isOpen={true}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Total LOC')).toBeDefined();
    // 5 + 2 + 1 = 8 lines of code
    expect(screen.getByText('8')).toBeDefined();
    // 3 files
    expect(screen.getByText('3')).toBeDefined();
    // Dominant language & language list items
    expect(screen.getAllByText('TypeScript (React)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('TypeScript').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('CSS').length).toBeGreaterThanOrEqual(1);
  });

  it('allows toggling between Donut and Bar charts, and LOC vs Files metrics', () => {
    render(
      <ProjectMetadataPanel
        project={mockProject}
        files={mockFiles}
        isOpen={true}
        onClose={() => {}}
      />
    );

    // Toggle to Bar chart
    const barBtn = screen.getByLabelText('Bar Chart');
    fireEvent.click(barBtn);
    expect(screen.getByTestId('responsive-container')).toBeDefined();

    // Toggle to Files metric
    const filesMetricBtn = screen.getByRole('button', { name: 'Files' });
    fireEvent.click(filesMetricBtn);
  });

  it('allows toggling to API Cost & Spend tab and displays usage stats & charts', () => {
    // Populate store with usage records
    useAppStore.setState({
      sessionUsageRecords: [
        {
          id: 'rec-1',
          timestamp: Date.now(),
          provider: 'anthropic',
          model: 'claude-3-7-sonnet',
          inputTokens: 10000,
          outputTokens: 2000,
          totalTokens: 12000,
          estimatedCostUsd: 0.06,
          category: 'agent_chat',
          promptPreview: 'Add responsive navbar'
        },
        {
          id: 'rec-2',
          timestamp: Date.now(),
          provider: 'openai',
          model: 'gpt-4o',
          inputTokens: 8000,
          outputTokens: 1500,
          totalTokens: 9500,
          estimatedCostUsd: 0.035,
          category: 'ensemble_candidate_a',
          promptPreview: 'Fix layout glitch'
        }
      ]
    });

    render(
      <ProjectMetadataPanel
        project={mockProject}
        files={mockFiles}
        isOpen={true}
        onClose={() => {}}
      />
    );

    // Click API Cost & Spend tab
    const spendTabBtn = screen.getByRole('button', { name: /API Cost & Spend/i });
    fireEvent.click(spendTabBtn);

    // Verify Cost KPI cards render
    expect(screen.getByText('Estimated Spend')).toBeDefined();
    expect(screen.getByText('Tokens Consumed')).toBeDefined();
    expect(screen.getByText('Recorded Runs')).toBeDefined();
    expect(screen.getByText('Ensemble Multiplier')).toBeDefined();

    // Verify usage records are listed
    expect(screen.getByText('claude-3-7-sonnet')).toBeDefined();
    expect(screen.getByText('gpt-4o')).toBeDefined();

    // Toggle Rate Card reference
    const rateCardBtn = screen.getByRole('button', { name: /Rate Card/i });
    fireEvent.click(rateCardBtn);
    expect(screen.getByText(/Model Pricing Rates/i)).toBeDefined();

    // Toggle between chart modes
    const ioBtn = screen.getByRole('button', { name: 'Input vs Output' });
    fireEvent.click(ioBtn);
    expect(screen.getByTestId('responsive-container')).toBeDefined();

    const historyBtn = screen.getByRole('button', { name: 'Turn History' });
    fireEvent.click(historyBtn);
    expect(screen.getByTestId('responsive-container')).toBeDefined();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <ProjectMetadataPanel
        project={mockProject}
        files={mockFiles}
        isOpen={true}
        onClose={onClose}
      />
    );

    const closeBtn = screen.getByLabelText('Close analytics');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
