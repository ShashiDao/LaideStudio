import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FileText, ChevronDown, Check, FolderPlus, X, Archive } from 'lucide-react';
import type { Project } from '../../db';
import { db } from '../../db';

export interface ProjectSelectorProps {
  projects: Project[];
  activeProject: Project | null;
  onSelectProjectId: (id: string) => void;
  onCreateBlankProject?: () => void;
  activeFilesCount?: number;
  className?: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  archivedCount?: number;
  onOpenArchivedProjects?: () => void;
}

export function ProjectSelector({
  projects,
  activeProject,
  onSelectProjectId,
  onCreateBlankProject,
  activeFilesCount,
  className = '',
  isOpen: controlledIsOpen,
  onOpenChange,
  archivedCount,
  onOpenArchivedProjects,
}: ProjectSelectorProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const setIsOpen = useCallback(
    (nextOpen: boolean | ((prev: boolean) => boolean)) => {
      const resolved = typeof nextOpen === 'function' ? nextOpen(isOpen) : nextOpen;
      if (!isControlled) {
        setInternalIsOpen(resolved);
      }
      onOpenChange?.(resolved);
    },
    [isControlled, isOpen, onOpenChange]
  );

  const [fileCounts, setFileCounts] = useState<Record<string, number>>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // Load project file counts asynchronously
  useEffect(() => {
    let isMounted = true;
    async function loadCounts() {
      try {
        const allFiles = await db.files.toArray();
        const counts: Record<string, number> = {};
        for (const file of allFiles) {
          counts[file.projectId] = (counts[file.projectId] || 0) + 1;
        }
        if (isMounted) {
          setFileCounts(counts);
        }
      } catch {
        // Fallback gracefully if database is busy/mocked in tests
      }
    }
    loadCounts();
    return () => {
      isMounted = false;
    };
  }, [projects, activeFilesCount]);

  // Handle outside click & Escape key
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex(prev => (prev < projects.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex(prev => (prev > 0 ? prev - 1 : projects.length - 1));
      } else if (e.key === 'Enter' && focusedIndex >= 0 && focusedIndex < projects.length) {
        e.preventDefault();
        const selected = projects[focusedIndex];
        if (selected) {
          onSelectProjectId(selected.id);
          setIsOpen(false);
          triggerRef.current?.focus();
        }
      }
    }

    function handleClickOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen, projects, focusedIndex, onSelectProjectId, setIsOpen]);

  const handleToggle = () => {
    setIsOpen(prev => {
      const next = !prev;
      if (next) {
        const activeIdx = projects.findIndex(p => p.id === activeProject?.id);
        setFocusedIndex(activeIdx >= 0 ? activeIdx : 0);
      }
      return next;
    });
  };

  const handleSelect = (projectId: string) => {
    onSelectProjectId(projectId);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const getFileCountForProject = (projectId: string) => {
    if (projectId === activeProject?.id && activeFilesCount !== undefined) {
      return activeFilesCount;
    }
    return fileCounts[projectId] ?? 0;
  };

  return (
    <div className={`relative min-w-[76px] flex-1 max-w-[170px] ${className}`}>
      {/* Custom Amber Trigger Button matching existing layout */}
      <button
        ref={triggerRef}
        type="button"
        id="project-selector-trigger"
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select active workspace project"
        title={activeProject ? `Active Project: ${activeProject.name}` : 'No Projects'}
        className={`w-full flex items-center justify-between bg-surface border transition-all rounded px-2 py-1 shadow-xs cursor-pointer text-left group active:scale-[0.98] ${
          isOpen
            ? 'border-accent ring-1 ring-accent/40 bg-surface-elevated text-accent'
            : 'border-border hover:border-accent/50 text-accent hover:bg-surface-elevated/60'
        }`}
      >
        <div className="flex items-center min-w-0 flex-1 mr-1">
          <FileText size={13} className="shrink-0 text-accent/80 mr-1.5 group-hover:text-accent transition-colors" />
          <span className="font-mono font-medium text-accent truncate text-[11px]">
            {activeProject?.name || 'No Projects'}
          </span>
        </div>
        <ChevronDown
          size={12}
          className={`shrink-0 text-accent/70 group-hover:text-accent transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-accent' : ''
          }`}
        />
      </button>

      {/* Custom Dropdown Modal / Popover */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-start justify-center sm:justify-start bg-black/75 sm:bg-black/40 backdrop-blur-xs animate-in fade-in duration-150 p-0 sm:p-0"
          role="dialog"
          aria-modal="true"
          aria-label="Project switcher dialog"
          onClick={() => setIsOpen(false)}
        >
          {/* Popover / Sheet Container */}
          <div
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
            role="listbox"
            aria-label="Workspace projects"
            className="w-full sm:w-72 sm:absolute sm:top-[38px] sm:left-2 bg-surface border-t sm:border border-border/90 rounded-t-2xl sm:rounded-xl shadow-2xl overflow-hidden font-mono text-xs animate-in slide-in-from-bottom-5 sm:slide-in-from-top-2 duration-200 corner-ticks flex flex-col max-h-[80vh] sm:max-h-[380px] z-[60]"
          >
            {/* Mobile Sheet Drag Indicator */}
            <div className="w-10 h-1 bg-muted/40 rounded-full mx-auto mt-2 sm:hidden shrink-0" />

            {/* Header */}
            <div className="px-3.5 py-2.5 border-b border-border/70 bg-surface-elevated/40 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={14} className="text-accent shrink-0" />
                <span className="text-[11px] font-bold text-accent uppercase tracking-wider">
                  Switch Project
                </span>
                <span className="text-[10px] text-muted">
                  ({projects.length})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-muted hover:text-accent rounded hover:bg-surface-elevated transition-colors cursor-pointer sm:hidden"
                aria-label="Close project selector"
              >
                <X size={14} />
              </button>
            </div>

            {/* Project List */}
            <div className="p-1.5 overflow-y-auto max-h-[55vh] sm:max-h-[260px] flex flex-col gap-1 divide-y divide-border/20">
              {projects.length === 0 ? (
                <div className="px-3 py-6 text-center text-muted text-xs">
                  No projects available
                </div>
              ) : (
                projects.map((project, idx) => {
                  const isActive = project.id === activeProject?.id;
                  const count = getFileCountForProject(project.id);
                  const isKeyboardFocused = idx === focusedIndex;

                  return (
                    <button
                      key={project.id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => handleSelect(project.id)}
                      onMouseEnter={() => setFocusedIndex(idx)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors cursor-pointer group ${
                        isActive
                          ? 'bg-accent/15 border border-accent/40 text-accent font-semibold'
                          : isKeyboardFocused
                          ? 'bg-surface-elevated text-text border border-border/60'
                          : 'hover:bg-surface-elevated text-text border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                        <div
                          className={`w-6 h-6 rounded flex items-center justify-center shrink-0 text-xs border ${
                            isActive
                              ? 'bg-accent text-accent-text-on border-accent font-bold'
                              : 'bg-surface border-border/70 text-muted group-hover:text-text group-hover:border-accent/40'
                          }`}
                        >
                          {project.name.charAt(0).toUpperCase() || 'P'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-mono group-hover:text-accent transition-colors">
                            {project.name}
                          </div>
                          <div className="text-[10px] text-muted font-mono truncate">
                            {count} {count === 1 ? 'file' : 'files'}
                          </div>
                        </div>
                      </div>

                      {isActive && (
                        <div className="flex items-center gap-1 shrink-0 text-accent">
                          <Check size={14} strokeWidth={2.5} />
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer Actions: Create New Project & View Archived Projects */}
            {(onCreateBlankProject || onOpenArchivedProjects || (archivedCount !== undefined && archivedCount > 0)) && (
              <div className="p-1.5 border-t border-border/60 bg-surface-elevated/20 shrink-0 flex flex-col gap-1">
                {onCreateBlankProject && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onCreateBlankProject();
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-surface hover:bg-accent/10 text-accent border border-border hover:border-accent/50 rounded-lg transition-all text-xs font-mono cursor-pointer shadow-xs active:scale-[0.98]"
                  >
                    <FolderPlus size={13} />
                    <span>Create New Project</span>
                  </button>
                )}

                {(onOpenArchivedProjects || (archivedCount !== undefined && archivedCount > 0)) && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onOpenArchivedProjects?.();
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-surface hover:bg-surface-elevated text-muted hover:text-amber-500 border border-border hover:border-amber-500/40 rounded-lg transition-all text-[11px] font-mono cursor-pointer shadow-xs active:scale-[0.98]"
                    aria-label="View archived projects"
                  >
                    <Archive size={12} className="text-amber-500" />
                    <span>Archived Projects {archivedCount !== undefined ? `(${archivedCount})` : ''}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
