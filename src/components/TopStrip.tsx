import React, { useState } from 'react';
import { Lock, X, Moon, Sun, Terminal } from 'lucide-react';
import { useAppStore } from '../store';

export function TopStrip({ onOpenShortcuts }: { dbTested?: boolean; onOpenShortcuts?: () => void }) {
  const { pendingPatches, setKeys, setChatHistory, lockVault, theme, toggleTheme } = useAppStore();
  const [showConfirmModal, setShowConfirmModal] = useState(false);

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
    <header 
      role="banner"
      className="h-[34px] shrink-0 bg-surface flex items-center justify-between px-3 border-b border-border relative select-none"
    >
      {/* 1px Signature Accent Hairline along the top strip bottom edge */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-accent/40 pointer-events-none" />

      {/* Left: Professional Brand Logo & Name */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-5 h-5 rounded bg-accent/15 border border-accent/40 flex items-center justify-center text-accent shrink-0 shadow-xs">
          <Terminal size={12} strokeWidth={2.5} />
        </div>
        
        <div className="flex items-center gap-1.5 truncate">
          <span className="font-mono font-bold text-xs sm:text-sm tracking-tight text-text">
            LAIDE
          </span>
          <span className="font-mono text-[10px] sm:text-xs text-muted tracking-wider uppercase">
            Studio
          </span>
        </div>
      </div>

      {/* Right: Uncluttered Quick Controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Quick theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center justify-center w-7 h-7 bg-surface-elevated hover:bg-accent/15 text-muted hover:text-accent border border-border hover:border-accent/40 rounded transition-colors cursor-pointer shadow-xs active:scale-95"
          title={`Switch Theme (Ctrl+T) • Current: ${theme === 'oled' ? 'OLED Vault' : 'Paper Blueprint'}`}
          aria-label={`Toggle theme, current is ${theme}`}
        >
          {theme === 'oled' ? (
            <Sun size={13} className="text-accent" />
          ) : (
            <Moon size={13} className="text-accent" />
          )}
        </button>

        {/* Quick Lock Vault Button */}
        <button
          type="button"
          onClick={handleLockClick}
          className="flex items-center gap-1.5 px-2 h-7 bg-surface-elevated hover:bg-oxide/15 text-muted hover:text-oxide border border-border hover:border-oxide/40 rounded transition-colors cursor-pointer shadow-xs active:scale-95 text-xs font-mono"
          title="Lock Vault & Protect Encryption Keys (Ctrl+Shift+L)"
          aria-label="Lock Vault"
        >
          <Lock size={12} className="shrink-0" />
          <span className="text-[11px] font-medium hidden xs:inline">Lock</span>
        </button>
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
    </header>
  );
}
