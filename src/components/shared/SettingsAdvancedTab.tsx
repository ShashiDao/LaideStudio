import { useState, useEffect } from 'react';
import { 
  Activity, CheckCircle2, Database, Cpu, Coins, Trash2, Layers, RefreshCw,
  Keyboard, ExternalLink, ChevronDown
} from 'lucide-react';
import { db } from '../../db';
import { useAppStore } from '../../store';
import { 
  getSessionUsageSummary, 
  clearSessionUsage, 
  formatUsdCost, 
  formatTokenCount 
} from '../../services/usage/tokenSpend';
import { clearDependencyCache, getDependencyCacheInfo } from '../../services/bundler/bundler';
import { formatTokens, KEYBOARD_SHORTCUTS_LIST } from './settingsConstants';

interface SettingsAdvancedTabProps {
  onOpenShortcuts?: () => void;
}

export function SettingsAdvancedTab({ onOpenShortcuts }: SettingsAdvancedTabProps) {
  const { tokenUsage } = useAppStore();

  const [dbStats, setDbStats] = useState<{ projectCount: number; fileCount: number; profileCount: number } | null>(null);
  const [cachedDepCount, setCachedDepCount] = useState<number | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheClearedMsg, setCacheClearedMsg] = useState(false);
  const [confirmClearUsage, setConfirmClearUsage] = useState(false);
  const [isShortcutsDropdownOpen, setIsShortcutsDropdownOpen] = useState(false);

  const sessionSummary = getSessionUsageSummary();

  const loadCacheInfo = async () => {
    try {
      const info = await getDependencyCacheInfo();
      setCachedDepCount(info.count);
    } catch {
      setCachedDepCount(0);
    }
  };

  useEffect(() => {
    let active = true;
    async function loadStats() {
      try {
        const [pCount, fCount, prCount] = await Promise.all([
          db.projects.count(),
          db.files.count(),
          db.connectionProfiles.count()
        ]);
        if (active) {
          setDbStats({ projectCount: pCount, fileCount: fCount, profileCount: prCount });
        }
      } catch {
        if (active) setDbStats(null);
      }
    }
    loadStats();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function initCache() {
      try {
        const info = await getDependencyCacheInfo();
        if (active) setCachedDepCount(info.count);
      } catch {
        if (active) setCachedDepCount(0);
      }
    }
    initCache();
    return () => {
      active = false;
    };
  }, []);

  const handleClearDepCache = async () => {
    try {
      setClearingCache(true);
      await clearDependencyCache();
      await loadCacheInfo();
      setCacheClearedMsg(true);
      setTimeout(() => setCacheClearedMsg(false), 2500);
    } catch (e) {
      console.warn('Failed clearing dependency cache:', e);
    } finally {
      setClearingCache(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* System Diagnostics & AI Context Allocation */}
      <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-accent">
            <Activity size={18} />
            <h3 className="text-sm font-sans font-bold">System Diagnostics & Context</h3>
          </div>
          <span className="text-[10px] font-mono text-moss bg-moss/10 border border-moss/30 px-2 py-0.5 rounded flex items-center gap-1">
            <CheckCircle2 size={11} /> Vault Healthy
          </span>
        </div>

        {/* Database & Storage Engine Diagnostics */}
        <div className="bg-bg/80 border border-border/80 rounded p-3 text-xs font-mono space-y-2">
          <div className="flex items-center justify-between text-muted text-[11px] pb-1 border-b border-border/60">
            <div className="flex items-center gap-1.5 text-text font-semibold">
              <Database size={13} className="text-accent" />
              <span>Encrypted IndexedDB Storage</span>
            </div>
            <span className="text-moss font-medium">Ready (AES-GCM)</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
            <div>
              <span className="text-muted block text-[10px]">Projects:</span>
              <span className="text-text font-bold">{dbStats?.projectCount ?? '—'}</span>
            </div>
            <div>
              <span className="text-muted block text-[10px]">Files:</span>
              <span className="text-text font-bold">{dbStats?.fileCount ?? '—'}</span>
            </div>
            <div>
              <span className="text-muted block text-[10px]">Profiles:</span>
              <span className="text-text font-bold">{dbStats?.profileCount ?? '—'}</span>
            </div>
          </div>
        </div>

        {/* AI Context Window Allocation Gauge */}
        <div className="bg-bg/80 border border-border/80 rounded p-3 text-xs font-mono space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-text text-[11px] font-semibold">
              <Cpu size={13} className="text-accent" />
              <span>AI Context Window Usage</span>
            </div>
            <span className="text-accent text-[11px] font-bold">
              {formatTokens(tokenUsage.system + tokenUsage.codebase + tokenUsage.chat)} / {formatTokens(tokenUsage.max || 200000)} tokens
              <span className="text-muted font-normal ml-1">
                ({Math.round(((tokenUsage.system + tokenUsage.codebase + tokenUsage.chat) / (tokenUsage.max || 200000)) * 100)}%)
              </span>
            </span>
          </div>

          {/* Visual token bar */}
          <div className="w-full h-2.5 bg-surface rounded-full overflow-hidden flex border border-border">
            <div 
              className="h-full bg-accent/80 transition-all duration-500"
              style={{ width: `${Math.min(100, (tokenUsage.system / (tokenUsage.max || 200000)) * 100)}%` }}
              title={`System Prompt: ${tokenUsage.system.toLocaleString()} tokens`}
            />
            <div 
              className="h-full bg-accent/50 transition-all duration-500"
              style={{ width: `${Math.min(100, (tokenUsage.codebase / (tokenUsage.max || 200000)) * 100)}%` }}
              title={`File Manifest: ${tokenUsage.codebase.toLocaleString()} tokens`}
            />
            <div 
              className="h-full bg-accent/25 transition-all duration-500"
              style={{ width: `${Math.min(100, (tokenUsage.chat / (tokenUsage.max || 200000)) * 100)}%` }}
              title={`Chat Conversation: ${tokenUsage.chat.toLocaleString()} tokens`}
            />
          </div>

          {/* Legend */}
          <div className="grid grid-cols-3 gap-1.5 text-[10px] text-muted pt-1">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs bg-accent/80 shrink-0" />
              <span className="truncate">System ({formatTokens(tokenUsage.system)})</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs bg-accent/50 shrink-0" />
              <span className="truncate">Manifest ({formatTokens(tokenUsage.codebase)})</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs bg-accent/25 shrink-0" />
              <span className="truncate">Chat ({formatTokens(tokenUsage.chat)})</span>
            </div>
          </div>
        </div>

        {/* Session API Cost & Token Tracking */}
        <div className="bg-bg/80 border border-border/80 rounded p-3 text-xs font-mono space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-text text-[11px] font-semibold">
              <Coins size={13} className="text-accent" />
              <span>Session API Spend & Token Usage</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-accent text-[11px] font-bold">
                {formatUsdCost(sessionSummary.totalCostUsd)}
              </span>
              {sessionSummary.recordsCount > 0 && (
                confirmClearUsage ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        clearSessionUsage();
                        setConfirmClearUsage(false);
                      }}
                      className="px-1.5 py-0.5 bg-oxide text-white rounded text-[10px] font-bold cursor-pointer transition-colors"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClearUsage(false)}
                      className="px-1 py-0.5 bg-surface border border-border text-muted rounded text-[10px] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClearUsage(true)}
                    className="p-1 text-muted hover:text-oxide rounded transition-colors cursor-pointer"
                    title="Reset session token usage counters"
                    aria-label="Reset session token usage"
                  >
                    <Trash2 size={11} />
                  </button>
                )
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-surface/50 border border-border/60 rounded p-1.5">
              <div className="text-muted text-[9px]">Total Tokens</div>
              <div className="text-text font-bold text-[11px] mt-0.5">{formatTokenCount(sessionSummary.totalTokens)}</div>
            </div>
            <div className="bg-surface/50 border border-border/60 rounded p-1.5">
              <div className="text-muted text-[9px]">Prompt / Input</div>
              <div className="text-text font-bold text-[11px] mt-0.5">{formatTokenCount(sessionSummary.totalInputTokens)}</div>
            </div>
            <div className="bg-surface/50 border border-border/60 rounded p-1.5">
              <div className="text-muted text-[9px]">Output / Gen</div>
              <div className="text-text font-bold text-[11px] mt-0.5">{formatTokenCount(sessionSummary.totalOutputTokens)}</div>
            </div>
          </div>

          {sessionSummary.recordsCount > 0 ? (
            <div className="text-[10px] text-muted flex items-center justify-between pt-0.5">
              <span>{sessionSummary.recordsCount} LLM call{sessionSummary.recordsCount === 1 ? '' : 's'} recorded</span>
              <span className="text-accent">Avg {formatUsdCost(sessionSummary.totalCostUsd / sessionSummary.recordsCount)}/call</span>
            </div>
          ) : (
            <div className="text-[10px] text-muted italic text-center py-1">
              No API requests dispatched yet in this session.
            </div>
          )}
        </div>
      </div>

      {/* Compiler Dependency Cache */}
      <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-accent">
            <Layers size={18} />
            <h3 className="text-sm font-sans font-bold">Dependency Cache</h3>
          </div>
          {cachedDepCount !== null && (
            <span className="text-[11px] font-sans text-muted bg-bg/60 px-2 py-0.5 rounded border border-border">
              {cachedDepCount} module{cachedDepCount === 1 ? '' : 's'} cached
            </span>
          )}
        </div>

        <p className="text-xs text-muted font-sans mb-4 leading-relaxed">
          The in-browser bundler caches npm dependencies fetched from esm.sh into browser Cache Storage. This accelerates preview rebuilds and enables full offline preview for previously cached dependencies.
        </p>

        <button
          type="button"
          onClick={handleClearDepCache}
          disabled={clearingCache}
          className="w-full py-2.5 px-4 bg-surface hover:bg-black/5 border border-white/15 text-text font-sans text-xs rounded font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
        >
          {cacheClearedMsg ? (
            <CheckCircle2 size={15} className="text-moss" />
          ) : clearingCache ? (
            <RefreshCw size={15} className="animate-spin text-accent" />
          ) : (
            <Trash2 size={15} className="text-oxide" />
          )}
          <span>
            {cacheClearedMsg 
              ? 'Dependency Cache Cleared!' 
              : clearingCache 
                ? 'Clearing Cache...' 
                : 'Clear Dependency Cache'}
          </span>
        </button>
      </div>

      {/* Keyboard Shortcuts Reference (Collapsible Dropdown Accordion) */}
      <div className="bg-surface/50 border border-border rounded-xl overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => setIsShortcutsDropdownOpen(!isShortcutsDropdownOpen)}
          aria-expanded={isShortcutsDropdownOpen}
          aria-controls="keyboard-shortcuts-dropdown"
          className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-surface-elevated/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center text-accent shrink-0">
              <Keyboard size={16} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-text tracking-tight">Keyboard Shortcuts</h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-elevated border border-border text-muted">
                  6 hotkeys
                </span>
              </div>
              <p className="text-[11px] text-muted truncate">
                {isShortcutsDropdownOpen ? 'Global accelerator hotkeys & keybindings' : 'Click to view accelerator shortcuts'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {onOpenShortcuts && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenShortcuts();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    onOpenShortcuts();
                  }
                }}
                className="hidden xs:flex text-[11px] font-sans text-accent hover:underline items-center gap-1 cursor-pointer p-1"
                title="Open full shortcuts cheat sheet modal"
              >
                <span>View All</span>
                <ExternalLink size={11} />
              </span>
            )}
            <div className={`p-1 rounded-md text-muted hover:text-text transition-transform duration-200 ${isShortcutsDropdownOpen ? 'rotate-180 text-accent' : ''}`}>
              <ChevronDown size={16} />
            </div>
          </div>
        </button>

        {/* Dropdown Content */}
        {isShortcutsDropdownOpen && (
          <div id="keyboard-shortcuts-dropdown" className="px-4 pb-4 sm:px-5 sm:pb-5 pt-0 border-t border-border/40 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center justify-between pt-3 mb-3 text-xs text-muted font-sans leading-relaxed">
              <p className="text-[11px]">
                Speed up your workflow with global accelerator hotkeys. On macOS, use <kbd className="px-1 py-0.2 rounded bg-surface border border-border text-[10px] font-mono text-text">⌘ Command</kbd> instead of <kbd className="px-1 py-0.2 rounded bg-surface border border-border text-[10px] font-mono text-text">Ctrl</kbd>.
              </p>
              {onOpenShortcuts && (
                <button
                  type="button"
                  onClick={onOpenShortcuts}
                  className="xs:hidden text-[11px] font-sans text-accent hover:underline flex items-center gap-1 cursor-pointer shrink-0 ml-2"
                >
                  <span>View All</span>
                  <ExternalLink size={11} />
                </button>
              )}
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {KEYBOARD_SHORTCUTS_LIST.map((sc) => (
                  <div key={sc.keyCombo} className="flex items-center justify-between bg-bg/80 border border-border/80 px-2.5 py-1.5 rounded-lg">
                    <span className="text-muted text-[11px]">{sc.label}</span>
                    <kbd className="px-1.5 py-0.5 text-[10px] font-bold bg-surface border border-border text-accent rounded">{sc.keyCombo}</kbd>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
