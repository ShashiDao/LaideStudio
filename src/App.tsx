/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { FileText, MessageSquare, MonitorPlay, Upload, FolderPlus, Plus, Settings, ChevronDown, Trash2, AlertTriangle, X, Terminal, BarChart3 } from 'lucide-react';
import { useAppStore, type TabId } from './store';
import { testDatabaseReadback } from './seed';
import { db, type FileItem, type Project } from './db';
import { exportZip } from './services/fs/zipExport';
import { importZip, isText } from './services/fs/zipImport';
import { listFiles, deleteProject, renameProject, bulkCreateOrUpdateFiles } from './services/fs/vfs';
import { calculateProjectMetadata } from './utils/projectStats';
import { FileTree } from './components/FileTree';
import { Editor } from './components/Editor';
import { LockScreen } from './components/LockScreen';

import { SettingsPanel } from './components/SettingsPanel';
import { PatchReviewSheet } from './components/PatchReviewSheet';
import { ChatPanel } from './components/ChatPanel';
import { TerminalPanel } from './components/TerminalPanel';
import { TopStrip } from './components/TopStrip';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PreviewPanel } from './components/PreviewPanel';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { RenameProjectModal } from './components/RenameProjectModal';
import { ProjectActionsMenu } from './components/ProjectActionsMenu';
import { ProjectMetadataPanel } from './components/ProjectMetadataPanel';
import { GithubImportModal } from './components/GithubImportModal';
import { GithubPushModal } from './components/GithubPushModal';
import { FindWhatBrokeModal } from './components/FindWhatBrokeModal';
import { CreateProjectModal } from './components/CreateProjectModal';
import { createProjectFromTemplate, type TemplateId } from './services/templates/projectTemplates';
import { ReloadPrompt } from './components/ReloadPrompt';
import { InstallPrompt } from './components/InstallPrompt';
import { Toaster } from './components/Toaster';

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

export default function App() {
  const { 
    activeTab, 
    setActiveTab, 
    activeFileId, 
    setActiveFileId,
    activeProjectId,
    setActiveProjectId,
    keys,
    setDeferredInstallPrompt,
    setMcpServers,
    toggleTheme,
    lockVault
  } = useAppStore();

  useEffect(() => {
    if (keys) {
      const enc = localStorage.getItem('xiom_mcp_servers');
      if (enc) {
        import('./services/crypto').then(({ decryptData }) => {
          decryptData(keys.aesKey, enc).then(str => {
            try {
              setMcpServers(JSON.parse(str));
            } catch (e) {
              console.error('Failed to parse MCP servers', e);
            }
          }).catch(e => console.error('Failed to decrypt MCP servers', e));
        }).catch(e => console.error('Failed to load crypto module', e));
      }
    }
  }, [keys, setMcpServers]);

  const [dbTested, setDbTested] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [showGithubImport, setShowGithubImport] = useState(false);
  const [showGithubPush, setShowGithubPush] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [focusSearchTrigger, setFocusSearchTrigger] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [showProjectStats, setShowProjectStats] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showFindWhatBrokeModal, setShowFindWhatBrokeModal] = useState(false);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [bisectInitialTestName, setBisectInitialTestName] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeProject = projects.find(p => p.id === activeProjectId) || projects[0] || null;

  const handleOpenBisect = (testName?: string) => {
    setBisectInitialTestName(testName);
    setShowFindWhatBrokeModal(true);
  };

  const activeProjectMetadata = useMemo(() => {
    return calculateProjectMetadata(files);
  }, [files]);

  const refreshFiles = async () => {
    if (activeProject) {
      setFiles(await listFiles(activeProject.id));
    }
  };

  const handleRenameProject = async (projId: string, newName: string) => {
    try {
      const updated = await renameProject(projId, newName);
      const allProjects = await db.projects.toArray();
      setProjects(allProjects);
      useAppStore.getState().addToast(`Workspace renamed to "${updated.name}"`, 'success');
    } catch (err: any) {
      console.error('Failed to rename project', err);
      useAppStore.getState().addToast(err.message || 'Failed to rename workspace', 'error');
      throw err;
    }
  };

  const handleDeleteProject = async (projId: string) => {
    try {
      await deleteProject(projId);
      const remainingProjects = await db.projects.toArray();
      setProjects(remainingProjects);
      setProjectToDelete(null);

      const nextActive = remainingProjects.find(p => p.id === activeProjectId && p.id !== projId) || remainingProjects[0] || null;
      if (nextActive) {
        setActiveProjectId(nextActive.id);
        setFiles(await listFiles(nextActive.id));
      } else {
        setActiveProjectId(null);
        setFiles([]);
      }
    } catch (err) {
      console.error('Failed to delete project', err);
    }
  };

  const handleOpenGithubImport = () => {
    const enc = localStorage.getItem('xiom_github_pat');
    if (!enc) {
      setActiveTab('settings');
      return;
    }
    setShowGithubImport(true);
  };

  const handleOpenGithubPush = () => {
    const enc = localStorage.getItem('xiom_github_pat');
    if (!enc) {
      setActiveTab('settings');
      return;
    }
    setShowGithubPush(true);
  };

  const handleCreateProjectFromTemplate = async (name: string, templateId: TemplateId) => {
    try {
      const { project: newProj, files: createdFiles } = await createProjectFromTemplate(name, templateId);
      const allProjects = await db.projects.toArray();
      setProjects(allProjects);
      setActiveProjectId(newProj.id);
      setFiles(createdFiles);
      if (createdFiles.length > 0) {
        const preferredFile = createdFiles.find(
          f => f.path === '/src/App.tsx' || f.path === '/src/main.tsx' || f.path === '/src/main.ts' || f.path === '/index.html' || f.path === '/README.md'
        ) || createdFiles[0];
        if (preferredFile) {
          setActiveFileId(preferredFile.id);
        }
      }
      useAppStore.getState().addToast(`Created project "${newProj.name}"`, 'success');
    } catch (err: any) {
      console.error('Failed to create project from template', err);
      if (err.name === 'QuotaExceededError') {
        useAppStore.getState().addToast('Storage is full. Free up space and try again.', 'error');
      } else {
        useAppStore.getState().addToast(err.message || 'Failed to create project', 'error');
      }
      throw err;
    }
  };

  const handleCreateBlankProject = async () => {
    setShowCreateProjectModal(true);
  };

  const readFileAsContent = async (file: File): Promise<{ path: string; content: string }> => {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let content: string;
    if (isText(bytes)) {
      content = new TextDecoder('utf-8').decode(bytes);
    } else {
      let binary = '';
      const len = bytes.byteLength;
      const chunkSize = 0x8000;
      for (let i = 0; i < len; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
        binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
      }
      content = btoa(binary);
    }
    const relPath = file.webkitRelativePath || file.name;
    const path = relPath.startsWith('/') ? relPath : `/${relPath}`;
    return { path, content };
  };

  const handleIncomingFiles = async (fileList: FileList | File[]) => {
    const fileArray = Array.from(fileList);
    if (fileArray.length === 0) return;

    try {
      let targetProjectId = activeProject?.id;
      let targetProjectName = activeProject?.name;

      // Automatically initialize new project if none is currently active
      if (!targetProjectId) {
        const newProjId = crypto.randomUUID();
        const zipFile = fileArray.find(f => f.name.toLowerCase().endsWith('.zip'));
        const defaultName = zipFile
          ? zipFile.name.replace(/\.zip$/i, '')
          : fileArray.length === 1
            ? fileArray[0].name.replace(/\.[^/.]+$/, '')
            : (projects.length > 0 ? `Imported Workspace ${projects.length + 1}` : 'Imported Workspace');

        const newProj: Project = {
          id: newProjId,
          name: defaultName,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await db.projects.put(newProj);
        targetProjectId = newProjId;
        targetProjectName = defaultName;
        const allProjects = await db.projects.toArray();
        setProjects(allProjects);
        setActiveProjectId(newProjId);
      }

      const zipFiles = fileArray.filter(f => f.name.toLowerCase().endsWith('.zip'));
      const regularFiles = fileArray.filter(f => !f.name.toLowerCase().endsWith('.zip'));

      let totalImported = 0;

      // Extract ZIP archives fast
      for (const zipFile of zipFiles) {
        const { count } = await importZip(zipFile, targetProjectId, { autoRestructure: true });
        totalImported += count;
      }

      // Process and write regular files in parallel
      if (regularFiles.length > 0) {
        const entries = await Promise.all(regularFiles.map(readFileAsContent));
        await bulkCreateOrUpdateFiles(targetProjectId, entries);
        totalImported += entries.length;
      }

      const updatedFiles = await listFiles(targetProjectId);
      setFiles(updatedFiles);

      if (updatedFiles.length > 0 && !activeFileId) {
        const preferred = updatedFiles.find(
          f => f.path === '/src/App.tsx' || f.path === '/src/main.tsx' || f.path === '/src/main.ts' || f.path === '/index.html' || f.path === '/README.md'
        ) || updatedFiles[0];
        if (preferred) {
          setActiveFileId(preferred.id);
        }
      }

      useAppStore.getState().addToast(
        `Successfully loaded ${totalImported} file${totalImported !== 1 ? 's' : ''} into "${targetProjectName}"`,
        'success'
      );
    } catch (err: any) {
      console.error('Failed to process uploaded files', err);
      if (err.name === 'QuotaExceededError') {
        useAppStore.getState().addToast('Storage is full. Free up space and try again.', 'error');
      } else {
        useAppStore.getState().addToast(err.message || 'Failed to upload files', 'error');
      }
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await handleIncomingFiles(e.target.files);
    }
  };

  useEffect(() => {
    testDatabaseReadback().then((res) => {
      setDbTested(res.success);
      setProjects(res.projects);
      if (activeProjectId && !res.projects.some(p => p.id === activeProjectId) && res.projects.length > 0) {
        setActiveProjectId(res.projects[0].id);
      }
      // If we don't fetch activeProject's files here, we should do it when activeProject changes
    }).catch(err => {
      console.error('[DB Test Error]', err);
    });

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the browser's default install banner
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [setDeferredInstallPrompt]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const isMod = isMac ? e.metaKey : (e.ctrlKey || e.metaKey);

      // Check if target is an active text input or textarea
      const target = e.target as HTMLElement | null;
      const isInput = target && (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable ||
        target.closest('.cm-editor') !== null
      );

      // 1. Help Cheat Sheet (Ctrl+? or Ctrl+/)
      if (isMod && (e.key === '?' || (e.shiftKey && e.key === '/'))) {
        e.preventDefault();
        setShowShortcutsModal(prev => !prev);
        return;
      }

      // 2. Escape: Dismiss modals or close open editor
      if (e.key === 'Escape') {
        if (showShortcutsModal) {
          e.preventDefault();
          setShowShortcutsModal(false);
          return;
        }
        if (activeFileId) {
          e.preventDefault();
          setActiveFileId(null);
          return;
        }
      }

      // If user is actively typing in an editor or input, only handle specific accelerator keys below
      // 3. Ctrl+P: Quick open & focus file search
      if (isMod && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setActiveTab('files');
        setFocusSearchTrigger(true);
        setTimeout(() => setFocusSearchTrigger(false), 200);
        return;
      }

      // 4. Ctrl+B: Toggle / Switch to Files (FileTree) tab
      if (isMod && !e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        if (activeFileId) {
          setActiveFileId(null);
        }
        const curr = useAppStore.getState().activeTab;
        setActiveTab(curr === 'files' ? 'chat' : 'files');
        return;
      }

      // 5. Ctrl+` (Backquote) / Ctrl+~: Toggle / Switch to Terminal tab
      if (isMod && (e.key === '`' || e.key === '~')) {
        e.preventDefault();
        const curr = useAppStore.getState().activeTab;
        setActiveTab(curr === 'terminal' ? 'files' : 'terminal');
        return;
      }

      // 6. Ctrl+Shift+P: Quick preview toggle / switch
      if (isMod && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setActiveTab('preview');
        return;
      }

      // 7. Ctrl+T: Toggle Theme (OLED / Paper)
      if (isMod && !e.shiftKey && e.key.toLowerCase() === 't' && !isInput) {
        e.preventDefault();
        toggleTheme();
        return;
      }

      // 8. Ctrl+Shift+L: Lock vault
      if (isMod && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        lockVault();
        return;
      }

      // 9. Numeric tab switching: Ctrl+1..5 (when not in CodeMirror or text inputs)
      if (isMod && !isInput) {
        if (e.key === '1') {
          e.preventDefault();
          setActiveTab('files');
        } else if (e.key === '2') {
          e.preventDefault();
          setActiveTab('chat');
        } else if (e.key === '3') {
          e.preventDefault();
          setActiveTab('preview');
        } else if (e.key === '4') {
          e.preventDefault();
          setActiveTab('terminal');
        } else if (e.key === '5') {
          e.preventDefault();
          setActiveTab('settings');
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeFileId, showShortcutsModal, setActiveTab, setActiveFileId, toggleTheme, lockVault]);

  useEffect(() => {
    let ignore = false;
    if (activeProject) {
      listFiles(activeProject.id).then(fileList => {
        if (!ignore) {
          setFiles(fileList);
        }
      });
    }
    return () => {
      ignore = true;
    };
  }, [activeProject?.id]);

  const activeFile = useMemo(() => files.find(f => f.id === activeFileId), [files, activeFileId]);

  if (!keys) {
    return <LockScreen />;
  }

  return (
    <div className="flex justify-center min-h-screen bg-black">
      {/* Mobile Viewport Container */}
      <div className="w-full max-w-[480px] h-dvh bg-bg text-text flex flex-col relative shadow-2xl overflow-hidden paper-grain-overlay">
        
        <Toaster />

        {/* Fixed Top Strip (~28px for context gauge) */}
        <TopStrip dbTested={dbTested} onOpenShortcuts={() => setShowShortcutsModal(true)} />

        {/* Main Content Area */}
        <main className="flex-1 overflow-hidden flex flex-col relative">
          {activeTab === 'files' && (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Clean, compact single-row project header */}
              <div className="flex items-center justify-between text-accent font-mono text-xs px-2.5 sm:px-3 py-1.5 shrink-0 border-b border-border/60 bg-surface/30 gap-2">
                {/* Left: Project Selector & Quick Create */}
                <div className="flex items-center gap-1.5 min-w-0 max-w-[68%] sm:max-w-[72%]">
                  <div className="relative flex items-center bg-surface border border-border hover:border-accent/50 focus-within:border-accent rounded px-2 py-1 transition-all shadow-xs group min-w-0">
                    <FileText size={13} className="shrink-0 text-accent/70 mr-1.5" />
                    <select
                      value={activeProject?.id || ''}
                      onChange={(e) => setActiveProjectId(e.target.value)}
                      aria-label="Select active workspace project"
                      className="appearance-none bg-transparent font-mono font-medium outline-none cursor-pointer pr-4 text-accent truncate text-[11px] max-w-[120px] sm:max-w-[170px]"
                    >
                      {projects.length === 0 ? (
                        <option value="" disabled className="bg-surface text-text">
                          No Projects
                        </option>
                      ) : (
                        projects.map(p => (
                          <option key={p.id} value={p.id} className="bg-surface text-text">
                            {p.name}
                          </option>
                        ))
                      )}
                    </select>
                    <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-accent/70 group-hover:text-accent transition-colors shrink-0" />
                  </div>

                  <button
                    onClick={handleCreateBlankProject}
                    className="flex items-center justify-center p-1.5 bg-surface border border-border hover:border-accent/50 hover:bg-accent/10 text-accent rounded transition-all cursor-pointer shadow-xs shrink-0 active:scale-95"
                    title="Create New Project"
                    aria-label="Create new project"
                  >
                    <Plus size={13} strokeWidth={2.5} />
                  </button>

                  {activeProject && (
                    <span className="hidden xs:inline-block px-1.5 py-0.5 bg-surface text-muted text-[10px] rounded border border-border font-mono shrink-0">
                      {files.length}
                    </span>
                  )}

                  {/* Active Project Detailed Metadata & Chart Trigger Pill */}
                  {activeProject && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowProjectStats(prev => !prev)}
                        className={`hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono border transition-all cursor-pointer shadow-xs ${
                          showProjectStats
                            ? 'bg-accent text-accent-text-on border-accent font-semibold'
                            : 'bg-surface hover:bg-surface-elevated text-muted hover:text-accent border-border hover:border-accent/40'
                        }`}
                        title={`View detailed project metadata & language charts (${activeProjectMetadata.totalLines.toLocaleString()} lines of code)`}
                        aria-label="Toggle active project detailed metadata and language analytics"
                      >
                        <BarChart3 size={11} className={showProjectStats ? 'text-accent-text-on' : 'text-accent'} />
                        <span>{activeProjectMetadata.totalLines.toLocaleString()} LOC</span>
                        {activeProjectMetadata.dominantLanguage !== 'None' && (
                          <span className="opacity-80 hidden md:inline">• {activeProjectMetadata.dominantLanguage}</span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowProjectStats(prev => !prev)}
                        className={`flex sm:hidden items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono transition-all cursor-pointer ${
                          showProjectStats
                            ? 'bg-accent text-accent-text-on border-accent'
                            : 'bg-surface text-muted hover:text-accent border-border'
                        }`}
                        title="Toggle active project analytics"
                        aria-label="Toggle active project analytics"
                      >
                        <BarChart3 size={10} className={showProjectStats ? 'text-accent-text-on' : 'text-accent'} />
                        <span>{activeProjectMetadata.totalLines.toLocaleString()}L</span>
                      </button>
                    </>
                  )}
                </div>

                {/* Hidden file input for file/zip upload */}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  multiple
                  className="hidden" 
                />

                {/* Right: Consolidated Professional Project Actions Dropdown Menu */}
                {activeProject && (
                  <div className="flex items-center gap-1 shrink-0 font-mono">
                    <ProjectActionsMenu
                      project={activeProject}
                      fileCount={files.length}
                      onOpenGithubImport={handleOpenGithubImport}
                      onOpenGithubPush={handleOpenGithubPush}
                      onOpenAnalytics={() => setShowProjectStats(true)}
                      onOpenBisect={() => handleOpenBisect()}
                      onNewProjectClick={() => setShowCreateProjectModal(true)}
                      onRenameClick={() => setShowRenameModal(true)}
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
                      onDeleteClick={() => setProjectToDelete(activeProject)}
                    />
                  </div>
                )}
              </div>

              {/* Active Project Metadata & Language Distribution Charts Panel */}
              {activeProject && (
                <ProjectMetadataPanel
                  project={activeProject}
                  files={files}
                  isOpen={showProjectStats}
                  onClose={() => setShowProjectStats(false)}
                />
              )}
              
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
                    handleIncomingFiles(e.dataTransfer.files);
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

                {projects.length === 0 ? (
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
                          onClick={handleCreateBlankProject}
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
                          onClick={handleOpenGithubImport}
                          className="w-full py-2 px-3 bg-surface border border-border text-text font-mono text-xs rounded hover:bg-accent/5 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <GithubIcon size={14} /> Import from GitHub
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <FileTree 
                    files={files} 
                    projectId={activeProject.id}
                    onFilesChanged={refreshFiles}
                    autoFocusSearch={focusSearchTrigger}
                  />
                )}
              </div>
            </div>
          )}
          {activeTab === 'chat' && (
            <ChatPanel projectId={activeProject?.id || 'project-1'} />
          )}
          {activeTab === 'preview' && (
            <ErrorBoundary resetKey={activeProject?.id}>
              <PreviewPanel files={files} />
            </ErrorBoundary>
          )}
          {activeTab === 'terminal' && (
            <TerminalPanel 
              projectId={activeProject?.id} 
              files={files} 
              onFilesChanged={refreshFiles}
              onOpenBisect={handleOpenBisect}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsPanel onOpenShortcuts={() => setShowShortcutsModal(true)} />
          )}

          {/* Full-screen Editor View Overlay */}
          {activeFile && (
            <Editor 
              file={activeFile} 
              onContentChanged={(newContent) => {
                setFiles(prev => prev.map(f => f.id === activeFile.id ? { ...f, content: newContent } : f));
              }}
              onOpenBisect={handleOpenBisect}
            />
          )}
        </main>

        {/* Fixed Bottom Tab Bar with 1px hairline */}
        <nav 
          role="tablist" 
          aria-label="Workspace view tabs"
          className="h-[60px] shrink-0 bg-surface border-t border-border flex relative"
        >
          <TabButton id="files" current={activeTab} onClick={setActiveTab} icon={<FileText size={19} />} label="Files" />
          <TabButton id="chat" current={activeTab} onClick={setActiveTab} icon={<MessageSquare size={19} />} label="Chat" />
          <TabButton id="preview" current={activeTab} onClick={setActiveTab} icon={<MonitorPlay size={19} />} label="Preview" />
          <TabButton id="terminal" current={activeTab} onClick={setActiveTab} icon={<Terminal size={19} />} label="Terminal" />
          <TabButton id="settings" current={activeTab} onClick={setActiveTab} icon={<Settings size={19} />} label="Settings" />
        </nav>
        
        {/* Agent Patch Review */}
        {activeProject && <PatchReviewSheet projectId={activeProject.id} />}

        {/* GitHub Import Modal */}
        {showGithubImport && activeProject && (
          <GithubImportModal 
            projectId={activeProject.id} 
            onClose={() => setShowGithubImport(false)}
            onSuccess={() => {
              setShowGithubImport(false);
              refreshFiles();
            }}
          />
        )}

        {/* GitHub Push Modal */}
        {showGithubPush && activeProject && (
          <GithubPushModal 
            projectId={activeProject.id} 
            onClose={() => setShowGithubPush(false)}
          />
        )}

        {/* Project Deletion Confirmation Modal */}
        {projectToDelete && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="bg-surface-elevated border border-error/40 rounded-xl max-w-sm w-full p-5 shadow-2xl flex flex-col gap-4 font-sans text-left corner-ticks">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5 text-error">
                  <div className="p-2 bg-error/10 border border-error/30 rounded-lg">
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-mono font-bold text-text">Delete Project</h3>
                    <p className="text-[10px] font-mono text-error font-semibold">Permanent Destruction</p>
                  </div>
                </div>
                <button
                  onClick={() => setProjectToDelete(null)}
                  className="text-muted hover:text-text p-1 cursor-pointer transition-colors"
                  aria-label="Cancel"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-2 text-xs text-muted leading-relaxed border-y border-border py-3">
                <p>
                  Are you sure you want to delete <span className="text-text font-bold font-mono">&quot;{projectToDelete.name}&quot;</span>?
                </p>
                <p className="text-error/90 text-[11px]">
                  This will permanently delete all files and snapshots in this project.
                </p>
                <p className="text-muted text-[10px] bg-error/5 border border-error/20 p-2 rounded">
                  ⚠️ This action is permanent and unrecoverable. There is no undo, soft-delete, or trash mechanism anywhere in this app.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => setProjectToDelete(null)}
                  className="px-3 py-1.5 bg-surface border border-border hover:bg-black/5 text-text rounded text-xs transition-colors cursor-pointer font-sans"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteProject(projectToDelete.id)}
                  className="px-3 py-1.5 bg-error hover:bg-error/90 text-white font-mono font-bold text-xs rounded transition-colors flex items-center gap-1.5 cursor-pointer shadow"
                >
                  <Trash2 size={13} />
                  <span>Delete Permanently</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Keyboard Shortcuts Cheatsheet Modal */}
        <KeyboardShortcutsModal
          isOpen={showShortcutsModal}
          onClose={() => setShowShortcutsModal(false)}
        />

        {/* Rename Workspace Modal */}
        {activeProject && (
          <RenameProjectModal
            project={activeProject}
            isOpen={showRenameModal}
            onClose={() => setShowRenameModal(false)}
            onRename={handleRenameProject}
          />
        )}

        {/* Find What Broke This (Bisection) Modal */}
        {activeProject && (
          <FindWhatBrokeModal
            projectId={activeProject.id}
            isOpen={showFindWhatBrokeModal}
            onClose={() => setShowFindWhatBrokeModal(false)}
            initialTestName={bisectInitialTestName}
          />
        )}

        {/* Create Project / Select Template Modal */}
        <CreateProjectModal
          isOpen={showCreateProjectModal}
          onClose={() => setShowCreateProjectModal(false)}
          onCreateProject={handleCreateProjectFromTemplate}
          existingProjectCount={projects.length}
        />

        {/* PWA Update / Offline Toast */}
        <ReloadPrompt />

        {/* Custom PWA Install Prompt */}
        <InstallPrompt />
      </div>
    </div>
  );
}

function TabButton({
  id,
  current,
  onClick,
  icon,
  label
}: {
  id: TabId;
  current: TabId;
  onClick: (id: TabId) => void;
  icon: React.ReactNode;
  label: string;
}) {
  const isActive = current === id;
  return (
    <button
      role="tab"
      aria-selected={isActive}
      aria-label={`${label} tab`}
      onClick={() => onClick(id)}
      className={`flex-1 relative flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
        isActive ? 'text-accent font-medium' : 'text-muted hover:text-text'
      }`}
    >
      <div className="relative flex flex-col items-center">
        {icon}
        {isActive && (
          <span className="w-5 h-[1px] bg-accent mt-0.5" />
        )}
      </div>
      <span className="text-[10px] font-mono tracking-tight">{label}</span>
      {isActive && (
        <div className="absolute bottom-0 left-3 right-3 h-[1px] bg-accent pointer-events-none" />
      )}
    </button>
  );
}
