import React, { useState, useRef } from 'react';
import { Plus, BarChart3, Upload, FolderPlus, Archive } from 'lucide-react';
import type { Project, FileItem } from '../../db';
import { ProjectSelector } from './ProjectSelector';
import { ProjectActionsMenu } from './ProjectActionsMenu';
import { FileTree } from '../shared/FileTree';
import { exportZip } from '../../services/fs/zipExport';
import { exportProjectAsMarkdown, generateProjectMarkdown } from '../../services/fs/markdownExport';
import { useAppStore } from '../../store';
import type { ShellBreakpoint } from '../../hooks/useShellBreakpoint';

function GithubIcon({ size = 16, className = '', strokeWidth = 2 }: { size?: number | string; className?: string; strokeWidth?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

interface ProjectFilesPaneProps {
  projects: Project[];
  activeProject: Project | null;
  files: FileItem[];
  breakpoint: ShellBreakpoint;
  onSelectProjectId: (id: string) => void;
  onCreateBlankProject: () => void;
  onRefreshFiles: () => void;
  focusSearchTrigger?: boolean;
  onOpenProjectSearch: (initialQuery?: string) => void;
  onOpenDeploy: () => void;
  onOpenSnapshots?: () => void;
  onOpenGithubImport: () => void;
  onOpenGithubPush: () => void;
  onOpenBisect: (testName?: string) => void;
  onOpenTrustReport: () => void;
  onOpenCreateProjectModal: () => void;
  onOpenRenameModal: () => void;
  onArchiveProject?: (project: Project) => void;
  onPromptDeleteProject: (project: Project) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onIncomingFiles: (fileList: FileList) => void;
  activeProjectMetadata: { totalLines: number; dominantLanguage: string };
  showProjectStats: boolean;
  setShowProjectStats: React.Dispatch<React.SetStateAction<boolean>>;
  archivedCount?: number;
  onOpenArchivedProjects?: () => void;
}

export function ProjectFilesPane({
  projects,
  activeProject,
  files,
  breakpoint,
  onSelectProjectId,
  onCreateBlankProject,
  onRefreshFiles,
  focusSearchTrigger,
  onOpenProjectSearch,
  onOpenDeploy,
  onOpenSnapshots,
  onOpenGithubImport,
  onOpenGithubPush,
  onOpenBisect,
  onOpenTrustReport,
  onOpenCreateProjectModal,
  onOpenRenameModal,
  onArchiveProject,
  onPromptDeleteProject,
  onFileUpload,
  onIncomingFiles,
  activeProjectMetadata,
  showProjectStats,
  setShowProjectStats,
  archivedCount,
  onOpenArchivedProjects,
}: ProjectFilesPaneProps) {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isWide = breakpoint !== 'phone';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Clean, compact single-row project header */}
      <div className="flex items-center justify-between text-accent font-mono text-xs px-2.5 py-1.5 shrink-0 border-b border-border/60 bg-surface/30 gap-2">
        {/* Left: Project Selector & Quick Create */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <ProjectSelector
            projects={projects}
            activeProject={activeProject}
            onSelectProjectId={onSelectProjectId}
            onCreateBlankProject={onCreateBlankProject}
            activeFilesCount={files.length}
            archivedCount={archivedCount}
            onOpenArchivedProjects={onOpenArchivedProjects}
          />

          <button
            onClick={onCreateBlankProject}
            className="flex items-center justify-center p-1.5 bg-surface border border-border hover:border-accent/50 hover:bg-accent/10 text-accent rounded transition-all cursor-pointer shadow-xs shrink-0 active:scale-95"
            title="Create New Project"
            aria-label="Create new project"
          >
            <Plus size={13} strokeWidth={2.5} />
          </button>

          {activeProject && (
            <span className="inline-block px-1.5 py-0.5 bg-surface text-muted text-[10px] rounded border border-border font-mono shrink-0">
              {files.length}
            </span>
          )}

          {/* Active Project Detailed Metadata & Chart Trigger Pill (hidden on phone-width to protect the project name; still reachable via the ⋮ menu) */}
          {activeProject && isWide && (
            <button
              type="button"
              onClick={() => setShowProjectStats(prev => !prev)}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono border transition-all cursor-pointer shadow-xs ${
                showProjectStats
                  ? 'bg-accent text-accent-text-on border-accent font-semibold'
                  : 'bg-surface hover:bg-surface-elevated text-muted hover:text-accent border-border hover:border-accent/40'
              }`}
              title={`View detailed project metadata & language charts (${activeProjectMetadata.totalLines.toLocaleString()} lines of code)`}
              aria-label="Toggle active project detailed metadata and language analytics"
            >
              <BarChart3 size={11} className={showProjectStats ? 'text-accent-text-on' : 'text-accent'} />
              <span>{activeProjectMetadata.totalLines.toLocaleString()} {isWide ? 'LOC' : 'L'}</span>
              {isWide && activeProjectMetadata.dominantLanguage !== 'None' && (
                <span className="opacity-80 inline">• {activeProjectMetadata.dominantLanguage}</span>
              )}
            </button>
          )}
        </div>

        {/* Hidden file input for file/zip upload */}
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={onFileUpload} 
          multiple
          className="hidden" 
        />

        {/* Right: Archive Button & Consolidated Professional Project Actions Dropdown Menu */}
        {activeProject && (
          <div className="flex items-center gap-1 shrink-0 font-mono">
            {/* Standalone Archive button only shown on wide layouts; on phone it's reachable via the ⋮ menu below, which protects space for the project name */}
            {onArchiveProject && isWide && (
              <button
                type="button"
                onClick={() => onArchiveProject(activeProject)}
                className="flex items-center justify-center p-1.5 bg-surface border border-border hover:border-amber-500/50 hover:bg-amber-500/10 text-muted hover:text-amber-500 rounded transition-all cursor-pointer shadow-xs shrink-0 active:scale-95"
                title={`Archive "${activeProject.name}" (move to separate archive collection)`}
                aria-label="Archive Project"
              >
                <Archive size={13} strokeWidth={2} />
              </button>
            )}

            <ProjectActionsMenu
              project={activeProject}
              fileCount={files.length}
              onOpenDeploy={onOpenDeploy}
              onOpenProjectSearch={onOpenProjectSearch}
              onOpenSnapshots={onOpenSnapshots}
              onOpenGithubImport={onOpenGithubImport}
              onOpenGithubPush={onOpenGithubPush}
              onOpenAnalytics={() => setShowProjectStats(true)}
              onOpenBisect={() => onOpenBisect()}
              onOpenTrustReport={onOpenTrustReport}
              onNewProjectClick={onOpenCreateProjectModal}
              onRenameClick={onOpenRenameModal}
              onArchiveClick={onArchiveProject ? () => onArchiveProject(activeProject) : undefined}
              onUploadClick={() => fileInputRef.current?.click()}
              onExportClick={async () => {
                try {
                  if (!activeProject) return;
                  const blob = await exportZip(activeProject.id);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${activeProject.name.replace(/\s+/g, '_')}.zip`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  useAppStore.getState().addToast('Project archive exported successfully', 'success');
                } catch (err) {
                  console.error('Export failed', err);
                  useAppStore.getState().addToast('Failed to export project ZIP', 'error');
                }
              }}
              onExportMarkdownClick={async () => {
                try {
                  if (!activeProject) return;
                  const { filename, blob } = await exportProjectAsMarkdown(activeProject.id);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  useAppStore.getState().addToast('Project exported as Markdown documentation', 'success');
                } catch (err) {
                  console.error('Markdown export failed', err);
                  useAppStore.getState().addToast('Failed to export project Markdown', 'error');
                }
              }}
              onCopyMarkdownClick={async () => {
                try {
                  if (!activeProject) return;
                  const markdown = await generateProjectMarkdown(activeProject.id);
                  await navigator.clipboard.writeText(markdown);
                  useAppStore.getState().addToast('Project markdown copied to clipboard', 'success');
                } catch (err) {
                  console.error('Copy markdown failed', err);
                  useAppStore.getState().addToast('Failed to copy project Markdown', 'error');
                }
              }}
              onDeleteClick={() => onPromptDeleteProject(activeProject)}
            />
          </div>
        )}
      </div>

      {/* Main Files Area with Drag-and-Drop */}
      <div 
        className="flex-1 overflow-hidden flex flex-col relative"
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingFiles(true);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingFiles(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setIsDraggingFiles(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingFiles(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onIncomingFiles(e.dataTransfer.files);
          }
        }}
      >
        {/* Drag and Drop Visual Highlight Overlay */}
        {isDraggingFiles && (
          <div className="absolute inset-0 z-50 bg-surface/95 backdrop-blur-xs border-2 border-dashed border-accent flex flex-col items-center justify-center p-6 text-center pointer-events-none">
            <div className="w-14 h-14 rounded-full bg-accent/15 border border-accent/40 flex items-center justify-center text-accent mb-3 shadow-lg animate-pulse">
              <Upload size={26} />
            </div>
            <p className="font-mono text-xs font-bold text-text uppercase tracking-wider mb-1">
              Drop Files or ZIP Archive
            </p>
            <p className="font-sans text-[11px] text-muted max-w-xs">
              Release to import immediately into your workspace
            </p>
          </div>
        )}

        {projects.length === 0 || !activeProject ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center h-full canvas-grid-pattern">
            <div className="border border-border bg-surface/80 rounded-xl p-6 max-w-xs w-full flex flex-col items-center corner-ticks shadow-sm">
              <div className="w-12 h-12 rounded-lg bg-surface-elevated border border-accent/40 flex items-center justify-center text-accent mb-3 shadow-xs">
                <FolderPlus size={22} />
              </div>
              <div className="font-mono text-[10px] text-accent tracking-wider uppercase mb-1">
                WORKSPACE : UNBOUND
              </div>
              <h3 className="font-mono text-xs font-bold text-text mb-1">
                No Project Open
              </h3>
              <p className="font-sans text-[11px] text-muted mb-5 leading-relaxed">
                Select an action below to draft a workspace or load a codebase archive.
              </p>
              <div className="flex flex-col gap-2 w-full">
                <button
                  onClick={onCreateBlankProject}
                  className="w-full py-2 px-3 bg-accent text-accent-text-on font-mono font-bold text-xs rounded hover:bg-accent/90 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus size={14} /> Create Blank Project
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2 px-3 bg-surface border border-border text-text font-mono text-xs rounded hover:bg-accent/5 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Upload size={14} /> Upload ZIP or File
                </button>
                <button
                  onClick={onOpenGithubImport}
                  className="w-full py-2 px-3 bg-surface border border-border text-text font-mono text-xs rounded hover:bg-accent/5 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <GithubIcon size={14} /> Import from GitHub
                </button>
                {onOpenArchivedProjects && archivedCount !== undefined && archivedCount > 0 && (
                  <button
                    onClick={onOpenArchivedProjects}
                    className="w-full py-2 px-3 bg-surface border border-amber-500/40 text-amber-600 dark:text-amber-400 font-mono text-xs rounded hover:bg-amber-500/10 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Archive size={14} /> View Archived Projects ({archivedCount})
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <FileTree 
            files={files} 
            projectId={activeProject.id}
            onFilesChanged={onRefreshFiles}
            autoFocusSearch={focusSearchTrigger}
            onOpenProjectSearch={onOpenProjectSearch}
          />
        )}
      </div>
    </div>
  );
}
