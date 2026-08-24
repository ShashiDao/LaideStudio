import { create, StateCreator } from 'zustand';
import type { KeyMaterial } from './services/crypto';
import type { PatchDefinition } from './services/agent/patchSchema';
import type { LLMMessage } from './services/llm/llmAdapter';
import { DEFAULT_MANIFEST_EXCLUDE_PATTERNS } from './services/agent/prompts';

export interface TokenUsage {
  system: number;
  codebase: number;
  chat: number;
  max: number;
  isEstimate: boolean;
}

export type TabId = 'files' | 'chat' | 'preview' | 'terminal' | 'settings';

export interface PreviewScreenshot {
  data: string; // base64 payload
  mediaType: string; // e.g. 'image/png'
  dataUrl?: string; // data:image/png;base64,...
  timestamp: number;
  width?: number;
  height?: number;
}

export interface MCPServer {
  id: string;
  url: string;
}

export type PendingPatch = PatchDefinition;

export interface WorkspaceSlice {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  activeFileId: string | null;
  setActiveFileId: (id: string | null) => void;
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  keys: KeyMaterial | null;
  setKeys: (keys: KeyMaterial | null) => void;
  mcpServers: MCPServer[];
  setMcpServers: (servers: MCPServer[]) => void;
  lastBuildError: string | null;
  setLastBuildError: (error: string | null) => void;
  lastPreviewScreenshot: PreviewScreenshot | null;
  setLastPreviewScreenshot: (screenshot: PreviewScreenshot | null) => void;
  editorNavigationTarget: { line: number; column?: number; length?: number } | null;
  setEditorNavigationTarget: (target: { line: number; column?: number; length?: number } | null) => void;
  lockVault: () => void;
}

export interface PatchSlice {
  pendingPatches: PendingPatch[];
  setPendingPatches: (patches: PendingPatch[]) => void;
  addPendingPatch: (patch: PendingPatch) => void;
  clearPendingPatches: () => void;
  isPatchReviewOpen: boolean;
  setIsPatchReviewOpen: (open: boolean) => void;
  flashingPaths: string[];
  flashPatchedPaths: (paths: string[]) => void;
}

export interface ChatSlice {
  chatHistory: LLMMessage[];
  setChatHistory: (history: LLMMessage[]) => void;
  tokenUsage: TokenUsage;
  setTokenUsage: (usage: TokenUsage) => void;
  queuedPrompt: string | null;
  setQueuedPrompt: (prompt: string | null) => void;
  customInstructions: string;
  setCustomInstructions: (instructions: string) => void;
  temperature?: number;
  setTemperature: (temperature?: number) => void;
  maxOutputTokens?: number;
  setMaxOutputTokens: (maxOutputTokens?: number) => void;
  maxAgentSteps: number;
  setMaxAgentSteps: (steps: number) => void;
  manifestExcludePatterns: string[];
  setManifestExcludePatterns: (patterns: string[]) => void;
  attachPreviewVision: boolean;
  setAttachPreviewVision: (attach: boolean) => void;
  autoVisionOnPatch: boolean;
  setAutoVisionOnPatch: (auto: boolean) => void;
  ensembleModeEnabled: boolean;
  setEnsembleModeEnabled: (enabled: boolean) => void;
  ensembleCandidateBProfileId: string | null;
  setEnsembleCandidateBProfileId: (id: string | null) => void;
}

export interface PWASlice {
  deferredInstallPrompt: any;
  setDeferredInstallPrompt: (prompt: any) => void;
  showInstallPrompt: boolean;
  setShowInstallPrompt: (show: boolean) => void;
  triggerInstallEngagement: () => void;
}

export type ThemeMode = 'oled' | 'paper';

export interface ThemeSlice {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'info' | 'error' | 'success';
}

export interface ToastSlice {
  toasts: ToastMessage[];
  addToast: (message: string, type?: 'info' | 'error' | 'success') => void;
  removeToast: (id: string) => void;
}

export type AppState = WorkspaceSlice & PatchSlice & ChatSlice & PWASlice & ThemeSlice & ToastSlice;

export const THEME_STORAGE_KEY = 'laide_theme_preference';

export const getInitialTheme = (): ThemeMode => {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'oled' || saved === 'paper') {
      return saved;
    }
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oled' : 'paper';
  }
  return 'oled';
};

export const applyThemeToDocument = (theme: ThemeMode) => {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
};

const initialTheme = getInitialTheme();
if (typeof document !== 'undefined') {
  applyThemeToDocument(initialTheme);
}

const createWorkspaceSlice: StateCreator<AppState, [], [], WorkspaceSlice> = (set) => ({
  activeTab: 'files',
  setActiveTab: (tab) => set({ activeTab: tab }),
  activeFileId: null,
  setActiveFileId: (id) => set({ activeFileId: id }),
  activeProfileId: typeof localStorage !== 'undefined' ? localStorage.getItem('xiom_active_profile_id') : null,
  setActiveProfileId: (id) => {
    if (typeof localStorage !== 'undefined') {
      if (id) {
        localStorage.setItem('xiom_active_profile_id', id);
      } else {
        localStorage.removeItem('xiom_active_profile_id');
      }
    }
    set({ activeProfileId: id });
  },
  activeProjectId: typeof localStorage !== 'undefined' ? localStorage.getItem('xiom_active_project_id') : null,
  setActiveProjectId: (id) => {
    if (typeof localStorage !== 'undefined') {
      if (id) {
        localStorage.setItem('xiom_active_project_id', id);
      } else {
        localStorage.removeItem('xiom_active_project_id');
      }
    }
    set({ activeProjectId: id });
  },
  keys: null,
  setKeys: (keys) => set({ keys }),
  mcpServers: [],
  setMcpServers: (mcpServers) => set({ mcpServers }),
  lastBuildError: null,
  setLastBuildError: (lastBuildError) => set({ lastBuildError }),
  lastPreviewScreenshot: null,
  setLastPreviewScreenshot: (lastPreviewScreenshot) => set({ lastPreviewScreenshot }),
  editorNavigationTarget: null,
  setEditorNavigationTarget: (editorNavigationTarget) => set({ editorNavigationTarget }),
  lockVault: () => {
    import('./services/session').then(({ clearPersistentSession }) => {
      clearPersistentSession().catch(err => console.error('Failed to clear persistent session', err));
    }).catch(err => console.error('Failed to import session service', err));
    set({ keys: null, chatHistory: [] });
  },
});

const createPatchSlice: StateCreator<AppState, [], [], PatchSlice> = (set) => ({
  pendingPatches: [],
  setPendingPatches: (pendingPatches) => set({ pendingPatches }),
  addPendingPatch: (patch) => set((state) => {
    const existing = state.pendingPatches.findIndex(p => p.path === patch.path);
    if (existing >= 0) {
      const newPatches = [...state.pendingPatches];
      newPatches[existing] = patch;
      return { pendingPatches: newPatches, isPatchReviewOpen: true };
    }
    return { pendingPatches: [...state.pendingPatches, patch], isPatchReviewOpen: true };
  }),
  clearPendingPatches: () => set({ pendingPatches: [], isPatchReviewOpen: false }),
  isPatchReviewOpen: false,
  setIsPatchReviewOpen: (open) => set({ isPatchReviewOpen: open }),
  flashingPaths: [],
  flashPatchedPaths: (paths) => {
    set({ flashingPaths: paths });
    setTimeout(() => {
      set((state) => ({
        flashingPaths: state.flashingPaths.filter(p => !paths.includes(p))
      }));
    }, 450);
  },
});

const getInitialTemperature = (): number | undefined => {
  if (typeof localStorage === 'undefined') return undefined;
  const val = localStorage.getItem('xiom_temperature');
  if (val === null || val === '') return undefined;
  const num = Number(val);
  return Number.isFinite(num) ? num : undefined;
};

const getInitialMaxOutputTokens = (): number | undefined => {
  if (typeof localStorage === 'undefined') return undefined;
  const val = localStorage.getItem('xiom_max_output_tokens');
  if (val === null || val === '') return undefined;
  const num = Number(val);
  return Number.isFinite(num) ? num : undefined;
};

const getInitialMaxAgentSteps = (): number => {
  if (typeof localStorage === 'undefined') return 25;
  const val = localStorage.getItem('xiom_max_agent_steps');
  if (val === null || val === '') return 25;
  const num = Number(val);
  return Number.isFinite(num) && num > 0 ? num : 25;
};

const getInitialManifestExcludePatterns = (): string[] => {
  if (typeof localStorage === 'undefined') return DEFAULT_MANIFEST_EXCLUDE_PATTERNS;
  const val = localStorage.getItem('xiom_manifest_exclude_patterns');
  if (!val) return DEFAULT_MANIFEST_EXCLUDE_PATTERNS;
  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // fallback to defaults
  }
  return DEFAULT_MANIFEST_EXCLUDE_PATTERNS;
};

const createChatSlice: StateCreator<AppState, [], [], ChatSlice> = (set) => ({
  chatHistory: [],
  setChatHistory: (chatHistory) => set({ chatHistory }),
  tokenUsage: { system: 0, codebase: 0, chat: 0, max: 32000, isEstimate: true },
  setTokenUsage: (tokenUsage) => set({ tokenUsage }),
  queuedPrompt: null,
  setQueuedPrompt: (queuedPrompt) => set({ queuedPrompt }),
  customInstructions: typeof localStorage !== 'undefined' ? (localStorage.getItem('xiom_custom_instructions') || '') : '',
  setCustomInstructions: (customInstructions) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('xiom_custom_instructions', customInstructions);
    }
    set({ customInstructions });
  },
  temperature: getInitialTemperature(),
  setTemperature: (temperature) => {
    if (typeof localStorage !== 'undefined') {
      if (temperature !== undefined) {
        localStorage.setItem('xiom_temperature', String(temperature));
      } else {
        localStorage.removeItem('xiom_temperature');
      }
    }
    set({ temperature });
  },
  maxOutputTokens: getInitialMaxOutputTokens(),
  setMaxOutputTokens: (maxOutputTokens) => {
    if (typeof localStorage !== 'undefined') {
      if (maxOutputTokens !== undefined) {
        localStorage.setItem('xiom_max_output_tokens', String(maxOutputTokens));
      } else {
        localStorage.removeItem('xiom_max_output_tokens');
      }
    }
    set({ maxOutputTokens });
  },
  maxAgentSteps: getInitialMaxAgentSteps(),
  setMaxAgentSteps: (maxAgentSteps) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('xiom_max_agent_steps', String(maxAgentSteps));
    }
    set({ maxAgentSteps });
  },
  manifestExcludePatterns: getInitialManifestExcludePatterns(),
  setManifestExcludePatterns: (manifestExcludePatterns) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('xiom_manifest_exclude_patterns', JSON.stringify(manifestExcludePatterns));
    }
    set({ manifestExcludePatterns });
  },
  attachPreviewVision: typeof localStorage !== 'undefined' ? localStorage.getItem('xiom_attach_preview_vision') === 'true' : false,
  setAttachPreviewVision: (attachPreviewVision) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('xiom_attach_preview_vision', String(attachPreviewVision));
    }
    set({ attachPreviewVision });
  },
  autoVisionOnPatch: typeof localStorage !== 'undefined' ? localStorage.getItem('xiom_auto_vision_on_patch') !== 'false' : true,
  setAutoVisionOnPatch: (autoVisionOnPatch) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('xiom_auto_vision_on_patch', String(autoVisionOnPatch));
    }
    set({ autoVisionOnPatch });
  },
  ensembleModeEnabled: typeof localStorage !== 'undefined' ? localStorage.getItem('xiom_ensemble_mode') === 'true' : false,
  setEnsembleModeEnabled: (ensembleModeEnabled) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('xiom_ensemble_mode', String(ensembleModeEnabled));
    }
    set({ ensembleModeEnabled });
  },
  ensembleCandidateBProfileId: typeof localStorage !== 'undefined' ? localStorage.getItem('xiom_ensemble_candidate_b_id') : null,
  setEnsembleCandidateBProfileId: (ensembleCandidateBProfileId) => {
    if (typeof localStorage !== 'undefined') {
      if (ensembleCandidateBProfileId) {
        localStorage.setItem('xiom_ensemble_candidate_b_id', ensembleCandidateBProfileId);
      } else {
        localStorage.removeItem('xiom_ensemble_candidate_b_id');
      }
    }
    set({ ensembleCandidateBProfileId });
  },
});

const createPWASlice: StateCreator<AppState, [], [], PWASlice> = (set, get) => ({
  deferredInstallPrompt: null,
  setDeferredInstallPrompt: (deferredInstallPrompt) => set({ deferredInstallPrompt }),
  showInstallPrompt: false,
  setShowInstallPrompt: (showInstallPrompt) => set({ showInstallPrompt }),
  triggerInstallEngagement: () => {
    const isDismissed = typeof localStorage !== 'undefined' && localStorage.getItem('xiom_pwa_install_dismissed') === 'true';
    const isInstalled = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;
    const { deferredInstallPrompt } = get();

    if (!isDismissed && !isInstalled && deferredInstallPrompt) {
      set({ showInstallPrompt: true });
    }
  },
});

const createThemeSlice: StateCreator<AppState, [], [], ThemeSlice> = (set, get) => ({
  theme: initialTheme,
  setTheme: (theme: ThemeMode) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
    applyThemeToDocument(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const nextTheme: ThemeMode = get().theme === 'oled' ? 'paper' : 'oled';
    get().setTheme(nextTheme);
  },
});

const createToastSlice: StateCreator<AppState, [], [], ToastSlice> = (set) => ({
  toasts: [],
  addToast: (message, type = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }]
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id)
      }));
    }, 4000);
  },
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id)
  }))
});

export const useAppStore = create<AppState>()((...a) => ({
  ...createWorkspaceSlice(...a),
  ...createPatchSlice(...a),
  ...createChatSlice(...a),
  ...createPWASlice(...a),
  ...createThemeSlice(...a),
  ...createToastSlice(...a),
}));
