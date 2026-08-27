/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { FileText, MessageSquare, MonitorPlay, Upload, FolderPlus, Plus, Settings, ChevronDown, Trash2, AlertTriangle, X, Terminal, BarChart3 } from 'lucide-react';
import { useAppStore, type TabId } from './store';
import type { BeforeInstallPromptEvent } from './types';
import { testDatabaseReadback } from './seed';
import { db, type FileItem, type Project, type ArchivedProject } from './db';
import { exportZip } from './services/fs/zipExport';
import { importZip, isText } from './services/fs/zipImport';
import { exportProjectAsMarkdown, generateProjectMarkdown } from './services/fs/markdownExport';
import { listFiles, deleteProject, renameProject, bulkCreateOrUpdateFiles, archiveProject, restoreProject, listArchivedProjects, deleteArchivedProject } from './services/fs/vfs';
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
import { ProjectFilesPane } from './components/ProjectFilesPane';
import { ActivityRail } from './components/ActivityRail';
import { EditorTabs } from './components/EditorTabs';
import { TerminalDrawer } from './components/TerminalDrawer';
const ProjectMetadataPanel = React.lazy(() =>
  import('./components/ProjectMetadataPanel').then((m) => ({ default: m.ProjectMetadataPanel }))
);
import { GithubImportModal } from './components/GithubImportModal';
import { GithubPushModal } from './components/GithubPushModal';
import { DeployModal } from './components/DeployModal';
import { FindWhatBrokeModal } from './components/FindWhatBrokeModal';
import { TrustReportModal } from './components/TrustReportModal';
import { CreateProjectModal } from './components/CreateProjectModal';
import { ProjectSearchModal } from './components/ProjectSearchModal';
import { ArchivedProjectsModal } from './components/ArchivedProjectsModal';
import { createProjectFromTemplate, type TemplateId } from './services/templates/projectTemplates';
import { ReloadPrompt } from './components/ReloadPrompt';
import { InstallPrompt } from './components/InstallPrompt';
import { Toaster } from './components/Toaster';
import { useGlobalKeyboardShortcuts } from './hooks/useGlobalKeyboardShortcuts';
import { useShellBreakpoint } from './hooks/useShellBreakpoint';

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
    openFileIds,
    setOpenFileIds,
    openFile,
    closeFile,
    isTerminalDrawerOpen,
    setIsTerminalDrawerOpen,
    toggleTerminalDrawer,
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
  const [archivedProjects, setArchivedProjects] = useState<ArchivedProject[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [showGithubImport, setShowGithubImport] = useState(false);
  const [showGithubPush, setShowGithubPush] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [showProjectSearchModal, setShowProjectSearchModal] = useState(false);
  const [projectSearchInitialQuery, setProjectSearchInitialQuery] = useState('');
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [focusSearchTrigger, setFocusSearchTrigger] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [showArchivedModal, setShowArchivedModal] = useState(false);
  const [showProjectStats, setShowProjectStats] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showFindWhatBrokeModal, setShowFindWhatBrokeModal] = useState(false);
  const [showTrustReportModal, setShowTrustReportModal] = useState(false);
  const [trustReportInitialFile, setTrustReportInitialFile] = useState<string | undefined>(undefined);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [bisectInitialTestName, setBisectInitialTestName] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const breakpoint = useShellBreakpoint(shellRef);

  const handleOpenProjectSearch = (initialQuery?: string) => {
    setProjectSearchInitialQuery(initialQuery || '');
    setShowProjectSearchModal(true);
  };

  const activeProject = useMemo(() => {
    if (projects.length === 0) return null;
    if (activeProjectId) {
      const found = projects.find(p => p.id === activeProjectId);
      if (found) return found;
    }
    return projects[0] || null;
  }, [projects, activeProjectId]);

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
    } catch (err) {
      console.error('Failed to rename project', err);
      useAppStore.getState().addToast(err instanceof Error ? err.message : 'Failed to rename workspace', 'error');
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

  const handleArchiveProject = async (project: Project) => {
    try {
      await archiveProject(project.id);
      const remainingProjects = await db.projects.toArray();
      const updatedArchived = await listArchivedProjects();
      setProjects(remainingProjects);
      setArchivedProjects(updatedArchived);

      const nextActive = remainingProjects.find(p => p.id !== project.id) || null;
      if (nextActive) {
        setActiveProjectId(nextActive.id);
        setFiles(await listFiles(nextActive.id));
      } else {
        setActiveProjectId(null);
        setFiles([]);
      }

      useAppStore.getState().addToast(`Archived "${project.name}" to separate collection`, 'success');
    } catch (err) {
      console.error('Failed to archive project', err);
      useAppStore.getState().addToast(err instanceof Error ? err.message : 'Failed to archive project', 'error');
    }
  };

  const handleRestoreProject = async (projectId: string) => {
    try {
      const restored = await restoreProject(projectId);
      const allProjects = await db.projects.toArray();
      const updatedArchived = await listArchivedProjects();
      setProjects(allProjects);
      setArchivedProjects(updatedArchived);
      setActiveProjectId(restored.id);
      setFiles(await listFiles(restored.id));
      useAppStore.getState().addToast(`Restored "${restored.name}" to workspace`, 'success');
    } catch (err) {
      console.error('Failed to restore project', err);
      useAppStore.getState().addToast(err instanceof Error ? err.message : 'Failed to restore project', 'error');
    }
  };

  const handleDeleteArchivedProject = async (projectId: string) => {
    try {
      await deleteArchivedProject(projectId);
      const updatedArchived = await listArchivedProjects();
      setArchivedProjects(updatedArchived);
      useAppStore.getState().addToast('Archived project permanently deleted', 'success');
    } catch (err) {
      console.error('Failed to delete archived project', err);
      useAppStore.getState().addToast('Failed to delete archived project', 'error');
    }
  };

  const handleOpenGithubImport = () => {
    const enc = localStorage.getItem('laide_github_pat') || localStorage.getItem('xiom_github_pat');
    if (!enc) {
      setActiveTab('settings');
      useAppStore.getState().addToast('Please enter your GitHub Personal Access Token in Settings to import repositories', 'info');
      return;
    }
    setShowGithubImport(true);
  };

  const handleOpenGithubPush = () => {
    const enc = localStorage.getItem('laide_github_pat') || localStorage.getItem('xiom_github_pat');
    if (!enc) {
      setActiveTab('settings');
      useAppStore.getState().addToast('Please enter your GitHub Personal Access Token in Settings to push repositories', 'info');
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
    } catch (err) {
      console.error('Failed to create project from template', err);
      if (err instanceof Error && err.name === 'QuotaExceededError') {
        useAppStore.getState().addToast('Storage is full. Free up space and try again.', 'error');
      } else {
        useAppStore.getState().addToast(err instanceof Error ? err.message : 'Failed to create project', 'error');
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
    } catch (err) {
      console.error('Failed to process uploaded files', err);
      if (err instanceof Error && err.name === 'QuotaExceededError') {
        useAppStore.getState().addToast('Storage is full. Free up space and try again.', 'error');
      } else {
        useAppStore.getState().addToast(err instanceof Error ? err.message : 'Failed to upload files', 'error');
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
    testDatabaseReadback().then(async (res) => {
      setDbTested(res.success);
      const loadedProjects = res.projects;
      setProjects(loadedProjects);
      try {
        const loadedArchived = await listArchivedProjects();
        setArchivedProjects(loadedArchived);
      } catch (e) {
        console.error('Failed to load archived projects', e);
      }

      if (loadedProjects.length > 0) {
        // Existing user with project data: restore saved project or most recently updated
        const savedId = useAppStore.getState().activeProjectId;
        const matched = loadedProjects.find(p => p.id === savedId);
        if (matched) {
          setActiveProjectId(matched.id);
        } else {
          const sorted = [...loadedProjects].sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
          setActiveProjectId(sorted[0].id);
        }
      } else {
        // New user with no projects: default page is "No Project Open"
        setActiveProjectId(null);
        setFiles([]);
      }
    }).catch(err => {
      console.error('[DB Test Error]', err);
    });

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the browser's default install banner
      e.preventDefault();
      setDeferredInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [setActiveProjectId, setDeferredInstallPrompt]);

  useGlobalKeyboardShortcuts({
    activeFileId,
    setActiveFileId,
    setActiveTab,
    showProjectSearchModal,
    setShowProjectSearchModal,
    showShortcutsModal,
    setShowShortcutsModal,
    setFocusSearchTrigger,
    handleOpenProjectSearch,
    toggleTheme,
    lockVault,
  });

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
    <div ref={shellRef} className="flex justify-center min-h-screen bg-black w-full">
      {/* Phone Layout (< 700px): Preserved Bit-for-Bit */}
      {breakpoint === 'phone' ? (
        <div className="w-full max-w-[480px] h-dvh bg-bg text-text flex flex-col relative shadow-2xl overflow-hidden paper-grain-overlay">
          {/* Fixed Top Strip (~28px for context gauge) */}
          <TopStrip 
            dbTested={dbTested} 
            onOpenShortcuts={() => setShowShortcutsModal(true)} 
            breakpoint={breakpoint}
          />

          {/* Main Content Area */}
          <main className="flex-1 overflow-hidden flex flex-col relative">
            {activeTab === 'files' && (
              <ProjectFilesPane
                projects={projects}
                activeProject={activeProject}
                files={files}
                breakpoint={breakpoint}
                onSelectProjectId={setActiveProjectId}
                onCreateBlankProject={handleCreateBlankProject}
                onRefreshFiles={refreshFiles}
                focusSearchTrigger={focusSearchTrigger}
                onOpenProjectSearch={handleOpenProjectSearch}
                onOpenDeploy={() => setShowDeployModal(true)}
                onOpenGithubImport={handleOpenGithubImport}
                onOpenGithubPush={handleOpenGithubPush}
                onOpenBisect={handleOpenBisect}
                onOpenTrustReport={() => {
                  setTrustReportInitialFile(undefined);
                  setShowTrustReportModal(true);
                }}
                onOpenCreateProjectModal={() => setShowCreateProjectModal(true)}
                onOpenRenameModal={() => setShowRenameModal(true)}
                onArchiveProject={handleArchiveProject}
                onPromptDeleteProject={setProjectToDelete}
                onFileUpload={handleFileUpload}
                onIncomingFiles={handleIncomingFiles}
                activeProjectMetadata={activeProjectMetadata}
                showProjectStats={showProjectStats}
                setShowProjectStats={setShowProjectStats}
                archivedCount={archivedProjects.length}
                onOpenArchivedProjects={() => setShowArchivedModal(true)}
              />
            )}
            {activeTab === 'chat' && (
              <ChatPanel projectId={activeProject?.id || 'project-1'} breakpoint={breakpoint} />
            )}
            {activeTab === 'preview' && (
              <ErrorBoundary resetKey={activeProject?.id}>
                <PreviewPanel 
                  files={files} 
                  breakpoint={breakpoint}
                  onOpenDeploy={activeProject ? () => setShowDeployModal(true) : undefined}
                />
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

            {/* Full-screen Editor View Overlay (Phone mode) */}
            {activeFile && (
              <Editor 
                file={activeFile} 
                onContentChanged={(newContent) => {
                  setFiles(prev => prev.map(f => f.id === activeFile.id ? { ...f, content: newContent } : f));
                }}
                onOpenBisect={handleOpenBisect}
                onOpenTrustReport={(filePath) => {
                  setTrustReportInitialFile(filePath);
                  setShowTrustReportModal(true);
                }}
              />
            )}
          </main>

          {/* Fixed Bottom Tab Bar with safe-area padding for home indicator */}
          <nav 
            role="tablist" 
            aria-label="Workspace view tabs"
            className="pb-safe pl-safe pr-safe shrink-0 bg-surface border-t border-border flex relative"
          >
            <div className="h-[60px] w-full flex">
              <TabButton id="files" current={activeTab} onClick={setActiveTab} icon={<FileText size={19} />} label="Files" />
              <TabButton id="chat" current={activeTab} onClick={setActiveTab} icon={<MessageSquare size={19} />} label="Chat" />
              <TabButton id="preview" current={activeTab} onClick={setActiveTab} icon={<MonitorPlay size={19} />} label="Preview" />
              <TabButton id="terminal" current={activeTab} onClick={setActiveTab} icon={<Terminal size={19} />} label="Terminal" />
              <TabButton id="settings" current={activeTab} onClick={setActiveTab} icon={<Settings size={19} />} label="Settings" />
            </div>
          </nav>
        </div>
      ) : (
        /* Tablet & Desktop Layout (>= 700px): Persistent Rail + File Tree + Workspace */
        <div className="w-full h-dvh bg-bg text-text flex flex-col relative overflow-hidden paper-grain-overlay">
          {/* Top Strip */}
          <TopStrip 
            dbTested={dbTested} 
            onOpenShortcuts={() => setShowShortcutsModal(true)} 
            breakpoint={breakpoint}
          />

          {/* Main 3-Column Shell Area */}
          <div className="flex-1 flex overflow-hidden relative">
            {/* 1. Left Icon Rail (46px) */}
            <ActivityRail activeTab={activeTab} onSelectTab={setActiveTab} />

            {/* 2. Persistent Files Pane (~220px) */}
            <aside 
              aria-label="Project Explorer"
              className="w-[220px] shrink-0 border-r border-border bg-surface/20 flex flex-col overflow-hidden"
            >
              <ProjectFilesPane
                projects={projects}
                activeProject={activeProject}
                files={files}
                breakpoint={breakpoint}
                onSelectProjectId={setActiveProjectId}
                onCreateBlankProject={handleCreateBlankProject}
                onRefreshFiles={refreshFiles}
                focusSearchTrigger={focusSearchTrigger}
                onOpenProjectSearch={handleOpenProjectSearch}
                onOpenDeploy={() => setShowDeployModal(true)}
                onOpenGithubImport={handleOpenGithubImport}
                onOpenGithubPush={handleOpenGithubPush}
                onOpenBisect={handleOpenBisect}
                onOpenTrustReport={() => {
                  setTrustReportInitialFile(undefined);
                  setShowTrustReportModal(true);
                }}
                onOpenCreateProjectModal={() => setShowCreateProjectModal(true)}
                onOpenRenameModal={() => setShowRenameModal(true)}
                onArchiveProject={handleArchiveProject}
                onPromptDeleteProject={setProjectToDelete}
                onFileUpload={handleFileUpload}
                onIncomingFiles={handleIncomingFiles}
                activeProjectMetadata={activeProjectMetadata}
                showProjectStats={showProjectStats}
                setShowProjectStats={setShowProjectStats}
                archivedCount={archivedProjects.length}
                onOpenArchivedProjects={() => setShowArchivedModal(true)}
              />
            </aside>

            {/* 3. Primary Workspace Column with Editor, Docks & Terminal Drawer */}
            <main className="flex-1 flex flex-col overflow-hidden relative bg-bg">
              {activeTab === 'settings' ? (
                <SettingsPanel onOpenShortcuts={() => setShowShortcutsModal(true)} />
              ) : activeTab === 'terminal' ? (
                <TerminalPanel 
                  projectId={activeProject?.id} 
                  files={files} 
                  onFilesChanged={refreshFiles}
                  onOpenBisect={handleOpenBisect}
                />
              ) : (
                /* Primary Editor & Right-Side Dock Area */
                <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                  {/* Multi-file Editor Tabs Bar */}
                  <EditorTabs
                    files={files}
                    openFileIds={openFileIds}
                    activeFileId={activeFileId}
                    onSelectFile={(id) => setActiveFileId(id)}
                    onCloseFile={(id) => closeFile(id)}
                    onReorderTabs={(ids) => setOpenFileIds(ids)}
                  />

                  {/* Horizontal Split: Editor Center + Right Dock */}
                  <div className="flex-1 flex overflow-hidden min-h-0">
                    {/* Main Editor Center View */}
                    <div className="flex-1 flex flex-col overflow-hidden min-w-0 border-r border-border/50">
                      {activeFile ? (
                        <Editor 
                          file={activeFile} 
                          onContentChanged={(newContent) => {
                            setFiles(prev => prev.map(f => f.id === activeFile.id ? { ...f, content: newContent } : f));
                          }}
                          onOpenBisect={handleOpenBisect}
                          onOpenTrustReport={(filePath) => {
                            setTrustReportInitialFile(filePath);
                            setShowTrustReportModal(true);
                          }}
                        />
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center canvas-grid-pattern text-muted select-none">
                          <div className="border border-border bg-surface/60 rounded-xl p-8 max-w-sm w-full flex flex-col items-center corner-ticks shadow-xs">
                            <div className="w-12 h-12 rounded-lg bg-surface-elevated border border-accent/40 flex items-center justify-center text-accent mb-3 shadow-xs">
                              <FileText size={22} />
                            </div>
                            <div className="font-mono text-[10px] text-accent tracking-wider uppercase mb-1">
                              WORKSPACE EDITOR
                            </div>
                            <h3 className="font-mono text-sm font-bold text-text mb-1">
                              No File Selected
                            </h3>
                            <p className="font-sans text-xs text-muted leading-relaxed">
                              Select a file from the explorer pane on the left or press <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded font-mono text-[10px] text-text">Ctrl+P</kbd> to quick-open.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right-Hand Dock: Tablet (Mutually exclusive activeTab 'chat'|'preview') / Desktop (Side-by-side or tabbed) */}
                    {breakpoint === 'desktop' ? (
                      <div className="w-[680px] shrink-0 border-l border-border flex overflow-hidden bg-surface/10">
                        {/* Desktop Chat Dock */}
                        <div className="w-[340px] shrink-0 border-r border-border flex flex-col overflow-hidden">
                          <ChatPanel projectId={activeProject?.id || 'project-1'} breakpoint={breakpoint} />
                        </div>
                        {/* Desktop Preview Dock */}
                        <div className="flex-1 flex flex-col overflow-hidden">
                          <ErrorBoundary resetKey={activeProject?.id}>
                            <PreviewPanel 
                              files={files} 
                              breakpoint={breakpoint}
                              onOpenDeploy={activeProject ? () => setShowDeployModal(true) : undefined}
                            />
                          </ErrorBoundary>
                        </div>
                      </div>
                    ) : (
                      /* Tablet Viewport (700-1199px): Dock renders the active panel if 'chat' or 'preview' is selected */
                      (activeTab === 'chat' || activeTab === 'preview') ? (
                        <div className="w-[360px] shrink-0 border-l border-border flex flex-col overflow-hidden bg-surface/10">
                          {activeTab === 'chat' ? (
                            <ChatPanel projectId={activeProject?.id || 'project-1'} breakpoint={breakpoint} />
                          ) : (
                            <ErrorBoundary resetKey={activeProject?.id}>
                              <PreviewPanel 
                                files={files} 
                                breakpoint={breakpoint}
                                onOpenDeploy={activeProject ? () => setShowDeployModal(true) : undefined}
                              />
                            </ErrorBoundary>
                          )}
                        </div>
                      ) : null
                    )}
                  </div>

                  {/* Collapsible Bottom Terminal Drawer */}
                  <TerminalDrawer
                    isOpen={isTerminalDrawerOpen}
                    onToggle={toggleTerminalDrawer}
                    onClose={() => setIsTerminalDrawerOpen(false)}
                    projectId={activeProject?.id}
                    files={files}
                    onFilesChanged={refreshFiles}
                    onOpenBisect={handleOpenBisect}
                  />
                </div>
              )}
            </main>
          </div>
        </div>
      )}

      {/* Shared Modals, Overlays & Toasts (Render once as siblings to both layout branches) */}
      <Toaster />

      {/* Active Project Metadata & Language Distribution Charts Panel */}
      {activeProject && (
        <React.Suspense fallback={null}>
          <ProjectMetadataPanel
            project={activeProject}
            files={files}
            isOpen={showProjectStats}
            onClose={() => setShowProjectStats(false)}
          />
        </React.Suspense>
      )}

      {/* Agent Patch Review */}
      {activeProject && <PatchReviewSheet projectId={activeProject.id} />}

        {/* GitHub Import Modal */}
        {showGithubImport && (
          <GithubImportModal 
            projectId={activeProject?.id} 
            onClose={() => setShowGithubImport(false)}
            onSuccess={async (newProjId?: string) => {
              setShowGithubImport(false);
              const allProjects = await db.projects.toArray();
              setProjects(allProjects);
              const targetId = newProjId || activeProject?.id || (allProjects.length > 0 ? allProjects[allProjects.length - 1].id : null);
              if (targetId) {
                setActiveProjectId(targetId);
                setFiles(await listFiles(targetId));
              }
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

        {/* 1-Click Live Deploy / Publish Modal */}
        {showDeployModal && activeProject && (
          <DeployModal
            project={activeProject}
            onClose={() => setShowDeployModal(false)}
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

        {/* Global Project-wide Search Modal (Find in Files) */}
        <ProjectSearchModal
          isOpen={showProjectSearchModal}
          onClose={() => setShowProjectSearchModal(false)}
          files={files}
          initialQuery={projectSearchInitialQuery}
        />

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

        {/* AI Provenance & Trust Score Report Modal */}
        {activeProject && (
          <TrustReportModal
            projectId={activeProject.id}
            isOpen={showTrustReportModal}
            onClose={() => setShowTrustReportModal(false)}
            initialFilePath={trustReportInitialFile}
            onSelectFile={(filePath) => {
              const file = files.find(f => f.path === filePath);
              if (file) {
                setActiveFileId(file.id);
                setShowTrustReportModal(false);
              }
            }}
            onOpenBisect={(testName) => {
              setShowTrustReportModal(false);
              handleOpenBisect(testName);
            }}
          />
        )}

        {/* Archived Projects Modal */}
        <ArchivedProjectsModal
          isOpen={showArchivedModal}
          onClose={() => setShowArchivedModal(false)}
          archivedProjects={archivedProjects}
          onRestoreProject={handleRestoreProject}
          onDeleteArchivedProject={handleDeleteArchivedProject}
        />

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
