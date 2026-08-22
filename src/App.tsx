/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { FileText, MessageSquare, MonitorPlay, CheckCircle2, Database, Download, Upload, FolderPlus, Plus, Settings, GitPullRequest, ChevronDown, Trash2, AlertTriangle, X } from 'lucide-react';
import { useAppStore, type TabId } from './store';
import { testDatabaseReadback } from './seed';
import { db, type FileItem, type Project } from './db';
import { exportZip } from './services/fs/zipExport';
import { importZip, isText } from './services/fs/zipImport';
import { listFiles, createFile, deleteProject } from './services/fs/vfs';
import { FileTree } from './components/FileTree';
import { Editor } from './components/Editor';
import { LockScreen } from './components/LockScreen';

import { SettingsPanel } from './components/SettingsPanel';
import { PatchReviewSheet } from './components/PatchReviewSheet';
import { ChatPanel } from './components/ChatPanel';
import { TopStrip } from './components/TopStrip';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PreviewPanel } from './components/PreviewPanel';
import { GithubImportModal } from './components/GithubImportModal';
import { GithubPushModal } from './components/GithubPushModal';
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
    activeProjectId,
    setActiveProjectId,
    keys,
    setDeferredInstallPrompt,
    setMcpServers
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
        });
      }
    }
  }, [keys, setMcpServers]);

  const [dbTested, setDbTested] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [showGithubImport, setShowGithubImport] = useState(false);
  const [showGithubPush, setShowGithubPush] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeProject = projects.find(p => p.id === activeProjectId) || projects[0] || null;

  const refreshFiles = async () => {
    if (activeProject) {
      setFiles(await listFiles(activeProject.id));
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

  const handleCreateBlankProject = async () => {
    try {
      const newProjId = crypto.randomUUID();
      const projName = projects.length > 0 ? `Workspace Project ${projects.length + 1}` : 'My Workspace Project';
      const newProj: Project = {
        id: newProjId,
        name: projName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.projects.put(newProj);
      await createFile(newProjId, '/README.md', `# ${projName}\nWelcome to LAIDE Studio local workspace.\n`);
      const allProjects = await db.projects.toArray();
      setProjects(allProjects);
      setActiveProjectId(newProjId);
      setFiles(await listFiles(newProjId));
    } catch (err: any) {
      console.error('Failed to create blank project', err);
      if (err.name === 'QuotaExceededError') {
        useAppStore.getState().addToast('Storage is full. Free up space and try again.', 'error');
      } else {
        useAppStore.getState().addToast(err.message || 'Failed to create project', 'error');
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeProject) return;
    
    try {
      if (file.name.endsWith('.zip')) {
        await importZip(file, activeProject.id, { autoRestructure: true });
      } else {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let content = '';
        if (isText(bytes)) {
          content = await file.text();
        } else {
          content = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        }
        await createFile(activeProject.id, `/${file.name}`, content);
      }
      await refreshFiles();
    } catch (err: any) {
      console.error('Failed to upload file', err);
      if (err.name === 'QuotaExceededError') {
        useAppStore.getState().addToast('Storage is full. Free up space and try again.', 'error');
      } else if (err.message && err.message.includes('collision')) {
        useAppStore.getState().addToast('A file already exists at this path.', 'error');
      } else {
        useAppStore.getState().addToast(err.message || 'Failed to upload file', 'error');
      }
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
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
    refreshFiles();
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
        <TopStrip dbTested={dbTested} />

        {/* Main Content Area */}
        <main className="flex-1 overflow-hidden flex flex-col relative">
          {activeTab === 'files' && (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              <div className="flex flex-wrap items-center justify-between text-accent font-mono text-xs px-3 sm:px-4 py-2 shrink-0 gap-y-2 gap-x-2 border-b border-border/40">
                <div className="flex items-center gap-1.5 min-w-0 max-w-full">
                  <div className="relative flex items-center bg-surface border border-accent/30 hover:border-accent/70 focus-within:border-accent rounded px-2 py-1 transition-all shadow-xs group">
                    <FileText size={13} className="shrink-0 text-accent/70 mr-1.5" />
                    <select
                      value={activeProject?.id || ''}
                      onChange={(e) => setActiveProjectId(e.target.value)}
                      aria-label="Select active workspace project"
                      className="appearance-none bg-transparent font-mono font-medium outline-none cursor-pointer pr-4 text-accent truncate text-[11px] max-w-[110px] sm:max-w-[150px]"
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
                    <ChevronDown size={13} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-accent/80 group-hover:text-accent transition-colors shrink-0" />
                  </div>

                  <button
                    onClick={handleCreateBlankProject}
                    className="flex items-center justify-center p-1.5 bg-surface border border-accent/30 hover:border-accent/70 hover:bg-accent/10 text-accent rounded transition-all cursor-pointer shadow-xs shrink-0 active:scale-95"
                    title="Create New Project"
                    aria-label="Create new project"
                  >
                    <Plus size={13} strokeWidth={2.5} />
                  </button>

                  {activeProject && (
                    <button
                      onClick={() => setProjectToDelete(activeProject)}
                      className="flex items-center justify-center p-1.5 bg-surface border border-error/30 hover:border-error/70 hover:bg-error/10 text-error rounded transition-all cursor-pointer shadow-xs shrink-0 active:scale-95"
                      title={`Delete project "${activeProject.name}"`}
                      aria-label={`Delete project ${activeProject.name}`}
                    >
                      <Trash2 size={13} strokeWidth={2} />
                    </button>
                  )}

                  {activeProject && (
                    <span className="px-1.5 py-0.5 bg-surface text-muted text-[10px] rounded border border-border font-mono normal-case tracking-normal shrink-0">
                      {files.length}
                    </span>
                  )}
                </div>
                {activeProject && (
                  <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 ml-auto font-mono">
                    <button 
                      onClick={handleOpenGithubImport}
                      className="flex flex-col items-center justify-center gap-0.5 text-muted hover:text-accent transition-colors cursor-pointer p-1"
                      title="Import from GitHub"
                      aria-label="Import from GitHub"
                    >
                      <GithubIcon size={15} />
                      <span className="text-[9px] sm:text-[10px] font-mono">Import</span>
                    </button>
                    <button 
                      onClick={handleOpenGithubPush}
                      className="flex flex-col items-center justify-center gap-0.5 text-muted hover:text-accent transition-colors cursor-pointer p-1"
                      title="Push to GitHub"
                      aria-label="Push to GitHub"
                    >
                      <GitPullRequest size={15} />
                      <span className="text-[9px] sm:text-[10px] font-mono">Push</span>
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                      className="hidden" 
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center justify-center gap-0.5 text-muted hover:text-accent transition-colors cursor-pointer p-1"
                      title="Upload file or .zip"
                      aria-label="Upload file or .zip"
                    >
                      <Upload size={15} />
                      <span className="text-[9px] sm:text-[10px] font-mono">Upload</span>
                    </button>
                    <button 
                      onClick={async () => {
                        try {
                          if (!activeProject) return;
                          const blob = await exportZip(activeProject.id);
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${activeProject.name.replace(/\s+/g, '_')}.zip`;
                          a.click();
                          URL.revokeObjectURL(url);
                        } catch (err) {
                          console.error('Export failed', err);
                        }
                      }}
                      className="flex flex-col items-center justify-center gap-0.5 text-muted hover:text-accent transition-colors cursor-pointer p-1"
                      title="Download project"
                      aria-label="Download project"
                    >
                      <Download size={15} />
                      <span className="text-[9px] sm:text-[10px] font-mono">Export</span>
                    </button>
                  </div>
                )}
              </div>
              
              <div className="flex-1 overflow-hidden flex flex-col">
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
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          onChange={handleFileUpload} 
                          className="hidden" 
                        />
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
          {activeTab === 'settings' && (
            <SettingsPanel />
          )}

          {/* Full-screen Editor View Overlay */}
          {activeFile && (
            <Editor 
              file={activeFile} 
              onContentChanged={(newContent) => {
                setFiles(prev => prev.map(f => f.id === activeFile.id ? { ...f, content: newContent } : f));
              }} 
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
