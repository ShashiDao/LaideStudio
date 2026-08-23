import React, { useState, useRef, useEffect } from 'react';
import { 
  MoreVertical, 
  Upload, 
  Download, 
  GitPullRequest, 
  Trash2, 
  BarChart3, 
  Edit2,
  GitBranch
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
  onDeleteClick: () => void;
  onRenameClick?: () => void;
  onOpenAnalytics?: () => void;
  onOpenBisect?: () => void;
  className?: string;
}

export function ProjectActionsMenu({
  project,
  fileCount,
  onOpenGithubImport,
  onOpenGithubPush,
  onUploadClick,
  onExportClick,
  onDeleteClick,
  onRenameClick,
  onOpenAnalytics,
  onOpenBisect,
  className = ''
}: ProjectActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

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

  return (
    <div className={`relative inline-block text-left ${className}`} ref={menuRef}>
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
          className="absolute right-0 mt-1.5 w-56 rounded-lg bg-surface border border-border/90 shadow-2xl z-50 overflow-hidden font-mono text-xs animate-in fade-in zoom-in-95 duration-150 corner-ticks"
          role="menu"
          aria-orientation="vertical"
        >
          {/* Header Info */}
          <div className="px-3 py-2 border-b border-border/70 bg-surface-elevated/40">
            <div className="text-[10px] font-bold text-accent uppercase tracking-wider truncate">
              {project.name}
            </div>
            <div className="text-[10px] text-muted flex items-center justify-between mt-0.5">
              <span>Workspace Actions</span>
              <span className="px-1.5 py-0.2 bg-surface text-[9px] rounded border border-border">
                {fileCount} {fileCount === 1 ? 'file' : 'files'}
              </span>
            </div>
          </div>

          {/* Action Items */}
          <div className="py-1 divide-y divide-border/30">
            {onRenameClick && (
              <div className="py-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onRenameClick();
                  }}
                  className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-text hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
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
              </div>
            )}

            {onOpenAnalytics && (
              <div className="py-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenAnalytics();
                  }}
                  className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-text hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
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
              </div>
            )}

            {onOpenBisect && (
              <div className="py-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenBisect();
                  }}
                  className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-text hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
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
              </div>
            )}

            <div className="py-0.5">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenGithubImport();
                }}
                className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-text hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
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
                onClick={() => {
                  setIsOpen(false);
                  onOpenGithubPush();
                }}
                className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-text hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
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

            <div className="py-0.5">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onUploadClick();
                }}
                className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-text hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
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
                onClick={() => {
                  setIsOpen(false);
                  onExportClick();
                }}
                className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-text hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
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
            </div>

            <div className="py-0.5">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onDeleteClick();
                }}
                className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-error hover:bg-error/10 transition-colors cursor-pointer"
                role="menuitem"
              >
                <div className="p-1 rounded bg-error/10 text-error border border-error/30 shrink-0">
                  <Trash2 size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium leading-tight">Delete Project</div>
                  <div className="text-[9px] text-error/70 truncate">Permanently remove workspace</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
