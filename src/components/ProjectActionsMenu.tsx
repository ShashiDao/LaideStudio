import React, { useState, useRef, useEffect } from 'react';
import { 
  MoreVertical, 
  Upload, 
  Download, 
  GitPullRequest, 
  Trash2, 
  BarChart3, 
  Edit2,
  GitBranch,
  X,
  FolderKanban,
  FolderPlus,
  FileText,
  Copy
} from 'lucide-react';
import { GithubIcon } from './GithubIcons';
import type { Project } from '../db';

export interface ProjectActionsMenuProps {
  project: Project | null;
  fileCount: number;
  onOpenGithubImport: () => void;
  onOpenGithubPush: () => void;
  onUploadClick: () => void;
  onExportClick: () => void;
  onExportMarkdownClick?: () => void;
  onCopyMarkdownClick?: () => void;
  onDeleteClick: () => void;
  onRenameClick?: () => void;
  onOpenAnalytics?: () => void;
  onOpenBisect?: () => void;
  onNewProjectClick?: () => void;
  className?: string;
}

export function ProjectActionsMenu({
  project,
  fileCount,
  onOpenGithubImport,
  onOpenGithubPush,
  onUploadClick,
  onExportClick,
  onExportMarkdownClick,
  onCopyMarkdownClick,
  onDeleteClick,
  onRenameClick,
  onOpenAnalytics,
  onOpenBisect,
  onNewProjectClick,
  className = ''
}: ProjectActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!project) return null;

  const handleAction = (callback?: () => void) => {
    setIsOpen(false);
    if (callback) {
      callback();
    }
  };

  return (
    <div className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="Workspace actions menu"
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-all cursor-pointer border active:scale-95 ${
          isOpen
            ? 'bg-accent text-accent-text-on border-accent shadow-xs'
            : 'bg-surface hover:bg-surface-elevated text-muted hover:text-accent border-border hover:border-accent/40 shadow-xs'
        }`}
        title="Workspace Actions (Import, Export, GitHub, Upload)"
      >
        <span className="text-[11px] font-medium hidden xs:inline">Actions</span>
        <MoreVertical size={13} className="shrink-0" />
      </button>

      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-actions-title"
          onClick={() => setIsOpen(false)}
        >
          <div 
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-surface border-t sm:border border-border/90 rounded-t-2xl sm:rounded-xl shadow-2xl overflow-hidden font-mono text-xs animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-2 duration-200 corner-ticks flex flex-col max-h-[88vh] sm:max-h-[80vh]"
            role="menu"
            aria-orientation="vertical"
          >
            {/* Grab handle indicator for mobile bottom sheet */}
            <div className="w-10 h-1 bg-muted/40 rounded-full mx-auto mt-2 sm:hidden shrink-0" />

            {/* Header Info */}
            <div className="px-4 py-3 border-b border-border/70 bg-surface-elevated/40 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-accent/15 text-accent border border-accent/30 shrink-0 shadow-xs">
                  <FolderKanban size={16} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 id="project-actions-title" className="text-xs font-bold text-accent uppercase tracking-wider truncate">
                      {project.name}
                    </h2>
                    <span className="px-1.5 py-0.2 bg-surface text-muted text-[9px] rounded border border-border shrink-0">
                      {fileCount} {fileCount === 1 ? 'file' : 'files'}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted truncate">
                    Workspace Actions & Tools
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close actions dialog"
                className="p-1 text-muted hover:text-text rounded-md hover:bg-surface-elevated transition-colors cursor-pointer shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {/* Grouped Action Items */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3.5 scrollbar-thin">
              
              {/* 1. Workspace Section */}
              {(onNewProjectClick || onRenameClick || onOpenAnalytics || onOpenBisect) && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold text-accent/80 uppercase tracking-wider px-1">
                    Workspace
                  </div>
                  <div className="bg-bg/60 border border-border/70 rounded-lg divide-y divide-border/40 overflow-hidden">
                    {onNewProjectClick && (
                      <button
                        type="button"
                        onClick={() => handleAction(onNewProjectClick)}
                        className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 text-text hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                        role="menuitem"
                      >
                        <div className="p-1 rounded bg-surface-elevated text-accent border border-border shrink-0">
                          <FolderPlus size={13} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium leading-tight">New Project...</div>
                          <div className="text-[9px] text-muted truncate">Choose from starter templates</div>
                        </div>
                      </button>
                    )}

                    {onRenameClick && (
                      <button
                        type="button"
                        onClick={() => handleAction(onRenameClick)}
                        className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 text-text hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                        role="menuitem"
                      >
                        <div className="p-1 rounded bg-surface-elevated text-accent border border-border shrink-0">
                          <Edit2 size={13} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium leading-tight">Rename Project</div>
                          <div className="text-[9px] text-muted truncate">Change workspace name</div>
                        </div>
                      </button>
                    )}

                    {onOpenAnalytics && (
                      <button
                        type="button"
                        onClick={() => handleAction(onOpenAnalytics)}
                        className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 text-text hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                        role="menuitem"
                      >
                        <div className="p-1 rounded bg-surface-elevated text-accent border border-border shrink-0">
                          <BarChart3 size={13} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium leading-tight">Project Analytics</div>
                          <div className="text-[9px] text-muted truncate">Lines of code & languages</div>
                        </div>
                      </button>
                    )}

                    {onOpenBisect && (
                      <button
                        type="button"
                        onClick={() => handleAction(onOpenBisect)}
                        className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 text-text hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                        role="menuitem"
                      >
                        <div className="p-1 rounded bg-surface-elevated text-accent border border-border shrink-0">
                          <GitBranch size={13} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium leading-tight">Find What Broke This</div>
                          <div className="text-[9px] text-muted truncate">Bisect failing test in history</div>
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* 2. GitHub Section */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-accent/80 uppercase tracking-wider px-1">
                  GitHub
                </div>
                <div className="bg-bg/60 border border-border/70 rounded-lg divide-y divide-border/40 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => handleAction(onOpenGithubImport)}
                    className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 text-text hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                    role="menuitem"
                  >
                    <div className="p-1 rounded bg-surface-elevated text-accent border border-border shrink-0">
                      <GithubIcon size={13} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium leading-tight">Import from GitHub</div>
                      <div className="text-[9px] text-muted truncate">Clone repo into workspace</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAction(onOpenGithubPush)}
                    className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 text-text hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                    role="menuitem"
                  >
                    <div className="p-1 rounded bg-surface-elevated text-accent border border-border shrink-0">
                      <GitPullRequest size={13} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium leading-tight">Push to GitHub</div>
                      <div className="text-[9px] text-muted truncate">Commit & push files</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* 3. Files Section */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-accent/80 uppercase tracking-wider px-1">
                  Files
                </div>
                <div className="bg-bg/60 border border-border/70 rounded-lg divide-y divide-border/40 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => handleAction(onUploadClick)}
                    className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 text-text hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                    role="menuitem"
                  >
                    <div className="p-1 rounded bg-surface-elevated text-accent border border-border shrink-0">
                      <Upload size={13} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium leading-tight">Upload ZIP or File</div>
                      <div className="text-[9px] text-muted truncate">Add files from computer</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAction(onExportClick)}
                    className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 text-text hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                    role="menuitem"
                  >
                    <div className="p-1 rounded bg-surface-elevated text-accent border border-border shrink-0">
                      <Download size={13} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium leading-tight">Export Project ZIP</div>
                      <div className="text-[9px] text-muted truncate">Download .zip archive</div>
                    </div>
                  </button>

                  {onExportMarkdownClick && (
                    <button
                      type="button"
                      onClick={() => handleAction(onExportMarkdownClick)}
                      className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 text-text hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                      role="menuitem"
                    >
                      <div className="p-1 rounded bg-surface-elevated text-accent border border-border shrink-0">
                        <FileText size={13} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium leading-tight">Export Markdown (.md)</div>
                        <div className="text-[9px] text-muted truncate">Single docs file with all code</div>
                      </div>
                    </button>
                  )}

                  {onCopyMarkdownClick && (
                    <button
                      type="button"
                      onClick={() => handleAction(onCopyMarkdownClick)}
                      className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 text-text hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                      role="menuitem"
                    >
                      <div className="p-1 rounded bg-surface-elevated text-accent border border-border shrink-0">
                        <Copy size={13} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium leading-tight">Copy as Markdown</div>
                        <div className="text-[9px] text-muted truncate">Copy full codebase to clipboard</div>
                      </div>
                    </button>
                  )}
                </div>
              </div>

              {/* 4. Destructive Section */}
              <div className="space-y-1.5 pt-1">
                <div className="text-[10px] font-bold text-error/80 uppercase tracking-wider px-1">
                  Danger Zone
                </div>
                <button
                  type="button"
                  onClick={() => handleAction(onDeleteClick)}
                  className="w-full text-left p-3 rounded-lg border border-error/30 bg-error/10 hover:bg-error/20 text-error flex items-center gap-3 transition-all cursor-pointer group shadow-xs active:scale-[0.99]"
                  role="menuitem"
                >
                  <div className="p-1.5 rounded-md bg-error/20 text-error border border-error/40 shrink-0 group-hover:scale-105 transition-transform">
                    <Trash2 size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold text-error leading-tight">Delete Project</div>
                    <div className="text-[9px] text-error/80 truncate">Permanently remove workspace and all files</div>
                  </div>
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
