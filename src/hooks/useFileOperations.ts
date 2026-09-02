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

/**
 * Owns the active project's file list plus every file-level operation:
 * reading the VFS, importing dropped/uploaded files (including ZIPs),
 * and auto-provisioning a project when files are dropped with none open.
 * Extracted from App.tsx.
 */
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

  const refreshFiles = async () => {
    if (activeProject) {
      setFiles(await listFiles(activeProject.id));
    }
  };

  // Reload the file list whenever the active project changes.
  const activeProjectId = activeProject?.id;
  useEffect(() => {
    let ignore = false;
    if (activeProjectId) {
      listFiles(activeProjectId).then(fileList => {
        if (!ignore) {
          setFiles(fileList);
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
