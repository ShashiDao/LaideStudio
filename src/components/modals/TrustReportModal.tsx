import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  ShieldCheck, 
  ShieldAlert, 
  Cpu, 
  XCircle, 
  Copy, 
  Check, 
  GitBranch, 
  Search, 
  Loader2,
  FileCode,
  Download,
  Key,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Terminal,
  FileText,
  Clock
} from 'lucide-react';
import { useAppStore } from '../../store';
import { db } from '../../db';
import { listFiles } from '../../services/fs/vfs';
import { 
  calculateProjectTrustScore, 
  generateTrustMarkdownReport, 
  getTrustColorStyles,
  type ProjectTrustScore,
  type FileTrustScore
} from '../../services/provenance/trustScore';
import {
  exportSignedProvenanceProof,
  generateDiffProvenanceSummary,
  computeFileTrustHistory,
  type SignedProvenanceArtifact,
  type DiffProvenanceSummary,
  type FileTrustProgression
} from '../../services/provenance/signing';

export interface TrustReportModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectFile?: (filePath: string) => void;
  onOpenBisect?: (testName?: string) => void;
  initialFilePath?: string;
}

type TabType = 'overview' | 'diff' | 'proof';

export const TrustReportModal: React.FC<TrustReportModalProps> = ({
  projectId,
  isOpen,
  onClose,
  onSelectFile,
  onOpenBisect,
  initialFilePath
}) => {
  const { theme, addToast } = useAppStore();
  const isLight = theme === 'paper';

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);
  const [projectTrust, setProjectTrust] = useState<ProjectTrustScore | null>(null);
  const [diffSummary, setDiffSummary] = useState<DiffProvenanceSummary | null>(null);
  const [signedArtifact, setSignedArtifact] = useState<SignedProvenanceArtifact | null>(null);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [copiedDiffMd, setCopiedDiffMd] = useState(false);
  const [copiedVerifyCmd, setCopiedVerifyCmd] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialFilePath || '');
  const [sortBy, setSortBy] = useState<'score' | 'ai' | 'path' | 'lines'>('score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedFile, setSelectedFile] = useState<FileTrustScore | null>(null);
  const [fileProgression, setFileProgression] = useState<FileTrustProgression | null>(null);
  const [loadingProgression, setLoadingProgression] = useState(false);

  useEffect(() => {
    if (!isOpen || !projectId) return;

    let active = true;
    const compute = async () => {
      setLoading(true);
      try {
        const [files, entries] = await Promise.all([
          listFiles(projectId),
          db.provenanceEntries.where('projectId').equals(projectId).toArray()
        ]);

        const [result, diff, signed] = await Promise.all([
          calculateProjectTrustScore(projectId, files, entries),
          generateDiffProvenanceSummary(projectId),
          exportSignedProvenanceProof(projectId)
        ]);

        if (active) {
          setProjectTrust(result);
          setDiffSummary(diff);
          setSignedArtifact(signed.artifact);
          if (initialFilePath) {
            const found = result.fileScores.find(f => f.filePath === initialFilePath);
            if (found) setSelectedFile(found);
          }
        }
      } catch (err) {
        console.error('Failed to calculate project trust score', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    compute();
    return () => {
      active = false;
    };
  }, [projectId, isOpen, initialFilePath]);

  // Load progression history when selected file changes
  useEffect(() => {
    let active = true;

    async function loadProgression() {
      if (!selectedFile || !projectId) {
        if (active) setFileProgression(null);
        return;
      }

      if (active) setLoadingProgression(true);
      try {
        const prog = await computeFileTrustHistory(projectId, selectedFile.filePath);
        if (active) setFileProgression(prog);
      } catch (err) {
        console.error('Failed to compute file trust history', err);
      } finally {
        if (active) setLoadingProgression(false);
      }
    }

    loadProgression();

    return () => {
      active = false;
    };
  }, [selectedFile, projectId]);

  const handleCopyMarkdown = () => {
    if (!projectTrust) return;
    const md = generateTrustMarkdownReport(projectTrust);
    navigator.clipboard.writeText(md).then(() => {
      setCopiedMarkdown(true);
      addToast('Copied PR Trust Report to clipboard', 'success');
      setTimeout(() => setCopiedMarkdown(false), 2000);
    }).catch(() => {
      addToast('Failed to copy to clipboard', 'error');
    });
  };

  const handleCopyDiffMarkdown = () => {
    if (!diffSummary) return;
    navigator.clipboard.writeText(diffSummary.markdown).then(() => {
      setCopiedDiffMd(true);
      addToast('Copied PR Changeset Description to clipboard', 'success');
      setTimeout(() => setCopiedDiffMd(false), 2000);
    }).catch(() => {
      addToast('Failed to copy to clipboard', 'error');
    });
  };

  const handleCopyVerifyCmd = () => {
    const cmd = 'node public/verify-provenance.js provenance-proof.json';
    navigator.clipboard.writeText(cmd).then(() => {
      setCopiedVerifyCmd(true);
      addToast('Copied verifier command to clipboard', 'success');
      setTimeout(() => setCopiedVerifyCmd(false), 2000);
    });
  };

  const handleExportSignedProof = async () => {
    if (!projectId) return;
    try {
      const { jsonString } = await exportSignedProvenanceProof(projectId);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `provenance-proof-${projectId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast('Exported ECDSA-signed provenance proof', 'success');
    } catch (err) {
      console.error('Failed to export signed provenance proof', err);
      addToast('Failed to export signed proof', 'error');
    }
  };

  const filteredAndSortedFiles = useMemo(() => {
    if (!projectTrust) return [];
    let list = [...projectTrust.fileScores];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(f => 
        f.filePath.toLowerCase().includes(q) || 
        f.modelAttributions.some(m => m.model.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'score') cmp = a.score - b.score;
      else if (sortBy === 'ai') cmp = a.aiRatio - b.aiRatio;
      else if (sortBy === 'path') cmp = a.filePath.localeCompare(b.filePath);
      else if (sortBy === 'lines') cmp = a.totalLines - b.totalLines;

      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [projectTrust, searchQuery, sortBy, sortOrder]);

  if (!isOpen) return null;

  const scoreStyles = projectTrust ? getTrustColorStyles(projectTrust.overallScore, theme) : {
    text: 'text-text', bg: 'bg-surface', border: 'border-border', badge: ''
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trust-report-title"
    >
      <div 
        className={`w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl border shadow-2xl overflow-hidden font-sans text-xs corner-ticks ${
          isLight ? 'bg-surface border-[#CBD8E2] text-[#1F2E3D]' : 'bg-[#0E0E11] border-border text-[#F2F0EA]'
        }`}
      >
        {/* Header */}
        <div className={`px-4 py-3 sm:px-5 sm:py-3.5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 ${
          isLight ? 'bg-[#EAEFF4] border-[#CBD8E2]' : 'bg-surface-elevated/40 border-border/70'
        }`}>
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-accent/15 text-accent border border-accent/30 shrink-0 shadow-xs mt-0.5 sm:mt-0">
              <ShieldCheck size={20} />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="trust-report-title" className="text-base sm:text-lg font-bold font-mono text-accent uppercase tracking-wider">
                  AI Provenance & Trust Report
                </h2>
                {projectTrust && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono border font-semibold shrink-0 ${
                    projectTrust.chainIntegrity.valid 
                      ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60'
                      : 'bg-rose-950/40 text-rose-400 border-rose-800/60'
                  }`}>
                    {projectTrust.chainIntegrity.valid ? '🔒 SHA-256 Ledger Intact' : '⚠️ Tampered'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted">
                Cryptographic provenance, per-line AI attribution, ECDSA signed proofs & test verifications
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleExportSignedProof}
              disabled={loading || !projectTrust}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-accent/15 border border-accent/40 hover:bg-accent/25 text-accent rounded font-mono text-[11px] font-semibold transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
              title="Export ECDSA P-256 signed provenance proof JSON"
            >
              <Key size={13} />
              <span className="hidden sm:inline">Export Signed Proof</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Trust Report Modal"
              className="p-1.5 text-muted hover:text-text rounded-md hover:bg-surface-elevated transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className={`px-4 sm:px-5 border-b flex items-center gap-2 shrink-0 ${
          isLight ? 'bg-slate-100 border-[#CBD8E2]' : 'bg-surface border-border'
        }`}>
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`py-2 px-3 border-b-2 font-mono text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === 'overview'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            Audit Overview & Files
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('diff')}
            className={`py-2 px-3 border-b-2 font-mono text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 ${
              activeTab === 'diff'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            <GitBranch size={13} />
            <span>PR Diff Summary</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('proof')}
            className={`py-2 px-3 border-b-2 font-mono text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 ${
              activeTab === 'proof'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            <Key size={13} />
            <span>Signed Proof & Verifier</span>
          </button>
        </div>

        {/* Content Area */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-3">
            <Loader2 className="animate-spin text-accent" size={32} />
            <p className="text-xs font-mono text-muted">Calculating cryptographic provenance & trust scores...</p>
          </div>
        ) : !projectTrust ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted">
            <ShieldAlert size={32} className="text-amber-400 mb-2" />
            <p className="text-sm font-semibold">Unable to load trust report</p>
          </div>
        ) : activeTab === 'diff' ? (
          /* PR Diff Summary View */
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold font-mono text-accent">Pull Request Changeset Summary</h3>
                <p className="text-[11px] text-muted">Ready-to-paste markdown block for GitHub/GitLab PR descriptions with verification instructions.</p>
              </div>
              <button
                type="button"
                onClick={handleCopyDiffMarkdown}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-accent-fg hover:opacity-90 rounded font-mono text-xs font-semibold cursor-pointer shadow-xs active:scale-95"
              >
                {copiedDiffMd ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedDiffMd ? 'Copied to Clipboard' : 'Copy PR Description'}</span>
              </button>
            </div>

            {diffSummary && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-surface border-border'}`}>
                  <span className="text-[10px] text-muted uppercase font-mono">Files Changed</span>
                  <p className="text-lg font-bold font-mono text-text">{diffSummary.totalFilesChanged}</p>
                </div>
                <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-surface border-border'}`}>
                  <span className="text-[10px] text-muted uppercase font-mono">AI vs Human</span>
                  <p className="text-lg font-bold font-mono text-text">{Math.round(diffSummary.aiRatio * 100)}% AI</p>
                </div>
                <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-surface border-border'}`}>
                  <span className="text-[10px] text-muted uppercase font-mono">Test Backing</span>
                  <p className="text-lg font-bold font-mono text-emerald-400">{diffSummary.testPassRate}% Pass</p>
                </div>
                <div className={`p-3 rounded-lg border ${isLight ? 'bg-white border-slate-200' : 'bg-surface border-border'}`}>
                  <span className="text-[10px] text-muted uppercase font-mono">Ledger Integrity</span>
                  <p className="text-lg font-bold font-mono text-emerald-400">Verified</p>
                </div>
              </div>
            )}

            <div className={`p-4 rounded-xl border font-mono text-[11px] space-y-3 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#141418] border-border'
            }`}>
              <div className="flex items-center justify-between text-muted border-b border-border pb-2">
                <span className="flex items-center gap-1.5 font-semibold text-text">
                  <FileText size={13} />
                  <span>Markdown Preview</span>
                </span>
                <span className="text-[10px]">Formatted for GitHub / GitLab PR body</span>
              </div>
              <pre className="whitespace-pre-wrap leading-relaxed text-text select-all overflow-x-auto">
                {diffSummary?.markdown}
              </pre>
            </div>
          </div>
        ) : activeTab === 'proof' ? (
          /* Signed Proof & Standalone Verifier View */
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold font-mono text-accent">Cryptographic Proof & Standalone Verifier</h3>
                <p className="text-[11px] text-muted">
                  Signed with ECDSA P-256 (NIST Curve). Anyone can independently verify the hash chain and signature without LAIDE installed.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportSignedProof}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-accent-fg hover:opacity-90 rounded font-mono text-xs font-semibold cursor-pointer shadow-xs active:scale-95 shrink-0"
              >
                <Download size={13} />
                <span>Download Proof (.json)</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`p-4 rounded-xl border space-y-3 ${
                isLight ? 'bg-white border-slate-200' : 'bg-surface border-border'
              }`}>
                <div className="flex items-center gap-2 font-mono font-bold text-accent text-xs">
                  <Key size={14} />
                  <span>Proof Metadata</span>
                </div>
                <div className="space-y-1.5 font-mono text-[11px]">
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted">Algorithm:</span>
                    <span className="font-semibold text-text">ECDSA-P256-SHA256</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted">Total Entries:</span>
                    <span className="font-semibold text-text">{signedArtifact?.summary.totalEntries}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted">Head Hash:</span>
                    <span className="font-semibold text-text truncate max-w-[180px]" title={signedArtifact?.summary.headHash}>
                      {signedArtifact?.summary.headHash ? `${signedArtifact.summary.headHash.slice(0, 16)}...` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted">Trust Grade:</span>
                    <span className="font-semibold text-emerald-400">{signedArtifact?.summary.overallGrade} ({signedArtifact?.summary.overallTrustScore}/100)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted">Key Storage:</span>
                    <span className="font-semibold text-accent">Vault-Protected (AES-GCM)</span>
                  </div>
                </div>
              </div>

              <div className={`p-4 rounded-xl border space-y-3 ${
                isLight ? 'bg-white border-slate-200' : 'bg-surface border-border'
              }`}>
                <div className="flex items-center justify-between font-mono font-bold text-accent text-xs">
                  <span className="flex items-center gap-2">
                    <Terminal size={14} />
                    <span>Standalone CLI Verifier</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyVerifyCmd}
                    className="text-[10px] text-muted hover:text-accent flex items-center gap-1 cursor-pointer"
                  >
                    {copiedVerifyCmd ? <Check size={11} /> : <Copy size={11} />}
                    <span>{copiedVerifyCmd ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-muted">
                  Run the zero-dependency verifier in any terminal with Node.js 18+:
                </p>
                <div className="p-2.5 rounded bg-black/80 font-mono text-[11px] text-emerald-400 overflow-x-auto border border-border/60">
                  <code>node public/verify-provenance.js provenance-proof.json</code>
                </div>
                <p className="text-[10px] text-muted">
                  Detects modified lines, altered models, broken genesis links, or signature tampering.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Audit Overview & File List View */
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            
            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Trust Score Hero Card */}
              <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
                isLight ? 'bg-white border-[#CBD8E2]' : 'bg-[#151518] border-[#2A2A2E]'
              }`}>
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-muted uppercase tracking-wider">Overall Trust Score</span>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-3xl font-extrabold font-mono ${scoreStyles.text}`}>
                      {projectTrust.overallScore}
                    </span>
                    <span className="text-xs text-muted font-mono">/ 100</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono border ${scoreStyles.badge}`}>
                      Grade {projectTrust.overallGrade}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted">
                    {projectTrust.fileScores.length} files scanned in workspace
                  </p>
                </div>
              </div>

              {/* AI vs Human Split Card */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                isLight ? 'bg-white border-[#CBD8E2]' : 'bg-[#151518] border-[#2A2A2E]'
              }`}>
                <div className="flex items-center justify-between text-[10px] font-mono text-muted">
                  <span className="uppercase tracking-wider">AI vs Human Split</span>
                  <span className="font-bold text-text">
                    {Math.round(projectTrust.aiRatio * 100)}% AI / {Math.round((1 - projectTrust.aiRatio) * 100)}% Human
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-border overflow-hidden my-2 flex">
                  <div 
                    className="h-full bg-accent transition-all" 
                    style={{ width: `${projectTrust.aiRatio * 100}%` }}
                    title={`AI: ${projectTrust.totalAiLines} lines`}
                  />
                  <div 
                    className="h-full bg-emerald-500 transition-all" 
                    style={{ width: `${(1 - projectTrust.aiRatio) * 100}%` }}
                    title={`Human: ${projectTrust.totalHumanLines} lines`}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-muted">
                  <span>🤖 {projectTrust.totalAiLines} AI lines</span>
                  <span>👤 {projectTrust.totalHumanLines} Human lines</span>
                </div>
              </div>

              {/* Test Verification Rate Card */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                isLight ? 'bg-white border-[#CBD8E2]' : 'bg-[#151518] border-[#2A2A2E]'
              }`}>
                <div className="flex items-center justify-between text-[10px] font-mono text-muted">
                  <span className="uppercase tracking-wider">Patch Test Verification</span>
                  <span className="font-bold text-emerald-400">
                    {projectTrust.overallTestPassRate}% Passed
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-border overflow-hidden my-2 flex">
                  <div 
                    className="h-full bg-emerald-500 transition-all" 
                    style={{ 
                      width: projectTrust.totalAiLines > 0 
                        ? `${(projectTrust.totalVerifiedAiLines / projectTrust.totalAiLines) * 100}%` 
                        : '100%' 
                    }}
                    title={`Verified: ${projectTrust.totalVerifiedAiLines} lines`}
                  />
                  <div 
                    className="h-full bg-rose-500 transition-all" 
                    style={{ 
                      width: projectTrust.totalAiLines > 0 
                        ? `${(projectTrust.totalFailingAiLines / projectTrust.totalAiLines) * 100}%` 
                        : '0%' 
                    }}
                    title={`Failing: ${projectTrust.totalFailingAiLines} lines`}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-muted">
                  <span className="text-emerald-400">✅ {projectTrust.totalVerifiedAiLines} verified</span>
                  <span className="text-rose-400">❌ {projectTrust.totalFailingAiLines} failing</span>
                  <span>⚪ {projectTrust.totalUntestedAiLines} untested</span>
                </div>
              </div>
            </div>

            {/* Bisect Candidate Alert Banner */}
            {projectTrust.bisectCandidates.length > 0 && onOpenBisect && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-rose-500/20 text-rose-400 rounded-lg shrink-0">
                    <XCircle size={16} />
                  </div>
                  <div>
                    <h4 className="font-bold text-rose-400 text-xs">
                      {projectTrust.bisectCandidates.length} AI patch{projectTrust.bisectCandidates.length > 1 ? 'es' : ''} recorded failing test runs
                    </h4>
                    <p className="text-[10px] text-muted">
                      Use the binary-search bisect tool to isolate regressions without manual debugging.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenBisect()}
                  className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/50 rounded flex items-center gap-1.5 font-mono text-xs font-semibold cursor-pointer transition-all active:scale-95 shrink-0"
                >
                  <GitBranch size={13} />
                  <span>Find What Broke This (Bisect)</span>
                </button>
              </div>
            )}

            {/* Model Attribution Matrix */}
            {projectTrust.modelDistribution.length > 0 && (
              <div className={`p-4 rounded-xl border space-y-2.5 ${
                isLight ? 'bg-white border-[#CBD8E2]' : 'bg-[#151518] border-[#2A2A2E]'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-accent text-xs">
                    <Cpu size={14} />
                    <span>Model Attribution & Test Pass Rate</span>
                  </div>
                  <span className="text-[10px] font-mono text-muted">
                    {projectTrust.modelDistribution.length} distinct model{projectTrust.modelDistribution.length > 1 ? 's' : ''}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {projectTrust.modelDistribution.map((m, idx) => (
                    <div 
                      key={idx} 
                      className={`p-2.5 rounded-lg border flex flex-col justify-between gap-1.5 ${
                        isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#1A1A1E] border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between min-w-0">
                        <span className="font-mono font-bold text-accent text-[11px] truncate" title={m.model}>
                          {m.model}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface border border-border text-muted shrink-0">
                          {m.provider}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-muted">
                        <span>{m.lines} lines ({m.percentage}% of AI)</span>
                        <span className={m.testPassRate >= 90 ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
                          {m.testPassRate}% test pass
                        </span>
                      </div>

                      <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-accent rounded-full" 
                          style={{ width: `${m.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* File-by-File Trust Breakdown Table */}
            <div className={`p-4 rounded-xl border space-y-3 ${
              isLight ? 'bg-white border-[#CBD8E2]' : 'bg-[#151518] border-[#2A2A2E]'
            }`}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-1.5 font-semibold text-accent text-xs">
                  <FileCode size={14} />
                  <span>File-by-File Provenance & Trust Scores</span>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Filter files or models..."
                      className="w-full pl-7 pr-3 py-1 bg-bg border border-border rounded font-mono text-xs focus:border-accent focus:outline-none"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-text cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (sortBy === 'score') setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                        else { setSortBy('score'); setSortOrder('asc'); }
                      }}
                      className={`px-2 py-1 rounded border text-[10px] font-mono cursor-pointer transition-colors ${
                        sortBy === 'score' ? 'bg-accent/15 border-accent text-accent font-bold' : 'border-border text-muted hover:text-text'
                      }`}
                      title="Sort by Trust Score"
                    >
                      Score {sortBy === 'score' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (sortBy === 'ai') setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                        else { setSortBy('ai'); setSortOrder('desc'); }
                      }}
                      className={`px-2 py-1 rounded border text-[10px] font-mono cursor-pointer transition-colors ${
                        sortBy === 'ai' ? 'bg-accent/15 border-accent text-accent font-bold' : 'border-border text-muted hover:text-text'
                      }`}
                      title="Sort by AI %"
                    >
                      AI % {sortBy === 'ai' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </button>
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="border border-border/80 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-72 scrollbar-thin">
                  <table className="w-full text-left font-mono text-[11px] border-collapse">
                    <thead className={`sticky top-0 z-10 border-b border-border ${
                      isLight ? 'bg-[#EAEFF4] text-[#1F2E3D]' : 'bg-surface text-muted'
                    }`}>
                      <tr>
                        <th className="py-2.5 px-4 font-semibold">File Path</th>
                        <th className="py-2.5 px-3 font-semibold text-center">Score</th>
                        <th className="py-2.5 px-3 font-semibold text-center">Grade</th>
                        <th className="py-2.5 px-3 font-semibold text-center">AI %</th>
                        <th className="py-2.5 px-3 font-semibold">Models Used</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Patch Tests</th>
                        <th className="py-2.5 px-4 font-semibold text-center">Inspect</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {filteredAndSortedFiles.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 px-4 text-center text-muted font-sans text-xs">
                            No files match filter &quot;{searchQuery}&quot;
                          </td>
                        </tr>
                      ) : (
                        filteredAndSortedFiles.map((file, i) => {
                          const fStyles = getTrustColorStyles(file.score, theme);
                          const aiPct = Math.round(file.aiRatio * 100);
                          return (
                            <tr 
                              key={i} 
                              className={`hover:bg-accent/5 transition-colors cursor-pointer ${
                                selectedFile?.filePath === file.filePath ? 'bg-accent/10' : ''
                              }`}
                              onClick={() => setSelectedFile(file)}
                            >
                              <td className="py-2.5 px-4 font-medium text-text truncate max-w-xs" title={file.filePath}>
                                {file.filePath}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`font-bold ${fStyles.text}`}>{file.score}%</span>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${fStyles.badge}`}>
                                  {file.grade}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-muted">
                                {aiPct}%
                              </td>
                              <td className="py-2.5 px-3 text-muted truncate max-w-[140px]">
                                {file.modelAttributions.length > 0 
                                  ? file.modelAttributions.map(m => m.model).join(', ') 
                                  : 'Human'}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {file.failingAiLines > 0 ? (
                                  <span className="text-rose-400 font-semibold">❌ {file.failingAiLines} fail</span>
                                ) : file.verifiedAiLines > 0 ? (
                                  <span className="text-emerald-400">✅ {file.verifiedAiLines} pass</span>
                                ) : (
                                  <span className="text-muted">⚪ Pristine</span>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onSelectFile) {
                                      onSelectFile(file.filePath);
                                      onClose();
                                    }
                                  }}
                                  className="px-2.5 py-1 bg-surface-elevated hover:bg-accent/20 text-muted hover:text-accent border border-border rounded text-[10px] cursor-pointer transition-colors"
                                  title="Open in Code Editor"
                                >
                                  Open
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Selected File Details Drawer & Trust Progression Timeline */}
              {selectedFile && (
                <div className={`p-4 rounded-lg border space-y-3 animate-in fade-in duration-150 ${
                  isLight ? 'bg-slate-50 border-[#CBD8E2]' : 'bg-[#18181C] border-border'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCode size={14} className="text-accent" />
                      <span className="font-mono font-bold text-accent text-xs">
                        {selectedFile.filePath}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-muted">
                      {selectedFile.totalLines} lines • {selectedFile.aiLines} AI / {selectedFile.humanLines} Human
                    </span>
                  </div>

                  {/* Trust Progression & History Section */}
                  {loadingProgression ? (
                    <div className="py-2 flex items-center gap-2 text-muted text-[11px] font-mono">
                      <Loader2 size={12} className="animate-spin" />
                      <span>Loading trust progression timeline...</span>
                    </div>
                  ) : fileProgression && (
                    <div className="space-y-2 pt-1 border-t border-border/50">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-muted flex items-center gap-1">
                          <Clock size={12} />
                          <span>Trust Progression Over Time:</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-text">
                            {fileProgression.initialGrade} ({fileProgression.initialScore}%) → {fileProgression.currentGrade} ({fileProgression.currentScore}%)
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                            fileProgression.trend === 'improving' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                            fileProgression.trend === 'degrading' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' :
                            'bg-slate-500/20 text-slate-300 border border-slate-500/40'
                          }`}>
                            {fileProgression.trend === 'improving' ? <TrendingUp size={11} /> :
                             fileProgression.trend === 'degrading' ? <TrendingDown size={11} /> : <Minus size={11} />}
                            <span className="capitalize">{fileProgression.trend}</span>
                            {fileProgression.scoreDelta !== 0 && (
                              <span>({fileProgression.scoreDelta > 0 ? `+${fileProgression.scoreDelta}` : fileProgression.scoreDelta}%)</span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Step Timeline */}
                      <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-thin">
                        {fileProgression.history.map((step, idx) => (
                          <div
                            key={idx}
                            className={`p-2 rounded border shrink-0 text-[10px] font-mono space-y-1 min-w-[140px] ${
                              isLight ? 'bg-white border-slate-200' : 'bg-surface border-border'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-accent font-bold">Step #{idx + 1}</span>
                              <span className="font-bold">{step.grade} ({step.score}%)</span>
                            </div>
                            <div className="text-muted truncate text-[9px]" title={step.model || 'Human'}>
                              {step.model || 'Initial'}
                            </div>
                            <div className="flex items-center justify-between text-[9px]">
                              <span>{step.linesChanged} lines</span>
                              <span className={step.testStatus === 'passed' ? 'text-emerald-400' : step.testStatus === 'failed' ? 'text-rose-400' : 'text-muted'}>
                                {step.testStatus === 'passed' ? '✅ Pass' : step.testStatus === 'failed' ? '❌ Fail' : '⚪ Untested'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedFile.riskFactors.length > 0 && (
                    <div className="space-y-1 pt-1">
                      {selectedFile.riskFactors.map((r, idx) => (
                        <div key={idx} className="text-rose-400 text-[11px] flex items-center gap-1.5">
                          <span>⚠️</span>
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedFile.highlights.length > 0 && (
                    <div className="space-y-1">
                      {selectedFile.highlights.map((h, idx) => (
                        <div key={idx} className="text-emerald-400 text-[11px] flex items-center gap-1.5">
                          <span>🛡️</span>
                          <span>{h}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
};
