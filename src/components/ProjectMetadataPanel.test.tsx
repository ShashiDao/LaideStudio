// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { ProjectMetadataPanel } from './ProjectMetadataPanel';
import type { FileItem, Project } from '../db';

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

    expect(screen.getByText('Studio App Analytics')).toBeDefined();
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
