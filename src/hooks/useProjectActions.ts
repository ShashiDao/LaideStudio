/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { testDatabaseReadback } from '../seed';
import { db, type Project, type ArchivedProject } from '../db';
import {
  listFiles,
  deleteProject,
  renameProject,
  archiveProject,
  restoreProject,
  listArchivedProjects,
  deleteArchivedProject,
} from '../services/fs/vfs';
import { createProjectFromTemplate, type TemplateId } from '../services/templates/projectTemplates';
import { useFileOperations } from './useFileOperations';

interface UseProjectActionsParams {
  activeFileId: string | null;
  setActiveFileId: (id: string | null) => void;
}

/**
 * Owns the project list, archived-project list, the active project
 * derivation, and every project-level lifecycle action (rename, delete,
 * archive, restore, create-from-template). Composes useFileOperations
 * internally so file state always stays in sync with the active project.
 * Extracted from App.tsx.
 */
export function useProjectActions({ activeFileId, setActiveFileId }: UseProjectActionsParams) {
  const { activeProjectId, setActiveProjectId } = useAppStore();

  const [dbTested, setDbTested] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<ArchivedProject[]>([]);

  const activeProject = useMemo(() => {
    if (projects.length === 0) return null;
    if (activeProjectId) {
      const found = projects.find(p => p.id === activeProjectId);
      if (found) return found;
    }
    return projects[0] || null;
  }, [projects, activeProjectId]);

  const fileOps = useFileOperations({
    activeProject,
    activeFileId,
    setActiveFileId,
    projects,
    setProjects,
    setActiveProjectId,
  });

  // Initial DB readback: load projects, archived projects, and restore
  // the previously active project (or most recently updated one).
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
        fileOps.setFiles([]);
      }
    }).catch(err => {
      console.error('[DB Test Error]', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      const nextActive = remainingProjects.find(p => p.id === activeProjectId && p.id !== projId) || remainingProjects[0] || null;
      if (nextActive) {
        setActiveProjectId(nextActive.id);
        fileOps.setFiles(await listFiles(nextActive.id));
      } else {
        setActiveProjectId(null);
        fileOps.setFiles([]);
      }
      useAppStore.getState().addToast('Project deleted permanently', 'success');
    } catch (err) {
      console.error('Failed to delete project', err);
      useAppStore.getState().addToast(err instanceof Error ? err.message : 'Failed to delete project', 'error');
      // Re-throw so the caller (the confirmation dialog) knows the delete
      // did not complete and can keep the dialog open instead of closing
      // as if it succeeded.
      throw err;
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
        fileOps.setFiles(await listFiles(nextActive.id));
      } else {
        setActiveProjectId(null);
        fileOps.setFiles([]);
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
      fileOps.setFiles(await listFiles(restored.id));
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

  const handleGithubImportSuccess = async (newProjId?: string) => {
    const allProjects = await db.projects.toArray();
    setProjects(allProjects);
    const targetId = newProjId || activeProject?.id || (allProjects.length > 0 ? allProjects[allProjects.length - 1].id : null);
    if (targetId) {
      setActiveProjectId(targetId);
      fileOps.setFiles(await listFiles(targetId));
    }
  };

  const handleCreateProjectFromTemplate = async (name: string, templateId: TemplateId) => {
    try {
      const { project: newProj, files: createdFiles } = await createProjectFromTemplate(name, templateId);
      const allProjects = await db.projects.toArray();
      setProjects(allProjects);
      setActiveProjectId(newProj.id);
      fileOps.setFiles(createdFiles);
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

  return {
    dbTested,
    projects,
    archivedProjects,
    activeProject,
    handleRenameProject,
    handleDeleteProject,
    handleArchiveProject,
    handleRestoreProject,
    handleDeleteArchivedProject,
    handleCreateProjectFromTemplate,
    handleGithubImportSuccess,
    ...fileOps,
  };
}
