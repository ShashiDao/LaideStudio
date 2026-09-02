import React, { useState, useEffect, useRef } from 'react';
import { Loader2, X, GitPullRequest, GitBranch, ShieldCheck, Cpu, Lock, ChevronDown, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../../store';
import { db } from '../../db';
import { createGithubClient, type GitTreeEntry, type GithubRepo, type GithubTreeResponse } from '../../services/github/githubClient';
import { listFiles } from '../../services/fs/vfs';
import { binaryExtensions } from '../../services/fs/zipExport';
import { scanFilesForSecrets, type SecretMatch } from '../../services/security/secretScan';
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
  const [repoSearchInput, setRepoSearchInput] = useState('');
  const [availableRepos, setAvailableRepos] = useState<GithubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [hasFetchedRepos, setHasFetchedRepos] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const comboboxRef = useRef<HTMLDivElement>(null);
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
  
  const [secretWarnings, setSecretWarnings] = useState<SecretMatch[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [createdBranch, setCreatedBranch] = useState<string | null>(null);
  const [createdRepoUrl, setCreatedRepoUrl] = useState<string | null>(null);

  // Close combobox dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (comboboxRef.current && !comboboxRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Fetch available repositories for existing mode
  useEffect(() => {
    if (!keys || mode !== 'existing' || hasFetchedRepos) return;

    let active = true;
    const fetchRepos = async () => {
      setLoadingRepos(true);
      try {
        const client = await createGithubClient(keys);
        const repos = await client.listRepos();
        if (active && Array.isArray(repos)) {
          setAvailableRepos(repos);
          setHasFetchedRepos(true);
        }
      } catch (_err) {
        // Fail silently without blocking the form
      } finally {
        if (active) {
          setLoadingRepos(false);
        }
      }
    };

    fetchRepos();
    return () => {
      active = false;
    };
  }, [keys, mode, hasFetchedRepos]);

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
          if (parsed.owner && parsed.repo) {
            setRepoSearchInput(`${parsed.owner}/${parsed.repo}`);
          } else if (parsed.repo) {
            setRepoSearchInput(parsed.repo);
          }
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

  const handleRepoInputChange = (val: string) => {
    setRepoSearchInput(val);
    setIsDropdownOpen(true);
    const trimmed = val.trim();
    if (trimmed.includes('/')) {
      const parts = trimmed.split('/');
      setOwner(parts[0].trim());
      setRepo(parts.slice(1).join('/').trim());
    } else {
      setOwner('');
      setRepo(trimmed);
    }
  };

  const handleSelectRepo = (selected: GithubRepo) => {
    const rOwner = selected.owner?.login || (selected.full_name ? selected.full_name.split('/')[0] : '');
    const rName = selected.name || (selected.full_name ? selected.full_name.split('/')[1] : '');
    const rFullName = selected.full_name || `${rOwner}/${rName}`;

    setOwner(rOwner);
    setRepo(rName);
    setRepoSearchInput(rFullName);
    if (selected.default_branch) {
      setBaseBranch(selected.default_branch);
    }
    setIsBaseBranchEdited(false);
    setIsDropdownOpen(false);
  };

  const handleUseManual = () => {
    const trimmed = repoSearchInput.trim();
    if (trimmed.includes('/')) {
      const parts = trimmed.split('/');
      setOwner(parts[0].trim());
      setRepo(parts.slice(1).join('/').trim());
    } else {
      setOwner('');
      setRepo(trimmed);
    }
    setIsDropdownOpen(false);
  };

  const filterQuery = repoSearchInput.trim().toLowerCase();
  const filteredRepos = availableRepos.filter(r => {
    const fullName = (r.full_name || `${r.owner?.login || ''}/${r.name}`).toLowerCase();
    return fullName.includes(filterQuery);
  });

  const handlePush = async (e?: React.FormEvent, forceBypass: boolean = false) => {
    if (e) e.preventDefault();
    if (!keys) return;
    if (mode === 'existing' && (!owner || !repo)) return;
    if (mode === 'create' && !newRepoName.trim()) return;
    
    setLoading(true);
    setError(null);
    setPrUrl(null);
    setCreatedBranch(null);
    setCreatedRepoUrl(null);
    
    try {
      setProgress('Analyzing local changes...');
      const localFiles = await listFiles(projectId);
      if (localFiles.length === 0) {
        throw new Error('Project contains no files to push.');
      }

      // Check for secret warnings before proceeding
      if (!forceBypass) {
        const findings = scanFilesForSecrets(localFiles);
        if (findings.length > 0) {
          setSecretWarnings(findings);
          setLoading(false);
          return;
        }
      }

      const client = await createGithubClient(keys);
      const targetBranch = (newBranch || defaultBranchName).trim();
      
      let finalOwner = owner.trim();
      let finalRepo = repo.trim();
      let finalBaseBranch = baseBranch;
      
      let baseCommitSha = '';
      let baseTreeSha = '';
      let treeData: GithubTreeResponse = { sha: '', tree: [] };

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
      setSecretWarnings(null);
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
      <div className="bg-surface border border-border p-5 rounded-lg shadow-2xl w-full max-w-md relative corner-ticks max-h-[90vh] overflow-y-auto">
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
        ) : secretWarnings && secretWarnings.length > 0 ? (
          /* Secret Detection Warning View */
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="p-4 bg-oxide/10 border border-oxide/30 rounded-xl space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-oxide/20 rounded-lg border border-oxide/40 text-oxide shrink-0 mt-0.5">
                  <AlertTriangle size={18} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-text">Potential Secrets Detected Before Pushing</h3>
                  <p className="text-[11px] text-muted leading-relaxed font-sans">
                    The push scanner detected <span className="text-oxide font-bold">{secretWarnings.length}</span> potential secret{secretWarnings.length > 1 ? 's' : ''} or credential pattern{secretWarnings.length > 1 ? 's' : ''} in your workspace files. Pushing will upload these files to GitHub.
                  </p>
                </div>
              </div>

              <div className="bg-bg/90 border border-border/80 rounded-lg p-2 max-h-52 overflow-y-auto space-y-2">
                {secretWarnings.map((item, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-2 bg-surface/80 rounded border border-border/60 text-[11px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-text font-mono font-bold truncate">{item.file}</span>
                      <span className="text-[10px] text-muted font-sans shrink-0">
                        {item.line > 0 ? `Line ${item.line}` : '(file)'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-oxide/15 text-oxide border border-oxide/30 font-sans">
                        {item.pattern}
                      </span>
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-bg text-muted font-mono border border-border">
                        {item.preview}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
              <button
                type="button"
                onClick={() => {
                  setSecretWarnings(null);
                }}
                className="px-4 py-2 bg-surface hover:bg-surface-elevated text-muted hover:text-text border border-border rounded-lg text-xs transition-colors cursor-pointer font-sans"
              >
                Cancel & Review Files
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handlePush(undefined, true)}
                className="px-5 py-2 bg-oxide hover:bg-oxide/90 text-white font-bold font-sans rounded-lg text-xs transition-all flex items-center gap-2 cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <GitBranch size={13} />}
                <span>Push anyway</span>
              </button>
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
                  setSecretWarnings(null);
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
                  setSecretWarnings(null);
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
                <div className="relative" ref={comboboxRef}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-sans text-muted">
                      Repository <span className="text-[10px] text-muted/70">(owner/repo)</span>
                    </label>
                    {loadingRepos && (
                      <span className="flex items-center gap-1 text-[10px] font-sans text-muted">
                        <Loader2 size={10} className="animate-spin" />
                        <span>Fetching repos...</span>
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input 
                      type="text"
                      value={repoSearchInput}
                      onChange={e => handleRepoInputChange(e.target.value)}
                      onFocus={() => setIsDropdownOpen(true)}
                      placeholder="owner/repo (e.g. facebook/react)"
                      required
                      disabled={loading}
                      className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-sm focus:border-accent focus:outline-none disabled:opacity-50 pr-8"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setIsDropdownOpen(prev => !prev)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-text p-1 cursor-pointer"
                      aria-label="Toggle repository list"
                    >
                      <ChevronDown size={14} className={`transition-transform duration-150 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {isDropdownOpen && (
                    <div 
                      role="listbox"
                      className="absolute left-0 right-0 top-full mt-1 bg-surface border border-border rounded-md shadow-xl z-20 max-h-52 overflow-y-auto divide-y divide-border/50"
                    >
                      {filteredRepos.length > 0 ? (
                        filteredRepos.map((r) => {
                          const rOwner = r.owner?.login || (r.full_name ? r.full_name.split('/')[0] : '');
                          const rName = r.name || (r.full_name ? r.full_name.split('/')[1] : '');
                          const rFullName = r.full_name || `${rOwner}/${rName}`;
                          const isSelected = owner === rOwner && repo === rName;

                          return (
                            <button
                              key={r.id || rFullName}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onClick={() => handleSelectRepo(r)}
                              className={`w-full text-left px-3 py-2.5 text-xs font-sans flex items-center justify-between min-h-[44px] hover:bg-bg/80 transition-colors cursor-pointer ${
                                isSelected ? 'bg-accent/10 text-accent font-semibold' : 'text-text'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 truncate">
                                {r.private ? (
                                  <Lock size={12} className="text-muted shrink-0" aria-label="Private repository" />
                                ) : (
                                  <GithubIcon size={12} className="text-muted shrink-0" />
                                )}
                                <span className="truncate">{rFullName}</span>
                              </div>
                              {r.default_branch && (
                                <span className="text-[10px] font-mono text-muted shrink-0 ml-2 px-1.5 py-0.5 rounded bg-bg border border-border/50">
                                  {r.default_branch}
                                </span>
                              )}
                            </button>
                          );
                        })
                      ) : repoSearchInput.trim() ? (
                        <div className="px-3 py-2.5 text-xs text-muted font-sans text-center">
                          No matching repositories
                        </div>
                      ) : (
                        <div className="px-3 py-2.5 text-xs text-muted font-sans text-center">
                          {loadingRepos ? 'Loading repositories...' : 'No repositories found'}
                        </div>
                      )}

                      {repoSearchInput.trim() && (
                        <button
                          type="button"
                          onClick={handleUseManual}
                          className="w-full text-left px-3 py-2.5 text-xs font-sans text-muted hover:text-text hover:bg-bg/80 transition-colors flex items-center gap-2 min-h-[44px] cursor-pointer bg-surface border-t border-border"
                        >
                          <span className="text-accent font-medium truncate">
                            Use &ldquo;{repoSearchInput.trim()}&rdquo; manually
                          </span>
                        </button>
                      )}
                    </div>
                  )}
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
