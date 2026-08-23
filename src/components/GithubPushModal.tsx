import React, { useState, useEffect } from 'react';
import { Loader2, X, GitPullRequest, GitBranch } from 'lucide-react';
import { useAppStore } from '../store';
import { createGithubClient } from '../services/github/githubClient';
import { listFiles } from '../services/fs/vfs';
import { binaryExtensions } from '../services/fs/zipExport';

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

interface GithubPushModalProps {
  projectId: string;
  onClose: () => void;
}

async function computeGitBlobSha(content: string, isBinary: boolean): Promise<string> {
  const enc = new TextEncoder();
  let contentBuffer: Uint8Array;
  
  if (isBinary) {
    const binString = atob(content);
    contentBuffer = new Uint8Array(binString.length);
    for (let i = 0; i < binString.length; i++) {
      contentBuffer[i] = binString.charCodeAt(i);
    }
  } else {
    contentBuffer = enc.encode(content);
  }

  const prefix = enc.encode(`blob ${contentBuffer.byteLength}\0`);
  const fullBuffer = new Uint8Array(prefix.byteLength + contentBuffer.byteLength);
  fullBuffer.set(prefix, 0);
  fullBuffer.set(contentBuffer, prefix.byteLength);

  const hashBuffer = await crypto.subtle.digest('SHA-1', fullBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function GithubPushModal({ projectId, onClose }: GithubPushModalProps) {
  const defaultDate = new Date().toISOString().slice(0, 10);
  const defaultBranchName = `laide-${defaultDate}`;
  const defaultCommit = `Update from LAIDE Studio (${defaultDate})`;

  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [baseBranch, setBaseBranch] = useState('main');
  const [isBaseBranchEdited, setIsBaseBranchEdited] = useState(false);
  const [newBranch, setNewBranch] = useState(defaultBranchName);
  const [commitMessage, setCommitMessage] = useState(defaultCommit);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [createdBranch, setCreatedBranch] = useState<string | null>(null);
  
  const { keys } = useAppStore();

  useEffect(() => {
    let active = true;
    const syncData = 
      localStorage.getItem(`xiom_github_sync_${projectId}`) || 
      sessionStorage.getItem('xiom_last_imported_repo') ||
      localStorage.getItem('xiom_last_github_repo');

    if (syncData) {
      try {
        const parsed = JSON.parse(syncData);
        Promise.resolve().then(() => {
          if (!active) return;
          if (parsed.owner) setOwner(parsed.owner);
          if (parsed.repo) setRepo(parsed.repo);
          if (parsed.branch) {
            setBaseBranch(parsed.branch);
            setIsBaseBranchEdited(true);
          }
        });
      } catch (_e) {
        // ignore
      }
    }
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!keys || !owner || !repo || isBaseBranchEdited) return;

    const timeout = setTimeout(async () => {
      try {
        const client = await createGithubClient(keys);
        const repoData = await client.getRepo(owner, repo);
        if (repoData.default_branch) {
          setBaseBranch(repoData.default_branch);
        }
      } catch (_e) {
        // ignore
      }
    }, 800);

    return () => clearTimeout(timeout);
  }, [owner, repo, keys, isBaseBranchEdited]);

  const handlePush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keys || !owner || !repo) return;
    
    setLoading(true);
    setError(null);
    setPrUrl(null);
    setCreatedBranch(null);
    
    try {
      const client = await createGithubClient(keys);
      const targetBranch = (newBranch || defaultBranchName).trim();
      
      let finalBaseBranch = baseBranch;
      if (!isBaseBranchEdited) {
        setProgress('Fetching repository info...');
        const repoData = await client.getRepo(owner, repo);
        if (repoData.default_branch) {
          finalBaseBranch = repoData.default_branch;
          setBaseBranch(finalBaseBranch);
        }
      }
      
      setProgress('Fetching base branch info...');
      const refData = await client.getBranch(owner, repo, finalBaseBranch);
      const baseCommitSha = refData.object.sha;
      
      const commitData = await client.getCommit(owner, repo, baseCommitSha);
      const baseTreeSha = commitData.tree.sha;
      
      setProgress('Fetching base tree...');
      const treeData = await client.getRepoTree(owner, repo, finalBaseBranch);
      const remoteFiles = new Map(treeData.tree.filter((t: any) => t.type === 'blob').map((t: any) => [t.path, t.sha]));
      
      setProgress('Analyzing local changes...');
      const localFiles = await listFiles(projectId);
      
      const createdEntries: any[] = [];
      let uploadCount = 0;
      
      const CONCURRENCY = 5;
      for (let i = 0; i < localFiles.length; i += CONCURRENCY) {
        const batch = localFiles.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(batch.map(async (file) => {
          const relativePath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
          const isBinary = binaryExtensions.some(ext => relativePath.toLowerCase().endsWith(ext));
          
          const localSha = await computeGitBlobSha(file.content, isBinary);
          const remoteSha = remoteFiles.get(relativePath);
          
          if (localSha !== remoteSha) {
            // File changed or is new
            const blobData = await client.createBlob(owner, repo, file.content, isBinary ? 'base64' : 'utf-8');
            return {
              entry: {
                path: relativePath,
                mode: '100644',
                type: 'blob',
                sha: blobData.sha
              },
              relativePath,
              isUpload: true
            };
          }
          return { entry: null, relativePath, isUpload: false };
        }));

        for (const res of batchResults) {
          if (res.entry) {
            createdEntries.push(res.entry);
          }
          if (res.isUpload) {
            uploadCount++;
          }
          remoteFiles.delete(res.relativePath);
        }
      }
      
      // Any remaining files in remoteFiles were deleted locally
      const deletedEntries: any[] = Array.from(remoteFiles.keys()).map(deletedPath => ({
        path: deletedPath,
        mode: '100644',
        type: 'blob',
        sha: null
      }));
      
      const treeEntries = [...createdEntries, ...deletedEntries];
      
      if (treeEntries.length === 0) {
        throw new Error('No changes detected to push.');
      }
      
      setProgress(`Creating tree with ${treeEntries.length} changes (${uploadCount} uploads)...`);
      const newTreeData = await client.createTree(owner, repo, baseTreeSha, treeEntries);
      
      setProgress('Creating commit...');
      const finalCommitMsg = (commitMessage || defaultCommit).trim();
      const newCommitData = await client.createCommit(owner, repo, finalCommitMsg, newTreeData.sha, baseCommitSha);
      
      setProgress(`Creating branch '${targetBranch}'...`);
      try {
        await client.createBranch(owner, repo, targetBranch, newCommitData.sha);
      } catch (branchErr: any) {
        if (branchErr.message && branchErr.message.includes('422')) {
          const match = targetBranch.match(/-(\d+)$/);
          let nextBranch = '';
          if (match) {
            nextBranch = targetBranch.substring(0, targetBranch.length - match[0].length) + '-' + (parseInt(match[1]) + 1);
          } else {
            nextBranch = targetBranch + '-2';
          }
          setNewBranch(nextBranch);
          throw new Error(`Branch '${targetBranch}' already exists. We've updated the name to '${nextBranch}', click push again to retry.`, { cause: branchErr });
        }
        throw branchErr;
      }
      
      // Save sync info for future pushes
      localStorage.setItem(`xiom_github_sync_${projectId}`, JSON.stringify({
        owner,
        repo,
        branch: baseBranch
      }));

      // Generate compare URL
      const compareUrl = `https://github.com/${owner}/${repo}/compare/${baseBranch}...${targetBranch}?expand=1`;
      setPrUrl(compareUrl);
      setCreatedBranch(targetBranch);
      
    } catch (err: any) {
      setError(err.message || 'Push failed');
    } finally {
      setLoading(false);
    }
  };

  const activeTargetBranch = (newBranch || defaultBranchName).trim();

  return (
    <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border p-5 rounded-lg shadow-2xl w-full max-w-md relative corner-ticks">
        <button 
          type="button"
          onClick={onClose} 
          aria-label="Close GitHub push modal"
          className="absolute top-4 right-4 text-muted hover:text-text cursor-pointer p-1 rounded"
        >
          <X size={16} />
        </button>
        
        <div className="flex items-center gap-2 text-accent font-sans mb-4">
          <GithubIcon size={20} />
          <h3 className="font-bold text-text">Push to GitHub</h3>
        </div>

        {prUrl ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-moss/20 text-moss flex items-center justify-center mx-auto mb-2">
              <GitPullRequest size={24} />
            </div>
            <h4 className="text-text font-sans text-sm font-bold">Branch Created!</h4>
            <p className="text-muted text-xs font-sans">
              Successfully pushed changes to <span className="text-accent font-semibold">{createdBranch}</span>. Click below to open a Pull Request on GitHub.
            </p>
            <a 
              href={prUrl} 
              target="_blank" 
              rel="noreferrer"
              onClick={onClose}
              className="inline-flex items-center gap-2 py-2.5 px-6 bg-moss text-white font-sans font-bold rounded hover:bg-moss/90 transition-colors mt-4 shadow-xs"
            >
              Open Pull Request <GitPullRequest size={16} />
            </a>
          </div>
        ) : (
          <form onSubmit={handlePush} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-sans text-muted mb-1">Owner</label>
                <input 
                  type="text"
                  value={owner}
                  onChange={e => setOwner(e.target.value)}
                  placeholder="e.g. facebook"
                  required
                  disabled={loading}
                  className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-sm focus:border-accent focus:outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-sans text-muted mb-1">Repo</label>
                <input 
                  type="text"
                  value={repo}
                  onChange={e => setRepo(e.target.value)}
                  placeholder="e.g. react"
                  required
                  disabled={loading}
                  className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-sm focus:border-accent focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-sans text-muted mb-1">Base Branch</label>
                <input 
                  type="text"
                  value={baseBranch}
                  onChange={e => {
                    setBaseBranch(e.target.value);
                    setIsBaseBranchEdited(true);
                  }}
                  placeholder="main"
                  required
                  disabled={loading}
                  className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-sm focus:border-accent focus:outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-sans text-muted mb-1">New Branch Name</label>
                <input 
                  type="text"
                  value={newBranch}
                  onChange={e => setNewBranch(e.target.value)}
                  placeholder={defaultBranchName}
                  required
                  disabled={loading}
                  className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-sm focus:border-accent focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-sans text-muted mb-1">Commit Message</label>
              <input 
                type="text"
                value={commitMessage}
                onChange={e => setCommitMessage(e.target.value)}
                placeholder="Update from LAIDE Studio"
                required
                disabled={loading}
                className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-sm focus:border-accent focus:outline-none disabled:opacity-50"
              />
            </div>

            {error && (
              <div className="text-xs text-oxide bg-oxide/10 border border-oxide/30 p-3 rounded font-sans break-words flex flex-col gap-2">
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
              disabled={loading || !owner || !repo}
              title={`Push to New Branch (${activeTargetBranch})`}
              className="w-full min-h-[42px] py-2.5 px-3 bg-accent text-accent-text-on font-sans font-bold rounded flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin shrink-0" />
                  <span className="text-xs sm:text-sm">{progress || 'Pushing...'}</span>
                </>
              ) : (
                <div className="flex items-center justify-center gap-1.5 min-w-0 max-w-full text-center px-1">
                  <GitBranch size={15} className="shrink-0" />
                  <span className="text-xs sm:text-sm leading-tight break-all sm:break-words line-clamp-2" title={activeTargetBranch}>
                    Push to New Branch (<span className="font-mono underline decoration-accent-text-on/30">{activeTargetBranch}</span>)
                  </span>
                </div>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
