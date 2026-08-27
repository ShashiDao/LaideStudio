import { useEffect } from 'react';
import { useAppStore, type TabId } from '../store';

export interface GlobalKeyboardShortcutsOptions {
  activeFileId: string | null;
  setActiveFileId: (id: string | null) => void;
  setActiveTab: (tab: TabId) => void;
  showProjectSearchModal: boolean;
  setShowProjectSearchModal: (show: boolean) => void;
  showShortcutsModal: boolean;
  setShowShortcutsModal: (updater: boolean | ((prev: boolean) => boolean)) => void;
  setFocusSearchTrigger: (show: boolean) => void;
  handleOpenProjectSearch: (initialQuery?: string) => void;
  toggleTheme: () => void;
  lockVault: () => void;
}

/**
 * Global app-wide keyboard shortcuts (help sheet, escape-to-dismiss, quick
 * open, tab switching, theme toggle, vault lock, numeric tab jumps).
 * Extracted from App.tsx so the shortcut map can be read, tested, and
 * changed on its own without wading through the rest of the component.
 */
export function useGlobalKeyboardShortcuts({
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
}: GlobalKeyboardShortcutsOptions): void {
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
        if (showProjectSearchModal) {
          e.preventDefault();
          setShowProjectSearchModal(false);
          return;
        }
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
      // 3. Ctrl+Shift+F: Global Project Search (Find in Files)
      if (isMod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        handleOpenProjectSearch();
        return;
      }

      // 4. Ctrl+P: Quick open & focus file search
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

      // 5. Ctrl+` (Backquote) / Ctrl+~: Toggle Terminal Drawer or Switch to Terminal tab
      if (isMod && (e.key === '`' || e.key === '~')) {
        e.preventDefault();
        const store = useAppStore.getState();
        store.toggleTerminalDrawer();
        if (store.activeTab === 'terminal') {
          setActiveTab('files');
        }
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
  }, [
    activeFileId,
    showShortcutsModal,
    showProjectSearchModal,
    setActiveTab,
    setActiveFileId,
    toggleTheme,
    lockVault,
    setShowShortcutsModal,
    setShowProjectSearchModal,
    setFocusSearchTrigger,
    handleOpenProjectSearch,
  ]);
}
