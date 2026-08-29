/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState } from 'react';
import { useAppStore } from '../store';
import type { Project } from '../db';

/**
 * Owns all modal/dialog/sheet visibility state for the workspace shell,
 * plus the handful of "open X" handlers that only need to flip a flag
 * (optionally guarded by a settings check). Extracted from App.tsx.
 */
export function useModalState() {
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

  const handleOpenProjectSearch = (initialQuery?: string) => {
    setProjectSearchInitialQuery(initialQuery || '');
    setShowProjectSearchModal(true);
  };

  const handleOpenBisect = (testName?: string) => {
    setBisectInitialTestName(testName);
    setShowFindWhatBrokeModal(true);
  };

  const handleOpenGithubImport = () => {
    const enc = localStorage.getItem('laide_github_pat') || localStorage.getItem('xiom_github_pat');
    if (!enc) {
      useAppStore.getState().setActiveTab('settings');
      useAppStore.getState().addToast('Please enter your GitHub Personal Access Token in Settings to import repositories', 'info');
      return;
    }
    setShowGithubImport(true);
  };

  const handleOpenGithubPush = () => {
    const enc = localStorage.getItem('laide_github_pat') || localStorage.getItem('xiom_github_pat');
    if (!enc) {
      useAppStore.getState().setActiveTab('settings');
      useAppStore.getState().addToast('Please enter your GitHub Personal Access Token in Settings to push repositories', 'info');
      return;
    }
    setShowGithubPush(true);
  };

  const handleCreateBlankProject = async () => {
    setShowCreateProjectModal(true);
  };

  return {
    showGithubImport, setShowGithubImport,
    showGithubPush, setShowGithubPush,
    showDeployModal, setShowDeployModal,
    showProjectSearchModal, setShowProjectSearchModal,
    projectSearchInitialQuery, setProjectSearchInitialQuery,
    showShortcutsModal, setShowShortcutsModal,
    focusSearchTrigger, setFocusSearchTrigger,
    projectToDelete, setProjectToDelete,
    showArchivedModal, setShowArchivedModal,
    showProjectStats, setShowProjectStats,
    showRenameModal, setShowRenameModal,
    showFindWhatBrokeModal, setShowFindWhatBrokeModal,
    showTrustReportModal, setShowTrustReportModal,
    trustReportInitialFile, setTrustReportInitialFile,
    showCreateProjectModal, setShowCreateProjectModal,
    isDraggingFiles, setIsDraggingFiles,
    bisectInitialTestName, setBisectInitialTestName,
    handleOpenProjectSearch,
    handleOpenBisect,
    handleOpenGithubImport,
    handleOpenGithubPush,
    handleCreateBlankProject,
  };
}
