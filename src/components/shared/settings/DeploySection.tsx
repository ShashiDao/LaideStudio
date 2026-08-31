import React, { useState, useEffect } from 'react';
import { Rocket, ExternalLink, Save, CheckCircle2 } from 'lucide-react';
import { db } from '../../../db';
import { useAppStore } from '../../../store';

export function DeploySection() {
  const { keys } = useAppStore();

  const [githubPatInput, setGithubPatInput] = useState('');
  const [githubPatSaved, setGithubPatSaved] = useState(false);

  const [netlifyTokenInput, setNetlifyTokenInput] = useState('');
  const [netlifyTokenSaved, setNetlifyTokenSaved] = useState(false);

  const [vercelTokenInput, setVercelTokenInput] = useState('');
  const [vercelTokenSaved, setVercelTokenSaved] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchTokens = async () => {
      if (!keys) return;
      try {
        const { decryptData } = await import('../../../services/security/crypto');
        const patRecord = await db.secureTokens.get('github_pat');
        if (patRecord && active) {
          const dec = await decryptData(keys.aesKey, patRecord.encryptedValue);
          setGithubPatInput(dec);
        }

        const netlifyRecord = await db.secureTokens.get('netlify_token');
        if (netlifyRecord && active) {
          const dec = await decryptData(keys.aesKey, netlifyRecord.encryptedValue);
          setNetlifyTokenInput(dec);
        }

        const vercelRecord = await db.secureTokens.get('vercel_token');
        if (vercelRecord && active) {
          const dec = await decryptData(keys.aesKey, vercelRecord.encryptedValue);
          setVercelTokenInput(dec);
        }
      } catch (err) {
        console.error('Failed to load tokens', err);
      }
    };
    fetchTokens();
    return () => {
      active = false;
    };
  }, [keys]);

  const handleSaveGithubPat = async (e: React.FormEvent) => {
    e.preventDefault();
    const { encryptData } = await import('../../../services/security/crypto');
    if (!keys) return;
    try {
      const enc = await encryptData(keys.aesKey, githubPatInput);
      await db.secureTokens.put({ key: 'github_pat', encryptedValue: enc });
      setGithubPatSaved(true);
      setTimeout(() => setGithubPatSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save GitHub PAT', err);
    }
  };

  const handleSaveNetlify = async (e: React.FormEvent) => {
    e.preventDefault();
    const { encryptData } = await import('../../../services/security/crypto');
    if (!keys) return;
    try {
      if (!netlifyTokenInput.trim()) {
        await db.secureTokens.delete('netlify_token');
      } else {
        const enc = await encryptData(keys.aesKey, netlifyTokenInput.trim());
        await db.secureTokens.put({ key: 'netlify_token', encryptedValue: enc });
      }
      setNetlifyTokenSaved(true);
      setTimeout(() => setNetlifyTokenSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save Netlify token', err);
    }
  };

  const handleSaveVercel = async (e: React.FormEvent) => {
    e.preventDefault();
    const { encryptData } = await import('../../../services/security/crypto');
    if (!keys) return;
    try {
      if (!vercelTokenInput.trim()) {
        await db.secureTokens.delete('vercel_token');
      } else {
        const enc = await encryptData(keys.aesKey, vercelTokenInput.trim());
        await db.secureTokens.put({ key: 'vercel_token', encryptedValue: enc });
      }
      setVercelTokenSaved(true);
      setTimeout(() => setVercelTokenSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save Vercel token', err);
    }
  };

  return (
    <div className="space-y-4">
      {/* GitHub Integration Form */}
      <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-sans text-accent">GitHub Integration</h3>
        </div>
        
        <form onSubmit={handleSaveGithubPat} className="space-y-4">
          <div>
            <label className="block text-xs font-sans text-muted mb-1">
              Personal Access Token
            </label>
            <input 
              type="password"
              value={githubPatInput}
              onChange={e => setGithubPatInput(e.target.value)}
              placeholder="ghp_..."
              className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-sm focus:border-accent focus:outline-none placeholder-neutral-500"
            />
            <p className="text-[10px] text-muted mt-1">
              Used for importing and exporting repositories. Stored encrypted.
            </p>
          </div>
          
          <button 
            type="submit"
            className="w-full py-2.5 bg-accent text-surface font-sans font-bold rounded flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors cursor-pointer"
          >
            {githubPatSaved ? <CheckCircle2 size={16} /> : <Save size={16} />}
            {githubPatSaved ? 'Saved' : 'Save GitHub Token'}
          </button>
        </form>
      </div>

      {/* 1-Click Deploy & Hosting Tokens (Netlify & Vercel) */}
      <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Rocket size={16} className="text-accent shrink-0" />
            <h3 className="text-sm font-sans text-accent font-semibold">1-Click Live Deploy Tokens</h3>
          </div>
          <p className="text-xs text-muted font-sans leading-relaxed break-words">
            Configure tokens for 1-click publishing directly to Netlify or Vercel edge CDN. All tokens are encrypted with your vault master key.
          </p>
        </div>

        {/* Netlify Token */}
        <form onSubmit={handleSaveNetlify} className="space-y-3 pt-3 border-t border-border/60">
          <div className="flex items-center justify-between">
            <label className="text-xs font-sans text-text font-medium flex items-center gap-1.5">
              <span>Netlify Personal Access Token</span>
            </label>
            <a 
              href="https://app.netlify.com/user/applications#personal-access-tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-accent hover:underline flex items-center gap-1 font-sans"
            >
              <span>Get Netlify Token</span>
              <ExternalLink size={10} />
            </a>
          </div>
          <input 
            type="password"
            value={netlifyTokenInput}
            onChange={e => setNetlifyTokenInput(e.target.value)}
            placeholder="nfp_..."
            className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-mono text-sm focus:border-accent focus:outline-none placeholder-neutral-500"
          />
          <button 
            type="submit"
            className="w-full py-2 bg-surface hover:bg-surface-elevated text-text border border-border font-sans font-bold text-xs rounded flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {netlifyTokenSaved ? <CheckCircle2 size={14} className="text-moss" /> : <Save size={14} />}
            {netlifyTokenSaved ? 'Netlify Token Saved' : 'Save Netlify Token'}
          </button>
        </form>

        {/* Vercel Token */}
        <form onSubmit={handleSaveVercel} className="space-y-3 pt-3 border-t border-border/60">
          <div className="flex items-center justify-between">
            <label className="text-xs font-sans text-text font-medium flex items-center gap-1.5">
              <span>Vercel API Token</span>
            </label>
            <a 
              href="https://vercel.com/account/tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-accent hover:underline flex items-center gap-1 font-sans"
            >
              <span>Get Vercel Token</span>
              <ExternalLink size={10} />
            </a>
          </div>
          <input 
            type="password"
            value={vercelTokenInput}
            onChange={e => setVercelTokenInput(e.target.value)}
            placeholder="vck_..."
            className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-mono text-sm focus:border-accent focus:outline-none placeholder-neutral-500"
          />
          <button 
            type="submit"
            className="w-full py-2 bg-surface hover:bg-surface-elevated text-text border border-border font-sans font-bold text-xs rounded flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {vercelTokenSaved ? <CheckCircle2 size={14} className="text-moss" /> : <Save size={14} />}
            {vercelTokenSaved ? 'Vercel Token Saved' : 'Save Vercel Token'}
          </button>
        </form>
      </div>
    </div>
  );
}
