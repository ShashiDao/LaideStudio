import React, { useState, useEffect } from 'react';
import { Loader2, X, GitPullRequest, GitBranch, ShieldCheck, Cpu } from 'lucide-react';
import { useAppStore } from '../../store';
import { db } from '../../db';
import { createGithubClient, type GitTreeEntry } from '../../services/github/githubClient';
import { listFiles } from '../../services/fs/vfs';
import { binaryExtensions } from '../../services/fs/zipExport';
import { 
  calculateProjectTrustScore, 
  generateTrustMarkdownReport, 
  type ProjectTrustScore 
} from '../../services/provenance/trustScore';

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
  const { theme, keys } = useAppStore();
  const isLight = theme === 'paper';
  const defaultDate = new Date().toISOString().slice(0, 10);
  const defaultBranchName = `laide-${defaultDate}`;
  const defaultCommit = `Update from LAIDE Studio (${defaultDate})`;

  const [mode, setMode] = useState<'existing' | 'create'>('existing');
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDescription, setNewRepoDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [newRepoOrg, setNewRepoOrg] = useState('');
  const [baseBranch, setBaseBranch] = useState('main');
  const [isBaseBranchEdited, setIsBaseBranchEdited] = useState(false);
  const [newBranch, setNewBranch] = useState(defaultBranchName);
  const [commitMessage, setCommitMessage] = useState(defaultCommit);
  const [includeTrustLedger, setIncludeTrustLedger] = useState(true);
  const [projectTrust, setProjectTrust] = useState<ProjectTrustScore | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [createdBranch, setCreatedBranch] = useState<string | null>(null);
  const [createdRepoUrl, setCreatedRepoUrl] = useState<string | null>(null);

  // Compute Project / PR Trust Score
  useEffect(() => {
    let active = true;
    const computeTrust = async () => {
      try {
        const [files, entries] = await Promise.all([
          listFiles(projectId),
          db.provenanceEntries.where('projectId').equals(projectId).toArray()
        ]);
        const result = await calculateProjectTrustScore(projectId, files, entries);
        if (active) {
          setProjectTrust(result);
        }
      } catch (err) {
        console.warn('Failed to calculate project trust for PR modal', err);
      }
    };
    computeTrust();
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    let active = true;
    const syncData = 
      localStorage.getItem(`laide_github_sync_${projectId}`) || 
      sessionStorage.getItem('laide_last_imported_repo') ||
      localStorage.getItem('laide_last_github_repo');

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
    if (mode === 'create' || !keys || !owner || !repo || isBaseBranchEdited) return;

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
  }, [owner, repo, keys, isBaseBranchEdited, mode]);

  const handlePush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keys) return;
    if (mode === 'existing' && (!owner || !repo)) return;
    if (mode === 'create' && !newRepoName.trim()) return;
    
    setLoading(true);
    setError(null);
    setPrUrl(null);
    setCreatedBranch(null);
    setCreatedRepoUrl(null);
    
    try {
      const client = await createGithubClient(keys);
      const targetBranch = (newBranch || defaultBranchName).trim();
      
      let finalOwner = owner.trim();
      let finalRepo = repo.trim();
      let finalBaseBranch = baseBranch;
      
      let baseCommitSha: string;
      let baseTreeSha: string;
      let treeData;

      if (mode === 'create') {
        setProgress('Creating repository...');
        let createdRepo;
        try {
          createdRepo = await client.createRepo(newRepoName.trim(), {
            description: newRepoDescription.trim() || undefined,
            private: isPrivate,
            org: newRepoOrg.trim() || undefined
          });
        } catch (createErr) {
          const msg = createErr instanceof Error ? createErr.message : String(createErr);
          if (msg.includes('422')) {
            throw new Error("A repository with this name already exists. Choose a different name or use 'push to existing repo' instead.", { cause: createErr });
          }
          throw createErr;
        }
        finalOwner = createdRepo.owner.login;
        finalRepo = createdRepo.name;
        finalBaseBranch = createdRepo.default_branch || 'main';
        setOwner(finalOwner);
        setRepo(finalRepo);
        setBaseBranch(finalBaseBranch);
        setCreatedRepoUrl(createdRepo.html_url || `https://github.com/${finalOwner}/${finalRepo}`);

        // Retry loop: GitHub may take a brief moment to initialize the created repo's default branch/ref
        const MAX_RETRIES = 5;
        let repoReady = false;
        let lastRepoError: unknown = null;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            setProgress(attempt === 1 ? 'Fetching base branch info...' : `Waiting for repository to initialize... (attempt ${attempt}/${MAX_RETRIES})`);
            const branchData = await client.getBranch(finalOwner, finalRepo, finalBaseBranch);
            if (!branchData || !branchData.object || !branchData.object.sha) {
               throw new Error("Branch not ready");
            }
            baseCommitSha = branchData.object.sha;

            const commitData = await client.getCommit(finalOwner, finalRepo, baseCommitSha);
            baseTreeSha = commitData.tree.sha;

            treeData = await client.getRepoTree(finalOwner, finalRepo, finalBaseBranch);
            
            repoReady = true;
            break;
          } catch (err) {
            lastRepoError = err;
            const msg = err instanceof Error ? err.message : String(err);
            const isNotFound = msg.includes('404') || msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('no access');
            if (isNotFound && attempt < MAX_RETRIES) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
              continue;
            }
            if (!isNotFound) {
              throw err;
            }
          }
        }

        if (!repoReady) {
          throw new Error("Repository was created but isn't ready yet. Please wait a few seconds and click 'Push to Remote Branch' again.", { cause: lastRepoError });
        }
      } else {
        if (!isBaseBranchEdited) {
          setProgress('Fetching repository info...');
          const repoData = await client.getRepo(finalOwner, finalRepo);
          if (repoData.default_branch) {
            finalBaseBranch = repoData.default_branch;
            setBaseBranch(finalBaseBranch);
          }
        }
        
        setProgress('Fetching base branch info...');
        const refData = await client.getBranch(finalOwner, finalRepo, finalBaseBranch);
        baseCommitSha = refData.object.sha;
        
        const commitData = await client.getCommit(finalOwner, finalRepo, baseCommitSha);
        baseTreeSha = commitData.tree.sha;
        
        setProgress('Fetching base tree...');
        treeData = await client.getRepoTree(finalOwner, finalRepo, finalBaseBranch);
      }
      
      const remoteFiles = new Map(treeData.tree.filter((t) => t.type === 'blob').map((t) => [t.path, t.sha]));
      
      setProgress('Analyzing local changes...');
      const localFiles = await listFiles(projectId);
      
      const createdEntries: GitTreeEntry[] = [];
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
            const blobData = await client.createBlob(finalOwner, finalRepo, file.content, isBinary ? 'base64' : 'utf-8');
            return {
              entry: {
                path: relativePath,
                mode: '100644' as const,
                type: 'blob' as const,
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
      const deletedEntries: GitTreeEntry[] = Array.from(remoteFiles.keys()).map(deletedPath => ({
        path: deletedPath,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: null
      }));
      
      const treeEntries = [...createdEntries, ...deletedEntries];
      
      if (treeEntries.length === 0) {
        throw new Error('No changes detected to push.');
      }
      
      setProgress(`Creating tree with ${treeEntries.length} changes (${uploadCount} uploads)...`);
      const newTreeData = await client.createTree(finalOwner, finalRepo, baseTreeSha, treeEntries);
      
      setProgress('Creating commit...');
      let finalCommitMsg = (commitMessage || defaultCommit).trim();
      if (includeTrustLedger && projectTrust) {
        finalCommitMsg += '\n\n' + generateTrustMarkdownReport(projectTrust);
      }
      const newCommitData = await client.createCommit(finalOwner, finalRepo, finalCommitMsg, newTreeData.sha, baseCommitSha);
      
      setProgress(`Creating branch '${targetBranch}'...`);
      try {
        await client.createBranch(finalOwner, finalRepo, targetBranch, newCommitData.sha);
      } catch (branchErr) {
        const msg = branchErr instanceof Error ? branchErr.message : String(branchErr);
        if (msg.includes('422')) {
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
      localStorage.setItem(`laide_github_sync_${projectId}`, JSON.stringify({
        owner: finalOwner,
        repo: finalRepo,
        branch: finalBaseBranch
      }));

      // Generate compare URL
      const compareUrl = `https://github.com/${finalOwner}/${finalRepo}/compare/${finalBaseBranch}...${targetBranch}?expand=1`;
      setPrUrl(compareUrl);
      setCreatedBranch(targetBranch);
      if (!createdRepoUrl) {
        setCreatedRepoUrl(`https://github.com/${finalOwner}/${finalRepo}`);
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Push failed');
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
            <h4 className="text-text font-sans text-sm font-bold">
              {mode === 'create' ? 'Repository Created & Branch Pushed!' : 'Branch Created!'}
            </h4>
            <p className="text-muted text-xs font-sans">
              Successfully pushed changes to <span className="text-accent font-semibold">{createdBranch}</span>. Click below to open a Pull Request on GitHub.
            </p>
            {createdRepoUrl && (
              <div className="pt-1">
                <a 
                  href={createdRepoUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-xs font-mono text-accent hover:underline inline-flex items-center gap-1.5"
                >
                  <GithubIcon size={14} />
                  <span>{createdRepoUrl.replace('https://github.com/', '')}</span>
                  <span className="text-[10px]">↗</span>
                </a>
              </div>
            )}
            <div className="pt-2">
              <a 
                href={prUrl} 
                target="_blank" 
                rel="noreferrer"
                onClick={onClose}
                className="inline-flex items-center gap-2 py-2.5 px-6 bg-moss text-white font-sans font-bold rounded hover:bg-moss/90 transition-colors shadow-xs"
              >
                Open Pull Request <GitPullRequest size={16} />
              </a>
            </div>
          </div>
        ) : (
          <form onSubmit={handlePush} className="space-y-4">
            <div className="flex rounded-lg p-0.5 bg-bg border border-border">
              <button
                type="button"
                onClick={() => {
                  setMode('existing');
                  setError(null);
                }}
                disabled={loading}
                className={`flex-1 py-1.5 px-3 text-xs font-sans font-medium rounded-md transition-colors cursor-pointer ${
                  mode === 'existing'
                    ? 'bg-surface text-text shadow-xs font-semibold'
                    : 'text-muted hover:text-text'
                }`}
              >
                Push to existing repository
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('create');
                  setError(null);
                }}
                disabled={loading}
                className={`flex-1 py-1.5 px-3 text-xs font-sans font-medium rounded-md transition-colors cursor-pointer ${
                  mode === 'create'
                    ? 'bg-surface text-text shadow-xs font-semibold'
                    : 'text-muted hover:text-text'
                }`}
              >
                Create new repository
              </button>
            </div>

            {mode === 'create' ? (
              <>
                <div>
                  <label className="block text-xs font-sans text-muted mb-1">Repository Name</label>
                  <input 
                    type="text"
                    value={newRepoName}
                    onChange={e => setNewRepoName(e.target.value)}
                    placeholder="e.g. my-app"
                    required
                    disabled={loading}
                    className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-sm focus:border-accent focus:outline-none disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-sans text-muted mb-1">
                    Description <span className="text-[10px] text-muted/70">(optional)</span>
                  </label>
                  <textarea 
                    value={newRepoDescription}
                    onChange={e => setNewRepoDescription(e.target.value)}
                    placeholder="e.g. Project built with LAIDE Studio"
                    disabled={loading}
                    rows={2}
                    className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-sm focus:border-accent focus:outline-none disabled:opacity-50 resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-sans text-muted mb-1">Visibility</label>
                    <div className="flex rounded p-0.5 bg-bg border border-border">
                      <button
                        type="button"
                        onClick={() => setIsPrivate(true)}
                        disabled={loading}
                        className={`flex-1 py-1.5 px-2 text-xs font-sans font-medium rounded transition-colors cursor-pointer ${
                          isPrivate
                            ? 'bg-surface text-text shadow-xs font-semibold'
                            : 'text-muted hover:text-text'
                        }`}
                      >
                        Private
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsPrivate(false)}
                        disabled={loading}
                        className={`flex-1 py-1.5 px-2 text-xs font-sans font-medium rounded transition-colors cursor-pointer ${
                          !isPrivate
                            ? 'bg-surface text-text shadow-xs font-semibold'
                            : 'text-muted hover:text-text'
                        }`}
                      >
                        Public
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-sans text-muted mb-1">
                      Organization <span className="text-[10px] text-muted/70">(optional)</span>
                    </label>
                    <input 
                      type="text"
                      value={newRepoOrg}
                      onChange={e => setNewRepoOrg(e.target.value)}
                      placeholder="Leave blank for personal"
                      disabled={loading}
                      className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-sm focus:border-accent focus:outline-none disabled:opacity-50"
                    />
                  </div>
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
              </>
            ) : (
              <>
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
              </>
            )}

            {/* PR Trust & Provenance Card */}
            {projectTrust && (
              <div className={`p-3 rounded-lg border space-y-2 text-xs font-sans ${
                isLight ? 'bg-white border-[#CBD8E2]' : 'bg-[#151518] border-[#2A2A2E]'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-accent text-[11px]">
                    <ShieldCheck size={14} />
                    <span>PR Provenance & Trust Analysis</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-mono font-bold text-accent text-xs">
                      {projectTrust.overallScore}%
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface border border-border text-muted font-semibold">
                      Grade {projectTrust.overallGrade}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 w-full text-[10.5px] font-mono text-muted pt-1">
                  <div className="flex items-center justify-between px-2 py-1.5 rounded bg-surface/60 border border-border/50">
                    <span>AI Attribution:</span>
                    <span className="font-semibold text-text">{Math.round(projectTrust.aiRatio * 100)}% AI</span>
                  </div>
                  <div className="flex items-center justify-between px-2 py-1.5 rounded bg-surface/60 border border-border/50">
                    <span>Tests at Patch:</span>
                    <span className="font-semibold text-emerald-400">{projectTrust.overallTestPassRate}% pass</span>
                  </div>
                  <div className="flex items-center justify-between px-2 py-1.5 rounded bg-surface/60 border border-border/50">
                    <span>Chain Integrity:</span>
                    <span className={`font-semibold ${projectTrust.chainIntegrity.valid ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {projectTrust.chainIntegrity.valid ? 'Valid' : 'Warning'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-2 py-1.5 rounded bg-surface/60 border border-border/50">
                    <span>Files Tracked:</span>
                    <span className="font-semibold text-text">{projectTrust.totalFiles}</span>
                  </div>
                </div>

                {projectTrust.modelDistribution.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {projectTrust.modelDistribution.map((m, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9.5px] font-mono bg-accent/10 text-accent border border-accent/20">
                        <Cpu size={9} />
                        <span>{m.model} ({m.percentage}%)</span>
                      </span>
                    ))}
                  </div>
                )}

                <label className="flex items-center gap-2 pt-1 text-[11px] font-sans text-muted cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeTrustLedger}
                    onChange={e => setIncludeTrustLedger(e.target.checked)}
                    className="rounded border-border text-accent focus:ring-accent accent-accent"
                  />
                  <span>Attach AI Provenance & Trust Ledger to PR description</span>
                </label>
              </div>
            )}

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
              disabled={loading || (mode === 'existing' ? (!owner.trim() || !repo.trim()) : !newRepoName.trim())}
              title={`Push to Remote Branch (${activeTargetBranch})`}
              className="w-full min-h-[44px] py-2.5 px-4 bg-accent text-accent-text-on font-sans font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-accent/90 active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin shrink-0" />
                  <span className="text-xs sm:text-sm font-semibold">{progress || 'Pushing...'}</span>
                </>
              ) : (
                <div className="flex items-center justify-center gap-2 min-w-0 max-w-full text-center">
                  <GitBranch size={16} className="shrink-0" />
                  <span className="text-xs sm:text-sm font-bold whitespace-nowrap">
                    Push to Remote Branch
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
