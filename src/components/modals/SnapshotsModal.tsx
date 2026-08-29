import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  History, 
  RotateCcw, 
  Trash2, 
  Plus, 
  Sparkles, 
  Check, 
  AlertTriangle, 
  Clock, 
  FileText, 
  ChevronDown, 
  ChevronRight, 
  Loader2,
  Bookmark
} from 'lucide-react';
import type { Project, Snapshot, FileItem } from '../../db';
import { useAppStore } from '../../store';
import { 
  listSnapshots, 
  createSnapshot, 
  restoreSnapshot, 
  deleteSnapshot, 
  clearSnapshots 
} from '../../services/fs/snapshot';
import { EmptyState } from '../shared/EmptyState';

export interface SnapshotsModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
  onRestore?: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDays = Math.floor(diffHour / 24);
  return `${diffDays}d ago`;
}

export function SnapshotsModal({
  isOpen,
  onClose,
  project,
  onRestore
}: SnapshotsModalProps) {
  const { addToast } = useAppStore();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedSnapshotId, setExpandedSnapshotId] = useState<string | null>(null);
  
  // Creation state
  const [isCreating, setIsCreating] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  
  // Confirmation state
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const loadSnapshots = useCallback(async () => {
    if (!project) return;
    setIsLoading(true);
    try {
      const list = await listSnapshots(project.id);
      setSnapshots(list);
    } catch (err) {
      console.error('Failed to load snapshots', err);
      addToast('Failed to load project snapshots', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [project, addToast]);

  useEffect(() => {
    let active = true;
    if (isOpen && project) {
      listSnapshots(project.id).then(list => {
        if (active) {
          setSnapshots(list);
          setIsLoading(false);
        }
      }).catch(err => {
        console.error('Failed to load snapshots', err);
        if (active) {
          addToast('Failed to load project snapshots', 'error');
          setIsLoading(false);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [isOpen, project, addToast]);

  const handleClose = useCallback(() => {
    setConfirmRestoreId(null);
    setConfirmDeleteId(null);
    setIsCreating(false);
    setNewLabel('');
    onClose();
  }, [onClose]);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isRestoring) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isRestoring, handleClose]);

  if (!isOpen || !project) return null;

  const handleCreateManualSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    const labelToUse = newLabel.trim() || `Manual snapshot (${new Date().toLocaleTimeString()})`;
    try {
      await createSnapshot(project.id, labelToUse);
      setNewLabel('');
      setIsCreating(false);
      addToast(`Created snapshot: "${labelToUse}"`, 'success');
      await loadSnapshots();
    } catch (err) {
      console.error('Failed to create snapshot', err);
      addToast('Failed to create snapshot', 'error');
    }
  };

  const handleExecuteRestore = async (snapshot: Snapshot) => {
    setIsRestoring(true);
    try {
      await restoreSnapshot(snapshot.id);
      addToast(`Restored snapshot: "${snapshot.label}"`, 'success');
      if (onRestore) {
        onRestore();
      }
      onClose();
    } catch (err) {
      console.error('Failed to restore snapshot', err);
      addToast(err instanceof Error ? err.message : 'Failed to restore snapshot', 'error');
    } finally {
      setIsRestoring(false);
      setConfirmRestoreId(null);
    }
  };

  const handleDelete = async (snapshotId: string) => {
    try {
      await deleteSnapshot(snapshotId);
      addToast('Snapshot deleted', 'info');
      setConfirmDeleteId(null);
      await loadSnapshots();
    } catch (err) {
      console.error('Failed to delete snapshot', err);
      addToast('Failed to delete snapshot', 'error');
    }
  };

  const handleClearAll = async () => {
    if (!project) return;
    try {
      await clearSnapshots(project.id);
      addToast('All snapshots cleared', 'info');
      await loadSnapshots();
    } catch (err) {
      console.error('Failed to clear snapshots', err);
      addToast('Failed to clear snapshots', 'error');
    }
  };

  const getSnapshotFiles = (snapshot: Snapshot): FileItem[] => {
    try {
      return JSON.parse(snapshot.fileSnapshotJson);
    } catch {
      return [];
    }
  };

  const latestAiSnapshot = snapshots.find(s => 
    s.label.toLowerCase().includes('agent') || 
    s.label.toLowerCase().includes('before applying')
  );

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="snapshots-modal-title"
    >
      <div 
        className="bg-surface border border-border/90 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden font-mono text-xs flex flex-col max-h-[90vh] corner-ticks"
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-border/80 bg-surface-elevated/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-accent/15 text-accent border border-accent/30 shrink-0 shadow-xs">
              <History size={16} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="snapshots-modal-title" className="text-xs font-bold text-text uppercase tracking-wider truncate">
                  Snapshots & Version History
                </h2>
                <span className="px-1.5 py-0.2 bg-surface text-accent text-[9px] rounded border border-accent/30 shrink-0">
                  {project.name}
                </span>
              </div>
              <p className="text-[10px] text-muted truncate">
                Undo AI changes, restore previous versions, and bookmark safe states
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isRestoring}
            aria-label="Close snapshots dialog"
            className="p-1 text-muted hover:text-text rounded-md hover:bg-surface-elevated transition-colors cursor-pointer disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        {/* Action Header & Quick Undo */}
        <div className="p-3 sm:p-4 border-b border-border/60 bg-bg/40 space-y-3 shrink-0">
          {/* Quick Undo AI Banner */}
          {latestAiSnapshot && (
            <div className="p-3 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-between gap-3 animate-in fade-in duration-200">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-accent/20 text-accent shrink-0">
                  <Sparkles size={15} />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-text text-[11px] truncate flex items-center gap-1.5">
                    <span>Undo Last AI Changes</span>
                    <span className="text-[9px] px-1 py-0.2 rounded bg-accent/20 text-accent font-normal">
                      {formatRelativeTime(latestAiSnapshot.createdAt)}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted truncate">
                    Revert project to state before recent AI modifications
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmRestoreId(latestAiSnapshot.id)}
                disabled={isRestoring}
                className="px-3 py-1.5 bg-accent hover:bg-accent/90 text-accent-text-on rounded-lg font-bold text-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
              >
                <RotateCcw size={12} />
                <span>Undo AI Edit</span>
              </button>
            </div>
          )}

          {/* Create Manual Snapshot Bar */}
          {isCreating ? (
            <form onSubmit={handleCreateManualSnapshot} className="flex items-center gap-2">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Snapshot label (e.g. Before refactoring navbar)..."
                autoFocus
                className="flex-1 bg-bg border border-accent rounded-lg px-3 py-1.5 text-text font-mono text-xs focus:outline-none"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-accent text-accent-text-on rounded-lg font-bold text-xs flex items-center gap-1 hover:bg-accent/90 cursor-pointer shadow-xs"
              >
                <Check size={13} />
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setNewLabel('');
                }}
                className="px-2.5 py-1.5 bg-surface hover:bg-surface-elevated text-muted hover:text-text rounded-lg border border-border cursor-pointer text-xs"
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-muted flex items-center gap-1.5 font-sans">
                <Bookmark size={13} className="text-accent" />
                <span>{snapshots.length} {snapshots.length === 1 ? 'snapshot' : 'snapshots'} saved in local workspace</span>
              </div>
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="px-2.5 py-1 bg-surface hover:bg-surface-elevated text-accent hover:text-accent border border-accent/40 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer text-xs shadow-xs"
              >
                <Plus size={13} />
                <span>Create Bookmark Snapshot</span>
              </button>
            </div>
          )}
        </div>

        {/* Snapshots List Content */}
        <div className="p-3 sm:p-4 overflow-y-auto flex-1 space-y-2.5 scrollbar-thin">
          {isLoading ? (
            <div className="p-8 flex flex-col items-center justify-center text-muted gap-2">
              <Loader2 size={20} className="animate-spin text-accent" />
              <span>Loading snapshots...</span>
            </div>
          ) : snapshots.length === 0 ? (
            <EmptyState
              variant="subtle"
              icon={<History size={24} />}
              title="No Snapshots Yet"
              description="Snapshots are created automatically before AI code modifications, or you can click 'Create Bookmark Snapshot' above."
            />
          ) : (
            snapshots.map((snapshot) => {
              const files = getSnapshotFiles(snapshot);
              const isAiGenerated = snapshot.label.toLowerCase().includes('agent') || snapshot.label.toLowerCase().includes('before applying');
              const isExpanded = expandedSnapshotId === snapshot.id;
              const isConfirmingRestore = confirmRestoreId === snapshot.id;
              const isConfirmingDelete = confirmDeleteId === snapshot.id;

              return (
                <div 
                  key={snapshot.id}
                  className={`p-3 rounded-xl border transition-all ${
                    isConfirmingRestore 
                      ? 'bg-amber-500/10 border-amber-500/50 shadow-md' 
                      : 'bg-surface-elevated/70 border-border/80 hover:border-accent/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                        isAiGenerated ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30' : 'bg-accent/15 text-accent border border-accent/30'
                      }`}>
                        {isAiGenerated ? <Sparkles size={14} /> : <Bookmark size={14} />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-text text-xs">
                            {snapshot.label}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded border ${
                            isAiGenerated 
                              ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' 
                              : 'bg-accent/10 text-accent border-accent/30'
                          }`}>
                            {isAiGenerated ? 'AI Auto-Snapshot' : 'Manual Bookmark'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-[10px] text-muted mt-1 font-sans">
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            {new Date(snapshot.createdAt).toLocaleString()} ({formatRelativeTime(snapshot.createdAt)})
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-mono">
                            <FileText size={11} />
                            {files.length} {files.length === 1 ? 'file' : 'files'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setExpandedSnapshotId(isExpanded ? null : snapshot.id)}
                        className="p-1.5 text-muted hover:text-text rounded-md hover:bg-surface border border-transparent hover:border-border transition-colors cursor-pointer"
                        title={isExpanded ? 'Hide files' : 'View files in snapshot'}
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setConfirmRestoreId(snapshot.id)}
                        disabled={isRestoring}
                        className="px-2.5 py-1 bg-surface hover:bg-accent hover:text-accent-text-on text-accent border border-accent/40 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
                        title="Restore this snapshot"
                      >
                        <RotateCcw size={11} />
                        <span>Restore</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(snapshot.id)}
                        disabled={isRestoring}
                        className="p-1.5 text-muted hover:text-error rounded-md hover:bg-error/10 transition-colors cursor-pointer"
                        title="Delete snapshot"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Inline Restore Confirmation */}
                  {isConfirmingRestore && (
                    <div className="mt-3 p-3 bg-bg border border-amber-500/40 rounded-lg space-y-2.5 animate-in fade-in duration-150">
                      <div className="flex items-center gap-2 text-amber-500 font-bold text-xs">
                        <AlertTriangle size={15} />
                        <span>Confirm Workspace Restore</span>
                      </div>
                      <p className="text-[11px] text-muted font-sans leading-relaxed">
                        Restoring will overwrite current workspace files with the {files.length} files from this snapshot. Any unsaved edits made since this snapshot will be replaced.
                      </p>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setConfirmRestoreId(null)}
                          disabled={isRestoring}
                          className="px-3 py-1.5 bg-surface hover:bg-surface-elevated text-muted hover:text-text border border-border rounded-lg text-xs cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExecuteRestore(snapshot)}
                          disabled={isRestoring}
                          className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                        >
                          {isRestoring ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                          <span>Revert Workspace Now</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Inline Delete Confirmation */}
                  {isConfirmingDelete && (
                    <div className="mt-3 p-3 bg-bg border border-error/40 rounded-lg space-y-2 animate-in fade-in duration-150">
                      <div className="text-xs text-error font-bold flex items-center gap-1.5">
                        <Trash2 size={13} />
                        <span>Delete this snapshot?</span>
                      </div>
                      <p className="text-[10px] text-muted font-sans">
                        This will permanently remove this saved snapshot from IndexedDB.
                      </p>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-1 bg-surface text-muted hover:text-text border border-border rounded text-xs cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(snapshot.id)}
                          className="px-2.5 py-1 bg-error hover:bg-error/90 text-white rounded text-xs font-bold cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Expanded File List */}
                  {isExpanded && (
                    <div className="mt-3 pt-2.5 border-t border-border/60 space-y-1.5 animate-in fade-in duration-150">
                      <div className="text-[10px] uppercase font-bold text-muted tracking-wider">
                        Files in Snapshot ({files.length}):
                      </div>
                      <div className="max-h-36 overflow-y-auto bg-bg/80 p-2 rounded-lg border border-border/70 space-y-1 scrollbar-thin">
                        {files.map((file) => (
                          <div key={file.id || file.path} className="flex items-center justify-between text-[11px] text-text font-mono">
                            <span className="truncate">{file.path}</span>
                            <span className="text-[9px] text-muted shrink-0 ml-2">
                              {file.content ? `${file.content.length} chars` : 'empty'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {snapshots.length > 0 && (
          <div className="px-4 py-2.5 border-t border-border/80 bg-surface-elevated/40 flex items-center justify-between shrink-0">
            <div className="text-[10px] text-muted font-sans">
              Snapshots are stored in local browser IndexedDB
            </div>
            <button
              type="button"
              onClick={handleClearAll}
              className="text-[10px] text-muted hover:text-error flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Trash2 size={11} />
              <span>Clear All Snapshots</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
