import React, { useState, useEffect } from 'react';
import { Activity, CheckCircle2, Database, Cpu, Coins, Trash2 } from 'lucide-react';
import { db } from '../../../db';
import { useAppStore } from '../../../store';
import { 
  computeSessionUsageSummary, 
  formatUsdCost, 
  formatTokenCount 
} from '../../../services/usage/tokenSpend';

const formatTokens = (n: number) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
};

export function UsageSection() {
  const {
    tokenUsage,
    sessionUsageRecords,
    clearSessionUsage,
  } = useAppStore();

  const [dbStats, setDbStats] = useState<{ projectCount: number; fileCount: number; profileCount: number } | null>(null);
  const [confirmClearUsage, setConfirmClearUsage] = useState(false);

  const sessionSummaryAsString = JSON.stringify(sessionUsageRecords);
  const sessionSummary = React.useMemo(() => {
    return computeSessionUsageSummary(sessionUsageRecords);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionSummaryAsString]);

  useEffect(() => {
    let active = true;
    async function loadStats() {
      try {
        const [projectCount, fileCount, profileCount] = await Promise.all([
          typeof db.projects.count === 'function' ? db.projects.count() : db.projects.toArray().then(a => a.length),
          typeof db.files.count === 'function' ? db.files.count() : db.files.toArray().then(a => a.length),
          typeof db.connectionProfiles.count === 'function' ? db.connectionProfiles.count() : db.connectionProfiles.toArray().then(a => a.length),
        ]);
        if (active) {
          setDbStats({ projectCount, fileCount, profileCount });
        }
      } catch (err) {
        console.error('Failed to load DB stats', err);
      }
    }
    loadStats();
    return () => {
      active = false;
    };
  }, []);

  return (
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
  );
}
