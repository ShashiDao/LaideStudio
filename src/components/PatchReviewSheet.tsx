import React, { useState, useMemo } from 'react';
import { useAppStore, type PendingPatch } from '../store';
import { computeHunks, type DiffHunk } from '../services/agent/patchSchema';
import { writeFile, createFile, deleteFile, listFiles } from '../services/fs/vfs';
import { createSnapshot } from '../services/fs/snapshot';
import { recordProvenanceEntry, runBackgroundTestsForProvenance } from '../services/provenance';
import { structuredPatch, applyPatch } from 'diff';
import { CheckSquare, Square, ChevronUp, ChevronDown, Check, Eye, AlertTriangle, Trash2, X } from 'lucide-react';

interface HunkState {
  patchIndex: number;
  hunkIndex: number;
  checked: boolean;
  viewMode: 'before' | 'after';
}

export function PatchReviewSheet({ projectId }: { projectId: string }) {
  const { 
    pendingPatches, 
    setPendingPatches,
    clearPendingPatches, 
    isPatchReviewOpen, 
    setIsPatchReviewOpen,
    triggerInstallEngagement,
    flashPatchedPaths
  } = useAppStore();
  // Compute all hunks on mount or when patches change
  const computedData = useMemo(() => {
    const data: { patch: PendingPatch, hunks: DiffHunk[] }[] = [];
    const stateList: HunkState[] = [];
    
    pendingPatches.forEach((patch, patchIndex) => {
      let hunks: DiffHunk[] = [];
      if (patch.type === 'replace') {
        hunks = computeHunks(patch.oldContent || '', patch.newContent || '');
      } else if (patch.type === 'append') {
         // Create a fake hunk for append
         hunks = [{
           oldStart: 1, oldLines: 0, newStart: 1, newLines: patch.newContent.split('\n').length,
           lines: patch.newContent.split('\n').map(l => ({ type: 'added', content: l }))
         }];
      } else if (patch.type === 'create') {
         hunks = [{
           oldStart: 1, oldLines: 0, newStart: 1, newLines: patch.newContent.split('\n').length,
           lines: patch.newContent.split('\n').map(l => ({ type: 'added', content: l }))
         }];
      } else if (patch.type === 'delete') {
         const old = patch.oldContent || '';
         hunks = [{
           oldStart: 1, oldLines: old.split('\n').length, newStart: 1, newLines: 0,
           lines: old.split('\n').map(l => ({ type: 'removed', content: l }))
         }];
      }
      
      data.push({ patch, hunks });
      hunks.forEach((_, hunkIndex) => {
        stateList.push({
          patchIndex,
          hunkIndex,
          checked: true,
          viewMode: patch.type === 'delete' ? 'before' : 'after' // default delete to seeing what's removed
        });
      });
    });
    return { data, stateList };
  }, [pendingPatches]);

  const [prevPatches, setPrevPatches] = useState(pendingPatches);
  const [hunkStates, setHunkStates] = useState<HunkState[]>(() => computedData.stateList);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [applyErrors, setApplyErrors] = useState<string[]>([]);

  if (pendingPatches !== prevPatches) {
    setPrevPatches(pendingPatches);
    setHunkStates(computedData.stateList);
  }

  if (pendingPatches.length === 0) return null;

  // Extract checked delete patches
  const checkedDeletePatches = computedData.data
    .filter((_, pIdx) => hunkStates.some(s => s.patchIndex === pIdx && s.checked))
    .map(d => d.patch)
    .filter(p => p.type === 'delete');

  const toggleCheck = (idx: number) => {
    const newStates = [...hunkStates];
    newStates[idx].checked = !newStates[idx].checked;
    setHunkStates(newStates);
  };

  const setViewMode = (idx: number, mode: 'before' | 'after') => {
    const newStates = [...hunkStates];
    newStates[idx].viewMode = mode;
    setHunkStates(newStates);
  };

  const executeApply = async () => {
    if (pendingPatches.length === 0) return;
    
    // Auto-create snapshot first (reuse 1.3)
    try {
      await createSnapshot(projectId, `Before applying agent patches (${pendingPatches.length})`);
    } catch (snapErr) {
      console.warn('Failed to create snapshot before patch apply:', snapErr);
    }

    const files = await listFiles(projectId);
    const appliedPaths: string[] = [];
    const recordedEntryIds: string[] = [];
    const errors: string[] = [];

    // Group hunks by patch
    for (let pIdx = 0; pIdx < computedData.data.length; pIdx++) {
      const { patch } = computedData.data[pIdx];
      const patchHunkStates = hunkStates.filter(s => s.patchIndex === pIdx);
      
      const anyChecked = patchHunkStates.some(s => s.checked);
      if (!anyChecked) continue; // Skip completely

      try {
        let beforeContent = '';
        let afterContent = '';

        if (patch.type === 'create') {
          const existing = files.find(f => f.path === patch.path);
          beforeContent = existing ? existing.content : '';
          afterContent = patch.newContent;
          if (existing) {
            await writeFile(existing.id, patch.newContent);
            existing.content = patch.newContent;
          } else {
            const created = await createFile(projectId, patch.path, patch.newContent);
            files.push(created);
          }
        } else if (patch.type === 'delete') {
          const file = files.find(f => f.path === patch.path);
          beforeContent = file ? file.content : (patch.oldContent || '');
          afterContent = '';
          if (file) {
            await deleteFile(file.id);
            const fIdx = files.findIndex(f => f.id === file.id);
            if (fIdx >= 0) files.splice(fIdx, 1);
          }
        } else if (patch.type === 'append') {
          const file = files.find(f => f.path === patch.path);
          if (file) {
            beforeContent = file.content;
            const appended = file.content + (file.content.endsWith('\n') ? '' : '\n') + patch.newContent;
            afterContent = appended;
            await writeFile(file.id, appended);
            file.content = appended;
          } else {
            throw new Error(`File ${patch.path} not found to append`);
          }
        } else if (patch.type === 'replace') {
          const file = files.find(f => f.path === patch.path);
          if (file) {
            beforeContent = file.content;
            const allHunksChecked = patchHunkStates.every(s => s.checked);
            if (allHunksChecked) {
              afterContent = patch.newContent;
              await writeFile(file.id, patch.newContent);
              file.content = patch.newContent;
            } else {
              // Partial apply
              if (patch.oldContent !== undefined && file.content !== patch.oldContent) {
                throw new Error(`File ${patch.path} has been modified since this patch was generated. Partial application aborted to prevent drift.`);
              }
              const p = structuredPatch('old', 'new', file.content, patch.newContent, '', '', { context: 3 });
              // Keep only hunks that are checked
              p.hunks = p.hunks.filter((_, idx) => {
                const state = patchHunkStates.find(s => s.hunkIndex === idx);
                return state ? state.checked : false;
              });
              const result = applyPatch(file.content, p);
              if (typeof result === 'string') {
                afterContent = result;
                await writeFile(file.id, result);
                file.content = result;
              } else {
                throw new Error(`Failed to partially apply diff hunks to ${patch.path}`);
              }
            }
          } else {
            throw new Error(`File ${patch.path} not found to replace`);
          }
        }

        // Record provenance ledger entry for the applied patch
        const recordedEntry = await recordProvenanceEntry({
          projectId,
          filePath: patch.path,
          beforeContent,
          afterContent,
          model: patch.model,
          provider: patch.provider,
          messageId: patch.messageId,
          rationale: patch.rationale
        });
        recordedEntryIds.push(recordedEntry.id);

        // Only push to appliedPaths after write and provenance operation actually succeeds
        appliedPaths.push(patch.path);
      } catch (err: any) {
        console.error(`Failed to apply patch to ${patch.path}:`, err);
        errors.push(`${patch.path}: ${err?.message || String(err)}`);
      }
    }
    
    if (appliedPaths.length > 0) {
      flashPatchedPaths(appliedPaths);
      triggerInstallEngagement();
      // Asynchronously run background test suite and attach results to ledger entries
      if (recordedEntryIds.length > 0) {
        runBackgroundTestsForProvenance(projectId, recordedEntryIds).catch(err => {
          console.warn('Background test runner for provenance failed:', err);
        });
      }
    }

    if (errors.length > 0) {
      setApplyErrors(errors);
      setShowDeleteConfirm(false);
      setIsPatchReviewOpen(true);
      if (appliedPaths.length > 0) {
        setPendingPatches(pendingPatches.filter(p => !appliedPaths.includes(p.path)));
      }
    } else {
      setApplyErrors([]);
      clearPendingPatches();
      setShowDeleteConfirm(false);
      setIsPatchReviewOpen(false);
    }
  };

  const handleApplyClick = () => {
    // If any checked patch is 'delete', intercept and show separate confirmation step
    if (checkedDeletePatches.length > 0) {
      setShowDeleteConfirm(true);
    } else {
      executeApply();
    }
  };

  return (
    <div className={`fixed bottom-0 left-0 right-0 bg-surface border-t border-border shadow-2xl transition-all duration-300 z-50 flex flex-col ${isPatchReviewOpen ? 'h-[80vh] sm:h-[75vh]' : 'h-12'}`}>
      {/* Header (swipe handle) */}
      <div 
        className="h-12 flex items-center justify-between px-3 sm:px-4 cursor-pointer hover:bg-black/5 transition-colors shrink-0 select-none"
        onClick={() => setIsPatchReviewOpen(!isPatchReviewOpen)}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
          <Eye size={16} className="text-moss shrink-0" />
          <span className="font-sans text-xs sm:text-sm text-text font-bold   truncate">
            Review Patches ({pendingPatches.length})
          </span>
          {pendingPatches.some(p => p.type === 'delete') && (
            <span className="text-[10px] font-sans bg-oxide/20 text-oxide border border-oxide/40 px-1.5 py-0.5 rounded  font-semibold flex items-center gap-1 shrink-0">
              <AlertTriangle size={10} />
              Contains Deletes
            </span>
          )}
        </div>
        <div className="shrink-0">
          {isPatchReviewOpen ? <ChevronDown size={20} className="text-muted" /> : <ChevronUp size={20} className="text-muted" />}
        </div>
      </div>

      {/* Content */}
      {isPatchReviewOpen && (
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 sm:space-y-6 scrollbar-thin">
          {/* Error Banner */}
          {applyErrors.length > 0 && (
            <div className="bg-oxide/20 border border-oxide/40 rounded-lg p-3 flex items-start justify-between gap-2 animate-in fade-in">
              <div className="flex items-start gap-2.5 min-w-0">
                <AlertTriangle size={18} className="text-oxide shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-sans font-bold text-oxide">
                    Failed to apply {applyErrors.length} patch{applyErrors.length > 1 ? 'es' : ''}:
                  </p>
                  <ul className="text-xs font-sans text-oxide/90 mt-1 list-disc list-inside space-y-1">
                    {applyErrors.map((errMsg, i) => (
                      <li key={i} className="break-all">{errMsg}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <button 
                onClick={() => setApplyErrors([])}
                className="text-oxide/70 hover:text-oxide p-1 rounded transition-colors cursor-pointer shrink-0"
                aria-label="Dismiss error banner"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {hunkStates.map((state, idx) => {
            const { patch, hunks } = computedData.data[state.patchIndex];
            const hunk = hunks[state.hunkIndex];
            const isDelete = patch.type === 'delete';
            
            const beforeLines = hunk.lines.filter(l => l.type === 'context' || l.type === 'removed');
            const afterLines = hunk.lines.filter(l => l.type === 'context' || l.type === 'added');

            return (
              <div 
                key={idx} 
                className={`border rounded-lg overflow-hidden flex flex-col min-w-0 ${
                  isDelete 
                    ? 'border-oxide/40 bg-bg shadow-[0_0_15px_rgba(248,113,113,0.05)]' 
                    : 'border-border bg-bg'
                }`}
              >
                {/* Hunk Header */}
                <div className={`p-3 border-b flex items-start justify-between gap-2 min-w-0 ${
                  isDelete ? 'bg-oxide/10 border-oxide/20' : 'bg-surface/50 border-border'
                }`}>
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className={`text-[10px] sm:text-xs font-sans px-2 py-0.5 rounded  font-semibold shrink-0 flex items-center gap-1 ${
                        isDelete 
                          ? 'bg-oxide/20 text-oxide border border-oxide/40' 
                          : 'bg-moss/20 text-moss'
                      }`}>
                        {isDelete && <Trash2 size={11} />}
                        {patch.type}
                      </span>
                      <span className="text-xs sm:text-sm font-sans text-text font-bold break-all min-w-0">{patch.path}</span>
                      {isDelete && (
                        <span className="text-[10px] font-sans text-oxide/90 font-medium">
                          (Will permanently remove this file)
                        </span>
                      )}
                    </div>
                    {patch.rationale && (
                      <p className="text-xs text-muted mt-1 break-words">{patch.rationale}</p>
                    )}
                  </div>
                  
                  <button 
                    onClick={() => toggleCheck(idx)}
                    aria-label={state.checked ? `Deselect changes for ${patch.path}` : `Select changes for ${patch.path}`}
                    className="ml-2 text-text hover:text-moss transition-colors cursor-pointer shrink-0 p-1"
                  >
                    {state.checked ? (
                      <CheckSquare size={20} className={isDelete ? "text-oxide" : "text-moss"} />
                    ) : (
                      <Square size={20} className="text-muted" />
                    )}
                  </button>
                </div>

                {/* Hunk Content */}
                <div className="flex-1 flex flex-col min-w-0">
                  {/* Toggle */}
                  <div className="flex border-b border-border bg-surface/30">
                    <button 
                      onClick={() => setViewMode(idx, 'before')}
                      className={`flex-1 py-1.5 text-xs font-sans text-center   transition-colors cursor-pointer ${state.viewMode === 'before' ? (isDelete ? 'bg-oxide/20 text-oxide font-bold' : 'bg-black/5 text-text font-bold') : 'text-muted hover:bg-black/5'}`}
                    >
                      {isDelete ? 'Content to be removed' : 'Before'}
                    </button>
                    {!isDelete && (
                      <button 
                        onClick={() => setViewMode(idx, 'after')}
                        className={`flex-1 py-1.5 text-xs font-sans text-center   transition-colors cursor-pointer ${state.viewMode === 'after' ? 'bg-black/5 text-text font-bold' : 'text-muted hover:bg-black/5'}`}
                      >
                        After
                      </button>
                    )}
                  </div>
                  
                  {/* Code */}
                  <pre className="p-3 text-xs font-mono bg-code-bg text-text overflow-x-auto min-w-0 whitespace-pre scrollbar-thin max-h-[40vh]">
                    {state.viewMode === 'before' ? (
                      beforeLines.length === 0 ? <span className="text-muted italic">No previous content</span> :
                      beforeLines.map((l, i) => (
                        <div key={i} className={`min-w-fit pr-4 ${l.type === 'removed' ? 'bg-oxide/20 text-oxide font-medium' : 'text-muted'}`}>
                          {l.content || ' '}
                        </div>
                      ))
                    ) : (
                      afterLines.length === 0 ? <span className="text-muted italic">No new content</span> :
                      afterLines.map((l, i) => (
                        <div key={i} className={`min-w-fit pr-4 ${l.type === 'added' ? 'bg-moss/20 text-moss font-medium' : 'text-muted'}`}>
                          {l.content || ' '}
                        </div>
                      ))
                    )}
                  </pre>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer (Apply Button) */}
      {isPatchReviewOpen && (
        <div className="p-3 sm:p-4 border-t border-border bg-surface/90 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 shrink-0">
          <button 
            onClick={() => {
              clearPendingPatches();
              setIsPatchReviewOpen(false);
            }}
            className="px-3 py-2 text-xs sm:text-sm font-sans text-muted hover:text-text transition-colors cursor-pointer"
          >
            Discard All
          </button>
          <button 
            onClick={handleApplyClick}
            disabled={!hunkStates.some(s => s.checked)}
            className={`px-4 sm:px-6 py-2 font-sans font-bold text-xs sm:text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer shadow-xs ${
              checkedDeletePatches.length > 0
                ? 'bg-oxide hover:bg-oxide/90 text-white'
                : 'bg-accent text-accent-text-on hover:bg-accent/90'
            }`}
          >
            {checkedDeletePatches.length > 0 ? (
              <>
                <AlertTriangle size={16} />
                Review & Apply ({hunkStates.filter(s => s.checked).length})
              </>
            ) : (
              <>
                <Check size={16} />
                Apply Selected ({hunkStates.filter(s => s.checked).length})
              </>
            )}
          </button>
        </div>
      )}

      {/* Dedicated Deletion Confirmation Step Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-surface border-2 border-oxide/40 rounded-xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-oxide/20 bg-oxide/10 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-oxide/20 text-oxide shrink-0">
                  <Trash2 size={22} />
                </div>
                <div>
                  <h3 className="text-text font-sans font-bold text-sm sm:text-base flex items-center gap-2">
                    Confirm Permanent File Deletion
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    The following {checkedDeletePatches.length} file{checkedDeletePatches.length > 1 ? 's' : ''} will be permanently removed from the project.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowDeleteConfirm(false)}
                className="text-muted hover:text-text p-1 rounded transition-colors cursor-pointer"
                aria-label="Close deletion confirmation"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body: Showing content that would be lost */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1 scrollbar-thin">
              <div className="text-xs text-oxide/90 bg-oxide/10 border border-oxide/30 rounded p-2.5 flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 mt-0.5 text-oxide" />
                <span>
                  Please inspect the content that will be lost below before proceeding. A snapshot will be automatically created before applying.
                </span>
              </div>

              {checkedDeletePatches.map((patch, idx) => (
                <div key={idx} className="border border-oxide/30 rounded-lg bg-bg overflow-hidden">
                  <div className="p-2.5 bg-surface/80 border-b border-oxide/20 flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-oxide break-all">{patch.path}</span>
                    <span className="text-[10px] font-sans bg-oxide/20 text-oxide px-2 py-0.5 rounded font-bold">
                      Delete File
                    </span>
                  </div>
                  {patch.rationale && (
                    <div className="px-3 py-1.5 bg-surface/30 text-[11px] text-muted border-b border-border">
                      <span className="text-muted font-sans">Reason: </span>
                      {patch.rationale}
                    </div>
                  )}
                  <div className="p-2 bg-code-bg text-text max-h-48 overflow-y-auto font-mono text-xs scrollbar-thin">
                    {patch.oldContent ? (
                      <pre className="text-oxide/90 whitespace-pre">
                        {patch.oldContent.split('\n').map((line, lIdx) => (
                          <div key={lIdx} className="line-through opacity-85">
                            {line || ' '}
                          </div>
                        ))}
                      </pre>
                    ) : (
                      <span className="text-muted italic">(Empty file)</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Actions */}
            <div className="p-4 border-t border-border bg-surface/90 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-xs font-sans text-muted hover:text-text transition-colors cursor-pointer"
              >
                Cancel / Keep Files
              </button>
              <button
                type="button"
                onClick={executeApply}
                className="px-4 sm:px-6 py-2 bg-oxide hover:bg-oxide/90 text-white font-sans font-bold text-xs sm:text-sm rounded transition-colors flex items-center gap-1.5 cursor-pointer shadow-lg"
              >
                <Trash2 size={16} />
                Confirm Deletion & Apply All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
