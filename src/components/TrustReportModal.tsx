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
  Download
} from 'lucide-react';
import { useAppStore } from '../store';
import { db } from '../db';
import { listFiles } from '../services/fs/vfs';
import { 
  calculateProjectTrustScore, 
  generateTrustMarkdownReport, 
  getTrustColorStyles,
  type ProjectTrustScore,
  type FileTrustScore
} from '../services/provenance/trustScore';

export interface TrustReportModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectFile?: (filePath: string) => void;
  onOpenBisect?: (testName?: string) => void;
  initialFilePath?: string;
}

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

  const [loading, setLoading] = useState(true);
  const [projectTrust, setProjectTrust] = useState<ProjectTrustScore | null>(null);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialFilePath || '');
  const [sortBy, setSortBy] = useState<'score' | 'ai' | 'path' | 'lines'>('score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedFile, setSelectedFile] = useState<FileTrustScore | null>(null);

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

        const result = await calculateProjectTrustScore(projectId, files, entries);
        if (active) {
          setProjectTrust(result);
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

  const handleExportLedgerJson = async () => {
    if (!projectId) return;
    try {
      const entries = await db.provenanceEntries.where('projectId').equals(projectId).toArray();
      const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `provenance-ledger-${projectId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast('Exported tamper-evident provenance ledger', 'success');
    } catch (err) {
      console.error('Failed to export provenance ledger', err);
      addToast('Failed to export ledger', 'error');
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
        <div className={`px-4 py-3 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'bg-[#EAEFF4] border-[#CBD8E2]' : 'bg-surface-elevated/40 border-border/70'
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-accent/15 text-accent border border-accent/30 shrink-0 shadow-xs">
              <ShieldCheck size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="trust-report-title" className="text-sm font-bold font-mono text-accent uppercase tracking-wider truncate">
                  AI Provenance & Trust Report
                </h2>
                {projectTrust && (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono border font-semibold ${
                    projectTrust.chainIntegrity.valid 
                      ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60'
                      : 'bg-rose-950/40 text-rose-400 border-rose-800/60'
                  }`}>
                    {projectTrust.chainIntegrity.valid ? '🔒 SHA-256 Ledger Intact' : '⚠️ Tampered'}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted truncate">
                Tamper-evident verification, model attribution & test provenance across your workspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyMarkdown}
              disabled={loading || !projectTrust}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface border border-border hover:border-accent text-muted hover:text-accent rounded font-mono text-[11px] transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
              title="Copy PR-ready Markdown report to clipboard"
            >
              {copiedMarkdown ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span className="hidden sm:inline">Copy PR Markdown</span>
            </button>
            <button
              type="button"
              onClick={handleExportLedgerJson}
              disabled={loading || !projectTrust}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface border border-border hover:border-accent text-muted hover:text-accent rounded font-mono text-[11px] transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
              title="Export raw cryptographic ledger JSON"
            >
              <Download size={13} />
              <span className="hidden sm:inline">Export Ledger</span>
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

        {/* Content Body */}
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3 text-muted">
            <Loader2 size={28} className="animate-spin text-accent" />
            <p className="font-mono text-xs">Computing cryptographic provenance & trust scores...</p>
          </div>
        ) : !projectTrust ? (
          <div className="p-8 text-center text-muted">
            <p>Failed to load provenance ledger.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 scrollbar-thin">
            
            {/* Top Cards: Trust Score Gauge & Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Card 1: Overall Trust Score */}
              <div className={`p-4 rounded-xl border flex items-center justify-between ${
                isLight ? 'bg-white border-[#CBD8E2]' : 'bg-[#151518] border-[#2A2A2E]'
              }`}>
                <div>
                  <div className="text-[10px] uppercase font-mono tracking-wider text-muted mb-1">
                    Overall Trust Score
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-3xl font-extrabold font-mono ${scoreStyles.text}`}>
                      {projectTrust.overallScore}%
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${scoreStyles.badge}`}>
                      Grade {projectTrust.overallGrade}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted mt-1">
                    {projectTrust.overallScore >= 90 
                      ? 'High trust — robust test validation' 
                      : 'Review unverified/failing AI patches'}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 ${scoreStyles.bg} ${scoreStyles.border} ${scoreStyles.text}`}>
                  {projectTrust.overallScore >= 75 ? <ShieldCheck size={26} /> : <ShieldAlert size={26} />}
                </div>
              </div>

              {/* Card 2: AI vs Human Attribution */}
              <div className={`p-4 rounded-xl border ${
                isLight ? 'bg-white border-[#CBD8E2]' : 'bg-[#151518] border-[#2A2A2E]'
              }`}>
                <div className="text-[10px] uppercase font-mono tracking-wider text-muted mb-1 flex items-center justify-between">
                  <span>AI vs Human Lines</span>
                  <span className="font-mono font-semibold text-accent">
                    {Math.round(projectTrust.aiRatio * 100)}% AI
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-border overflow-hidden my-2 flex">
                  <div 
                    className="h-full bg-accent transition-all" 
                    style={{ width: `${projectTrust.aiRatio * 100}%` }}
                    title={`AI: ${projectTrust.totalAiLines} lines`}
                  />
                  <div 
                    className="h-full bg-emerald-500/60 transition-all" 
                    style={{ width: `${(1 - projectTrust.aiRatio) * 100}%` }}
                    title={`Human: ${projectTrust.totalHumanLines} lines`}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-muted">
                  <span>AI: {projectTrust.totalAiLines} lines</span>
                  <span>Human: {projectTrust.totalHumanLines} lines</span>
                </div>
              </div>

              {/* Card 3: Test Verification Rate at Patch Time */}
              <div className={`p-4 rounded-xl border ${
                isLight ? 'bg-white border-[#CBD8E2]' : 'bg-[#151518] border-[#2A2A2E]'
              }`}>
                <div className="text-[10px] uppercase font-mono tracking-wider text-muted mb-1 flex items-center justify-between">
                  <span>Patch Test Verification</span>
                  <span className="font-mono font-semibold text-emerald-400">
                    {projectTrust.overallTestPassRate}%
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

            {/* Bisect Candidate Alert Banner if failing patches exist */}
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
                        <th className="py-2 px-3 font-semibold">File Path</th>
                        <th className="py-2 px-2.5 font-semibold text-center">Score</th>
                        <th className="py-2 px-2.5 font-semibold text-center">Grade</th>
                        <th className="py-2 px-2.5 font-semibold text-center">AI %</th>
                        <th className="py-2 px-2.5 font-semibold">Models Used</th>
                        <th className="py-2 px-2.5 font-semibold text-right">Patch Tests</th>
                        <th className="py-2 px-2.5 font-semibold text-center">Inspect</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {filteredAndSortedFiles.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-muted font-sans text-xs">
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
                              <td className="py-2 px-3 font-medium text-text truncate max-w-xs" title={file.filePath}>
                                {file.filePath}
                              </td>
                              <td className="py-2 px-2.5 text-center">
                                <span className={`font-bold ${fStyles.text}`}>{file.score}%</span>
                              </td>
                              <td className="py-2 px-2.5 text-center">
                                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${fStyles.badge}`}>
                                  {file.grade}
                                </span>
                              </td>
                              <td className="py-2 px-2.5 text-center text-muted">
                                {aiPct}%
                              </td>
                              <td className="py-2 px-2.5 text-muted truncate max-w-[140px]">
                                {file.modelAttributions.length > 0 
                                  ? file.modelAttributions.map(m => m.model).join(', ') 
                                  : 'Human'}
                              </td>
                              <td className="py-2 px-2.5 text-right">
                                {file.failingAiLines > 0 ? (
                                  <span className="text-rose-400 font-semibold">❌ {file.failingAiLines} fail</span>
                                ) : file.verifiedAiLines > 0 ? (
                                  <span className="text-emerald-400">✅ {file.verifiedAiLines} pass</span>
                                ) : (
                                  <span className="text-muted">⚪ Pristine</span>
                                )}
                              </td>
                              <td className="py-2 px-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onSelectFile) {
                                      onSelectFile(file.filePath);
                                      onClose();
                                    }
                                  }}
                                  className="px-2 py-0.5 bg-surface-elevated hover:bg-accent/20 text-muted hover:text-accent border border-border rounded text-[10px] cursor-pointer transition-colors"
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

              {/* Selected File Details Drawer if clicked */}
              {selectedFile && (
                <div className={`p-3 rounded-lg border space-y-2 animate-in fade-in duration-150 ${
                  isLight ? 'bg-slate-50 border-[#CBD8E2]' : 'bg-[#18181C] border-border'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-accent text-xs">
                      {selectedFile.filePath}
                    </span>
                    <span className="text-[10px] font-mono text-muted">
                      {selectedFile.totalLines} lines • {selectedFile.aiLines} AI / {selectedFile.humanLines} Human
                    </span>
                  </div>

                  {selectedFile.riskFactors.length > 0 && (
                    <div className="space-y-1">
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
