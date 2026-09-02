import React, { useState, useEffect } from 'react';
import { 
  X, 
  Globe, 
  Rocket, 
  ExternalLink, 
  Copy, 
  Check, 
  Loader2, 
  ShieldCheck, 
  AlertCircle, 
  AlertTriangle,
  History, 
  Trash2, 
  Clock
} from 'lucide-react';
import type { Project } from '../../db';
import { useAppStore } from '../../store';
import { 
  buildDeployPackage, 
  deployToNetlify, 
  deployToVercel, 
  deployToCloudflarePages,
  getDeployToken, 
  saveDeployToken, 
  deleteDeployToken,
  getDeployHistory, 
  clearDeployHistory, 
  type DeployResult,
  type DeployPackage
} from '../../services/deploy/deployClient';
import type { SecretMatch } from '../../services/security/secretScan';
import { listFiles } from '../../services/fs/vfs';
import { EmptyState } from '../shared/EmptyState';

function NetlifyIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="currentColor" 
      className={className}
    >
      <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.236L19.553 8 12 11.764 4.447 8 12 4.236zM4 9.447l7 3.5v7.606l-7-3.5V9.447zm9 11.106v-7.606l7-3.5v7.606l-7 3.5z" />
    </svg>
  );
}

function VercelIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="currentColor" 
      className={className}
    >
      <path d="M12 1L24 22H0L12 1Z" />
    </svg>
  );
}

function CloudflareIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="currentColor" 
      className={className}
    >
      <path d="M16.59 8.24a4.19 4.19 0 0 0-3.32-1.63 4.2 4.2 0 0 0-4.06 3.12 3.12 3.12 0 0 0-.82-.12A3.16 3.16 0 0 0 5.23 12.7 3.12 3.12 0 0 0 5.5 13H5a2.53 2.53 0 0 0-2.5 2.56c0 1.4 1.15 2.55 2.56 2.55h14.28c1.78 0 3.22-1.42 3.22-3.17s-1.42-3.18-3.17-3.21a4.23 4.23 0 0 0-2.8-3.49z"/>
    </svg>
  );
}

interface DeployModalProps {
  project: Project;
  onClose: () => void;
}

export function DeployModal({ project, onClose }: DeployModalProps) {
  const { keys, addToast } = useAppStore();
  const [activeTab, setActiveTab] = useState<'netlify' | 'vercel' | 'cloudflare' | 'history'>('netlify');
  
  const [siteName, setSiteName] = useState(() => {
    return project.name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36) || 'laide-app';
  });

  const [tokenInput, setTokenInput] = useState('');
  const [accountIdInput, setAccountIdInput] = useState('');
  const [hasSavedToken, setHasSavedToken] = useState(false);
  const [saveTokenToVault, setSaveTokenToVault] = useState(true);
  
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployStep, setDeployStep] = useState<string>('');
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deploySuccess, setDeploySuccess] = useState<DeployResult | null>(null);
  
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [historyItems, setHistoryItems] = useState<DeployResult[]>([]);
  const [secretWarnings, setSecretWarnings] = useState<SecretMatch[] | null>(null);
  const [pendingDeployPkg, setPendingDeployPkg] = useState<DeployPackage | null>(null);

  // Load saved token and history on mount or tab change
  useEffect(() => {
    let active = true;

    async function loadProviderInfo() {
      setDeployError(null);
      setDeploySuccess(null);
      setSecretWarnings(null);
      setPendingDeployPkg(null);
      const history = getDeployHistory(project.id);
      if (active) setHistoryItems(history);

      if (activeTab === 'history') return;

      const provider = activeTab === 'netlify' ? 'netlify' : activeTab === 'vercel' ? 'vercel' : 'cloudflare';
      const saved = await getDeployToken(keys, provider);
      if (active) {
        if (saved) {
          if (typeof saved === 'object' && saved !== null) {
            setTokenInput(saved.token);
            setAccountIdInput(saved.accountId);
          } else if (typeof saved === 'string') {
            setTokenInput(saved);
            setAccountIdInput('');
          }
          setHasSavedToken(true);
        } else {
          setTokenInput('');
          setAccountIdInput('');
          setHasSavedToken(false);
        }
      }
    }

    loadProviderInfo();

    return () => {
      active = false;
    };
  }, [activeTab, project.id, keys]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeploying) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDeploying, onClose]);

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      addToast('Live URL copied to clipboard!', 'success');
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      addToast('Failed to copy URL', 'error');
    }
  };

  const handleDeploy = async (e?: React.FormEvent, forceBypass: boolean = false) => {
    if (e) e.preventDefault();
    if (isDeploying) return;

    setIsDeploying(true);
    setDeployError(null);
    setDeploySuccess(null);
    setDeployStep('Reading project workspace files...');

    try {
      let deployPkg = pendingDeployPkg;

      if (!deployPkg) {
        // 1. Fetch files
        const projectFiles = await listFiles(project.id);
        if (projectFiles.length === 0) {
          throw new Error('Project contains no files to deploy.');
        }

        // 2. Build deployment package (bundles TS/React if detected and scans secrets)
        deployPkg = await buildDeployPackage(projectFiles, (status) => {
          setDeployStep(status);
        });
      }

      // Check for secret warnings before proceeding
      if (!forceBypass && deployPkg.secretWarnings && deployPkg.secretWarnings.length > 0) {
        setSecretWarnings(deployPkg.secretWarnings);
        setPendingDeployPkg(deployPkg);
        setIsDeploying(false);
        return;
      }

      // 3. Save token if requested and keys exist
      if (tokenInput.trim() && saveTokenToVault && keys) {
        const provider = activeTab === 'netlify' ? 'netlify' : activeTab === 'vercel' ? 'vercel' : 'cloudflare';
        await saveDeployToken(keys, provider, tokenInput.trim(), accountIdInput.trim());
        setHasSavedToken(true);
      }

      // 4. Execute provider deploy
      let result: DeployResult;
      if (activeTab === 'netlify') {
        result = await deployToNetlify({
          token: tokenInput.trim() || undefined,
          siteName: siteName.trim() || undefined,
          projectId: project.id,
          zipBlob: deployPkg.zipBlob,
          onProgress: (status) => setDeployStep(status)
        });
      } else if (activeTab === 'vercel') {
        if (!tokenInput.trim()) {
          throw new Error('Vercel API Token is required to deploy to Vercel.');
        }
        result = await deployToVercel({
          token: tokenInput.trim(),
          projectName: siteName.trim() || 'laide-app',
          projectId: project.id,
          files: deployPkg.staticFiles,
          onProgress: (status) => setDeployStep(status)
        });
      } else {
        if (!tokenInput.trim() || !accountIdInput.trim()) {
          throw new Error('Cloudflare API Token and Account ID are required.');
        }
        result = await deployToCloudflarePages({
          apiToken: tokenInput.trim(),
          accountId: accountIdInput.trim(),
          projectName: siteName.trim() || 'laide-app',
          projectId: project.id,
          files: deployPkg.staticFiles,
          onProgress: (status) => setDeployStep(status)
        });
      }

      setSecretWarnings(null);
      setPendingDeployPkg(null);
      setDeploySuccess(result);
      setHistoryItems(getDeployHistory(project.id));
      addToast(`Successfully published to ${activeTab === 'netlify' ? 'Netlify' : activeTab === 'vercel' ? 'Vercel' : 'Cloudflare'}!`, 'success');
    } catch (err: unknown) {
      console.error('Deploy failed', err);
      const errMsg = err instanceof Error ? err.message : 'Deployment failed. Please check your token and site settings.';
      setDeployError(errMsg);
      addToast('Deployment failed', 'error');
    } finally {
      setIsDeploying(false);
    }
  };

  const handleClearHistory = () => {
    clearDeployHistory(project.id);
    setHistoryItems([]);
    addToast('Deployment history cleared', 'info');
  };

  const handleDeleteToken = async () => {
    const provider = activeTab === 'netlify' ? 'netlify' : activeTab === 'vercel' ? 'vercel' : 'cloudflare';
    await deleteDeployToken(provider);
    setTokenInput('');
    setAccountIdInput('');
    setHasSavedToken(false);
    addToast(`${activeTab === 'netlify' ? 'Netlify' : activeTab === 'vercel' ? 'Vercel' : 'Cloudflare'} token removed from vault`, 'info');
  };

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deploy-modal-title"
    >
      <div 
        className="bg-surface border border-border/90 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden font-mono text-xs flex flex-col max-h-[90vh] corner-ticks"
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-border/80 bg-surface-elevated/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-accent/15 text-accent border border-accent/30 shrink-0 shadow-xs">
              <Rocket size={16} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="deploy-modal-title" className="text-xs font-bold text-text uppercase tracking-wider truncate">
                  Publish Live Web App
                </h2>
                <span className="px-1.5 py-0.2 bg-surface text-accent text-[9px] rounded border border-accent/30 shrink-0">
                  {project.name}
                </span>
              </div>
              <p className="text-[10px] text-muted truncate">
                1-Click Live Deployment & Instant URL Sharing
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeploying}
            aria-label="Close publish dialog"
            className="p-1 text-muted hover:text-text rounded-md hover:bg-surface-elevated transition-colors cursor-pointer disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        {/* Provider Tabs */}
        <div className="flex border-b border-border/60 bg-bg/40 px-3 pt-2 gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (!isDeploying) setActiveTab('netlify');
            }}
            disabled={isDeploying}
            className={`flex items-center gap-2 px-3 py-2 rounded-t-lg font-sans text-xs font-medium transition-all cursor-pointer border-t border-x ${
              activeTab === 'netlify'
                ? 'bg-surface text-accent border-border/80 -mb-[1px] border-b-transparent shadow-xs'
                : 'text-muted hover:text-text border-transparent hover:bg-surface/50'
            }`}
          >
            <NetlifyIcon size={14} className="text-[#00C7B7]" />
            <span>Netlify</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-moss/15 text-moss border border-moss/30 font-mono">
              Fast
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (!isDeploying) setActiveTab('vercel');
            }}
            disabled={isDeploying}
            className={`flex items-center gap-2 px-3 py-2 rounded-t-lg font-sans text-xs font-medium transition-all cursor-pointer border-t border-x ${
              activeTab === 'vercel'
                ? 'bg-surface text-accent border-border/80 -mb-[1px] border-b-transparent shadow-xs'
                : 'text-muted hover:text-text border-transparent hover:bg-surface/50'
            }`}
          >
            <VercelIcon size={13} className="text-text" />
            <span>Vercel</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (!isDeploying) setActiveTab('cloudflare');
            }}
            disabled={isDeploying}
            className={`flex items-center gap-2 px-3 py-2 rounded-t-lg font-sans text-xs font-medium transition-all cursor-pointer border-t border-x ${
              activeTab === 'cloudflare'
                ? 'bg-surface text-accent border-border/80 -mb-[1px] border-b-transparent shadow-xs'
                : 'text-muted hover:text-text border-transparent hover:bg-surface/50'
            }`}
          >
            <CloudflareIcon size={14} className="text-[#F38020]" />
            <span>Cloudflare</span>
          </button>

          <button
            type="button"
            aria-label="Past Deploys"
            onClick={() => {
              if (!isDeploying) setActiveTab('history');
            }}
            disabled={isDeploying}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg font-sans text-xs font-medium transition-all cursor-pointer border-t border-x ml-auto ${
              activeTab === 'history'
                ? 'bg-surface text-accent border-border/80 -mb-[1px] border-b-transparent shadow-xs'
                : 'text-muted hover:text-text border-transparent hover:bg-surface/50'
            }`}
          >
            <History size={13} />
            <span>Deploys</span>
            {historyItems.length > 0 && (
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-accent/15 text-accent font-mono">
                {historyItems.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'history' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-text uppercase tracking-wider">
                  Past Deploys for this Project
                </span>
                {historyItems.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    className="flex items-center gap-1 text-[10px] text-muted hover:text-error transition-colors cursor-pointer"
                  >
                    <Trash2 size={11} />
                    <span>Clear History</span>
                  </button>
                )}
              </div>

              {historyItems.length === 0 ? (
                <EmptyState
                  variant="subtle"
                  icon={<Globe size={22} />}
                  title={`No deploys yet for "${project.name}"`}
                  description="Switch to Netlify or Vercel tab to publish your live app URL in 1 click!"
                />
              ) : (
                <div className="space-y-2">
                  {historyItems.map((item) => (
                    <div 
                      key={item.id}
                      className="p-3 bg-surface-elevated/70 border border-border/80 rounded-xl flex flex-col gap-2 hover:border-accent/40 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {item.provider === 'netlify' ? (
                            <span className="p-1 rounded bg-[#00C7B7]/10 text-[#00C7B7] border border-[#00C7B7]/30 shrink-0">
                              <NetlifyIcon size={12} />
                            </span>
                          ) : (
                            <span className="p-1 rounded bg-text/10 text-text border border-text/30 shrink-0">
                              <VercelIcon size={11} />
                            </span>
                          )}
                          <span className="font-bold text-text text-xs truncate">
                            {item.siteName}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-surface text-muted border border-border shrink-0 uppercase">
                            {item.provider}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted flex items-center gap-1 shrink-0">
                          <Clock size={10} />
                          <span>{new Date(item.deployedAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 bg-bg/80 p-2 rounded-lg border border-border/60">
                        <a 
                          href={item.liveUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-accent hover:underline text-xs truncate flex items-center gap-1 min-w-0 font-mono"
                        >
                          <span className="truncate">{item.liveUrl}</span>
                          <ExternalLink size={11} className="shrink-0" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopyUrl(item.liveUrl)}
                          className="p-1 text-muted hover:text-accent rounded hover:bg-surface transition-colors cursor-pointer shrink-0"
                          title="Copy Live URL"
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : deploySuccess ? (
            /* Success View */
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="p-4 bg-moss/10 border border-moss/30 rounded-xl space-y-3">
                <div className="flex items-center gap-2.5 text-moss">
                  <div className="p-1.5 bg-moss/20 rounded-lg border border-moss/40">
                    <Check size={18} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-text">Your Project is Live!</h3>
                    <p className="text-[10px] text-moss">Deployed successfully to {deploySuccess.provider === 'netlify' ? 'Netlify' : 'Vercel'}</p>
                  </div>
                </div>

                <div className="bg-bg border border-border/80 rounded-lg p-3 space-y-2">
                  <div className="text-[10px] text-muted uppercase tracking-wider font-bold">
                    Live Shareable URL:
                  </div>
                  <div className="flex items-center justify-between gap-2 bg-surface p-2 rounded border border-border">
                    <a 
                      href={deploySuccess.liveUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-accent hover:underline text-xs sm:text-sm font-bold truncate flex items-center gap-1.5 font-mono"
                    >
                      <span className="truncate">{deploySuccess.liveUrl}</span>
                      <ExternalLink size={13} className="shrink-0 text-accent" />
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopyUrl(deploySuccess.liveUrl)}
                      className={`px-2.5 py-1.5 rounded text-xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0 font-medium ${
                        copiedUrl 
                          ? 'bg-moss text-white' 
                          : 'bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30'
                      }`}
                    >
                      {copiedUrl ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedUrl ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <a
                    href={deploySuccess.liveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 px-4 bg-accent text-accent-text-on font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-accent/90 transition-all cursor-pointer shadow-sm text-center"
                  >
                    <ExternalLink size={14} />
                    <span>Open Live Application</span>
                  </a>
                  {deploySuccess.adminUrl && (
                    <a
                      href={deploySuccess.adminUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2.5 px-3 bg-surface hover:bg-surface-elevated text-muted hover:text-text border border-border rounded-lg flex items-center justify-center gap-1.5 transition-colors text-center"
                    >
                      <span>Dashboard</span>
                    </a>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeploySuccess(null)}
                  className="px-3 py-1.5 bg-surface hover:bg-surface-elevated text-muted hover:text-text border border-border rounded-lg transition-colors cursor-pointer"
                >
                  Deploy Another Version
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 bg-surface-elevated hover:bg-accent hover:text-accent-text-on text-text border border-border rounded-lg transition-colors cursor-pointer"
                >
                  Done
                </button>
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
                    <h3 className="text-xs font-bold text-text">Potential Secrets Detected Before Publishing</h3>
                    <p className="text-[11px] text-muted leading-relaxed font-sans">
                      The deploy scanner detected <span className="text-oxide font-bold">{secretWarnings.length}</span> potential secret{secretWarnings.length > 1 ? 's' : ''} or credential pattern{secretWarnings.length > 1 ? 's' : ''} in your workspace files. Deploying will publish these files publicly to the hosting provider.
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
                    setPendingDeployPkg(null);
                  }}
                  className="px-4 py-2 bg-surface hover:bg-surface-elevated text-muted hover:text-text border border-border rounded-lg text-xs transition-colors cursor-pointer font-sans"
                >
                  Cancel & Review Files
                </button>
                <button
                  type="button"
                  disabled={isDeploying}
                  onClick={() => handleDeploy(undefined, true)}
                  className="px-5 py-2 bg-oxide hover:bg-oxide/90 text-white font-bold font-sans rounded-lg text-xs transition-all flex items-center gap-2 cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
                >
                  {isDeploying ? <Loader2 size={13} className="animate-spin" /> : <Rocket size={13} />}
                  <span>Deploy anyway</span>
                </button>
              </div>
            </div>
          ) : (
            /* Deploy Form */
            <form onSubmit={handleDeploy} className="space-y-4">
              {/* Provider Info Banner */}
              <div className="p-3 bg-surface-elevated/60 border border-border/70 rounded-xl flex items-start gap-2.5">
                {activeTab === 'netlify' ? (
                  <>
                    <NetlifyIcon size={16} className="text-[#00C7B7] shrink-0 mt-0.5" />
                    <div className="text-[11px] text-muted leading-relaxed font-sans">
                      <strong className="text-text font-mono">Netlify Direct Deploy</strong>: Automatically bundles your code and publishes a lightning-fast live URL on <span className="font-mono text-accent">*.netlify.app</span>.
                    </div>
                  </>
                ) : activeTab === 'vercel' ? (
                  <>
                    <VercelIcon size={14} className="text-text shrink-0 mt-0.5" />
                    <div className="text-[11px] text-muted leading-relaxed font-sans">
                      <strong className="text-text font-mono">Vercel Edge Deploy</strong>: Deploys your project static bundle directly to Vercel&apos;s global CDN edge network on <span className="font-mono text-accent">*.vercel.app</span>.
                    </div>
                  </>
                ) : (
                  <>
                    <CloudflareIcon size={16} className="text-[#F38020] shrink-0 mt-0.5" />
                    <div className="text-[11px] text-muted leading-relaxed font-sans">
                      <strong className="text-text font-mono">Cloudflare Pages Deploy</strong>: Deploys your project to Cloudflare Pages edge network on <span className="font-mono text-accent">*.pages.dev</span>.
                    </div>
                  </>
                )}
              </div>

              {/* Site / Project Name */}
              <div className="space-y-1.5">
                <label htmlFor="deploy-site-name" className="block text-[11px] font-sans font-medium text-text">
                  Site / Subdomain Name
                </label>
                <div className="relative flex items-center">
                  <input
                    id="deploy-site-name"
                    type="text"
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    disabled={isDeploying}
                    placeholder="my-cool-app"
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text font-mono text-xs focus:border-accent focus:outline-none disabled:opacity-50"
                  />
                  <span className="absolute right-3 text-[10px] text-muted pointer-events-none font-mono">
                    .{activeTab === 'netlify' ? 'netlify.app' : activeTab === 'vercel' ? 'vercel.app' : 'pages.dev'}
                  </span>
                </div>
                <p className="text-[10px] text-muted font-sans">
                  Use lowercase letters, numbers, and dashes.
                </p>
              </div>

              {activeTab === 'cloudflare' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="deploy-account-id" className="block text-[11px] font-sans font-medium text-text">
                      Cloudflare Account ID (Required)
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      id="deploy-account-id"
                      type="text"
                      value={accountIdInput}
                      onChange={(e) => setAccountIdInput(e.target.value)}
                      disabled={isDeploying}
                      placeholder="Enter Account ID from dashboard URL"
                      className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text font-mono text-xs focus:border-accent focus:outline-none disabled:opacity-50"
                    />
                  </div>
                </div>
              )}

              {/* API Token Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="deploy-token" className="block text-[11px] font-sans font-medium text-text">
                    {activeTab === 'netlify' ? 'Netlify Access Token (Optional / Recommended)' : activeTab === 'vercel' ? 'Vercel API Token (Required)' : 'Cloudflare API Token (Required)'}
                  </label>
                  <a
                    href={
                      activeTab === 'netlify'
                        ? 'https://app.netlify.com/user/applications#personal-access-tokens'
                        : activeTab === 'vercel'
                        ? 'https://vercel.com/account/tokens'
                        : 'https://dash.cloudflare.com/profile/api-tokens'
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-accent hover:underline flex items-center gap-1 font-sans"
                  >
                    <span>Get {activeTab === 'netlify' ? 'Netlify' : activeTab === 'vercel' ? 'Vercel' : 'Cloudflare'} Token</span>
                    <ExternalLink size={10} />
                  </a>
                </div>
                <div className="relative">
                  <input
                    id="deploy-token"
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    disabled={isDeploying}
                    placeholder={activeTab === 'netlify' ? 'nfp_... or leave empty for drop deploy' : activeTab === 'vercel' ? 'vck_...' : 'Cloudflare API Token...'}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-text font-mono text-xs focus:border-accent focus:outline-none disabled:opacity-50"
                  />
                  {hasSavedToken && (
                    <span className="absolute right-3 top-2.5 text-[9px] text-moss flex items-center gap-1 font-sans">
                      <ShieldCheck size={11} />
                      <span>Vault Saved</span>
                    </span>
                  )}
                </div>
                {hasSavedToken ? (
                  <div className="flex items-center justify-between text-[10px] font-sans pt-0.5">
                    <span className="text-moss flex items-center gap-1">
                      <ShieldCheck size={11} />
                      <span>Token securely stored in local encrypted vault</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleDeleteToken}
                      disabled={isDeploying}
                      className="text-error hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      title="Remove token from vault"
                    >
                      <Trash2 size={11} />
                      <span>Revoke / Delete Token</span>
                    </button>
                  </div>
                ) : activeTab === 'netlify' ? (
                  <p className="text-[10px] text-muted font-sans">
                    Providing a token links the site directly to your personal Netlify account.
                  </p>
                ) : null}
              </div>

              {/* Save token checkbox */}
              {tokenInput.trim() && (
                <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-muted font-sans">
                  <input
                    type="checkbox"
                    checked={saveTokenToVault}
                    onChange={(e) => setSaveTokenToVault(e.target.checked)}
                    disabled={isDeploying}
                    className="rounded border-border text-accent focus:ring-accent"
                  />
                  <span>Save token securely to encrypted vault for future deploys</span>
                </label>
              )}

              {/* Deploy Progress Status */}
              {isDeploying && (
                <div className="p-3 bg-accent/10 border border-accent/30 rounded-xl space-y-2 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2 text-accent font-sans text-xs font-medium">
                    <Loader2 size={14} className="animate-spin text-accent" />
                    <span>Publishing Live Site...</span>
                  </div>
                  <div className="text-[11px] font-mono text-text truncate">
                    {deployStep || 'Preparing bundle...'}
                  </div>
                  <div className="w-full h-1 bg-surface rounded-full overflow-hidden">
                    <div className="h-full bg-accent animate-pulse w-3/4 rounded-full" />
                  </div>
                </div>
              )}

              {/* Error Box */}
              {deployError && (
                <div className="p-3 bg-oxide/10 border border-oxide/30 rounded-xl flex items-start gap-2.5 text-oxide text-[11px] animate-in fade-in duration-150">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-bold font-sans">Deployment Error</span>
                    <p className="font-mono text-[10px] leading-relaxed break-all">{deployError}</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isDeploying}
                  className="px-4 py-2 bg-surface hover:bg-surface-elevated text-muted hover:text-text border border-border rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50 font-sans"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeploying || (activeTab === 'vercel' && !tokenInput.trim()) || (activeTab === 'cloudflare' && (!tokenInput.trim() || !accountIdInput.trim()))}
                  className="px-5 py-2 bg-accent hover:bg-accent/90 text-accent-text-on font-bold font-sans rounded-lg text-xs transition-all flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  {isDeploying ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Deploying...</span>
                    </>
                  ) : (
                    <>
                      <Rocket size={13} />
                      <span>Publish to {activeTab === 'netlify' ? 'Netlify' : activeTab === 'vercel' ? 'Vercel' : 'Cloudflare'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
