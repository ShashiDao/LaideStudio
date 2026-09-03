/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store';
import { db, type FileItem, type Project } from '../db';
import { importZip, isText } from '../services/fs/zipImport';
import { listFiles, bulkCreateOrUpdateFiles } from '../services/fs/vfs';
import { calculateProjectMetadata } from '../utils/projectStats';

interface UseFileOperationsParams {
  activeProject: Project | null;
  activeFileId: string | null;
  setActiveFileId: (id: string | null) => void;
  projects: Project[];
  setProjects: (projects: Project[]) => void;
  setActiveProjectId: (id: string | null) => void;
}

export interface FileSelectionState {
  openFileIds: string[];
  activeFileId: string | null;
}

export function reconcileFileSelection(
  files: FileItem[],
  selection: FileSelectionState,
): FileSelectionState {
  const validIds = new Set(files.map(file => file.id));
  const openFileIds = selection.openFileIds.filter(id => validIds.has(id));
  const activeFileId = selection.activeFileId && validIds.has(selection.activeFileId)
    ? selection.activeFileId
    : openFileIds[openFileIds.length - 1] || null;

  return { openFileIds, activeFileId };
}

export function useFileOperations({
  activeProject,
  activeFileId,
  setActiveFileId,
  projects,
  setProjects,
  setActiveProjectId,
}: UseFileOperationsParams) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeFile = useMemo(() => files.find(f => f.id === activeFileId), [files, activeFileId]);

  const activeProjectMetadata = useMemo(() => {
    return calculateProjectMetadata(files);
  }, [files]);

  useEffect(() => {
    const current = useAppStore.getState();
    const next = reconcileFileSelection(files, {
      openFileIds: current.openFileIds,
      activeFileId: current.activeFileId,
    });

    if (next.openFileIds.length !== current.openFileIds.length ||
        next.openFileIds.some((id, index) => id !== current.openFileIds[index])) {
      current.setOpenFileIds(next.openFileIds);
    }
    if (next.activeFileId !== current.activeFileId) {
      setActiveFileId(next.activeFileId);
    }
  }, [files, setActiveFileId]);

  const refreshFiles = async () => {
    if (activeProject) {
      setFiles(await listFiles(activeProject.id));
    }
  };

  const activeProjectId = activeProject?.id;
  useEffect(() => {
    let ignore = false;
    setFiles([]);

    if (activeProjectId) {
      listFiles(activeProjectId).then(fileList => {
        if (!ignore) {
          setFiles(fileList);
        }
      }).catch(err => {
        if (!ignore) {
          console.error('Failed to load project files', err);
        }
      });
    }

    return () => {
      ignore = true;
    };
  }, [activeProjectId]);

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

    const zipFiles = fileArray.filter(f => f.name.toLowerCase().endsWith('.zip'));
    const regularFiles = fileArray.filter(f => !f.name.toLowerCase().endsWith('.zip'));

    if (zipFiles.length > 0) {
      useAppStore.getState().addToast(
        zipFiles.length === 1
          ? `Extracting "${zipFiles[0].name}"...`
          : `Processing ${fileArray.length} files...`,
        'info'
      );
    } else {
      useAppStore.getState().addToast(
        `Importing ${fileArray.length} file${fileArray.length !== 1 ? 's' : ''}...`,
        'info'
      );
    }

    try {
      let targetProjectId = activeProject?.id;
      let targetProjectName = activeProject?.name;

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

      let totalImported = 0;
      let totalSkipped = 0;
      let recoveredArchives = 0;

      for (const zipFile of zipFiles) {
        const result = await importZip(zipFile, targetProjectId, { autoRestructure: true });
        totalImported += result.count;
        if (result.skipped && result.skipped.length > 0) {
          totalSkipped += result.skipped.length;
        }
        if (result.recovered) {
          recoveredArchives++;
        }
      }

      if (recoveredArchives > 0) {
        useAppStore.getState().addToast(
          `ZIP recovery salvaged ${totalImported} readable file${totalImported !== 1 ? 's' : ''}. Some damaged or unsafe entries may have been skipped.`,
          'warning'
        );
      }

      if (totalSkipped > 0 && recoveredArchives === 0) {
        useAppStore.getState().addToast(
          `${totalSkipped} file${totalSkipped > 1 ? 's were' : ' was'} skipped due to unsafe path names`,
          'warning'
        );
      }

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

  return {
    files,
    setFiles,
    activeFile,
    activeProjectMetadata,
    refreshFiles,
    fileInputRef,
    handleIncomingFiles,
    handleFileUpload,
  };
}
