import React, { useState, useEffect } from 'react';
import { Save, Trash2, CheckCircle2, Plus, Rocket, ExternalLink } from 'lucide-react';
import { db } from '../../db';
import { useAppStore } from '../../store';
import { encryptData, decryptData } from '../../services/security/crypto';

export function SettingsIntegrationsTab() {
  const { keys, mcpServers, setMcpServers } = useAppStore();

  const [githubPatInput, setGithubPatInput] = useState('');
  const [githubPatSaved, setGithubPatSaved] = useState(false);

  const [netlifyTokenInput, setNetlifyTokenInput] = useState('');
  const [netlifyTokenSaved, setNetlifyTokenSaved] = useState(false);

  const [vercelTokenInput, setVercelTokenInput] = useState('');
  const [vercelTokenSaved, setVercelTokenSaved] = useState(false);

  const [mcpServerUrlInput, setMcpServerUrlInput] = useState('');
  const [mcpServersSaved, setMcpServersSaved] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadTokens() {
      if (!keys) return;
      
      const githubRecord = await db.secureTokens.get('github_pat');
      const enc = githubRecord?.encryptedValue;
      if (enc) {
        try {
          const dec = await decryptData(keys.aesKey, enc);
          if (active) setGithubPatInput(dec);
        } catch (_e) {
          console.warn('Could not decrypt GitHub PAT');
        }
      }

      const netlifyRecord = await db.secureTokens.get('netlify_token');
      const netlifyEnc = netlifyRecord?.encryptedValue;
      if (netlifyEnc) {
        try {
          const dec = await decryptData(keys.aesKey, netlifyEnc);
          if (active) setNetlifyTokenInput(dec);
        } catch (_e) {
          console.warn('Could not decrypt Netlify token');
        }
      }

      const vercelRecord = await db.secureTokens.get('vercel_token');
      const vercelEnc = vercelRecord?.encryptedValue;
      if (vercelEnc) {
        try {
          const dec = await decryptData(keys.aesKey, vercelEnc);
          if (active) setVercelTokenInput(dec);
        } catch (_e) {
          console.warn('Could not decrypt Vercel token');
        }
      }
    }
    loadTokens();
    return () => {
      active = false;
    };
  }, [keys]);

  const handleAddMcpServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keys || !mcpServerUrlInput.trim()) return;
    try {
      const newServers = [...mcpServers, { id: crypto.randomUUID(), url: mcpServerUrlInput.trim() }];
      setMcpServers(newServers);
      setMcpServerUrlInput('');
      const enc = await encryptData(keys.aesKey, JSON.stringify(newServers));
      localStorage.setItem('laide_mcp_servers', enc);
      setMcpServersSaved(true);
      setTimeout(() => setMcpServersSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save MCP server', err);
    }
  };

  const handleRemoveMcpServer = async (id: string) => {
    if (!keys) return;
    try {
      const newServers = mcpServers.filter(s => s.id !== id);
      setMcpServers(newServers);
      if (newServers.length === 0) {
        localStorage.removeItem('laide_mcp_servers');
      } else {
        const enc = await encryptData(keys.aesKey, JSON.stringify(newServers));
        localStorage.setItem('laide_mcp_servers', enc);
      }
    } catch (err) {
      console.error('Failed to remove MCP server', err);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* GitHub Integration Form */}
      <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-sans text-accent">GitHub Integration</h3>
        </div>
        
        <form onSubmit={async (e) => {
          e.preventDefault();
          if (!keys) return;
          try {
            const enc = await encryptData(keys.aesKey, githubPatInput);
            await db.secureTokens.put({ key: 'github_pat', encryptedValue: enc });
            setGithubPatSaved(true);
            setTimeout(() => setGithubPatSaved(false), 2000);
          } catch (err) {
            console.error('Failed to save GitHub PAT', err);
          }
        }} className="space-y-4">
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
        <form onSubmit={async (e) => {
          e.preventDefault();
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
        }} className="space-y-3 pt-3 border-t border-border/60">
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
        <form onSubmit={async (e) => {
          e.preventDefault();
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
        }} className="space-y-3 pt-3 border-t border-border/60">
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

      {/* MCP Servers Integration */}
      <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-sans text-accent">Model Context Protocol (MCP) Servers</h3>
        </div>
        
        <p className="text-xs text-muted font-sans mb-4 leading-relaxed">
          Connect streamable HTTP MCP servers (Server-Sent Events) to provide additional tools to the AI agent. Server URLs are stored encrypted in your local vault.
        </p>

        {mcpServers.length > 0 && (
          <div className="flex flex-col gap-2 mb-4">
            {mcpServers.map(server => (
              <div key={server.id} className="flex items-center justify-between bg-bg border border-border p-2 rounded">
                <span className="text-xs font-mono text-text truncate">{server.url}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveMcpServer(server.id)}
                  className="text-oxide hover:bg-oxide/20 p-1.5 rounded transition-colors cursor-pointer"
                  title="Remove Server"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAddMcpServer} className="space-y-4">
          <div>
            <label className="block text-xs font-sans text-muted mb-1">
              Add Server URL (SSE)
            </label>
            <input 
              type="url"
              value={mcpServerUrlInput}
              onChange={e => setMcpServerUrlInput(e.target.value)}
              placeholder="http://localhost:3001/sse"
              required
              className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-sm focus:border-accent focus:outline-none placeholder-neutral-500"
            />
          </div>
          
          <button 
            type="submit"
            className="w-full py-2.5 bg-accent text-surface font-sans font-bold rounded flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors cursor-pointer"
          >
            {mcpServersSaved ? <CheckCircle2 size={16} /> : <Plus size={16} />}
            {mcpServersSaved ? 'Added' : 'Add Server'}
          </button>
        </form>
      </div>
    </div>
  );
}
