import React, { useState, useEffect, useRef } from 'react';
import { 
  GitMerge, 
  Sparkles, 
  Play, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Check, 
  X, 
  ArrowRight, 
  Copy, 
  RefreshCw, 
  Sliders, 
  FileCode, 
  Terminal, 
  ShieldCheck, 
  Clock, 
  Coins, 
  Flame, 
  Cpu, 
  Scale, 
  ChevronDown, 
  ChevronRight,
  HelpCircle,
  FilePlus,
  FileEdit,
  Trash2
} from 'lucide-react';
import { useAppStore } from '../store';
import { db, type ConnectionProfile, type FileItem } from '../db';
import { createLLMAdapter } from '../services/llm/factory';
import { 
  runEnsembleDualEvaluation, 
  type EnsembleEvaluationResult, 
  type CandidateExecutionResult, 
  type EnsembleCandidateProfile 
} from '../services/agent/ensemble';
import { listFiles, writeFile, createFile, deleteFile } from '../services/fs/vfs';
import { createSnapshot } from '../services/fs/snapshot';
import { recordProvenanceEntry, runBackgroundTestsForProvenance } from '../services/provenance';
import { computeHunks, type DiffHunk } from '../services/agent/patchSchema';
import { buildSystemPrompt } from '../services/agent/prompts';

interface EnsembleDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  files: FileItem[];
  onRefreshFiles?: () => void;
  initialPrompt?: string;
}

const SAMPLE_PROMPTS = [
  'Fix failing unit tests and handle null edge-cases',
  'Implement missing TypeScript interfaces and error handling',
  'Refactor state management into cleanly modular hooks',
  'Add input validation and responsive layout styling'
];

export function EnsembleDashboard({
  isOpen,
  onClose,
  projectId,
  files,
  onRefreshFiles,
  initialPrompt = ''
}: EnsembleDashboardProps) {
  const { 
    keys, 
    activeProfileId, 
    addToast, 
    flashPatchedPaths, 
    customInstructions
  } = useAppStore();

  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [modelAProfileId, setModelAProfileId] = useState<string>('');
  const [modelBProfileId, setModelBProfileId] = useState<string>('');
  const [prompt, setPrompt] = useState(initialPrompt);
  const [runTests, setRunTests] = useState(true);
  const [temperature, setTemperature] = useState(0.2);
  const [maxSteps, setMaxSteps] = useState(15);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Execution state
  const [isExecuting, setIsExecuting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [executionPhase, setExecutionPhase] = useState<'idle' | 'running' | 'judging' | 'completed' | 'error'>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [evaluationResult, setEvaluationResult] = useState<EnsembleEvaluationResult | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  // UI view toggles
  const [expandedFileA, setExpandedFileA] = useState<string | null>(null);
  const [expandedFileB, setExpandedFileB] = useState<string | null>(null);
  const [showLogsA, setShowLogsA] = useState(false);
  const [showLogsB, setShowLogsB] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);

  // Load profiles on mount
  useEffect(() => {
    async function loadProfiles() {
      try {
        const list = await db.connectionProfiles.toArray();
        setProfiles(list);
        if (list.length > 0) {
          const active = list.find(p => p.id === activeProfileId) || list[0];
          setModelAProfileId(active.id);
          const second = list.find(p => p.id !== active.id) || list[0];
          setModelBProfileId(second.id);
        }
      } catch (err) {
        console.error('Failed to load profiles for Ensemble dashboard', err);
      }
    }
    if (isOpen) {
      loadProfiles();
    }
  }, [isOpen, activeProfileId]);

  // Timer while executing
  useEffect(() => {
    if (isExecuting) {
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isExecuting]);

  if (!isOpen) return null;

  const profileA = profiles.find(p => p.id === modelAProfileId) || profiles[0] || null;
  const profileB = profiles.find(p => p.id === modelBProfileId) || profiles[1] || profiles[0] || null;

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsExecuting(false);
    setExecutionPhase('idle');
    setStatusMessage('Execution cancelled by user.');
  };

  const handleRunEnsemble = async () => {
    if (!prompt.trim()) {
      addToast('Please enter a task or prompt to evaluate.', 'error');
      return;
    }
    if (!keys) {
      addToast('Vault is locked. Please unlock your vault first.', 'error');
      return;
    }
    if (!profileA || !profileB) {
      addToast('Please configure at least one AI connection profile in Settings.', 'error');
      return;
    }

    setIsExecuting(true);
    setExecutionPhase('running');
    setStatusMessage('Initializing parallel candidate pipelines...');
    setEvaluationResult(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const adapterA = await createLLMAdapter(profileA, keys.aesKey);
      const adapterB = await createLLMAdapter(profileB, keys.aesKey);

      const candProfileA: EnsembleCandidateProfile = {
        id: profileA.id,
        label: profileA.label || profileA.model || 'Candidate A',
        provider: profileA.provider,
        model: profileA.model,
        adapter: adapterA
      };

      const candProfileB: EnsembleCandidateProfile = {
        id: profileB.id,
        label: profileB.label || profileB.model || 'Candidate B',
        provider: profileB.provider,
        model: profileB.model,
        adapter: adapterB
      };

      const projectFiles = files && files.length > 0 ? files : await listFiles(projectId);

      const systemPrompt = buildSystemPrompt(
        projectFiles,
        customInstructions
      );

      setStatusMessage(`Dispatching parallel generation: ${candProfileA.label} vs ${candProfileB.label}...`);

      const result = await runEnsembleDualEvaluation(
        prompt,
        [],
        candProfileA,
        candProfileB,
        projectId,
        systemPrompt,
        projectFiles,
        abortController.signal,
        {
          temperature,
          maxSteps
        },
        (msg) => {
          setStatusMessage(msg);
          if (msg.toLowerCase().includes('arbiter') || msg.toLowerCase().includes('judge')) {
            setExecutionPhase('judging');
          }
        }
      );

      if (abortController.signal.aborted) return;

      setEvaluationResult(result);
      setExecutionPhase('completed');
      setStatusMessage(result.summary);
      addToast('Ensemble evaluation and arbitration completed!', 'success');

    } catch (err: any) {
      if (abortController.signal.aborted) return;
      console.error('Ensemble evaluation failed', err);
      setExecutionPhase('error');
      setStatusMessage(`Error: ${err?.message || 'Failed to complete dual generation'}`);
      addToast(err?.message || 'Dual generation failed', 'error');
    } finally {
      setIsExecuting(false);
      abortControllerRef.current = null;
    }
  };

  const handleApplyCandidatePatches = async (candidate: CandidateExecutionResult) => {
    if (!candidate || candidate.patches.length === 0) {
      addToast('Candidate has no patches to apply.', 'info');
      return;
    }

    setIsApplying(true);
    try {
      // 1. Snapshot prior state
      await createSnapshot(projectId, `Before applying ${candidate.profile.label} ensemble patches (${candidate.patches.length})`);

      const currentFiles = await listFiles(projectId);
      const updatedPaths: string[] = [];
      const provenanceIds: string[] = [];

      for (const patch of candidate.patches) {
        let beforeContent = '';
        let afterContent = '';

        if (patch.type === 'create') {
          const existing = currentFiles.find(f => f.path === patch.path);
          beforeContent = existing ? existing.content : '';
          afterContent = patch.newContent;
          if (existing) {
            await writeFile(existing.id, patch.newContent);
            existing.content = patch.newContent;
          } else {
            const created = await createFile(projectId, patch.path, patch.newContent);
            currentFiles.push(created);
          }
        } else if (patch.type === 'delete') {
          const file = currentFiles.find(f => f.path === patch.path);
          beforeContent = file ? file.content : (patch.oldContent || '');
          afterContent = '';
          if (file) {
            await deleteFile(file.id);
          }
        } else {
          // replace or append
          const file = currentFiles.find(f => f.path === patch.path);
          beforeContent = file ? file.content : (patch.oldContent || '');
          afterContent = patch.newContent;
          if (file) {
            await writeFile(file.id, patch.newContent);
            file.content = patch.newContent;
          } else {
            const created = await createFile(projectId, patch.path, patch.newContent);
            currentFiles.push(created);
          }
        }

        updatedPaths.push(patch.path);

        // Record provenance
        try {
          const provEntry = await recordProvenanceEntry({
            projectId,
            filePath: patch.path,
            beforeContent,
            afterContent,
            model: candidate.profile.model,
            provider: candidate.profile.provider,
            rationale: `Ensemble accepted candidate (${candidate.profile.label}): ${patch.rationale || 'Code generation'}`
          });
          provenanceIds.push(provEntry.id);
        } catch (provErr) {
          console.warn('Failed recording provenance for ensemble patch:', provErr);
        }
      }

      if (provenanceIds.length > 0) {
        runBackgroundTestsForProvenance(projectId, provenanceIds).catch(e => 
          console.warn('Background provenance tests failed:', e)
        );
      }

      flashPatchedPaths(updatedPaths);
      if (onRefreshFiles) {
        await onRefreshFiles();
      }

      addToast(`Applied ${candidate.patches.length} patch(es) from ${candidate.profile.label}!`, 'success');
      onClose();

    } catch (err: any) {
      console.error('Failed to apply candidate patches', err);
      addToast(`Failed to apply patches: ${err.message}`, 'error');
    } finally {
      setIsApplying(false);
    }
  };

  const handleCopyReport = () => {
    if (!evaluationResult) return;
    const { candidateA, candidateB, arbiter, summary } = evaluationResult;
    const report = `# Ensemble Dual-LLM Comparison Report
**Task**: ${prompt}
**Generated**: ${new Date().toLocaleString()}

## 🏆 Arbiter Verdict
${arbiter ? `**Winner**: Candidate ${arbiter.winner} (${arbiter.winner === 'A' ? candidateA.profile.label : candidateB.profile.label})\n**Reasoning**: ${arbiter.reasoning}` : summary}

## Candidate A: ${candidateA.profile.label}
- **Provider / Model**: ${candidateA.profile.provider} / ${candidateA.profile.model}
- **Status**: ${candidateA.status}
- **Tests**: ${candidateA.testResult ? `${candidateA.testResult.passed} passed, ${candidateA.testResult.failed} failed` : 'None'}
- **Proposed Patches**: ${candidateA.patches.length} files
${candidateA.patches.map(p => `  - \`${p.path}\` (${p.type}): ${p.rationale}`).join('\n')}

## Candidate B: ${candidateB.profile.label}
- **Provider / Model**: ${candidateB.profile.provider} / ${candidateB.profile.model}
- **Status**: ${candidateB.status}
- **Tests**: ${candidateB.testResult ? `${candidateB.testResult.passed} passed, ${candidateB.testResult.failed} failed` : 'None'}
- **Proposed Patches**: ${candidateB.patches.length} files
${candidateB.patches.map(p => `  - \`${p.path}\` (${p.type}): ${p.rationale}`).join('\n')}
`;
    navigator.clipboard.writeText(report);
    addToast('Comparison report copied to clipboard!', 'success');
  };

  const renderCandidateStatusBadge = (cand: CandidateExecutionResult) => {
    if (cand.status === 'passed') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-moss bg-moss/10 border border-moss/30 px-2 py-0.5 rounded font-semibold">
          <CheckCircle2 size={13} />
          <span>Tests Passed ({cand.testResult?.passed ?? 0})</span>
        </span>
      );
    }
    if (cand.status === 'failed') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-oxide bg-oxide/10 border border-oxide/30 px-2 py-0.5 rounded font-semibold">
          <XCircle size={13} />
          <span>Tests Failed ({cand.testResult?.failed ?? 0})</span>
        </span>
      );
    }
    if (cand.status === 'no_patches') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted bg-surface border border-border px-2 py-0.5 rounded">
          <span>No Patches</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-oxide bg-oxide/10 border border-oxide/30 px-2 py-0.5 rounded">
        <AlertTriangle size={13} />
        <span>Execution Error</span>
      </span>
    );
  };

  const renderDiffSnippet = (oldContent: string = '', newContent: string = '', patchType: string) => {
    let lines: { type: 'added' | 'removed' | 'context'; text: string; lineNo?: number }[] = [];
    
    if (patchType === 'create') {
      lines = newContent.split('\n').map((line, i) => ({ type: 'added', text: line, lineNo: i + 1 }));
    } else if (patchType === 'delete') {
      lines = oldContent.split('\n').map((line, i) => ({ type: 'removed', text: line, lineNo: i + 1 }));
    } else {
      const hunks = computeHunks(oldContent, newContent);
      if (hunks.length > 0) {
        hunks.slice(0, 3).forEach(h => {
          h.lines.forEach((l, i) => {
            lines.push({ type: l.type, text: l.content, lineNo: i + 1 });
          });
        });
      } else {
        lines = newContent.split('\n').slice(0, 15).map((l, i) => ({ type: 'context', text: l, lineNo: i + 1 }));
      }
    }

    const previewLines = lines.slice(0, 20);

    return (
      <div className="bg-code-bg border border-border/80 rounded font-mono text-[11px] overflow-x-auto max-h-48 scrollbar-thin p-2 select-text">
        {previewLines.map((line, idx) => (
          <div 
            key={idx} 
            className={`flex items-start gap-2 leading-relaxed px-1 rounded-xs ${
              line.type === 'added' ? 'bg-moss/15 text-moss' : line.type === 'removed' ? 'bg-oxide/15 text-oxide line-through' : 'text-muted'
            }`}
          >
            <span className="w-5 shrink-0 text-right select-none opacity-40">{line.lineNo || idx + 1}</span>
            <span className="w-3 shrink-0 font-bold select-none">
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
            </span>
            <span className="whitespace-pre flex-1">{line.text || ' '}</span>
          </div>
        ))}
        {lines.length > 20 && (
          <div className="text-[10px] text-muted italic px-2 pt-1">
            ... and {lines.length - 20} more lines
          </div>
        )}
      </div>
    );
  };

  const isWinnerA = evaluationResult?.arbiter?.winner === 'A';
  const isWinnerB = evaluationResult?.arbiter?.winner === 'B';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ensemble-dashboard-title"
    >
      <div className="bg-surface border border-border rounded-xl w-full max-w-6xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden corner-ticks">
        
        {/* Top Header */}
        <div className="px-5 py-3.5 border-b border-border bg-surface-elevated/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/40 flex items-center justify-center text-accent shrink-0 shadow-xs">
              <Scale size={18} strokeWidth={2.2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="ensemble-dashboard-title" className="font-mono font-bold text-sm text-text">
                  Ensemble Mode Studio
                </h2>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-accent/20 text-accent font-bold border border-accent/30">
                  Dual-Model & Judge AI
                </span>
              </div>
              <p className="text-xs text-muted font-sans">
                Trigger parallel code generation from two distinct models with automatic test verification and AI arbitration.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {evaluationResult && (
              <button
                type="button"
                onClick={handleCopyReport}
                className="px-2.5 py-1.5 bg-surface hover:bg-surface-elevated text-muted hover:text-text border border-border rounded text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Copy markdown report"
              >
                <Copy size={13} />
                <span className="hidden sm:inline">Copy Report</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Ensemble Dashboard"
              className="p-1.5 text-muted hover:text-text rounded-md hover:bg-surface-elevated transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Dashboard Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          
          {/* Setup / Configuration Box */}
          <div className="bg-bg/70 border border-border rounded-xl p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Candidate A Model Picker */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-bold text-accent flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Cpu size={14} />
                    Model A (Primary Candidate)
                  </span>
                  <span className="text-[10px] font-normal text-muted">Slot A</span>
                </label>
                <select
                  value={modelAProfileId}
                  onChange={(e) => setModelAProfileId(e.target.value)}
                  disabled={isExecuting}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs font-mono text-text focus:border-accent focus:outline-none transition-colors"
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.label || `${p.provider} • ${p.model}`} ({p.model})
                    </option>
                  ))}
                </select>
                {profileA && (
                  <div className="flex items-center gap-2 text-[10px] font-mono text-muted px-1">
                    <span className="px-1.5 py-0.2 rounded bg-surface border border-border">{profileA.provider}</span>
                    <span className="truncate">{profileA.model}</span>
                  </div>
                )}
              </div>

              {/* Candidate B Model Picker */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-bold text-accent flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Cpu size={14} />
                    Model B (Comparison Candidate)
                  </span>
                  <span className="text-[10px] font-normal text-muted">Slot B</span>
                </label>
                <select
                  value={modelBProfileId}
                  onChange={(e) => setModelBProfileId(e.target.value)}
                  disabled={isExecuting}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs font-mono text-text focus:border-accent focus:outline-none transition-colors"
                >
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.label || `${p.provider} • ${p.model}`} ({p.model})
                    </option>
                  ))}
                </select>
                {profileB && (
                  <div className="flex items-center gap-2 text-[10px] font-mono text-muted px-1">
                    <span className="px-1.5 py-0.2 rounded bg-surface border border-border">{profileB.provider}</span>
                    <span className="truncate">{profileB.model}</span>
                  </div>
                )}
              </div>

            </div>

            {/* Task Prompt Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono font-bold text-text flex items-center gap-1.5">
                  <FileCode size={14} className="text-accent" />
                  <span>Task Instruction / Code Request</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-[11px] font-mono text-muted hover:text-accent flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Sliders size={12} />
                  <span>{showAdvanced ? 'Hide Options' : 'Run Options'}</span>
                </button>
              </div>

              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the feature to implement, bug to resolve, or test failures to fix in parallel..."
                rows={3}
                disabled={isExecuting}
                className="w-full bg-surface border border-border rounded-lg p-3 text-xs font-mono text-text placeholder:text-muted/60 focus:border-accent focus:outline-none resize-y min-h-[70px]"
              />

              {/* Sample Prompt Chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] font-mono text-muted mr-1">Quick Tasks:</span>
                {SAMPLE_PROMPTS.map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPrompt(sample)}
                    disabled={isExecuting}
                    className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface hover:bg-surface-elevated text-muted hover:text-text border border-border/80 transition-colors cursor-pointer truncate max-w-[260px]"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced Options Accordion */}
            {showAdvanced && (
              <div className="p-3 bg-surface border border-border/70 rounded-lg grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono animate-in fade-in duration-150">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={runTests}
                    onChange={(e) => setRunTests(e.target.checked)}
                    disabled={isExecuting}
                    className="rounded border-border text-accent focus:ring-accent"
                  />
                  <span className="text-text">Run Sandboxed Tests</span>
                </label>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted">Temperature:</span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value) || 0.2)}
                    disabled={isExecuting}
                    className="w-16 bg-bg border border-border rounded px-2 py-0.5 text-xs text-text text-right"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted">Max Agent Steps:</span>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={maxSteps}
                    onChange={(e) => setMaxSteps(parseInt(e.target.value, 10) || 15)}
                    disabled={isExecuting}
                    className="w-16 bg-bg border border-border rounded px-2 py-0.5 text-xs text-text text-right"
                  />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/60">
              <div className="text-xs font-mono text-muted flex items-center gap-2 truncate">
                {isExecuting ? (
                  <span className="text-accent flex items-center gap-1.5 animate-pulse">
                    <RefreshCw size={13} className="animate-spin" />
                    <span>{statusMessage || 'Processing parallel generation...'} ({elapsedSeconds}s)</span>
                  </span>
                ) : (
                  <span>Ready to evaluate 2 candidates side-by-side</span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isExecuting ? (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-3.5 py-2 bg-surface hover:bg-oxide/20 text-oxide border border-oxide/40 font-mono text-xs font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel Run
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRunEnsemble}
                    disabled={isExecuting || !prompt.trim() || !keys || !profileA || !profileB || profileA.id === profileB.id}
                    className="px-5 py-2 bg-accent hover:bg-accent/90 text-accent-text-on font-mono font-bold text-xs rounded-lg transition-all flex items-center gap-2 cursor-pointer shadow-sm hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Play size={14} className="fill-current" />
                    <span>Run Parallel Generation</span>
                  </button>
                )}
              </div>
            </div>

          </div>

          {/* Judge Recommendation Banner (when completed) */}
          {evaluationResult && (
            <div className={`p-4 rounded-xl border transition-all ${
              evaluationResult.arbiter 
                ? 'bg-accent/10 border-accent/50 shadow-md' 
                : 'bg-surface border-border'
            }`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-accent text-accent-text-on shrink-0 mt-0.5">
                    <Scale size={18} strokeWidth={2.5} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-mono font-bold text-sm text-text">
                        {evaluationResult.arbiter 
                          ? `🏆 Judge AI Recommends Candidate ${evaluationResult.arbiter.winner}: ${evaluationResult.arbiter.winner === 'A' ? evaluationResult.candidateA.profile.label : evaluationResult.candidateB.profile.label}` 
                          : 'Ensemble Evaluation Summary'}
                      </h3>
                      {evaluationResult.arbiter && (
                        <span className="px-2 py-0.5 rounded bg-accent/20 text-accent text-[10px] font-mono font-bold border border-accent/40">
                          Recommended Winner
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text/90 font-sans mt-1 leading-relaxed">
                      {evaluationResult.arbiter?.reasoning || evaluationResult.summary}
                    </p>
                  </div>
                </div>

                {evaluationResult.chosenCandidate && (
                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleApplyCandidatePatches(evaluationResult.chosenCandidate!)}
                      disabled={isApplying || evaluationResult.chosenCandidate.patches.length === 0}
                      className="w-full md:w-auto px-4 py-2 bg-moss hover:bg-moss/90 text-white font-mono font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 shadow cursor-pointer disabled:opacity-50"
                    >
                      <Check size={14} className="stroke-[3]" />
                      <span>Apply Recommended Solution ({evaluationResult.chosenCandidate.patches.length} files)</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Side-by-Side Results Columns */}
          {evaluationResult && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              
              {/* Candidate A Column */}
              <div className={`bg-bg/80 border rounded-xl p-4 flex flex-col space-y-3 relative ${
                isWinnerA ? 'border-accent ring-1 ring-accent/60 bg-accent/5' : 'border-border'
              }`}>
                {/* Header */}
                <div className="flex items-center justify-between pb-2 border-b border-border/70">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-text">
                      Candidate A: {evaluationResult.candidateA.profile.label}
                    </span>
                    {isWinnerA && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-accent text-accent-text-on font-bold">
                        Winner
                      </span>
                    )}
                  </div>
                  {renderCandidateStatusBadge(evaluationResult.candidateA)}
                </div>

                {/* Model Meta */}
                <div className="flex items-center justify-between text-[11px] font-mono text-muted bg-surface/60 px-2.5 py-1.5 rounded border border-border/50">
                  <span>{evaluationResult.candidateA.profile.provider} • {evaluationResult.candidateA.profile.model}</span>
                  <span>{evaluationResult.candidateA.patches.length} patch(es)</span>
                </div>

                {/* Test Output Expandable */}
                {evaluationResult.candidateA.testResult && (
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setShowLogsA(!showLogsA)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-surface border border-border/60 text-xs font-mono text-muted hover:text-text cursor-pointer transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Terminal size={12} className="text-accent" />
                        <span>Sandboxed Test Output ({evaluationResult.candidateA.testResult.passed} passed, {evaluationResult.candidateA.testResult.failed} failed)</span>
                      </span>
                      {showLogsA ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    {showLogsA && (
                      <pre className="bg-code-bg border border-border p-2.5 rounded text-[10px] font-mono text-muted max-h-36 overflow-y-auto whitespace-pre-wrap">
                        {evaluationResult.candidateA.testResult.output || evaluationResult.candidateA.testResult.error || 'No stdout generated'}
                      </pre>
                    )}
                  </div>
                )}

                {/* Patches Accordion */}
                <div className="space-y-2 flex-1">
                  <div className="text-[11px] font-mono font-bold text-text uppercase tracking-wider">
                    Proposed Patches ({evaluationResult.candidateA.patches.length})
                  </div>

                  {evaluationResult.candidateA.patches.length === 0 ? (
                    <div className="p-4 text-center text-xs font-mono text-muted italic bg-surface/30 rounded border border-border/40">
                      No code patches proposed by Candidate A.
                    </div>
                  ) : (
                    evaluationResult.candidateA.patches.map((p, idx) => {
                      const isExpanded = expandedFileA === p.path || (expandedFileA === null && idx === 0);
                      return (
                        <div key={idx} className="bg-surface border border-border rounded-lg overflow-hidden font-mono text-xs">
                          <button
                            type="button"
                            onClick={() => setExpandedFileA(isExpanded ? '' : p.path)}
                            className="w-full px-3 py-2 flex items-center justify-between hover:bg-surface-elevated transition-colors cursor-pointer text-left"
                          >
                            <div className="flex items-center gap-2 truncate">
                              {p.type === 'create' ? (
                                <FilePlus size={13} className="text-moss shrink-0" />
                              ) : p.type === 'delete' ? (
                                <Trash2 size={13} className="text-oxide shrink-0" />
                              ) : (
                                <FileEdit size={13} className="text-accent shrink-0" />
                              )}
                              <span className="font-bold text-text truncate">{p.path}</span>
                            </div>
                            <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-bg border border-border text-muted shrink-0 ml-2">
                              {p.type}
                            </span>
                          </button>

                          {isExpanded && (
                            <div className="p-2.5 pt-0 space-y-2 border-t border-border/40">
                              {p.rationale && (
                                <p className="text-[11px] font-sans text-muted leading-relaxed pt-1.5">
                                  {p.rationale}
                                </p>
                              )}
                              {renderDiffSnippet(p.oldContent, p.newContent, p.type)}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Column Action */}
                <div className="pt-2 border-t border-border/60">
                  <button
                    type="button"
                    onClick={() => handleApplyCandidatePatches(evaluationResult.candidateA)}
                    disabled={isApplying || evaluationResult.candidateA.patches.length === 0}
                    className="w-full py-2 bg-surface hover:bg-surface-elevated text-text hover:text-accent border border-border hover:border-accent/50 font-mono font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <span>Apply Candidate A Patches</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>

              {/* Candidate B Column */}
              <div className={`bg-bg/80 border rounded-xl p-4 flex flex-col space-y-3 relative ${
                isWinnerB ? 'border-accent ring-1 ring-accent/60 bg-accent/5' : 'border-border'
              }`}>
                {/* Header */}
                <div className="flex items-center justify-between pb-2 border-b border-border/70">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-text">
                      Candidate B: {evaluationResult.candidateB.profile.label}
                    </span>
                    {isWinnerB && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-accent text-accent-text-on font-bold">
                        Winner
                      </span>
                    )}
                  </div>
                  {renderCandidateStatusBadge(evaluationResult.candidateB)}
                </div>

                {/* Model Meta */}
                <div className="flex items-center justify-between text-[11px] font-mono text-muted bg-surface/60 px-2.5 py-1.5 rounded border border-border/50">
                  <span>{evaluationResult.candidateB.profile.provider} • {evaluationResult.candidateB.profile.model}</span>
                  <span>{evaluationResult.candidateB.patches.length} patch(es)</span>
                </div>

                {/* Test Output Expandable */}
                {evaluationResult.candidateB.testResult && (
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setShowLogsB(!showLogsB)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-surface border border-border/60 text-xs font-mono text-muted hover:text-text cursor-pointer transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Terminal size={12} className="text-accent" />
                        <span>Sandboxed Test Output ({evaluationResult.candidateB.testResult.passed} passed, {evaluationResult.candidateB.testResult.failed} failed)</span>
                      </span>
                      {showLogsB ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    {showLogsB && (
                      <pre className="bg-code-bg border border-border p-2.5 rounded text-[10px] font-mono text-muted max-h-36 overflow-y-auto whitespace-pre-wrap">
                        {evaluationResult.candidateB.testResult.output || evaluationResult.candidateB.testResult.error || 'No stdout generated'}
                      </pre>
                    )}
                  </div>
                )}

                {/* Patches Accordion */}
                <div className="space-y-2 flex-1">
                  <div className="text-[11px] font-mono font-bold text-text uppercase tracking-wider">
                    Proposed Patches ({evaluationResult.candidateB.patches.length})
                  </div>

                  {evaluationResult.candidateB.patches.length === 0 ? (
                    <div className="p-4 text-center text-xs font-mono text-muted italic bg-surface/30 rounded border border-border/40">
                      No code patches proposed by Candidate B.
                    </div>
                  ) : (
                    evaluationResult.candidateB.patches.map((p, idx) => {
                      const isExpanded = expandedFileB === p.path || (expandedFileB === null && idx === 0);
                      return (
                        <div key={idx} className="bg-surface border border-border rounded-lg overflow-hidden font-mono text-xs">
                          <button
                            type="button"
                            onClick={() => setExpandedFileB(isExpanded ? '' : p.path)}
                            className="w-full px-3 py-2 flex items-center justify-between hover:bg-surface-elevated transition-colors cursor-pointer text-left"
                          >
                            <div className="flex items-center gap-2 truncate">
                              {p.type === 'create' ? (
                                <FilePlus size={13} className="text-moss shrink-0" />
                              ) : p.type === 'delete' ? (
                                <Trash2 size={13} className="text-oxide shrink-0" />
                              ) : (
                                <FileEdit size={13} className="text-accent shrink-0" />
                              )}
                              <span className="font-bold text-text truncate">{p.path}</span>
                            </div>
                            <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-bg border border-border text-muted shrink-0 ml-2">
                              {p.type}
                            </span>
                          </button>

                          {isExpanded && (
                            <div className="p-2.5 pt-0 space-y-2 border-t border-border/40">
                              {p.rationale && (
                                <p className="text-[11px] font-sans text-muted leading-relaxed pt-1.5">
                                  {p.rationale}
                                </p>
                              )}
                              {renderDiffSnippet(p.oldContent, p.newContent, p.type)}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Column Action */}
                <div className="pt-2 border-t border-border/60">
                  <button
                    type="button"
                    onClick={() => handleApplyCandidatePatches(evaluationResult.candidateB)}
                    disabled={isApplying || evaluationResult.candidateB.patches.length === 0}
                    className="w-full py-2 bg-surface hover:bg-surface-elevated text-text hover:text-accent border border-border hover:border-accent/50 font-mono font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <span>Apply Candidate B Patches</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border bg-surface-elevated/40 flex items-center justify-between text-xs font-mono text-muted shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-accent" />
            <span>Sandboxed execution protects workspace files until you click Apply</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-surface hover:bg-surface-elevated border border-border text-text rounded text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
