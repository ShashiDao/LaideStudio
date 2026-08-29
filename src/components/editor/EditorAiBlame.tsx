import React from 'react';
import { hoverTooltip, EditorView, type ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { ProvenanceEntry, ProvenanceTestResult } from '../../db';
import { Sparkles, CheckCircle2, XCircle, AlertCircle, HelpCircle, Clock, Cpu, FileText, Hash, ShieldCheck, X, GitBranch, BarChart2 } from 'lucide-react';
import { getTrustColorStyles, type FileTrustScore } from '../../services/provenance/trustScore';

export function formatTimestamp(ts: number): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return String(ts);
  }
}

export function formatTestStatus(result?: ProvenanceTestResult): {
  label: string;
  badgeClass: string;
  icon: 'passed' | 'failed' | 'error' | 'no_tests';
  details?: string;
} {
  if (!result) {
    return {
      label: 'No test run recorded',
      badgeClass: 'bg-zinc-800 text-zinc-400 border-zinc-700',
      icon: 'no_tests'
    };
  }

  if (result.status === 'passed') {
    return {
      label: `Passed (${result.passed}/${result.total} tests)`,
      badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80',
      icon: 'passed'
    };
  }

  if (result.status === 'failed') {
    const failedNames = result.failedTests && result.failedTests.length > 0 
      ? result.failedTests.slice(0, 3).join(', ') + (result.failedTests.length > 3 ? '...' : '')
      : `${result.failed} failed`;
    return {
      label: `Failed (${result.failed}/${result.total})`,
      details: failedNames,
      badgeClass: 'bg-rose-950/80 text-rose-300 border-rose-800/80',
      icon: 'failed'
    };
  }

  if (result.status === 'error') {
    return {
      label: 'Test execution error',
      details: result.error,
      badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
      icon: 'error'
    };
  }

  return {
    label: 'No test files in project',
    badgeClass: 'bg-zinc-800 text-zinc-400 border-zinc-700',
    icon: 'no_tests'
  };
}

/**
 * Creates a CodeMirror 6 hover tooltip extension for displaying AI blame popovers.
 */
export function createAiBlameHoverTooltip(
  getBlameForLine: (lineNumber: number) => ProvenanceEntry | null,
  theme: 'oled' | 'paper' | string = 'oled'
): Extension {
  return hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos);
    const lineNumber = line.number;
    const entry = getBlameForLine(lineNumber);
    if (!entry) return null;

    const isLight = theme === 'paper';
    const testInfo = formatTestStatus(entry.testResult);

    return {
      pos: line.from,
      end: line.to,
      above: true,
      arrow: true,
      create() {
        const dom = document.createElement('div');
        dom.className = `cm-ai-blame-popover p-3 rounded-lg shadow-2xl text-xs font-sans max-w-sm pointer-events-auto select-text border transition-all ${
          isLight 
            ? 'bg-white text-[#1F2E3D] border-[#CBD8E2] shadow-slate-300' 
            : 'bg-[#131316] text-[#F2F0EA] border-[#2A2A2E] shadow-black/80'
        }`;

        const modelStr = entry.model || 'AI Assistant';
        const providerStr = entry.provider ? `(${entry.provider})` : '';
        const timeStr = formatTimestamp(entry.timestamp);
        const rationaleStr = entry.rationale || 'AI generated code modification';
        const shortHash = entry.entryHash ? entry.entryHash.slice(0, 10) + '...' : 'genesis';

        let testBadgeHtml: string;
        if (testInfo.icon === 'passed') {
          testBadgeHtml = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
            isLight ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/80'
          }">✅ ${testInfo.label}</span>`;
        } else if (testInfo.icon === 'failed') {
          testBadgeHtml = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
            isLight ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-rose-950/80 text-rose-300 border border-rose-800/80'
          }">❌ ${testInfo.label}${testInfo.details ? ` - ${testInfo.details}` : ''}</span>`;
        } else if (testInfo.icon === 'error') {
          testBadgeHtml = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
            isLight ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-amber-950/80 text-amber-300 border border-amber-800/80'
          }">⚠️ ${testInfo.label}</span>`;
        } else {
          testBadgeHtml = `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
            isLight ? 'bg-slate-100 text-slate-600 border border-slate-300' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
          }">⚪ ${testInfo.label}</span>`;
        }

        dom.innerHTML = `
          <div class="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b ${isLight ? 'border-slate-200' : 'border-[#232326]'}">
            <div class="flex items-center gap-1.5 font-semibold text-[11px] ${isLight ? 'text-amber-700' : 'text-accent'}">
              <span>✨</span>
              <span>${modelStr} ${providerStr}</span>
            </div>
            <span class="text-[10px] opacity-60 font-mono">${timeStr}</span>
          </div>
          <div class="mb-2 text-[11px] leading-relaxed italic ${isLight ? 'text-slate-700' : 'text-zinc-300'}">
            "${rationaleStr.replace(/"/g, '&quot;')}"
          </div>
          <div class="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t ${isLight ? 'border-slate-200' : 'border-[#232326]'}">
            ${testBadgeHtml}
            <span class="text-[9px] font-mono opacity-50">#${shortHash}</span>
          </div>
        `;

        return { dom };
      }
    };
  }, { hoverTime: 200 });
}

/**
 * Creates an editor update listener extension that reports the current line number and active blame.
 */
export function createAiBlameCursorListener(
  onLineChange: (lineNumber: number, entry: ProvenanceEntry | null) => void,
  getBlameForLine: (lineNumber: number) => ProvenanceEntry | null
): Extension {
  return EditorView.updateListener.of((update: ViewUpdate) => {
    if (update.selectionSet || update.docChanged) {
      const pos = update.state.selection.main.head;
      const line = update.state.doc.lineAt(pos);
      const entry = getBlameForLine(line.number);
      onLineChange(line.number, entry);
    }
  });
}

export interface AiBlameSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeLineNumber: number | null;
  activeEntry: ProvenanceEntry | null;
  totalAiLines: number;
  totalDocLines: number;
  theme: 'oled' | 'paper' | string;
  onOpenBisect?: (testName?: string) => void;
  fileTrustScore?: FileTrustScore | null;
  onOpenTrustReport?: () => void;
}

export const AiBlameSidePanel: React.FC<AiBlameSidePanelProps> = ({
  isOpen,
  onClose,
  activeLineNumber,
  activeEntry,
  totalAiLines,
  totalDocLines,
  theme,
  onOpenBisect,
  fileTrustScore,
  onOpenTrustReport
}) => {
  if (!isOpen) return null;

  const isLight = theme === 'paper';
  const testInfo = formatTestStatus(activeEntry?.testResult);
  const scoreStyles = fileTrustScore ? getTrustColorStyles(fileTrustScore.score, theme) : {
    text: 'text-text', bg: 'bg-surface', border: 'border-border', badge: ''
  };

  return (
    <>
      {/* Mobile backdrop overlay */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-30 sm:hidden animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        aria-label="AI Blame Inspector"
        className={`fixed sm:static inset-x-0 bottom-0 z-40 sm:z-20 w-full sm:w-80 max-h-[80vh] sm:max-h-none sm:h-full shrink-0 border-t sm:border-t-0 sm:border-l flex flex-col rounded-t-2xl sm:rounded-none shadow-2xl sm:shadow-none text-xs transition-colors overflow-y-auto animate-in slide-in-from-bottom sm:slide-in-from-right duration-200 ${
          isLight ? 'bg-[#F4F7F9] border-[#CBD8E2] text-[#1F2E3D]' : 'bg-[#0E0E11] border-border text-[#F2F0EA]'
        }`}
      >
        {/* Grab handle indicator for mobile bottom sheet */}
        <div className="w-10 h-1 bg-muted/40 rounded-full mx-auto mt-2 mb-1 sm:hidden shrink-0 pointer-events-none" />

        {/* Header */}
        <div className={`h-[40px] px-3 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'bg-[#EAEFF4] border-[#CBD8E2]' : 'bg-surface border-border'
        }`}>
          <div className="flex items-center gap-1.5 font-semibold text-accent text-xs">
            <Sparkles size={14} className="text-accent" />
            <span>AI Blame & Trust</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close AI Blame Panel"
            className="text-muted hover:text-text p-1 rounded cursor-pointer transition-colors"
          >
            <X size={14} />
          </button>
        </div>

      {/* Trust Score & Provenance Summary Card */}
      <div className={`p-3 border-b space-y-2 ${isLight ? 'border-[#CBD8E2] bg-white' : 'border-border bg-surface/50'}`}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-mono tracking-wider text-muted">File Provenance & Trust</span>
          {fileTrustScore && (
            <div className="flex items-center gap-1.5">
              <span className={`font-mono font-bold text-xs ${scoreStyles.text}`}>
                {fileTrustScore.score}%
              </span>
              <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-mono font-bold border ${scoreStyles.badge}`}>
                {fileTrustScore.grade}
              </span>
            </div>
          )}
        </div>

        {fileTrustScore ? (
          <div className="w-full h-1.5 rounded-full bg-border overflow-hidden flex">
            <div 
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${(fileTrustScore.verifiedAiLines / Math.max(1, fileTrustScore.totalLines)) * 100}%` }}
              title={`Verified AI: ${fileTrustScore.verifiedAiLines} lines`}
            />
            <div 
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${(fileTrustScore.untestedAiLines / Math.max(1, fileTrustScore.totalLines)) * 100}%` }}
              title={`Untested AI: ${fileTrustScore.untestedAiLines} lines`}
            />
            <div 
              className="h-full bg-rose-500 transition-all duration-300"
              style={{ width: `${(fileTrustScore.failingAiLines / Math.max(1, fileTrustScore.totalLines)) * 100}%` }}
              title={`Failing AI: ${fileTrustScore.failingAiLines} lines`}
            />
            <div 
              className="h-full bg-zinc-400 transition-all duration-300"
              style={{ width: `${(fileTrustScore.humanLines / Math.max(1, fileTrustScore.totalLines)) * 100}%` }}
              title={`Human: ${fileTrustScore.humanLines} lines`}
            />
          </div>
        ) : (
          <div className="w-full h-1.5 rounded-full bg-border overflow-hidden flex">
            <div 
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${(totalAiLines / Math.max(1, totalDocLines)) * 100}%` }}
            />
          </div>
        )}

        <div className="flex items-center justify-between text-[9.5px] font-mono text-muted">
          <span>{totalAiLines} / {totalDocLines} lines ({Math.round((totalAiLines / Math.max(1, totalDocLines)) * 100)}%)</span>
          {fileTrustScore ? (
            fileTrustScore.tamperProofChainValid ? (
              <span className="text-emerald-400 flex items-center gap-0.5">🔒 Verified</span>
            ) : (
              <span className="text-rose-400 flex items-center gap-0.5">⚠️ Tampered</span>
            )
          ) : (
            <span className="text-accent/80">AI Patched</span>
          )}
        </div>

        {/* Model breakdown pills for this file */}
        {fileTrustScore && fileTrustScore.modelAttributions.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {fileTrustScore.modelAttributions.map((m, idx) => (
              <span 
                key={idx} 
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-mono bg-accent/10 border border-accent/25 text-accent"
                title={`${m.lines} lines (${m.percentage}%) • ${m.testPassRate}% pass rate`}
              >
                <Cpu size={9} />
                <span>{m.model}</span>
              </span>
            ))}
          </div>
        )}

        {onOpenTrustReport && (
          <button
            type="button"
            onClick={onOpenTrustReport}
            className="w-full mt-1.5 py-1 px-2 rounded bg-surface hover:bg-surface-elevated text-muted hover:text-accent border border-border flex items-center justify-center gap-1 text-[10.5px] font-mono transition-colors cursor-pointer"
          >
            <BarChart2 size={11} />
            <span>Full Workspace Trust Report</span>
          </button>
        )}
      </div>

      {/* Active Line Inspector */}
      <div className="p-3 flex-1 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-muted">
            Line {activeLineNumber ?? 1}
          </span>
          {activeEntry ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent/10 text-accent border border-accent/20">
              <ShieldCheck size={11} /> Provenance Verified
            </span>
          ) : (
            <span className="text-[10px] text-muted italic">Manual / No AI History</span>
          )}
        </div>

        {activeEntry ? (
          <div className={`p-3 rounded-lg border space-y-2.5 ${
            isLight ? 'bg-white border-[#CBD8E2]' : 'bg-[#151518] border-[#2A2A2E]'
          }`}>
            {/* Model & Provider */}
            <div>
              <div className="flex items-center gap-1 text-[10px] text-muted mb-0.5">
                <Cpu size={12} /> Model & Provider
              </div>
              <div className="font-semibold text-accent font-mono text-[11px]">
                {activeEntry.model || 'Unknown Model'} {activeEntry.provider ? `(${activeEntry.provider})` : ''}
              </div>
            </div>

            {/* Rationale */}
            <div>
              <div className="flex items-center gap-1 text-[10px] text-muted mb-0.5">
                <FileText size={12} /> Patch Rationale
              </div>
              <div className={`p-2 rounded text-[11px] italic leading-relaxed border ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-[#1D1D22] border-border text-zinc-300'
              }`}>
                "{activeEntry.rationale || 'No rationale provided'}"
              </div>
            </div>

            {/* Test Status */}
            <div>
              <div className="flex items-center gap-1 text-[10px] text-muted mb-1">
                <ShieldCheck size={12} /> Test Status at Patch
              </div>
              <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium border w-full ${testInfo.badgeClass}`}>
                {testInfo.icon === 'passed' && <CheckCircle2 size={13} className="shrink-0 text-emerald-400" />}
                {testInfo.icon === 'failed' && <XCircle size={13} className="shrink-0 text-rose-400" />}
                {testInfo.icon === 'error' && <AlertCircle size={13} className="shrink-0 text-amber-400" />}
                {testInfo.icon === 'no_tests' && <HelpCircle size={13} className="shrink-0 text-zinc-400" />}
                <span className="truncate">{testInfo.label}</span>
              </div>
              {testInfo.details && (
                <p className="text-[10px] text-rose-400 mt-1 pl-1">
                  Failed: {testInfo.details}
                </p>
              )}
              {onOpenBisect && (testInfo.icon === 'failed' || testInfo.icon === 'error') && (
                <button
                  type="button"
                  onClick={() => onOpenBisect(testInfo.details)}
                  className="mt-2 w-full py-1.5 px-2 bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/40 rounded flex items-center justify-center gap-1.5 font-mono text-[10.5px] cursor-pointer transition-all active:scale-95"
                >
                  <GitBranch size={12} />
                  <span>Find What Broke This</span>
                </button>
              )}
            </div>

            {/* Timestamp */}
            <div>
              <div className="flex items-center gap-1 text-[10px] text-muted mb-0.5">
                <Clock size={12} /> Applied At
              </div>
              <div className="font-mono text-[11px] text-muted">
                {formatTimestamp(activeEntry.timestamp)}
              </div>
            </div>

            {/* Ledger Hash */}
            <div>
              <div className="flex items-center gap-1 text-[10px] text-muted mb-0.5">
                <Hash size={12} /> Entry Hash
              </div>
              <div className="font-mono text-[10px] text-muted break-all select-all bg-black/20 p-1 rounded">
                {activeEntry.entryHash || 'N/A'}
              </div>
            </div>
          </div>
        ) : (
          <div className={`p-4 rounded-lg border text-center text-muted space-y-1.5 ${
            isLight ? 'bg-white border-dashed border-slate-300' : 'bg-[#151518] border-dashed border-[#2A2A2E]'
          }`}>
            <p className="text-xs">No AI provenance for line {activeLineNumber ?? 1}.</p>
            <p className="text-[10px]">This line was authored or modified manually outside an AI patch.</p>
          </div>
        )}
      </div>
    </aside>
    </>
  );
};
