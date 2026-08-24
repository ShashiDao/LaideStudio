import React, { useState } from 'react';
import { 
  GitMerge, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Check, 
  X,
  ArrowRight
} from 'lucide-react';
import type { EnsembleEvaluationResult, CandidateExecutionResult } from '../services/agent/ensemble';

interface EnsembleCandidatePickerModalProps {
  evaluationResult: EnsembleEvaluationResult;
  onSelectCandidate: (candidate: CandidateExecutionResult) => void;
  onDismiss: () => void;
}

export function EnsembleCandidatePickerModal({
  evaluationResult,
  onSelectCandidate,
  onDismiss
}: EnsembleCandidatePickerModalProps) {
  const { candidateA, candidateB } = evaluationResult;
  const [selectedCandidateId, setSelectedCandidateId] = useState<'A' | 'B'>(
    candidateA.status === 'passed' ? 'A' : candidateB.status === 'passed' ? 'B' : 'A'
  );

  const activeCandidate = selectedCandidateId === 'A' ? candidateA : candidateB;

  const renderBadge = (candidate: CandidateExecutionResult) => {
    if (candidate.status === 'passed') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-moss bg-moss/10 border border-moss/30 px-2 py-0.5 rounded font-semibold">
          <CheckCircle2 size={12} />
          <span>Tests Passed ({candidate.testResult?.passed ?? 0})</span>
        </span>
      );
    }
    if (candidate.status === 'failed') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-oxide bg-oxide/10 border border-oxide/30 px-2 py-0.5 rounded font-semibold">
          <XCircle size={12} />
          <span>Tests Failed ({candidate.testResult?.failed ?? 0})</span>
        </span>
      );
    }
    if (candidate.status === 'no_patches') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted bg-surface border border-border px-2 py-0.5 rounded">
          <span>No Patches</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-oxide bg-oxide/10 border border-oxide/30 px-2 py-0.5 rounded">
        <AlertTriangle size={12} />
        <span>Error</span>
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="bg-surface border border-border rounded-xl w-full max-w-4xl max-h-[85vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-4 border-b border-border bg-bg/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-accent">
            <GitMerge size={20} />
            <h3 className="font-sans font-bold text-sm text-text">
              Dual-LLM Candidate Comparison
            </h3>
            <span className="text-[10px] font-mono bg-accent/15 text-accent px-2 py-0.5 rounded font-semibold">
              Ensemble Mode
            </span>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close"
            className="text-muted hover:text-text p-1 rounded transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Evaluation Summary Banner */}
        <div className="px-4 py-2.5 bg-accent/5 border-b border-border text-xs text-text flex items-center justify-between gap-2 shrink-0">
          <span className="leading-relaxed">{evaluationResult.summary}</span>
          <span className="text-[11px] text-muted shrink-0">Sandboxed Test Verified</span>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
          {/* Candidate A Column / Selector */}
          <div 
            onClick={() => setSelectedCandidateId('A')}
            className={`p-4 flex flex-col overflow-y-auto cursor-pointer transition-colors ${
              selectedCandidateId === 'A' ? 'bg-bg/80 ring-2 ring-accent inset-0' : 'bg-surface/30 hover:bg-black/5'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-sans font-bold text-sm text-text">
                  Candidate A: {candidateA.profile.label}
                </span>
              </div>
              {selectedCandidateId === 'A' && (
                <div className="w-5 h-5 rounded-full bg-accent text-surface flex items-center justify-center text-xs font-bold">
                  <Check size={13} className="stroke-[3]" />
                </div>
              )}
            </div>

            <div className="text-xs text-muted mb-3 flex items-center gap-2">
              <span>Provider: {candidateA.profile.provider}</span>
              <span>•</span>
              <span>Model: {candidateA.profile.model}</span>
            </div>

            <div className="mb-3">
              {renderBadge(candidateA)}
            </div>

            {/* Test output snippet */}
            {candidateA.testResult && (
              <div className="bg-bg border border-border/80 rounded p-2.5 mb-3 font-mono text-[11px] max-h-28 overflow-y-auto text-muted">
                <div className="font-bold text-text mb-1">Sandboxed Test Output:</div>
                <pre className="whitespace-pre-wrap">{candidateA.testResult.output || candidateA.testResult.error || 'No test output'}</pre>
              </div>
            )}

            {/* Candidate A Patches list */}
            <div className="mt-2 space-y-2 flex-1">
              <div className="text-[11px] font-sans font-semibold text-text uppercase tracking-wider">
                Proposed Patches ({candidateA.patches.length})
              </div>
              {candidateA.patches.length === 0 ? (
                <div className="text-xs text-muted italic">No file changes proposed.</div>
              ) : (
                candidateA.patches.map((p, idx) => (
                  <div key={idx} className="bg-bg border border-border rounded p-2.5 text-xs font-mono">
                    <div className="flex items-center justify-between font-bold text-accent mb-1">
                      <span className="truncate">{p.path}</span>
                      <span className="text-[10px] uppercase px-1.5 py-0.2 rounded bg-surface border border-border text-muted">
                        {p.type}
                      </span>
                    </div>
                    {p.rationale && (
                      <p className="text-[11px] font-sans text-muted leading-relaxed line-clamp-2 mt-1">
                        {p.rationale}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Candidate B Column / Selector */}
          <div 
            onClick={() => setSelectedCandidateId('B')}
            className={`p-4 flex flex-col overflow-y-auto cursor-pointer transition-colors ${
              selectedCandidateId === 'B' ? 'bg-bg/80 ring-2 ring-accent inset-0' : 'bg-surface/30 hover:bg-black/5'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-sans font-bold text-sm text-text">
                  Candidate B: {candidateB.profile.label}
                </span>
              </div>
              {selectedCandidateId === 'B' && (
                <div className="w-5 h-5 rounded-full bg-accent text-surface flex items-center justify-center text-xs font-bold">
                  <Check size={13} className="stroke-[3]" />
                </div>
              )}
            </div>

            <div className="text-xs text-muted mb-3 flex items-center gap-2">
              <span>Provider: {candidateB.profile.provider}</span>
              <span>•</span>
              <span>Model: {candidateB.profile.model}</span>
            </div>

            <div className="mb-3">
              {renderBadge(candidateB)}
            </div>

            {/* Test output snippet */}
            {candidateB.testResult && (
              <div className="bg-bg border border-border/80 rounded p-2.5 mb-3 font-mono text-[11px] max-h-28 overflow-y-auto text-muted">
                <div className="font-bold text-text mb-1">Sandboxed Test Output:</div>
                <pre className="whitespace-pre-wrap">{candidateB.testResult.output || candidateB.testResult.error || 'No test output'}</pre>
              </div>
            )}

            {/* Candidate B Patches list */}
            <div className="mt-2 space-y-2 flex-1">
              <div className="text-[11px] font-sans font-semibold text-text uppercase tracking-wider">
                Proposed Patches ({candidateB.patches.length})
              </div>
              {candidateB.patches.length === 0 ? (
                <div className="text-xs text-muted italic">No file changes proposed.</div>
              ) : (
                candidateB.patches.map((p, idx) => (
                  <div key={idx} className="bg-bg border border-border rounded p-2.5 text-xs font-mono">
                    <div className="flex items-center justify-between font-bold text-accent mb-1">
                      <span className="truncate">{p.path}</span>
                      <span className="text-[10px] uppercase px-1.5 py-0.2 rounded bg-surface border border-border text-muted">
                        {p.type}
                      </span>
                    </div>
                    {p.rationale && (
                      <p className="text-[11px] font-sans text-muted leading-relaxed line-clamp-2 mt-1">
                        {p.rationale}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-border bg-bg flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs font-sans text-muted">
            Selecting <strong className="text-text">{activeCandidate.profile.label}</strong> ({activeCandidate.patches.length} patch{activeCandidate.patches.length === 1 ? '' : 'es'})
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDismiss}
              className="px-3.5 py-2 text-xs font-sans text-muted hover:text-text transition-colors cursor-pointer"
            >
              Dismiss
            </button>

            <button
              type="button"
              onClick={() => onSelectCandidate(activeCandidate)}
              disabled={activeCandidate.patches.length === 0}
              className="px-5 py-2 bg-accent text-surface font-sans font-bold text-xs rounded-lg hover:bg-accent/90 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>Accept Candidate {selectedCandidateId} Patches</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
