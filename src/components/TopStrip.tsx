import React, { useState } from 'react';
import { Database, CheckCircle2, AlertTriangle, Lock, X, Moon, Sun, Loader2 } from 'lucide-react';
import { useAppStore } from '../store';

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export function TopStrip({ dbTested }: { dbTested: boolean }) {
  const { tokenUsage, pendingPatches, setKeys, setChatHistory, lockVault, theme, toggleTheme } = useAppStore();
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const total = tokenUsage.system + tokenUsage.codebase + tokenUsage.chat;
  const max = tokenUsage.max || 200000;
  
  const pSystem = Math.min(100, (tokenUsage.system / max) * 100);
  const pCodebase = Math.min(100, (tokenUsage.codebase / max) * 100);
  const pChat = Math.min(100, (tokenUsage.chat / max) * 100);
  const pTotal = Math.min(100, (total / max) * 100);
  const isNearFull = pTotal >= 85;

  const performLock = () => {
    if (lockVault) {
      lockVault();
    } else {
      setKeys(null);
      setChatHistory([]);
    }
  };

  const handleLockClick = () => {
    if (pendingPatches.length > 0) {
      setShowConfirmModal(true);
    } else {
      performLock();
    }
  };

  return (
    <div className="h-[28px] shrink-0 bg-surface flex flex-col justify-center px-2.5 sm:px-3 border-b border-border relative group">
      {/* 1px Signature Accent Hairline along the status bar bottom edge */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-accent/60 z-20 pointer-events-none" />

      {/* Background token bar with accent fill and opacity stepping */}
      <div className="absolute inset-0 pointer-events-none flex overflow-hidden">
        <div 
          className="h-full bg-accent/30 transition-all duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${pSystem}%` }}
          title={`System Prompt: ${tokenUsage.system.toLocaleString()} tokens`}
        />
        <div 
          className="h-full bg-accent/20 transition-all duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${pCodebase}%` }}
          title={`File Manifest: ${tokenUsage.codebase.toLocaleString()} tokens`}
        />
        <div 
          className="h-full bg-accent/10 transition-all duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${pChat}%` }}
          title={`Chat History: ${tokenUsage.chat.toLocaleString()} tokens`}
        />
      </div>

      <div className="relative z-10 flex items-center justify-between text-[11px] text-muted font-sans w-full min-w-0 gap-1.5">
        <div className="flex items-center gap-1 shrink-0 font-mono text-[10px] sm:text-[11px]">
          <Database size={11} className={dbTested ? 'text-moss' : 'text-accent animate-pulse'} />
          <span className="font-mono">{dbTested ? 'DB:READY' : 'DB:INIT'}</span>
        </div>
        
        {/* Token context & percentage slot: preserved in all states to prevent layout shift */}
        <div 
          className={`flex items-center gap-1 text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded transition-colors ${
            isNearFull ? 'bg-oxide/20 text-oxide font-medium' : 'text-muted'
          }`}
          title={total > 0 ? `Context Window: ${total.toLocaleString()}${tokenUsage.isEstimate ? ' (estimated)' : ''} / ${max.toLocaleString()} tokens (${pTotal.toFixed(1)}%)` : (dbTested ? `Tokens: 0 / ${formatTokens(max)}` : 'Initializing DB...')}
        >
          {isNearFull && <AlertTriangle size={10} className="text-oxide shrink-0" />}
          <span className="hidden sm:inline font-mono">Tokens: </span>
          <span className="font-mono text-[10px]">{formatTokens(total)}{tokenUsage.isEstimate ? '*' : ''}/{formatTokens(max)}</span>
          {dbTested ? (
            <span className="text-[9px] opacity-80 font-mono">({Math.round(pTotal)}%)</span>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-accent font-mono" title="Initializing context">
              (<Loader2 size={8} className="animate-spin" />)
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 text-[10px] sm:text-[11px]">
          {/* Status indicator slot: preserved in all states to prevent layout shift */}
          <span className={`flex items-center gap-0.5 font-mono text-[10px] ${dbTested ? 'text-moss' : 'text-accent'}`}>
            {dbTested ? (
              <>
                <CheckCircle2 size={10} />
                <span className="hidden xs:inline">LIVE</span>
              </>
            ) : (
              <>
                <Loader2 size={10} className="animate-spin" />
                <span className="hidden xs:inline">INIT</span>
              </>
            )}
          </span>

          {/* Quick theme toggle button */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1 px-1.5 py-0.5 bg-surface hover:bg-accent/15 text-muted hover:text-accent border border-border hover:border-accent/40 rounded transition-colors cursor-pointer shadow-xs active:scale-95"
            title={`Theme: ${theme === 'oled' ? 'OLED (Vault)' : 'Paper (Blueprint)'} - Click to switch`}
            aria-label={`Toggle theme, current is ${theme}`}
          >
            {theme === 'oled' ? (
              <>
                <Moon size={10} className="text-accent" />
                <span className="font-mono text-[9px] tracking-tight hidden xs:inline uppercase">OLED</span>
              </>
            ) : (
              <>
                <Sun size={10} className="text-accent" />
                <span className="font-mono text-[9px] tracking-tight hidden xs:inline uppercase">PAPER</span>
              </>
            )}
          </button>

          <button
            onClick={handleLockClick}
            className="flex items-center gap-1 px-1.5 py-0.5 bg-surface hover:bg-oxide/15 text-muted hover:text-oxide border border-border/80 hover:border-oxide/40 rounded transition-colors cursor-pointer shadow-xs active:scale-95"
            title="Lock Vault"
            aria-label="Lock Vault"
          >
            <Lock size={10} className="shrink-0" />
            <span className="font-mono text-[10px] font-medium uppercase">Lock</span>
          </button>
        </div>
      </div>

      {/* Confirmation Modal when pending patches exist */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-bg border border-oxide/40 rounded-xl max-w-sm w-full p-5 shadow-2xl flex flex-col gap-4 font-sans text-left corner-ticks">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5 text-oxide">
                <div className="p-2 bg-oxide/10 border border-oxide/30 rounded-lg">
                  <Lock size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-mono font-bold text-text">Lock Vault?</h3>
                  <p className="text-[10px] font-mono text-oxide font-semibold">Pending Patches Unreviewed</p>
                </div>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-muted hover:text-text p-1 cursor-pointer transition-colors"
                aria-label="Cancel"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 text-xs text-muted leading-relaxed border-y border-border py-3">
              <p>
                You have <span className="text-text font-bold font-mono">{pendingPatches.length} pending patch{pendingPatches.length > 1 ? 'es' : ''}</span> waiting for review.
              </p>
              <p className="text-[11px] text-text/90 font-sans">
                Locking the vault will not lose your local workspace files, but you will need to re-unlock the vault to continue reviewing pending patches.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-3 py-1.5 bg-surface border border-border hover:bg-black/5 text-text rounded text-xs transition-colors cursor-pointer font-sans"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  performLock();
                }}
                className="px-3 py-1.5 bg-oxide hover:bg-oxide/90 text-white font-mono font-bold text-xs rounded transition-colors flex items-center gap-1.5 cursor-pointer shadow"
              >
                <Lock size={13} />
                <span>Lock Vault</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


