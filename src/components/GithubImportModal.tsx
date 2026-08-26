import React, { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useAppStore } from '../store';
import { createGithubClient } from '../services/github/githubClient';
import { createFile, writeFile, listFiles } from '../services/fs/vfs';

function GithubIcon({ size = 16, className = '', strokeWidth = 2 }: { size?: number | string; className?: string; strokeWidth?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

interface GithubImportModalProps {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function GithubImportModal({ projectId, onClose, onSuccess }: GithubImportModalProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');
  const { keys } = useAppStore();

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keys) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Parse URL
      // E.g. https://github.com/owner/repo
      let owner = '';
      let repo = '';
      try {
        const urlObj = new URL(url);
        const parts = urlObj.pathname.split('/').filter(Boolean);
        if (parts.length < 2) throw new Error('Invalid repo URL');
        owner = parts[0];
        repo = parts[1];
      } catch (err) {
        throw new Error('Please enter a valid GitHub repository URL (e.g. https://github.com/owner/repo)', { cause: err });
      }

      const client = await createGithubClient(keys);
      
      setProgress('Fetching repository details...');
      const repoData = await client.getRepo(owner, repo);
      const branch = repoData?.default_branch || 'main';

      setProgress('Fetching repository tree...');
      const treeData = await client.getRepoTree(owner, repo, branch);
      if (!treeData || !treeData.tree) {
        throw new Error('Failed to fetch repository tree');
      }

      const filesToDownload = treeData.tree.filter((item) => item.type === 'blob');
      let completed = 0;
      
      setProgress(`Downloading 0 / ${filesToDownload.length} files...`);
      
      // Get existing files to handle overwrite
      const existingFiles = await listFiles(projectId);
      const existingMap = new Map(existingFiles.map(f => [f.path, f]));
      
      // Batch download and create (with concurrency limit)
      const CONCURRENCY = 5;
      for (let i = 0; i < filesToDownload.length; i += CONCURRENCY) {
        const batch = filesToDownload.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (file) => {
          try {
            const content = await client.getFileContent(owner, repo, file.path, branch);
            const targetPath = `/${file.path}`;
            const existing = existingMap.get(targetPath);
            if (existing) {
              await writeFile(existing.id, content);
            } else {
              await createFile(projectId, targetPath, content);
            }
          } catch (err) {
            console.warn(`Failed to import file ${file.path}:`, err);
          }
          completed++;
          setProgress(`Downloading ${completed} / ${filesToDownload.length} files...`);
        }));
      }

      const syncPayload = JSON.stringify({
        owner,
        repo,
        branch
      });
      localStorage.setItem(`xiom_github_sync_${projectId}`, syncPayload);
      localStorage.setItem('xiom_last_github_repo', syncPayload);
      sessionStorage.setItem('xiom_last_imported_repo', syncPayload);

      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      if (msg.includes('404')) {
        setError('Repository not found or no access');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border p-5 rounded-lg shadow-2xl w-full max-w-sm relative corner-ticks">
        <button 
          type="button"
          onClick={onClose} 
          aria-label="Close GitHub import modal"
          className="absolute top-4 right-4 text-muted hover:text-text cursor-pointer p-1 rounded"
        >
          <X size={16} />
        </button>
        
        <div className="flex items-center gap-2 text-accent font-sans mb-4">
          <GithubIcon size={20} />
          <h3 className="font-bold text-text">Import from GitHub</h3>
        </div>

        <form onSubmit={handleImport} className="space-y-4">
          <div>
            <label className="block text-xs font-sans text-muted mb-1">
              Repository URL
            </label>
            <input 
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              required
              disabled={loading}
              className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-sm focus:border-accent focus:outline-none disabled:opacity-50"
            />
          </div>

          {error && (
            <div className="text-xs text-oxide bg-oxide/10 border border-oxide/30 p-3 rounded font-sans flex flex-col gap-2">
              <span>{error}</span>
              {error.toLowerCase().includes('pat') && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    useAppStore.getState().setActiveTab('settings');
                  }}
                  className="text-accent underline text-left hover:text-accent/80 cursor-pointer"
                >
                  Configure Token in Settings →
                </button>
              )}
            </div>
          )}

          <button 
            type="submit"
            disabled={loading || !url}
            className="w-full py-2.5 bg-accent text-accent-text-on font-sans font-bold rounded flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {progress || 'Importing...'}
              </>
            ) : (
              'Import Repository'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
