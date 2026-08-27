import React, { useState, useEffect, useRef } from 'react';
import { Edit2, X, Check, AlertCircle } from 'lucide-react';
import type { Project } from '../db';

export interface RenameProjectModalProps {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
  onRename: (projectId: string, newName: string) => Promise<void>;
}

export function RenameProjectModal({
  project,
  isOpen,
  onClose,
  onRename,
}: RenameProjectModalProps) {
  const [name, setName] = useState(project?.name || '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [prevProject, setPrevProject] = useState(project);

  if (project !== prevProject) {
    setPrevProject(project);
    setName(project?.name || '');
    setError(null);
  }

  useEffect(() => {
    if (project && isOpen) {
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [project, isOpen]);

  if (!isOpen || !project) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Workspace name cannot be empty');
      return;
    }
    if (trimmed.length > 60) {
      setError('Workspace name cannot exceed 60 characters');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onRename(project.id, trimmed);
      onClose();
    } catch (err) {
      console.error('Rename project failed', err);
      setError(err instanceof Error ? err.message : 'Failed to rename workspace');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/65 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-project-title"
      onClick={onClose}
    >
      <div 
        className="bg-surface border border-border/90 rounded-xl shadow-2xl w-full max-w-md p-5 font-mono relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-accent/15 text-accent border border-accent/30">
              <Edit2 size={15} />
            </div>
            <h3 id="rename-project-title" className="text-xs font-bold text-text uppercase tracking-wider">
              Rename Workspace
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="text-muted hover:text-text p-1 rounded hover:bg-surface-elevated transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="workspace-name-input" className="block text-[11px] text-muted mb-1.5 font-medium">
              Workspace Name
            </label>
            <input
              ref={inputRef}
              id="workspace-name-input"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. My Next Project"
              maxLength={60}
              className="w-full px-3 py-2 bg-bg border border-border rounded text-xs text-text placeholder:text-muted/60 focus:outline-none focus:border-accent transition-colors font-mono"
              disabled={isSubmitting}
            />
            <div className="flex items-center justify-between mt-1 text-[10px] text-muted">
              <span>Current ID: <span className="opacity-70">{project.id.slice(0, 8)}...</span></span>
              <span>{name.length}/60</span>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-1.5 text-error text-[11px] bg-error/10 border border-error/30 rounded p-2">
              <AlertCircle size={13} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded border border-border bg-surface hover:bg-surface-elevated text-muted hover:text-text text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-4 py-1.5 rounded bg-accent text-accent-text-on hover:bg-accent/90 disabled:opacity-50 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              {isSubmitting ? (
                <span>Saving...</span>
              ) : (
                <>
                  <Check size={13} />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
