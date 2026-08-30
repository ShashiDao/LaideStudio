// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { DeployModal } from './DeployModal';
import type { Project, FileItem } from '../../db';
import * as vfs from '../../services/fs/vfs';
import * as deployClient from '../../services/deploy/deployClient';

describe('DeployModal', () => {
  const dummyProject: Project = {
    id: 'proj-deploy-1',
    name: 'Awesome React App',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const dummyFiles: FileItem[] = [
    {
      id: 'f1',
      projectId: 'proj-deploy-1',
      path: '/index.html',
      content: '<html><body><h1>App</h1></body></html>',
      updatedAt: Date.now()
    }
  ];

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(vfs, 'listFiles').mockResolvedValue(dummyFiles);
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders modal with Netlify, Vercel, and Deploys tabs', () => {
    render(<DeployModal project={dummyProject} onClose={() => {}} />);
    
    expect(screen.getByText('Publish Live Web App')).toBeDefined();
    expect(screen.getByText('Awesome React App')).toBeDefined();
    expect(screen.getByRole('button', { name: /^Netlify/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /^Vercel/i })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Past Deploys' })).toBeDefined();
  });

  it('switches between Netlify and Vercel tabs', () => {
    render(<DeployModal project={dummyProject} onClose={() => {}} />);

    // Click Vercel tab
    fireEvent.click(screen.getByRole('button', { name: /^Vercel/i }));
    expect(screen.getByText(/Vercel Edge Deploy/i)).toBeDefined();
    expect(screen.getByLabelText(/Vercel API Token/i)).toBeDefined();

    // Click Netlify tab
    fireEvent.click(screen.getByRole('button', { name: /^Netlify/i }));
    expect(screen.getByText(/Netlify Direct Deploy/i)).toBeDefined();
  });

  it('handles successful Netlify deploy and shows live shareable URL card', async () => {
    const mockDeployResult = {
      id: 'd-123',
      provider: 'netlify' as const,
      siteName: 'awesome-react-app',
      url: 'https://awesome-react-app.netlify.app',
      liveUrl: 'https://awesome-react-app.netlify.app',
      adminUrl: 'https://app.netlify.com/sites/awesome-react-app',
      deployedAt: new Date().toISOString(),
      projectId: 'proj-deploy-1'
    };

    vi.spyOn(deployClient, 'deployToNetlify').mockResolvedValue(mockDeployResult);

    render(<DeployModal project={dummyProject} onClose={() => {}} />);

    const deployBtn = screen.getByRole('button', { name: /Publish to Netlify/i });
    fireEvent.click(deployBtn);

    await waitFor(() => {
      expect(screen.getByText('Your Project is Live!')).toBeDefined();
      expect(screen.getByText('https://awesome-react-app.netlify.app')).toBeDefined();
      expect(screen.getByRole('link', { name: /Open Live Application/i }).getAttribute('href')).toBe('https://awesome-react-app.netlify.app');
    });
  });

  it('displays deployment error message if deploy fails', async () => {
    vi.spyOn(deployClient, 'deployToNetlify').mockRejectedValue(new Error('Site name already registered on Netlify'));

    render(<DeployModal project={dummyProject} onClose={() => {}} />);

    const deployBtn = screen.getByRole('button', { name: /Publish to Netlify/i });
    fireEvent.click(deployBtn);

    await waitFor(() => {
      expect(screen.getByText('Deployment Error')).toBeDefined();
      expect(screen.getByText('Site name already registered on Netlify')).toBeDefined();
    });
  });

  it('displays empty state and past deploys list in History tab', async () => {
    const { unmount } = render(<DeployModal project={dummyProject} onClose={() => {}} />);

    // Click History tab (initially empty)
    fireEvent.click(screen.getByRole('button', { name: 'Past Deploys' }));
    expect(screen.getByText(/No deploys yet for/i)).toBeDefined();

    unmount();

    // Add a deploy to history
    deployClient.saveDeployHistory('proj-deploy-1', {
      id: 'history-item-1',
      provider: 'netlify',
      siteName: 'historic-app',
      url: 'https://historic-app.netlify.app',
      liveUrl: 'https://historic-app.netlify.app',
      deployedAt: new Date().toISOString(),
      projectId: 'proj-deploy-1'
    });

    render(<DeployModal project={dummyProject} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Past Deploys' }));

    await waitFor(() => {
      expect(screen.getByText('historic-app')).toBeDefined();
      expect(screen.getByText('https://historic-app.netlify.app')).toBeDefined();
    });
  });

  it('allows revoking and deleting saved deploy token from vault', async () => {
    vi.spyOn(deployClient, 'getDeployToken').mockResolvedValue('nfp_saved_test_token');
    const deleteSpy = vi.spyOn(deployClient, 'deleteDeployToken');

    render(<DeployModal project={dummyProject} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('Vault Saved')).toBeDefined();
      expect(screen.getByText('Revoke / Delete Token')).toBeDefined();
    });

    const revokeBtn = screen.getByRole('button', { name: /Revoke \/ Delete Token/i });
    fireEvent.click(revokeBtn);

    expect(deleteSpy).toHaveBeenCalledWith('netlify');
    await waitFor(() => {
      expect(screen.queryByText('Vault Saved')).toBeNull();
    });
  });
});
