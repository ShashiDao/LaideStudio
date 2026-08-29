import React, { useState, useMemo } from 'react';
import { Archive, RotateCcw, Trash2, X, Search, Clock, FileText, AlertTriangle } from 'lucide-react';
import type { ArchivedProject } from '../../db';

export interface ArchivedProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  archivedProjects: ArchivedProject[];
  onRestoreProject: (projectId: string) => Promise<void>;
  onDeleteArchivedProject: (projectId: string) => Promise<void>;
}

export function ArchivedProjectsModal({
  isOpen,
  onClose,
  archivedProjects,
  onRestoreProject,
  onDeleteArchivedProject,
}: ArchivedProjectsModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteProject, setConfirmDeleteProject] = useState<ArchivedProject | null>(null);

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return archivedProjects;
    return archivedProjects.filter(p => p.name.toLowerCase().includes(q));
  }, [archivedProjects, searchQuery]);

  if (!isOpen) return null;

  const handleRestore = async (projectId: string) => {
    try {
      setRestoringId(projectId);
      await onRestoreProject(projectId);
      if (archivedProjects.length <= 1) {
        onClose();
      }
    } catch (err) {
      console.error('Failed to restore project', err);
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async (projectId: string) => {
    try {
      setDeletingId(projectId);
      await onDeleteArchivedProject(projectId);
      setConfirmDeleteProject(null);
    } catch (err) {
      console.error('Failed to permanently delete archived project', err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="archived-projects-title"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border/90 rounded-2xl sm:rounded-xl shadow-2xl w-full max-w-lg font-mono text-xs overflow-hidden corner-ticks flex flex-col max-h-[85vh] relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 py-3 border-b border-border/70 bg-surface-elevated/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 shadow-xs">
              <Archive size={16} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="archived-projects-title" className="text-xs font-bold text-accent uppercase tracking-wider truncate">
                  Archived Projects
                </h2>
                <span className="px-1.5 py-0.2 bg-surface text-muted text-[9px] rounded border border-border shrink-0">
                  {archivedProjects.length} {archivedProjects.length === 1 ? 'archived' : 'archived'}
                </span>
              </div>
              <div className="text-[10px] text-muted truncate">
                Separate storage collection for inactive workspaces
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close archived projects dialog"
            className="p-1.5 text-muted hover:text-text rounded-md hover:bg-surface-elevated transition-colors cursor-pointer shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search Bar (if > 2 items) */}
        {archivedProjects.length > 2 && (
          <div className="px-4 py-2.5 border-b border-border/60 bg-bg/40 shrink-0">
            <div className="relative flex items-center">
              <Search size={13} className="absolute left-2.5 text-muted pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search archived projects..."
                className="w-full pl-8 pr-3 py-1.5 bg-surface border border-border rounded-lg text-text placeholder-neutral-500 text-xs focus:outline-none focus:border-accent font-mono transition-colors"
                aria-label="Search archived projects"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 text-muted hover:text-text p-0.5"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Project List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 scrollbar-thin">
          {archivedProjects.length === 0 ? (
            <div className="py-10 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-xl bg-surface-elevated border border-border flex items-center justify-center text-muted mb-3 shadow-xs">
                <Archive size={22} className="opacity-60" />
              </div>
              <p className="font-mono text-xs font-bold text-text mb-1">No Archived Projects</p>
              <p className="font-sans text-[11px] text-muted max-w-xs leading-relaxed">
                Inactive projects can be archived from the workspace actions menu or header to keep your active project list clean.
              </p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="py-8 text-center text-muted text-xs font-sans">
              No archived projects matching &quot;{searchQuery}&quot;
            </div>
          ) : (
            filteredProjects.map((project) => {
              const isRestoring = restoringId === project.id;
              const isDeleting = deletingId === project.id;
              const formattedArchivedDate = new Date(project.archivedAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });

              return (
                <div
                  key={project.id}
                  className="bg-surface-elevated/40 hover:bg-surface-elevated border border-border/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-bold text-text text-xs truncate">
                        {project.name}
                      </span>
                      {project.fileCount !== undefined && (
                        <span className="px-1.5 py-0.2 bg-surface text-muted text-[9px] rounded border border-border shrink-0 flex items-center gap-1">
                          <FileText size={10} />
                          <span>{project.fileCount} {project.fileCount === 1 ? 'file' : 'files'}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted mt-1 font-sans">
                      <span className="flex items-center gap-1">
                        <Clock size={11} className="text-muted/80" />
                        <span>Archived {formattedArchivedDate}</span>
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      disabled={isRestoring || isDeleting}
                      onClick={() => handleRestore(project.id)}
                      className="px-2.5 py-1.5 bg-accent/15 hover:bg-accent/25 text-accent border border-accent/40 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 active:scale-95 shadow-xs"
                      title="Restore project to active workspace"
                      aria-label={`Restore project ${project.name}`}
                    >
                      <RotateCcw size={12} className={isRestoring ? 'animate-spin' : ''} />
                      <span>{isRestoring ? 'Restoring...' : 'Restore'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isRestoring || isDeleting}
                      onClick={() => setConfirmDeleteProject(project)}
                      className="p-1.5 text-muted hover:text-error hover:bg-error/10 border border-transparent hover:border-error/30 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                      title="Delete permanently"
                      aria-label={`Delete archived project ${project.name}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border/70 bg-surface-elevated/30 flex items-center justify-between text-[10px] text-muted shrink-0">
          <span>Archived projects are stored safely in a separate collection.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-surface border border-border hover:bg-surface-elevated text-text rounded-md text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* Permanent Delete Confirmation Overlay */}
        {confirmDeleteProject && (
          <div
            className="absolute inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm permanent deletion"
          >
            <div className="bg-surface border border-error/40 rounded-xl p-4 max-w-sm w-full space-y-3 font-mono shadow-2xl">
              <div className="flex items-center gap-2 text-error">
                <AlertTriangle size={16} />
                <span className="font-bold text-xs uppercase tracking-wider">Permanently Delete</span>
              </div>
              <p className="text-[11px] text-muted leading-relaxed font-sans">
                Are you sure you want to permanently delete <strong className="text-text font-mono">&quot;{confirmDeleteProject.name}&quot;</strong> from the archive? This cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteProject(null)}
                  className="px-3 py-1.5 bg-surface border border-border hover:bg-surface-elevated text-text rounded-lg text-xs transition-colors cursor-pointer font-sans"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handlePermanentDelete(confirmDeleteProject.id)}
                  className="px-3 py-1.5 bg-error hover:bg-error/90 text-white font-mono font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Trash2 size={12} />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
