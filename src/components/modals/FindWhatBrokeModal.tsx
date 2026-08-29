import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  Sparkles, 
  GitBranch, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  Cpu, 
  FileText, 
  Play, 
  RotateCcw,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { useAppStore } from '../../store';
import { bisectBrokenTest, type BisectProgress, type BisectResult } from '../../services/provenance/bisect';
import { formatTimestamp } from '../editor/EditorAiBlame';
import { listFiles } from '../../services/fs/vfs';
import { runProjectTestsDetailed } from '../../services/bundler/testRunner';

export interface FindWhatBrokeModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  initialTestName?: string;
}

export function FindWhatBrokeModal({
  isOpen,
  onClose,
  projectId,
  initialTestName
}: FindWhatBrokeModalProps) {
  const { setQueuedPrompt, setActiveTab, theme } = useAppStore();
  const isLight = theme === 'paper';

  const [testName, setTestName] = useState(initialTestName || '');
  const [failingTests, setFailingTests] = useState<string[]>([]);
  const [isDetectingFailures, setIsDetectingFailures] = useState(false);
  const [isRunningBisect, setIsRunningBisect] = useState(false);
  const [progress, setProgress] = useState<BisectProgress | null>(null);
  const [result, setResult] = useState<BisectResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const detectCurrentFailingTests = useCallback(async () => {
    if (!projectId) return;
    setIsDetectingFailures(true);
    try {
      const files = await listFiles(projectId);
      const testRes = await runProjectTestsDetailed(files);
      if (testRes.failedTests && testRes.failedTests.length > 0) {
        setFailingTests(testRes.failedTests);
        if (!initialTestName && testRes.failedTests.length > 0) {
          setTestName(testRes.failedTests[0]);
        }
      } else {
        setFailingTests([]);
      }
    } catch {
      setFailingTests([]);
    } finally {
      setIsDetectingFailures(false);
    }
  }, [projectId, initialTestName]);

  // Sync initialTestName when modal opens
  useEffect(() => {
    let active = true;
    if (isOpen) {
      Promise.resolve().then(() => {
        if (!active) return;
        if (initialTestName) {
          setTestName(initialTestName);
        }
        setResult(null);
        setError(null);
        setProgress(null);
        detectCurrentFailingTests();
      });
    } else {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      Promise.resolve().then(() => {
        if (!active) return;
        setIsRunningBisect(false);
      });
    }
    return () => {
      active = false;
    };
  }, [isOpen, initialTestName, detectCurrentFailingTests]);

  const handleStartBisect = async () => {
    if (!projectId || isRunningBisect) return;

    setError(null);
    setResult(null);
    setIsRunningBisect(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const bisectRes = await bisectBrokenTest({
        projectId,
        testName: testName.trim() || undefined,
        signal: abortController.signal,
        onProgress: (p) => {
          setProgress(p);
        }
      });

      setResult(bisectRes);
    } catch (err) {
      if ((err instanceof Error && err.name === 'AbortError') || abortController.signal.aborted) {
        setError('Bisection search was cancelled.');
      } else {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred during bisection.');
      }
    } finally {
      setIsRunningBisect(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunningBisect(false);
  };

  const handleSendToAgentToFix = () => {
    if (!result || !result.offendingEntry) return;

    const entry = result.offendingEntry;
    const testTitle = result.testName || testName || 'failing project test';
    const rationale = entry.rationale || 'AI generated change';
    const diffStr = result.diff || '';
    const outputDetails = result.testOutputAtOffendingPatch || 'Test assertion failed';

    const promptMessage = `The test suite detected a regression in \`${testTitle}\`.
Bisection identified that this test started failing immediately after AI patch #${(result.offendingIndex ?? 0) + 1} on \`${entry.filePath}\` (authored by ${entry.model || 'AI Assistant'}).

**Offending Patch Rationale:**
> "${rationale}"

**Offending Patch Diff:**
\`\`\`diff
${diffStr}
\`\`\`

**Test Failure Output:**
\`\`\`
${outputDetails}
\`\`\`

Please diagnose why this patch broke the test and propose a fix for \`${entry.filePath}\` so that the entire test suite passes.`;

    setQueuedPrompt(promptMessage);
    setActiveTab('chat');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bisect-modal-title"
    >
      <div className={`w-full max-w-xl max-h-[90vh] flex flex-col rounded-xl border shadow-2xl overflow-hidden font-sans corner-ticks ${
        isLight ? 'bg-[#F9FBFC] border-[#CBD8E2] text-slate-900' : 'bg-[#101013] border-border text-text'
      }`}>
        {/* Header */}
        <div className={`px-4 py-3 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'bg-white border-slate-200' : 'bg-surface-elevated/60 border-border/80'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-accent/15 text-accent border border-accent/30 shrink-0 shadow-xs">
              <GitBranch size={16} />
            </div>
            <div>
              <h2 id="bisect-modal-title" className="text-sm font-mono font-bold text-text leading-tight">
                Find What Broke This
              </h2>
              <p className="text-[11px] text-muted">
                Binary-search historical provenance patches to isolate regressions
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 text-muted hover:text-text rounded-md hover:bg-surface-elevated transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs">
          {/* Target Test Selection */}
          {!result && !isRunningBisect && (
            <div className={`p-3.5 rounded-lg border space-y-3 ${
              isLight ? 'bg-white border-slate-200' : 'bg-surface border-border'
            }`}>
              <label htmlFor="test-target-input" className="block text-xs font-semibold text-text">
                Failing Test Name or Suite:
              </label>

              {isDetectingFailures ? (
                <div className="flex items-center gap-2 text-muted text-xs py-1">
                  <Loader2 size={13} className="animate-spin text-accent" />
                  <span>Checking current project test failures...</span>
                </div>
              ) : failingTests.length > 0 ? (
                <div className="space-y-1.5">
                  <div className="text-[11px] text-rose-500 font-medium flex items-center gap-1">
                    <ShieldAlert size={13} />
                    Detected failing tests in current project:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {failingTests.map((ft) => (
                      <button
                        key={ft}
                        type="button"
                        onClick={() => setTestName(ft)}
                        className={`px-2 py-1 rounded text-[11px] border transition-all cursor-pointer text-left truncate max-w-full ${
                          testName === ft
                            ? 'bg-rose-500/20 text-rose-400 border-rose-500/50 font-semibold'
                            : 'bg-surface-elevated hover:bg-surface text-muted hover:text-text border-border'
                        }`}
                      >
                        ❌ {ft}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-1">
                <input
                  id="test-target-input"
                  type="text"
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  placeholder="e.g. math > calculates sum correctly (or leave blank for any failure)"
                  className={`w-full px-3 py-2 rounded border text-xs outline-none focus:border-accent transition-all ${
                    isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-surface-elevated border-border text-text'
                  }`}
                />
                <p className="text-[10px] text-muted leading-relaxed font-sans">
                  The sandboxed test runner will test historical snapshot copies in memory across your tamper-evident provenance ledger using binary search (O(log N) runs) without touching live project files.
                </p>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleStartBisect}
                  disabled={isRunningBisect}
                  className="px-4 py-2 bg-accent text-accent-text-on rounded-lg font-mono font-bold text-xs hover:bg-accent/90 transition-all flex items-center gap-2 cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
                >
                  <Play size={13} fill="currentColor" />
                  Start Bisection Search
                </button>
              </div>
            </div>
          )}

          {/* Running Progress Indicator */}
          {isRunningBisect && (
            <div className={`p-4 rounded-lg border space-y-3.5 animate-in fade-in duration-200 ${
              isLight ? 'bg-white border-slate-200' : 'bg-surface border-border'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-accent font-semibold text-xs">
                  <Loader2 size={15} className="animate-spin" />
                  <span>Bisecting Provenance History...</span>
                </div>
                {progress && (
                  <span className="text-[11px] text-muted">
                    Step {progress.currentStep} of ~{progress.totalEstimatedSteps}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div className="w-full bg-surface-elevated rounded-full h-2 overflow-hidden border border-border">
                <div 
                  className="bg-accent h-full transition-all duration-300 rounded-full"
                  style={{
                    width: progress 
                      ? `${Math.min(100, Math.round((progress.currentStep / progress.totalEstimatedSteps) * 100))}%` 
                      : '30%'
                  }}
                />
              </div>

              <div className="p-2.5 rounded bg-surface-elevated text-text text-[11px] space-y-1 border border-border">
                <div className="text-muted text-[10px] uppercase tracking-wider">Current Operation</div>
                <div className="text-accent font-medium truncate">
                  {progress?.statusText || 'Initializing sandbox runners...'}
                </div>
                {progress?.entry && (
                  <div className="text-[10px] text-muted flex items-center gap-2 pt-0.5 truncate">
                    <span>File: {progress.entry.filePath}</span>
                    <span>•</span>
                    <span>Model: {progress.entry.model || 'AI'}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-3 py-1.5 rounded border border-border hover:bg-surface-elevated text-muted hover:text-text text-xs cursor-pointer transition-colors"
                >
                  Cancel Bisection
                </button>
              </div>
            </div>
          )}

          {/* Error / Abort Notification */}
          {error && (
            <div className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs flex items-start gap-2.5">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-bold">Notice</div>
                <div>{error}</div>
              </div>
            </div>
          )}

          {/* Bisection Result Presentation */}
          {result && (
            <div className="space-y-3.5 animate-in fade-in duration-200">
              {result.found && result.offendingEntry ? (
                <>
                  {/* Summary Card */}
                  <div className="p-3.5 rounded-lg border border-rose-500/40 bg-rose-500/10 space-y-2">
                    <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
                      <XCircle size={15} className="shrink-0" />
                      <span>Earliest Breaking Patch Identified (Patch #{ (result.offendingIndex ?? 0) + 1 })</span>
                    </div>
                    <p className="text-[11px] text-rose-300 font-sans leading-relaxed">
                      {result.reason}
                    </p>
                  </div>

                  {/* Offending Patch Meta Details */}
                  <div className={`p-3.5 rounded-lg border space-y-2.5 ${
                    isLight ? 'bg-white border-slate-200' : 'bg-surface border-border'
                  }`}>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <div className="flex items-center gap-1 text-muted text-[10px] mb-0.5">
                          <Cpu size={11} /> Model & Provider
                        </div>
                        <div className="font-semibold text-accent truncate">
                          {result.offendingEntry.model || 'AI Assistant'} {result.offendingEntry.provider ? `(${result.offendingEntry.provider})` : ''}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center gap-1 text-muted text-[10px] mb-0.5">
                          <Clock size={11} /> Applied At
                        </div>
                        <div className="text-muted truncate">
                          {formatTimestamp(result.offendingEntry.timestamp)}
                        </div>
                      </div>

                      <div className="col-span-2">
                        <div className="flex items-center gap-1 text-muted text-[10px] mb-0.5">
                          <FileText size={11} /> Modified File
                        </div>
                        <div className="font-semibold text-text truncate">
                          {result.offendingEntry.filePath}
                        </div>
                      </div>
                    </div>

                    {/* Original Rationale */}
                    <div>
                      <div className="text-[10px] text-muted mb-1 flex items-center gap-1">
                        <FileText size={11} /> Original Patch Rationale:
                      </div>
                      <div className={`p-2 rounded text-[11px] italic leading-relaxed border ${
                        isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-[#18181C] border-border text-zinc-300'
                      }`}>
                        "{result.offendingEntry.rationale || 'No rationale provided'}"
                      </div>
                    </div>

                    {/* Unified Diff Viewer */}
                    <div>
                      <div className="text-[10px] text-muted mb-1 flex items-center justify-between">
                        <span>Offending Diff:</span>
                        <span className="text-[9px] opacity-60 font-mono">
                          #{result.offendingEntry.entryHash?.slice(0, 8) || 'genesis'}
                        </span>
                      </div>
                      <pre className={`p-2.5 rounded text-[10.5px] leading-snug overflow-x-auto max-h-48 font-mono border select-text ${
                        isLight ? 'bg-slate-900 text-slate-100 border-slate-700' : 'bg-black/70 text-zinc-200 border-border'
                      }`}>
                        {result.diff?.split('\n').map((line, idx) => {
                          let lineClass = 'text-zinc-400';
                          if (line.startsWith('+') && !line.startsWith('+++')) {
                            lineClass = 'text-emerald-400 bg-emerald-950/30';
                          } else if (line.startsWith('-') && !line.startsWith('---')) {
                            lineClass = 'text-rose-400 bg-rose-950/30';
                          } else if (line.startsWith('@@')) {
                            lineClass = 'text-cyan-400';
                          }
                          return (
                            <div key={idx} className={`${lineClass} whitespace-pre`}>
                              {line}
                            </div>
                          );
                        })}
                      </pre>
                    </div>

                    {/* Test failure details */}
                    {result.testOutputAtOffendingPatch && (
                      <div>
                        <div className="text-[10px] text-rose-400 mb-1 font-semibold flex items-center gap-1">
                          <XCircle size={11} /> Test Output at this Patch:
                        </div>
                        <pre className="p-2 rounded text-[10px] max-h-28 overflow-y-auto bg-rose-950/20 border border-rose-900/40 text-rose-300 font-mono">
                          {result.testOutputAtOffendingPatch}
                        </pre>
                      </div>
                    )}
                  </div>

                  {/* Primary CTA: Send to Agent to Fix */}
                  <div className="pt-2 flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={handleSendToAgentToFix}
                      className="flex-1 py-2.5 px-4 bg-accent text-accent-text-on rounded-lg font-mono font-bold text-xs hover:bg-accent/90 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95"
                    >
                      <Sparkles size={14} className="shrink-0" />
                      <span>Send to Agent to Fix</span>
                      <ArrowRight size={13} className="shrink-0 ml-auto sm:ml-0" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setResult(null);
                        detectCurrentFailingTests();
                      }}
                      className="py-2 px-3 rounded-lg border border-border hover:bg-surface-elevated text-muted hover:text-text text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <RotateCcw size={12} />
                      <span>Search Again</span>
                    </button>
                  </div>
                </>
              ) : (
                /* Not found or test passing */
                <div className={`p-4 rounded-lg border space-y-3 text-center ${
                  isLight ? 'bg-white border-slate-200' : 'bg-surface border-border'
                }`}>
                  <div className="w-10 h-10 rounded-full bg-accent/15 text-accent flex items-center justify-center mx-auto">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-xs text-text">No Historical Regression Found</h3>
                    <p className="text-[11px] text-muted mt-1 leading-relaxed font-sans">
                      {result.reason || 'All tests passed at historical checkpoints.'}
                    </p>
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setResult(null);
                        detectCurrentFailingTests();
                      }}
                      className="px-3 py-1.5 rounded-lg border border-border hover:bg-surface-elevated text-text text-xs cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <RotateCcw size={12} /> Try another test
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
