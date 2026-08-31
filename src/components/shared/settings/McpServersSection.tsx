import React, { useState, useEffect } from 'react';
import { Trash2, Plus, CheckCircle2 } from 'lucide-react';
import { db } from '../../../db';
import { useAppStore } from '../../../store';

export function McpServersSection() {
  const { keys, mcpServers, setMcpServers } = useAppStore();

  const [mcpServerUrlInput, setMcpServerUrlInput] = useState('');
  const [mcpServersSaved, setMcpServersSaved] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchMcpServers = async () => {
      if (!keys) return;
      try {
        const { decryptData } = await import('../../../services/security/crypto');
        const mcpRecord = await db.secureTokens.get('mcp_servers');
        if (mcpRecord && active) {
          const dec = await decryptData(keys.aesKey, mcpRecord.encryptedValue);
          const parsed = JSON.parse(dec);
          setMcpServers(parsed);
        }
      } catch (err) {
        console.error('Failed to load MCP servers', err);
      }
    };
    fetchMcpServers();
    return () => {
      active = false;
    };
  }, [keys, setMcpServers]);

  const handleAddMcpServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keys || !mcpServerUrlInput.trim()) return;

    try {
      const { encryptData } = await import('../../../services/security/crypto');
      const newServer = { id: crypto.randomUUID(), url: mcpServerUrlInput.trim() };
      const updated = [...mcpServers, newServer];
      const encrypted = await encryptData(keys.aesKey, JSON.stringify(updated));

      await db.secureTokens.put({ key: 'mcp_servers', encryptedValue: encrypted });
      setMcpServers(updated);
      setMcpServerUrlInput('');
      setMcpServersSaved(true);
      setTimeout(() => setMcpServersSaved(false), 2000);
    } catch (err) {
      console.error('Failed to add MCP server', err);
    }
  };

  const handleRemoveMcpServer = async (id: string) => {
    if (!keys) return;
    try {
      const { encryptData } = await import('../../../services/security/crypto');
      const updated = mcpServers.filter(s => s.id !== id);
      const encrypted = await encryptData(keys.aesKey, JSON.stringify(updated));
      await db.secureTokens.put({ key: 'mcp_servers', encryptedValue: encrypted });
      setMcpServers(updated);
    } catch (err) {
      console.error('Failed to remove MCP server', err);
    }
  };

  return (
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
  );
}
