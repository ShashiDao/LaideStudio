import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Plus, Save, Trash2, ShieldCheck, ShieldAlert, Activity, CheckCircle2, 
  ChevronDown, ChevronLeft, ChevronRight, Check, X, Sparkles, RefreshCw, MessageSquareCode, RotateCcw,
  Download, Upload, HardDrive, FileJson, AlertTriangle, Layers, Lock, Moon, Sun, Palette, Keyboard,
  Database, Cpu, ExternalLink, GitMerge, ToggleLeft, ToggleRight,
  Rocket, Sliders, Coins, Key, Tag, Globe, Eye, EyeOff, Edit3, Bot
} from 'lucide-react';
import { db, type ConnectionProfile } from '../../db';
import { useAppStore } from '../../store';
import { 
  computeSessionUsageSummary, 
  formatUsdCost, 
  formatTokenCount 
} from '../../services/usage/tokenSpend';
import { 
  DEFAULT_CONTRAST, 
  MIN_CONTRAST, 
  MAX_CONTRAST, 
  getContrastLabel, 
  computeThemeVariables 
} from '../../services/theme/contrast';
import { AnthropicProvider } from '../../services/llm/providers/anthropic';
import { OpenAIProvider } from '../../services/llm/providers/openai';
import { GoogleProvider } from '../../services/llm/providers/google';
import { OpenAICompatibleProvider } from '../../services/llm/providers/openaiCompatible';
import type { LLMAdapter } from '../../services/llm/llmAdapter';
import { LaideLogo } from './LaideLogo';
import { 
  fetchAvailableModels, 
  type DiscoveredModel,
  getModelContextWindow,
  formatContextWindow
} from '../../services/llm/modelDiscovery';
import { ModelPickerModal } from '../modals/ModelPickerModal';
import { 
  createEncryptedBackup, 
  downloadBackupFile, 
  validateBackupFile, 
  restoreBackup, 
  type BackupValidationResult 
} from '../../services/security/backup';

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'google', label: 'Google Gemini' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'openai-compatible', label: 'OpenAI Compatible (Local/Custom)' },
] as const;

const API_KEY_HINTS: Record<string, string> = {
  'anthropic': 'sk-ant-...',
  'openai': 'sk-...',
  'google': 'AIza...',
  'openrouter': 'sk-or-v1-...',
  'openai-compatible': 'sk-...',
};

const DEFAULT_MODELS: Record<string, string> = {
  'anthropic': 'claude-3-7-sonnet-20250219',
  'openai': 'gpt-4o',
  'google': 'gemini-1.5-pro',
  'openrouter': 'anthropic/claude-3.5-sonnet',
  'openai-compatible': ''
};

export type SettingsCategoryId = 'appearance' | 'ai-providers' | 'integrations' | 'security-vault' | 'advanced';

export interface SettingsCategoryDef {
  id: SettingsCategoryId;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

export const SETTINGS_CATEGORIES: SettingsCategoryDef[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    shortLabel: 'Appearance',
    description: 'Themes & Contrast',
    icon: Palette
  },
  {
    id: 'ai-providers',
    label: 'AI & Providers',
    shortLabel: 'AI & Providers',
    description: 'LLM Profiles & Ensembles',
    icon: Bot
  },
  {
    id: 'integrations',
    label: 'Integrations',
    shortLabel: 'Integrations',
    description: 'GitHub, Deploys & MCP',
    icon: Globe
  },
  {
    id: 'security-vault',
    label: 'Security & Vault',
    shortLabel: 'Security',
    description: 'Vault Lock & Backups',
    icon: ShieldCheck
  },
  {
    id: 'advanced',
    label: 'Advanced',
    shortLabel: 'Advanced',
    description: 'Diagnostics, Cache & Keys',
    icon: Activity
  }
];

export function SettingsPanel({ onOpenShortcuts }: { onOpenShortcuts?: () => void }) {
  const { 
    keys, 
    setKeys,
    setChatHistory,
    lockVault,
    pendingPatches,
    activeProfileId, 
    setActiveProfileId,
    customInstructions,
    setCustomInstructions,
    tokenUsage,
    setTokenUsage,
    theme,
    setTheme,
    themeContrast,
    setThemeContrast,
    ensembleModeEnabled,
    setEnsembleModeEnabled,
    ensembleCandidateBProfileId,
    setEnsembleCandidateBProfileId,
    sessionUsageRecords,
    clearSessionUsage
  } = useAppStore();

  // Navigation state: category selection & responsive layout
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>('appearance');
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(() => 
    typeof window !== 'undefined' ? window.innerWidth : 800
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const updateWidth = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) {
        setContainerWidth(rect.width);
      }
    };
    updateWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0) {
            setContainerWidth(entry.contentRect.width);
          }
        }
      });
      observer.observe(el);
      return () => observer.disconnect();
    } else {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }
  }, []);

  const isWide = (containerWidth > 0 ? containerWidth : (typeof window !== 'undefined' ? window.innerWidth : 800)) >= 700;

  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [showLockConfirmModal, setShowLockConfirmModal] = useState(false);
  const [confirmClearUsage, setConfirmClearUsage] = useState(false);

  const sessionSummary = useMemo(() => {
    return computeSessionUsageSummary(sessionUsageRecords || []);
  }, [sessionUsageRecords]);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [provider, setProvider] = useState('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');

  const selectProvider = (newProvider: string) => {
    setProvider(newProvider);
    setModel(DEFAULT_MODELS[newProvider] || '');
    if (newProvider === 'openrouter') {
      setBaseUrl('https://openrouter.ai/api/v1');
    } else if (newProvider !== 'openai-compatible') {
      setBaseUrl('');
    }
  };
  
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [isShortcutsDropdownOpen, setIsShortcutsDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const [testStatus, setTestStatus] = useState<{ id: string, loading: boolean, success?: boolean, error?: string } | null>(null);

  const [githubPatInput, setGithubPatInput] = useState('');
  const [githubPatSaved, setGithubPatSaved] = useState(false);

  const [netlifyTokenInput, setNetlifyTokenInput] = useState('');
  const [netlifyTokenSaved, setNetlifyTokenSaved] = useState(false);

  const [vercelTokenInput, setVercelTokenInput] = useState('');
  const [vercelTokenSaved, setVercelTokenSaved] = useState(false);

  const [mcpServerUrlInput, setMcpServerUrlInput] = useState('');
  const [mcpServersSaved, setMcpServersSaved] = useState(false);

  const {
    mcpServers,
    setMcpServers
  } = useAppStore();

  const handleAddMcpServer = async (e: React.FormEvent) => {
    e.preventDefault();
    const { encryptData } = await import('../../services/security/crypto');
    if (!keys || !mcpServerUrlInput.trim()) return;
    try {
      const newServers = [...mcpServers, { id: crypto.randomUUID(), url: mcpServerUrlInput.trim() }];
      setMcpServers(newServers);
      setMcpServerUrlInput('');
      const enc = await encryptData(keys.aesKey, JSON.stringify(newServers));
      localStorage.setItem('xiom_mcp_servers', enc);
      setMcpServersSaved(true);
      setTimeout(() => setMcpServersSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save MCP server', err);
    }
  };

  const handleRemoveMcpServer = async (id: string) => {
    if (!keys) return;
    try {
      const newServers = mcpServers.filter(s => s.id !== id);
      setMcpServers(newServers);
      if (newServers.length === 0) {
        localStorage.removeItem('xiom_mcp_servers');
      } else {
        const { encryptData } = await import('../../services/security/crypto');
        const enc = await encryptData(keys.aesKey, JSON.stringify(newServers));
        localStorage.setItem('xiom_mcp_servers', enc);
      }
    } catch (err) {
      console.error('Failed to remove MCP server', err);
    }
  };

  const [instructionsDraft, setInstructionsDraft] = useState(customInstructions);
  const [instructionsSaved, setInstructionsSaved] = useState(false);

  const [cachedDepCount, setCachedDepCount] = useState<number | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheClearedMsg, setCacheClearedMsg] = useState(false);

  const [exportingBackup, setExportingBackup] = useState(false);
  const [backupExportSuccess, setBackupExportSuccess] = useState(false);
  const [importValidation, setImportValidation] = useState<BackupValidationResult | null>(null);
  const [importingBackup, setImportingBackup] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const [dbStats, setDbStats] = useState<{ projectCount: number; fileCount: number } | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  const loadProfiles = async () => {
    const all = await db.connectionProfiles.toArray();
    setProfiles(all);
  };

  const loadCacheInfo = async () => {
    try {
      const { getDependencyCacheInfo } = await import('../../services/bundler/bundler');
      const info = await getDependencyCacheInfo();
      setCachedDepCount(info.count);
    } catch {
      setCachedDepCount(0);
    }
  };

  useEffect(() => {
    let active = true;
    async function loadStats() {
      try {
        const pCount = await db.projects.count();
        const fCount = await db.files.count();
        if (active) {
          setDbStats({ projectCount: pCount, fileCount: fCount });
        }
      } catch {
        if (active) setDbStats(null);
      }
    }
    loadStats();
    return () => {
      active = false;
    };
  }, [profiles]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        setInstructionsDraft(customInstructions);
      }
    });
    return () => {
      active = false;
    };
  }, [customInstructions]);

  useEffect(() => {
    let active = true;
    async function initProfiles() {
      const all = await db.connectionProfiles.toArray();
      if (active) {
        setProfiles(all);
      }
    }
    initProfiles();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function initCache() {
      try {
        const { getDependencyCacheInfo } = await import('../../services/bundler/bundler');
        const info = await getDependencyCacheInfo();
        if (active) setCachedDepCount(info.count);
      } catch {
        if (active) setCachedDepCount(0);
      }
    }
    initCache();
    return () => {
      active = false;
    };
  }, []);

  // Close model dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-discover models when API key and provider are available
  const handleRefreshModels = async () => {
    if (!apiKey && provider !== 'openai-compatible' && provider !== 'openrouter') {
      return;
    }
    setLoadingModels(true);
    try {
      const models = await fetchAvailableModels(provider, apiKey, baseUrl);
      setDiscoveredModels(models);
    } catch {
      setDiscoveredModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    let active = true;
    const fetchModels = async () => {
      if (!apiKey && provider !== 'openai-compatible' && provider !== 'openrouter') {
        setDiscoveredModels([]);
        return;
      }
      setLoadingModels(true);
      try {
        const models = await fetchAvailableModels(provider, apiKey, baseUrl);
        if (active) {
          setDiscoveredModels(models);
        }
      } catch {
        if (active) setDiscoveredModels([]);
      } finally {
        if (active) setLoadingModels(false);
      }
    };

    const timer = setTimeout(fetchModels, 500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [provider, apiKey, baseUrl]);

  // Load GitHub PAT & Deploy Tokens
  useEffect(() => {
    let active = true;
    async function loadTokens() {
      const { decryptData } = await import('../../services/security/crypto');
      if (!keys) return;
      
      const enc = localStorage.getItem('xiom_github_pat');
      if (enc) {
        try {
          const dec = await decryptData(keys.aesKey, enc);
          if (active) setGithubPatInput(dec);
        } catch (_e) {
          console.warn('Could not decrypt GitHub PAT');
        }
      }

      const netlifyEnc = localStorage.getItem('xiom_netlify_token');
      if (netlifyEnc) {
        try {
          const dec = await decryptData(keys.aesKey, netlifyEnc);
          if (active) setNetlifyTokenInput(dec);
        } catch (_e) {
          console.warn('Could not decrypt Netlify token');
        }
      }

      const vercelEnc = localStorage.getItem('xiom_vercel_token');
      if (vercelEnc) {
        try {
          const dec = await decryptData(keys.aesKey, vercelEnc);
          if (active) setVercelTokenInput(dec);
        } catch (_e) {
          console.warn('Could not decrypt Vercel token');
        }
      }
    }
    loadTokens();
    return () => {
      active = false;
    };
  }, [keys]);

  const handleClearDepCache = async () => {
    try {
      setClearingCache(true);
      const { clearDependencyCache } = await import('../../services/bundler/bundler');
      await clearDependencyCache();
      await loadCacheInfo();
      setCacheClearedMsg(true);
      setTimeout(() => setCacheClearedMsg(false), 2500);
    } catch (e) {
      console.warn('Failed clearing dependency cache:', e);
    } finally {
      setClearingCache(false);
    }
  };

  const handleSetDefault = (id: string) => {
    setActiveProfileId(id);
    const p = profiles.find(x => x.id === id);
    if (p) {
      const targetMax = getModelContextWindow(p.provider, p.model);
      setTokenUsage({ ...tokenUsage, max: targetMax });
    }
  };

  const handleEdit = async (p: ConnectionProfile) => {
    setEditingId(p.id);
    setLabel(p.label);
    setProvider(p.provider);
    setBaseUrl(p.baseUrl);
    setModel(p.model);
    setApiKey(''); // Don't show by default, user must enter new one if they want to change it
    
    // Attempt to decrypt to show it, or keep it empty
    if (keys) {
      try {
        const { decryptData } = await import('../../services/security/crypto');
        const decrypted = await decryptData(keys.aesKey, p.encryptedApiKey);
        setApiKey(decrypted);
      } catch (_e) {
        console.warn('Could not decrypt API key for display');
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keys) return;

    let finalEncryptedKey = '';
    if (editingId && !apiKey) {
      // User didn't change the API key
      const existing = profiles.find(p => p.id === editingId);
      if (existing) finalEncryptedKey = existing.encryptedApiKey;
    } else {
      // Encrypt new API key
      const { encryptData } = await import('../../services/security/crypto');
      finalEncryptedKey = await encryptData(keys.aesKey, apiKey);
    }

    const id = editingId || crypto.randomUUID();
    
    const newProfile: ConnectionProfile = {
      id,
      label: label || `${provider} default`,
      provider,
      encryptedApiKey: finalEncryptedKey,
      baseUrl: (provider === 'openai-compatible' || provider === 'openrouter') ? baseUrl : '',
      model: model || DEFAULT_MODELS[provider] || ''
    };

    await db.connectionProfiles.put(newProfile);
    
    if (!activeProfileId || activeProfileId === id) {
      handleSetDefault(id);
    }
    
    resetForm();
    loadProfiles();
  };

  const handleDelete = async (id: string) => {
    await db.connectionProfiles.delete(id);
    if (activeProfileId === id) {
      localStorage.removeItem('xiom_active_profile_id');
      setActiveProfileId('');
    }
    loadProfiles();
  };

  const resetForm = () => {
    setEditingId(null);
    setLabel('');
    setProvider('anthropic');
    setApiKey('');
    setBaseUrl('');
    setModel(DEFAULT_MODELS['anthropic']);
  };

  const handleTest = async (p: ConnectionProfile) => {
    if (!keys) return;
    setTestStatus({ id: p.id, loading: true });
    
    try {
      // Decrypt API key
      const { decryptData } = await import('../../services/security/crypto');
      const rawKey = await decryptData(keys.aesKey, p.encryptedApiKey);

      if (!rawKey) throw new Error('API key could not be decrypted');

      let adapter: LLMAdapter;
      switch (p.provider) {
        case 'anthropic':
          adapter = new AnthropicProvider(rawKey, p.model);
          break;
        case 'openai':
          adapter = new OpenAIProvider(rawKey, p.model);
          break;
        case 'google':
          adapter = new GoogleProvider(rawKey, p.model);
          break;
        case 'openrouter':
        case 'openai-compatible':
          adapter = new OpenAICompatibleProvider(p.baseUrl, rawKey, p.model);
          break;
        default:
          throw new Error('Unknown provider');
      }

      // Minimal test request
      await adapter.send({
        messages: [{ role: 'user', content: 'Hello.' }],
        maxTokens: 5
      });

      setTestStatus({ id: p.id, loading: false, success: true });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setTestStatus({ id: p.id, loading: false, success: false, error: errorMsg });
    }
  };

  const handleExportBackup = async () => {
    try {
      setExportingBackup(true);
      const backup = await createEncryptedBackup();
      downloadBackupFile(backup);
      setBackupExportSuccess(true);
      setTimeout(() => setBackupExportSuccess(false), 2500);
    } catch (err: unknown) {
      console.error('Export backup failed', err);
    } finally {
      setExportingBackup(false);
    }
  };

  const handleBackupFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    setImportSuccessMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      const validation = validateBackupFile(content);
      if (!validation.valid) {
        setImportError(validation.error || 'Invalid backup file');
      } else {
        setImportValidation(validation);
      }
      if (backupFileInputRef.current) backupFileInputRef.current.value = '';
    };
    reader.onerror = () => {
      setImportError('Failed to read selected file');
      if (backupFileInputRef.current) backupFileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleConfirmRestore = async () => {
    if (!importValidation?.backup) return;
    try {
      setImportingBackup(true);
      setImportError(null);
      const result = await restoreBackup(importValidation.backup);
      await loadProfiles();
      setImportValidation(null);
      setImportSuccessMsg(`Successfully restored ${result.projectsCount} project(s), ${result.filesCount} file(s), and ${result.profilesCount} profile(s).`);
      setTimeout(() => setImportSuccessMsg(null), 4000);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setImportError(`Restore failed: ${errorMsg}`);
    } finally {
      setImportingBackup(false);
    }
  };

  const performLock = () => {
    if (lockVault) {
      lockVault();
    } else {
      setKeys(null);
      setChatHistory([]);
    }
  };

  const handleLockClick = () => {
    if (pendingPatches.length > 0) {
      setShowLockConfirmModal(true);
    } else {
      performLock();
    }
  };

  const handleSelectCategory = (catId: SettingsCategoryId) => {
    setActiveCategory(catId);
    setMobileView('detail');
  };

  // Category content renderer
  const renderCategoryContent = (catId: SettingsCategoryId) => {
    switch (catId) {
      case 'appearance':
        return (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Workspace Appearance & Theme Settings (Single Unified Panel) */}
            <div className="rounded-xl border border-border bg-surface/30 p-4 space-y-4">
              {/* Panel Header */}
              <div className="flex items-center justify-between pb-3 border-b border-border/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center text-accent">
                    <Palette size={15} />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-text tracking-tight">Workspace Appearance</h3>
                    <p className="text-[11px] text-muted">Theme styling and display contrast calibration</p>
                  </div>
                </div>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-surface-elevated border border-border text-muted font-medium">
                  Active: <span className="text-accent font-bold">{theme === 'oled' ? 'OLED' : 'Paper'}</span>
                </span>
              </div>

              {/* Theme Cards Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* OLED Theme Option */}
                <button
                  type="button"
                  onClick={() => setTheme('oled')}
                  aria-pressed={theme === 'oled'}
                  className={`flex flex-col p-3.5 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                    theme === 'oled'
                      ? 'border-accent bg-[#0D0D10] text-[#F2F0EA] shadow-md ring-1 ring-accent/40'
                      : 'border-border bg-surface/70 text-text hover:border-accent/60 hover:bg-surface-elevated/80'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1.5">
                    <div className={`flex items-center gap-1.5 font-mono text-xs font-bold ${
                      theme === 'oled' ? 'text-[#F2F0EA]' : 'text-text'
                    }`}>
                      <Moon size={13} className="text-accent" />
                      <span>OLED / Vault</span>
                    </div>
                    {theme === 'oled' && (
                      <div className="w-4 h-4 rounded-full bg-accent text-accent-text-on flex items-center justify-center">
                        <Check size={10} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <p className={`text-[11px] leading-relaxed mb-2.5 font-sans ${
                    theme === 'oled' ? 'text-[#A0A0A8]' : 'text-muted'
                  }`}>
                    True black instrument panel styling with high-contrast amber accents.
                  </p>
                  <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-border/60">
                    <div className="w-2.5 h-2.5 rounded-xs bg-[#000000] border border-[#232326]" />
                    <div className="w-2.5 h-2.5 rounded-xs bg-[#0D0D10] border border-[#232326]" />
                    <div className="w-2.5 h-2.5 rounded-xs bg-[#E8A33D]" />
                    <div className="w-2.5 h-2.5 rounded-xs bg-[#F2F0EA]" />
                    <span className="font-mono text-[9px] text-muted ml-auto font-medium">TRUE BLACK</span>
                  </div>
                </button>

                {/* Paper Theme Option */}
                <button
                  type="button"
                  onClick={() => setTheme('paper')}
                  aria-pressed={theme === 'paper'}
                  className={`flex flex-col p-3.5 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                    theme === 'paper'
                      ? 'border-accent bg-[#F7F9FB] text-[#1F2E3D] shadow-md ring-1 ring-accent/40'
                      : 'border-border bg-surface/70 text-text hover:border-accent/60 hover:bg-surface-elevated/80'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1.5">
                    <div className={`flex items-center gap-1.5 font-mono text-xs font-bold ${
                      theme === 'paper' ? 'text-[#1F2E3D]' : 'text-text'
                    }`}>
                      <Sun size={13} className="text-accent" />
                      <span>Paper / Blueprint</span>
                    </div>
                    {theme === 'paper' && (
                      <div className="w-4 h-4 rounded-full bg-accent text-accent-text-on flex items-center justify-center">
                        <Check size={10} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <p className={`text-[11px] leading-relaxed mb-2.5 font-sans ${
                    theme === 'paper' ? 'text-[#3E4E5C]' : 'text-muted'
                  }`}>
                    Drafting-table blueprint styling with pale texture and clean ink lines.
                  </p>
                  <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-border/60">
                    <div className="w-2.5 h-2.5 rounded-xs bg-[#EDF1F5] border border-[#B7C4CE]" />
                    <div className="w-2.5 h-2.5 rounded-xs bg-[#F7F9FB] border border-[#B7C4CE]" />
                    <div className="w-2.5 h-2.5 rounded-xs bg-[#E8A33D]" />
                    <div className="w-2.5 h-2.5 rounded-xs bg-[#1F2E3D]" />
                    <span className="font-mono text-[9px] text-muted ml-auto font-medium">BLUEPRINT</span>
                  </div>
                </button>
              </div>

              {/* Contrast Fine-Tuning Section */}
              <div className="pt-3 border-t border-border/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders size={13} className="text-accent" />
                    <span className="text-xs font-medium text-text">Display Contrast</span>
                    <span className="text-[11px] text-muted">
                      ({getContrastLabel(themeContrast ?? DEFAULT_CONTRAST).label})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-medium px-2 py-0.5 rounded-md bg-surface-elevated border border-border text-text">
                      {themeContrast ?? DEFAULT_CONTRAST}%
                    </span>
                    {(themeContrast ?? DEFAULT_CONTRAST) !== DEFAULT_CONTRAST && (
                      <button
                        type="button"
                        onClick={() => setThemeContrast(DEFAULT_CONTRAST)}
                        className="p-1 rounded-md text-muted hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                        title="Reset to 100% standard contrast"
                        aria-label="Reset theme contrast"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Range Slider Track */}
                <div className="space-y-1.5">
                  <div className="relative flex items-center">
                    <input
                      type="range"
                      min={MIN_CONTRAST}
                      max={MAX_CONTRAST}
                      step={1}
                      value={themeContrast ?? DEFAULT_CONTRAST}
                      onChange={(e) => setThemeContrast(Number(e.target.value))}
                      aria-label="Theme contrast level"
                      className="w-full h-1.5 bg-border/60 rounded-full appearance-none cursor-pointer accent-accent focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-muted/70 px-0.5">
                    <span>{MIN_CONTRAST}% Soft</span>
                    <span className="text-muted font-medium">100% Standard</span>
                    <span>{MAX_CONTRAST}% High</span>
                  </div>
                </div>

                {/* Segmented Preset Selector & Live Palette Preview */}
                <div className="pt-2 border-t border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Segmented Control */}
                  <div className="inline-flex p-0.5 bg-bg/80 border border-border/70 rounded-lg">
                    {[
                      { label: 'Soft', value: 75 },
                      { label: 'Standard', value: 100 },
                      { label: 'High', value: 125 },
                      { label: 'Ultra', value: 140 },
                    ].map((preset) => {
                      const isActive = (themeContrast ?? DEFAULT_CONTRAST) === preset.value;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setThemeContrast(preset.value)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-sans transition-all cursor-pointer ${
                            isActive
                              ? 'bg-surface-elevated text-text font-medium shadow-xs border border-border/80'
                              : 'text-muted hover:text-text'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Live Dynamic Swatch */}
                  <div className="flex items-center gap-2 mt-2 px-1">
                    <span className="text-[10px] font-mono text-muted">Palette</span>
                    {(() => {
                      const liveVars = computeThemeVariables(theme, themeContrast ?? DEFAULT_CONTRAST);
                      return (
                        <div className="flex items-center gap-1.5 bg-bg/60 p-1 px-1.5 rounded-md border border-border/60">
                          <div 
                            className="w-3 h-3 rounded-xs border border-black/10 transition-colors"
                            style={{ backgroundColor: liveVars['--bg'] }}
                            title={`Background: ${liveVars['--bg']}`}
                          />
                          <div 
                            className="w-3 h-3 rounded-xs border border-black/10 transition-colors"
                            style={{ backgroundColor: liveVars['--surface'] }}
                            title={`Surface: ${liveVars['--surface']}`}
                          />
                          <div 
                            className="w-3 h-3 rounded-xs border border-black/10 transition-colors"
                            style={{ backgroundColor: liveVars['--border'] }}
                            title={`Border: ${liveVars['--border']}`}
                          />
                          <div 
                            className="w-3 h-3 rounded-xs border border-black/10 transition-colors"
                            style={{ backgroundColor: liveVars['--text-primary'] }}
                            title={`Ink: ${liveVars['--text-primary']}`}
                          />
                          <div 
                            className="w-3 h-3 rounded-xs border border-black/10 transition-colors"
                            style={{ backgroundColor: liveVars['--accent'] }}
                            title={`Accent: ${liveVars['--accent']}`}
                          />
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'ai-providers':
        return (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Connection Profiles Section (Unified Professional Layout) */}
            <div className="rounded-xl border border-border bg-surface/30 p-4 sm:p-5 space-y-4">
              {/* Section Header */}
              <div className="flex items-center justify-between pb-3 border-b border-border/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center text-accent">
                    <Bot size={15} />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-text tracking-tight">Connection Profiles</h3>
                    <p className="text-[11px] text-muted">AI provider credentials for chat, coding loops, and automated patch reviews</p>
                  </div>
                </div>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-surface-elevated border border-border text-muted font-medium">
                  {profiles.length === 0 ? '0 Configured' : `${profiles.length} ${profiles.length === 1 ? 'Profile' : 'Profiles'}`}
                </span>
              </div>

              {/* Existing Profiles List or Compact Empty State */}
              {profiles.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/80 bg-surface/40 p-4 sm:p-5 text-center flex flex-col items-center">
                  <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center text-accent mb-2.5">
                    <Sparkles size={16} />
                  </div>
                  <h4 className="text-xs font-semibold text-text mb-1">No Connection Profiles Configured</h4>
                  <p className="text-[11px] text-muted max-w-sm leading-relaxed mb-3.5">
                    Connect an AI model to power chat, code generation, and patch review. Choose a provider below, enter your API key, and tap Add Profile.
                  </p>
                  {/* Quick Provider Selection Chips */}
                  <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2.5 border-t border-border/40 w-full max-w-md">
                    <span className="text-[10px] font-mono text-muted mr-1">Quick Select:</span>
                    {PROVIDERS.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectProvider(p.id)}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer border ${
                          provider === p.id 
                            ? 'bg-accent/15 border-accent text-accent font-semibold' 
                            : 'bg-surface-elevated/80 border-border text-muted hover:text-text hover:border-accent/40'
                        }`}
                      >
                        {p.label.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {profiles.map(p => {
                    const isActive = activeProfileId === p.id;
                    const ctx = getModelContextWindow(p.provider, p.model);
                    return (
                      <div 
                        key={p.id} 
                        className={`border rounded-lg p-3.5 transition-all flex flex-col gap-2.5 ${
                          isActive 
                            ? 'border-accent bg-accent/5 ring-1 ring-accent/30 shadow-xs' 
                            : 'border-border/80 bg-surface/40 hover:border-border'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-md bg-surface-elevated border border-border flex items-center justify-center text-accent text-xs font-bold font-mono">
                              {p.provider.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-semibold text-xs text-text">{p.label}</span>
                            {isActive && (
                              <span className="text-[10px] font-mono bg-moss/15 text-moss border border-moss/30 px-1.5 py-0.5 rounded font-semibold">
                                Default
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {!isActive && (
                              <button 
                                onClick={() => handleSetDefault(p.id)} 
                                className="px-2 py-1 text-[11px] font-medium rounded text-muted hover:text-text hover:bg-surface-elevated transition-colors cursor-pointer"
                              >
                                Set Default
                              </button>
                            )}
                            <button 
                              onClick={() => handleEdit(p)} 
                              className="p-1 rounded text-muted hover:text-accent hover:bg-surface-elevated transition-colors cursor-pointer"
                              title="Edit profile"
                              aria-label={`Edit ${p.label}`}
                            >
                              <Edit3 size={13} />
                            </button>
                            <button 
                              onClick={() => handleDelete(p.id)} 
                              className="p-1 rounded text-muted hover:text-oxide hover:bg-surface-elevated transition-colors cursor-pointer"
                              title="Delete profile"
                              aria-label={`Delete ${p.label}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-muted">
                          <span className="text-text/90 font-medium">{p.model}</span>
                          <span>•</span>
                          <span>{formatContextWindow(ctx)} ctx</span>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-moss">
                            <ShieldCheck size={11} /> Encrypted Key
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs">
                          <button 
                            onClick={() => handleTest(p)}
                            disabled={testStatus?.id === p.id && testStatus.loading}
                            title="Test basic connectivity with provider"
                            className="text-[11px] font-medium flex items-center gap-1.5 bg-surface-elevated hover:bg-surface border border-border text-text px-2.5 py-1 rounded transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {testStatus?.id === p.id && testStatus.loading ? (
                              <RefreshCw size={11} className="animate-spin text-accent" />
                            ) : (
                              <Activity size={11} className="text-accent" />
                            )}
                            <span>{testStatus?.id === p.id && testStatus.loading ? 'Testing...' : 'Test Connection'}</span>
                          </button>
                          
                          {testStatus?.id === p.id && !testStatus.loading && (
                            <div className={`text-[11px] font-medium flex items-center gap-1 ${testStatus.success ? 'text-moss' : 'text-oxide'}`}>
                              {testStatus.success ? (
                                <><CheckCircle2 size={12} /> Connection OK</>
                              ) : (
                                <><ShieldAlert size={12} /> {testStatus.error}</>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add / Edit Profile Form Card */}
              <div className="rounded-lg border border-border/80 bg-surface/50 p-4 space-y-4">
                <div className="flex items-center justify-between pb-2.5 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    {editingId ? <Save size={13} className="text-accent" /> : <Plus size={13} className="text-accent" />}
                    <h4 className="text-xs font-semibold text-text tracking-tight">
                      {editingId ? 'Edit Profile' : 'Add New Profile'}
                    </h4>
                  </div>
                  {editingId && (
                    <button 
                      type="button"
                      onClick={resetForm} 
                      className="text-[11px] text-muted hover:text-text px-2 py-0.5 rounded hover:bg-surface-elevated transition-colors cursor-pointer"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>
                
                <form onSubmit={handleSave} className="space-y-2.5">
                  {/* Quick Provider Picker Chips */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-medium text-muted">Provider</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {PROVIDERS.map((opt, idx) => {
                        const isSelected = provider === opt.id;
                        const isLastOdd = idx === PROVIDERS.length - 1 && PROVIDERS.length % 2 !== 0;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => selectProvider(opt.id)}
                            className={`px-2.5 py-2 rounded-lg border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                              isLastOdd ? 'col-span-2 sm:col-span-1' : 'col-span-1'
                            } ${
                              isSelected
                                ? 'border-accent bg-accent/15 text-accent font-semibold shadow-xs ring-1 ring-accent/30'
                                : 'border-border/70 bg-bg/50 text-muted hover:border-accent/40 hover:text-text'
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="text-xs truncate">{opt.label.split(' ')[0]}</span>
                              {isSelected && <Check size={11} className="text-accent stroke-[3] shrink-0" />}
                            </div>
                            <span className="text-[10px] text-muted font-normal truncate">
                              {opt.id === 'anthropic' && 'Claude 3.7'}
                              {opt.id === 'openai' && 'GPT-4o'}
                              {opt.id === 'google' && 'Gemini 1.5/2.0'}
                              {opt.id === 'openrouter' && '400+ Models'}
                              {opt.id === 'openai-compatible' && 'Ollama / Local'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Profile Label & Model Name */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-muted">Profile Label</label>
                      <div className="relative flex items-center">
                        <Tag size={13} className="absolute left-2.5 text-muted pointer-events-none" />
                        <input 
                          type="text"
                          value={label}
                          onChange={e => setLabel(e.target.value)}
                          placeholder="e.g. Work Claude"
                          required
                          className="w-full bg-bg/80 border border-border/80 rounded-lg pl-8 pr-3 py-2 text-text font-sans text-xs focus:border-accent focus:ring-1 focus:ring-accent/30 focus:outline-none transition-colors placeholder-neutral-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 relative" ref={modelDropdownRef}>
                      <div className="flex items-center justify-between">
                        <label className="block text-[11px] font-medium text-muted">Model Name</label>
                        {discoveredModels.length > 0 && (
                          <span className="text-[10px] font-mono text-moss flex items-center gap-1">
                            <Sparkles size={9} /> {discoveredModels.length} models found
                          </span>
                        )}
                      </div>
                      <div className="relative flex items-center">
                        <Cpu size={13} className="absolute left-2.5 text-muted pointer-events-none" />
                        <input 
                          type="text"
                          value={model}
                          onChange={e => setModel(e.target.value)}
                          placeholder={`e.g. ${DEFAULT_MODELS[provider] || 'gpt-4'}`}
                          required
                          className="w-full bg-bg/80 border border-border/80 rounded-lg pl-8 pr-8 py-2 text-text font-sans text-xs focus:border-accent focus:ring-1 focus:ring-accent/30 focus:outline-none transition-colors font-mono placeholder-neutral-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowModelDropdown(true)}
                          disabled={loadingModels || (discoveredModels.length === 0 && !apiKey && provider !== 'openai-compatible' && provider !== 'openrouter')}
                          title="Select from available models"
                          aria-label="Toggle available models list"
                          className="absolute right-2 text-muted hover:text-accent disabled:opacity-30 cursor-pointer p-1 transition-colors"
                        >
                          {loadingModels ? (
                            <RefreshCw size={13} className="animate-spin text-accent" />
                          ) : (
                            <ChevronDown size={13} />
                          )}
                        </button>
                      </div>

                      {/* Searchable Model Picker Bottom Sheet */}
                      <ModelPickerModal
                        isOpen={showModelDropdown}
                        onClose={() => setShowModelDropdown(false)}
                        models={discoveredModels}
                        selectedModel={model}
                        onSelectModel={(modelId) => setModel(modelId)}
                        provider={provider}
                        loading={loadingModels}
                        onRefresh={handleRefreshModels}
                      />
                    </div>
                  </div>
                  
                  {/* Base URL for OpenRouter & OpenAI-compatible */}
                  {(provider === 'openai-compatible' || provider === 'openrouter') && (
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-muted">Base URL</label>
                      <div className="relative flex items-center">
                        <Globe size={13} className="absolute left-2.5 text-muted pointer-events-none" />
                        <input 
                          type="url"
                          value={baseUrl}
                          onChange={e => setBaseUrl(e.target.value)}
                          placeholder="https://openrouter.ai/api/v1"
                          required
                          className="w-full bg-bg/80 border border-border/80 rounded-lg pl-8 pr-3 py-2 text-text font-sans text-xs focus:border-accent focus:ring-1 focus:ring-accent/30 focus:outline-none transition-colors font-mono placeholder-neutral-500"
                        />
                      </div>
                    </div>
                  )}

                  {/* API Key */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-medium text-muted">
                        API Key {editingId && '(Leave blank to keep existing)'}
                      </label>
                      <span className="text-[10px] text-muted flex items-center gap-1">
                        <Lock size={10} className="text-moss" /> Encrypted locally
                      </span>
                    </div>
                    <div className="relative flex items-center">
                      <Key size={13} className="absolute left-2.5 text-muted pointer-events-none" />
                      <input 
                        type={showApiKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        placeholder={API_KEY_HINTS[provider] || 'sk-...'}
                        required={!editingId}
                        className="w-full bg-bg/80 border border-border/80 rounded-lg pl-8 pr-9 py-2 text-text font-sans text-xs focus:border-accent focus:ring-1 focus:ring-accent/30 focus:outline-none transition-colors font-mono placeholder-neutral-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-2.5 text-muted hover:text-text cursor-pointer p-1 transition-colors"
                        title={showApiKey ? "Hide API key" : "Show API key"}
                        aria-label={showApiKey ? "Hide API key" : "Show API key"}
                      >
                        {showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>
                  
                  {/* Submit Button */}
                  <button 
                    type="submit"
                    className="w-full mt-2 py-2.5 bg-accent text-surface font-semibold text-xs rounded-lg flex items-center justify-center gap-2 hover:brightness-105 active:scale-[0.99] transition-all cursor-pointer shadow-xs"
                  >
                    {editingId ? <Save size={14} /> : <Plus size={14} />}
                    <span>{editingId ? 'Save Profile' : 'Add Profile'}</span>
                  </button>
                </form>
              </div>
            </div>

            {/* Dual-LLM Ensemble Mode Configuration Card */}
            <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-accent">
                  <GitMerge size={18} />
                  <h3 className="text-sm font-sans font-bold">Dual-LLM Ensemble Mode</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEnsembleModeEnabled(!ensembleModeEnabled)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-sans font-semibold transition-colors cursor-pointer border ${
                    ensembleModeEnabled
                      ? 'bg-accent text-surface border-accent'
                      : 'bg-bg text-muted border-border hover:text-text'
                  }`}
                >
                  {ensembleModeEnabled ? (
                    <>
                      <ToggleRight size={16} />
                      <span>Enabled (Opt-In)</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft size={16} />
                      <span>Disabled (Off)</span>
                    </>
                  )}
                </button>
              </div>

              <p className="text-xs text-muted font-sans mb-3 leading-relaxed">
                When enabled and multiple profiles are configured, your coding task is dispatched to two models concurrently. Both candidate patches are executed against the sandboxed Vitest runner. Only the patch that passes test verification is presented to you; if both pass, you can compare diffs and pick.
              </p>

              <div className="p-3 bg-oxide/10 border border-oxide/20 rounded text-[11px] text-oxide flex items-start gap-2 mb-3">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  <strong>Token Cost Notice:</strong> Running two LLM providers in parallel roughly doubles token consumption per request. This mode defaults to disabled.
                </span>
              </div>

              {ensembleModeEnabled && (
                <div className="space-y-3 pt-2 border-t border-border">
                  {profiles.length < 2 ? (
                    <div className="p-3 bg-bg border border-border rounded text-xs text-muted">
                      ⚠️ You need at least two connection profiles configured to run Dual-LLM Ensemble mode. Please add a second profile above.
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-sans text-muted mb-1.5">
                        Secondary Candidate Model (Candidate B)
                      </label>
                      <select
                        value={ensembleCandidateBProfileId || ''}
                        onChange={(e) => setEnsembleCandidateBProfileId(e.target.value || null)}
                        className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-xs focus:border-accent focus:outline-none"
                      >
                        <option value="">-- Auto-select first alternate profile --</option>
                        {profiles
                          .filter((p) => p.id !== activeProfileId)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label || p.provider} ({p.model})
                            </option>
                          ))}
                      </select>
                      <p className="text-[10px] text-muted mt-1">
                        Primary model (Candidate A) is your active default profile: <strong>{profiles.find(p => p.id === activeProfileId)?.label || 'Default Profile'}</strong>.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Custom Instructions Panel */}
            <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-accent">
                  <MessageSquareCode size={18} />
                  <h3 className="text-sm font-sans font-bold">Custom Instructions</h3>
                </div>
                {instructionsDraft.trim() !== '' && (
                  <button
                    type="button"
                    onClick={() => {
                      setInstructionsDraft('');
                      setCustomInstructions('');
                    }}
                    className="text-[11px] font-sans text-muted hover:text-oxide flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <RotateCcw size={12} /> Clear
                  </button>
                )}
              </div>
              
              <p className="text-xs text-muted font-sans mb-3">
                Direct the AI assistant on coding preferences, architectural patterns, styling conventions, or response demeanor across all chats.
              </p>

              <form onSubmit={(e) => {
                e.preventDefault();
                setCustomInstructions(instructionsDraft);
                setInstructionsSaved(true);
                setTimeout(() => setInstructionsSaved(false), 2000);
              }} className="space-y-3">
                <div>
                  <textarea
                    rows={4}
                    value={instructionsDraft}
                    onChange={(e) => setInstructionsDraft(e.target.value)}
                    placeholder="e.g. Always use TypeScript strict mode. Prefer Tailwind CSS utility classes. Keep components modular and concise. Avoid unnecessary conversational fluff."
                    className="w-full bg-bg border border-border rounded px-3 py-2.5 text-text font-sans text-xs focus:border-accent focus:outline-none placeholder-neutral-500 leading-relaxed resize-y min-h-[90px]"
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full py-2.5 bg-accent text-surface font-sans font-bold rounded flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors cursor-pointer"
                >
                  {instructionsSaved ? <CheckCircle2 size={16} /> : <Save size={16} />}
                  {instructionsSaved ? 'Instructions Saved' : 'Save Custom Instructions'}
                </button>
              </form>
            </div>
          </div>
        );

      case 'integrations':
        return (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* GitHub Integration Form */}
            <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-sans text-accent">GitHub Integration</h3>
              </div>
              
              <form onSubmit={async (e) => {
                e.preventDefault();
                const { encryptData } = await import('../../services/security/crypto');
                if (!keys) return;
                try {
                  const enc = await encryptData(keys.aesKey, githubPatInput);
                  localStorage.setItem('xiom_github_pat', enc);
                  setGithubPatSaved(true);
                  setTimeout(() => setGithubPatSaved(false), 2000);
                } catch (err) {
                  console.error('Failed to save GitHub PAT', err);
                }
              }} className="space-y-4">
                <div>
                  <label className="block text-xs font-sans text-muted mb-1">
                    Personal Access Token
                  </label>
                  <input 
                    type="password"
                    value={githubPatInput}
                    onChange={e => setGithubPatInput(e.target.value)}
                    placeholder="ghp_..."
                    className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-sm focus:border-accent focus:outline-none placeholder-neutral-500"
                  />
                  <p className="text-[10px] text-muted mt-1">
                    Used for importing and exporting repositories. Stored encrypted.
                  </p>
                </div>
                
                <button 
                  type="submit"
                  className="w-full py-2.5 bg-accent text-surface font-sans font-bold rounded flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors cursor-pointer"
                >
                  {githubPatSaved ? <CheckCircle2 size={16} /> : <Save size={16} />}
                  {githubPatSaved ? 'Saved' : 'Save GitHub Token'}
                </button>
              </form>
            </div>

            {/* 1-Click Deploy & Hosting Tokens (Netlify & Vercel) */}
            <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Rocket size={16} className="text-accent shrink-0" />
                  <h3 className="text-sm font-sans text-accent font-semibold">1-Click Live Deploy Tokens</h3>
                </div>
                <p className="text-xs text-muted font-sans leading-relaxed break-words">
                  Configure tokens for 1-click publishing directly to Netlify or Vercel edge CDN. All tokens are encrypted with your vault master key.
                </p>
              </div>

              {/* Netlify Token */}
              <form onSubmit={async (e) => {
                e.preventDefault();
                const { encryptData } = await import('../../services/security/crypto');
                if (!keys) return;
                try {
                  if (!netlifyTokenInput.trim()) {
                    localStorage.removeItem('xiom_netlify_token');
                  } else {
                    const enc = await encryptData(keys.aesKey, netlifyTokenInput.trim());
                    localStorage.setItem('xiom_netlify_token', enc);
                  }
                  setNetlifyTokenSaved(true);
                  setTimeout(() => setNetlifyTokenSaved(false), 2000);
                } catch (err) {
                  console.error('Failed to save Netlify token', err);
                }
              }} className="space-y-3 pt-3 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-sans text-text font-medium flex items-center gap-1.5">
                    <span>Netlify Personal Access Token</span>
                  </label>
                  <a 
                    href="https://app.netlify.com/user/applications#personal-access-tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-accent hover:underline flex items-center gap-1 font-sans"
                  >
                    <span>Get Netlify Token</span>
                    <ExternalLink size={10} />
                  </a>
                </div>
                <input 
                  type="password"
                  value={netlifyTokenInput}
                  onChange={e => setNetlifyTokenInput(e.target.value)}
                  placeholder="nfp_..."
                  className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-mono text-sm focus:border-accent focus:outline-none placeholder-neutral-500"
                />
                <button 
                  type="submit"
                  className="w-full py-2 bg-surface hover:bg-surface-elevated text-text border border-border font-sans font-bold text-xs rounded flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {netlifyTokenSaved ? <CheckCircle2 size={14} className="text-moss" /> : <Save size={14} />}
                  {netlifyTokenSaved ? 'Netlify Token Saved' : 'Save Netlify Token'}
                </button>
              </form>

              {/* Vercel Token */}
              <form onSubmit={async (e) => {
                e.preventDefault();
                const { encryptData } = await import('../../services/security/crypto');
                if (!keys) return;
                try {
                  if (!vercelTokenInput.trim()) {
                    localStorage.removeItem('xiom_vercel_token');
                  } else {
                    const enc = await encryptData(keys.aesKey, vercelTokenInput.trim());
                    localStorage.setItem('xiom_vercel_token', enc);
                  }
                  setVercelTokenSaved(true);
                  setTimeout(() => setVercelTokenSaved(false), 2000);
                } catch (err) {
                  console.error('Failed to save Vercel token', err);
                }
              }} className="space-y-3 pt-3 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-sans text-text font-medium flex items-center gap-1.5">
                    <span>Vercel API Token</span>
                  </label>
                  <a 
                    href="https://vercel.com/account/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-accent hover:underline flex items-center gap-1 font-sans"
                  >
                    <span>Get Vercel Token</span>
                    <ExternalLink size={10} />
                  </a>
                </div>
                <input 
                  type="password"
                  value={vercelTokenInput}
                  onChange={e => setVercelTokenInput(e.target.value)}
                  placeholder="vck_..."
                  className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-mono text-sm focus:border-accent focus:outline-none placeholder-neutral-500"
                />
                <button 
                  type="submit"
                  className="w-full py-2 bg-surface hover:bg-surface-elevated text-text border border-border font-sans font-bold text-xs rounded flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {vercelTokenSaved ? <CheckCircle2 size={14} className="text-moss" /> : <Save size={14} />}
                  {vercelTokenSaved ? 'Vercel Token Saved' : 'Save Vercel Token'}
                </button>
              </form>
            </div>

            {/* MCP Servers Integration */}
            <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-sans text-accent">Model Context Protocol (MCP) Servers</h3>
              </div>
              
              <p className="text-xs text-muted font-sans mb-4 leading-relaxed">
                Connect streamable HTTP MCP servers (Server-Sent Events) to provide additional tools to the AI agent. Server URLs are stored encrypted in your local vault.
              </p>

              {mcpServers.length > 0 && (
                <div className="flex flex-col gap-2 mb-4">
                  {mcpServers.map(server => (
                    <div key={server.id} className="flex items-center justify-between bg-bg border border-border p-2 rounded">
                      <span className="text-xs font-mono text-text truncate">{server.url}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveMcpServer(server.id)}
                        className="text-oxide hover:bg-oxide/20 p-1.5 rounded transition-colors cursor-pointer"
                        title="Remove Server"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleAddMcpServer} className="space-y-4">
                <div>
                  <label className="block text-xs font-sans text-muted mb-1">
                    Add Server URL (SSE)
                  </label>
                  <input 
                    type="url"
                    value={mcpServerUrlInput}
                    onChange={e => setMcpServerUrlInput(e.target.value)}
                    placeholder="http://localhost:3001/sse"
                    required
                    className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-sm focus:border-accent focus:outline-none placeholder-neutral-500"
                  />
                </div>
                
                <button 
                  type="submit"
                  className="w-full py-2.5 bg-accent text-surface font-sans font-bold rounded flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors cursor-pointer"
                >
                  {mcpServersSaved ? <CheckCircle2 size={16} /> : <Plus size={16} />}
                  {mcpServersSaved ? 'Added' : 'Add Server'}
                </button>
              </form>
            </div>
          </div>
        );

      case 'security-vault':
        return (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Lock Vault Control Card */}
            <div className="rounded-xl border border-border bg-surface/30 p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center text-accent">
                    <Lock size={15} />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-text tracking-tight">Vault Security</h3>
                    <p className="text-[11px] text-muted">Protect active workspace session and cryptographic keys</p>
                  </div>
                </div>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-moss/10 border border-moss/30 text-moss font-medium flex items-center gap-1">
                  <ShieldCheck size={11} /> Unlocked
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-bg/60 border border-border p-3.5 rounded-lg">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-semibold text-text">Lock Local Vault</h4>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Purges active decrypted keys and chat context from memory. Your files remain securely encrypted on disk.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLockClick}
                  className="px-3.5 py-2 bg-oxide/15 hover:bg-oxide/25 text-oxide border border-oxide/30 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  <Lock size={13} />
                  <span>Lock Vault</span>
                </button>
              </div>
            </div>

            {/* Encrypted Vault Backup & Restore */}
            <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded">
              <div className="flex items-center gap-2 text-accent mb-2">
                <HardDrive size={18} />
                <h3 className="text-sm font-sans font-bold">Encrypted Vault Backup</h3>
              </div>

              <p className="text-xs text-muted font-sans mb-4 leading-relaxed">
                Export a complete encrypted JSON backup of all your projects, files, and connection profiles, or restore from a previously downloaded backup file.
              </p>

              {importError && (
                <div className="mb-4 p-3 rounded bg-oxide/10 border border-oxide/30 text-oxide text-xs font-sans flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {importSuccessMsg && (
                <div className="mb-4 p-3 rounded bg-moss/10 border border-moss/30 text-moss text-xs font-sans flex items-center gap-2">
                  <CheckCircle2 size={14} className="shrink-0" />
                  <span>{importSuccessMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  disabled={exportingBackup}
                  className="py-2.5 px-4 bg-surface hover:bg-black/5 border border-white/15 text-text font-sans text-xs rounded font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {backupExportSuccess ? (
                    <CheckCircle2 size={15} className="text-moss" />
                  ) : (
                    <Download size={15} className="text-accent" />
                  )}
                  <span>{backupExportSuccess ? 'Backup Exported!' : exportingBackup ? 'Exporting...' : 'Export Encrypted Backup'}</span>
                </button>

                <input
                  type="file"
                  ref={backupFileInputRef}
                  onChange={handleBackupFileSelect}
                  accept=".json,application/json"
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => backupFileInputRef.current?.click()}
                  className="py-2.5 px-4 bg-surface hover:bg-black/5 border border-white/15 text-text font-sans text-xs rounded font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Upload size={15} className="text-moss" />
                  <span>Import Backup File</span>
                </button>
              </div>
            </div>
          </div>
        );

      case 'advanced':
        return (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* System Diagnostics & AI Context Allocation */}
            <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-accent">
                  <Activity size={18} />
                  <h3 className="text-sm font-sans font-bold">System Diagnostics & Context</h3>
                </div>
                <span className="text-[10px] font-mono text-moss bg-moss/10 border border-moss/30 px-2 py-0.5 rounded flex items-center gap-1">
                  <CheckCircle2 size={11} /> Vault Healthy
                </span>
              </div>

              {/* Database & Storage Engine Diagnostics */}
              <div className="bg-bg/80 border border-border/80 rounded p-3 text-xs font-mono space-y-2">
                <div className="flex items-center justify-between text-muted text-[11px] pb-1 border-b border-border/60">
                  <div className="flex items-center gap-1.5 text-text font-semibold">
                    <Database size={13} className="text-accent" />
                    <span>Encrypted IndexedDB Storage</span>
                  </div>
                  <span className="text-moss font-medium">Ready (AES-GCM)</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                  <div>
                    <span className="text-muted block text-[10px]">Projects:</span>
                    <span className="text-text font-bold">{dbStats?.projectCount ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted block text-[10px]">Files:</span>
                    <span className="text-text font-bold">{dbStats?.fileCount ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted block text-[10px]">Profiles:</span>
                    <span className="text-text font-bold">{profiles.length}</span>
                  </div>
                </div>
              </div>

              {/* AI Context Window Allocation Gauge */}
              <div className="bg-bg/80 border border-border/80 rounded p-3 text-xs font-mono space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-text text-[11px] font-semibold">
                    <Cpu size={13} className="text-accent" />
                    <span>AI Context Window Usage</span>
                  </div>
                  <span className="text-accent text-[11px] font-bold">
                    {formatTokens(tokenUsage.system + tokenUsage.codebase + tokenUsage.chat)} / {formatTokens(tokenUsage.max || 200000)} tokens
                    <span className="text-muted font-normal ml-1">
                      ({Math.round(((tokenUsage.system + tokenUsage.codebase + tokenUsage.chat) / (tokenUsage.max || 200000)) * 100)}%)
                    </span>
                  </span>
                </div>

                {/* Visual token bar */}
                <div className="w-full h-2.5 bg-surface rounded-full overflow-hidden flex border border-border">
                  <div 
                    className="h-full bg-accent/80 transition-all duration-500"
                    style={{ width: `${Math.min(100, (tokenUsage.system / (tokenUsage.max || 200000)) * 100)}%` }}
                    title={`System Prompt: ${tokenUsage.system.toLocaleString()} tokens`}
                  />
                  <div 
                    className="h-full bg-accent/50 transition-all duration-500"
                    style={{ width: `${Math.min(100, (tokenUsage.codebase / (tokenUsage.max || 200000)) * 100)}%` }}
                    title={`File Manifest: ${tokenUsage.codebase.toLocaleString()} tokens`}
                  />
                  <div 
                    className="h-full bg-accent/25 transition-all duration-500"
                    style={{ width: `${Math.min(100, (tokenUsage.chat / (tokenUsage.max || 200000)) * 100)}%` }}
                    title={`Chat Conversation: ${tokenUsage.chat.toLocaleString()} tokens`}
                  />
                </div>

                {/* Legend */}
                <div className="grid grid-cols-3 gap-1.5 text-[10px] text-muted pt-1">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-xs bg-accent/80 shrink-0" />
                    <span className="truncate">System ({formatTokens(tokenUsage.system)})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-xs bg-accent/50 shrink-0" />
                    <span className="truncate">Manifest ({formatTokens(tokenUsage.codebase)})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-xs bg-accent/25 shrink-0" />
                    <span className="truncate">Chat ({formatTokens(tokenUsage.chat)})</span>
                  </div>
                </div>
              </div>

              {/* Session API Cost & Token Tracking */}
              <div className="bg-bg/80 border border-border/80 rounded p-3 text-xs font-mono space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-text text-[11px] font-semibold">
                    <Coins size={13} className="text-accent" />
                    <span>Session API Spend & Token Usage</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-accent text-[11px] font-bold">
                      {formatUsdCost(sessionSummary.totalCostUsd)}
                    </span>
                    {sessionSummary.recordsCount > 0 && (
                      confirmClearUsage ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              clearSessionUsage();
                              setConfirmClearUsage(false);
                            }}
                            className="px-1.5 py-0.5 bg-oxide text-white rounded text-[10px] font-bold cursor-pointer transition-colors"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmClearUsage(false)}
                            className="px-1 py-0.5 bg-surface border border-border text-muted rounded text-[10px] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmClearUsage(true)}
                          className="p-1 text-muted hover:text-oxide rounded transition-colors cursor-pointer"
                          title="Reset session token usage counters"
                          aria-label="Reset session token usage"
                        >
                          <Trash2 size={11} />
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-surface/50 border border-border/60 rounded p-1.5">
                    <div className="text-muted text-[9px]">Total Tokens</div>
                    <div className="text-text font-bold text-[11px] mt-0.5">{formatTokenCount(sessionSummary.totalTokens)}</div>
                  </div>
                  <div className="bg-surface/50 border border-border/60 rounded p-1.5">
                    <div className="text-muted text-[9px]">Prompt / Input</div>
                    <div className="text-text font-bold text-[11px] mt-0.5">{formatTokenCount(sessionSummary.totalInputTokens)}</div>
                  </div>
                  <div className="bg-surface/50 border border-border/60 rounded p-1.5">
                    <div className="text-muted text-[9px]">Output / Gen</div>
                    <div className="text-text font-bold text-[11px] mt-0.5">{formatTokenCount(sessionSummary.totalOutputTokens)}</div>
                  </div>
                </div>

                {sessionSummary.recordsCount > 0 ? (
                  <div className="text-[10px] text-muted flex items-center justify-between pt-0.5">
                    <span>{sessionSummary.recordsCount} LLM call{sessionSummary.recordsCount === 1 ? '' : 's'} recorded</span>
                    <span className="text-accent">Avg {formatUsdCost(sessionSummary.totalCostUsd / sessionSummary.recordsCount)}/call</span>
                  </div>
                ) : (
                  <div className="text-[10px] text-muted italic text-center py-1">
                    No API requests dispatched yet in this session.
                  </div>
                )}
              </div>
            </div>

            {/* Compiler Dependency Cache */}
            <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-accent">
                  <Layers size={18} />
                  <h3 className="text-sm font-sans font-bold">Dependency Cache</h3>
                </div>
                {cachedDepCount !== null && (
                  <span className="text-[11px] font-sans text-muted bg-bg/60 px-2 py-0.5 rounded border border-border">
                    {cachedDepCount} module{cachedDepCount === 1 ? '' : 's'} cached
                  </span>
                )}
              </div>

              <p className="text-xs text-muted font-sans mb-4 leading-relaxed">
                The in-browser bundler caches npm dependencies fetched from esm.sh into browser Cache Storage. This accelerates preview rebuilds and enables full offline preview for previously cached dependencies.
              </p>

              <button
                type="button"
                onClick={handleClearDepCache}
                disabled={clearingCache}
                className="w-full py-2.5 px-4 bg-surface hover:bg-black/5 border border-white/15 text-text font-sans text-xs rounded font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                {cacheClearedMsg ? (
                  <CheckCircle2 size={15} className="text-moss" />
                ) : clearingCache ? (
                  <RefreshCw size={15} className="animate-spin text-accent" />
                ) : (
                  <Trash2 size={15} className="text-oxide" />
                )}
                <span>
                  {cacheClearedMsg 
                    ? 'Dependency Cache Cleared!' 
                    : clearingCache 
                      ? 'Clearing Cache...' 
                      : 'Clear Dependency Cache'}
                </span>
              </button>
            </div>

            {/* Keyboard Shortcuts Reference (Collapsible Dropdown Accordion) */}
            <div className="bg-surface/50 border border-border rounded-xl overflow-hidden transition-all">
              <button
                type="button"
                onClick={() => setIsShortcutsDropdownOpen(!isShortcutsDropdownOpen)}
                aria-expanded={isShortcutsDropdownOpen}
                aria-controls="keyboard-shortcuts-dropdown"
                className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-surface-elevated/40 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center text-accent shrink-0">
                    <Keyboard size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold text-text tracking-tight">Keyboard Shortcuts</h3>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-elevated border border-border text-muted">
                        6 hotkeys
                      </span>
                    </div>
                    <p className="text-[11px] text-muted truncate">
                      {isShortcutsDropdownOpen ? 'Global accelerator hotkeys & keybindings' : 'Click to view accelerator shortcuts'}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {onOpenShortcuts && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenShortcuts();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          onOpenShortcuts();
                        }
                      }}
                      className="hidden xs:flex text-[11px] font-sans text-accent hover:underline items-center gap-1 cursor-pointer p-1"
                      title="Open full shortcuts cheat sheet modal"
                    >
                      <span>View All</span>
                      <ExternalLink size={11} />
                    </span>
                  )}
                  <div className={`p-1 rounded-md text-muted hover:text-text transition-transform duration-200 ${isShortcutsDropdownOpen ? 'rotate-180 text-accent' : ''}`}>
                    <ChevronDown size={16} />
                  </div>
                </div>
              </button>

              {/* Dropdown Content */}
              {isShortcutsDropdownOpen && (
                <div id="keyboard-shortcuts-dropdown" className="px-4 pb-4 sm:px-5 sm:pb-5 pt-0 border-t border-border/40 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-center justify-between pt-3 mb-3 text-xs text-muted font-sans leading-relaxed">
                    <p className="text-[11px]">
                      Speed up your workflow with global accelerator hotkeys. On macOS, use <kbd className="px-1 py-0.2 rounded bg-surface border border-border text-[10px] font-mono text-text">⌘ Command</kbd> instead of <kbd className="px-1 py-0.2 rounded bg-surface border border-border text-[10px] font-mono text-text">Ctrl</kbd>.
                    </p>
                    {onOpenShortcuts && (
                      <button
                        type="button"
                        onClick={onOpenShortcuts}
                        className="xs:hidden text-[11px] font-sans text-accent hover:underline flex items-center gap-1 cursor-pointer shrink-0 ml-2"
                      >
                        <span>View All</span>
                        <ExternalLink size={11} />
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="flex items-center justify-between bg-bg/80 border border-border/80 px-2.5 py-1.5 rounded-lg">
                        <span className="text-muted text-[11px]">Toggle Files tab</span>
                        <kbd className="px-1.5 py-0.5 text-[10px] font-bold bg-surface border border-border text-accent rounded">Ctrl+B</kbd>
                      </div>
                      <div className="flex items-center justify-between bg-bg/80 border border-border/80 px-2.5 py-1.5 rounded-lg">
                        <span className="text-muted text-[11px]">Toggle Terminal</span>
                        <kbd className="px-1.5 py-0.5 text-[10px] font-bold bg-surface border border-border text-accent rounded">Ctrl+`</kbd>
                      </div>
                      <div className="flex items-center justify-between bg-bg/80 border border-border/80 px-2.5 py-1.5 rounded-lg">
                        <span className="text-muted text-[11px]">Quick Open & Search</span>
                        <kbd className="px-1.5 py-0.5 text-[10px] font-bold bg-surface border border-border text-accent rounded">Ctrl+P</kbd>
                      </div>
                      <div className="flex items-center justify-between bg-bg/80 border border-border/80 px-2.5 py-1.5 rounded-lg">
                        <span className="text-muted text-[11px]">Find in File</span>
                        <kbd className="px-1.5 py-0.5 text-[10px] font-bold bg-surface border border-border text-accent rounded">Ctrl+F</kbd>
                      </div>
                      <div className="flex items-center justify-between bg-bg/80 border border-border/80 px-2.5 py-1.5 rounded-lg">
                        <span className="text-muted text-[11px]">Open Preview</span>
                        <kbd className="px-1.5 py-0.5 text-[10px] font-bold bg-surface border border-border text-accent rounded">Ctrl+Shift+P</kbd>
                      </div>
                      <div className="flex items-center justify-between bg-bg/80 border border-border/80 px-2.5 py-1.5 rounded-lg">
                        <span className="text-muted text-[11px]">Lock Vault</span>
                        <kbd className="px-1.5 py-0.5 text-[10px] font-bold bg-surface border border-border text-accent rounded">Ctrl+Shift+L</kbd>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
    }
  };

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden flex flex-col h-full bg-bg">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/70 text-accent font-sans shrink-0 bg-surface/20">
        <div className="flex items-center gap-2.5">
          {!isWide && mobileView === 'detail' ? (
            <button
              type="button"
              onClick={() => setMobileView('list')}
              className="flex items-center gap-1.5 h-full py-1 text-muted hover:text-text rounded-md hover:bg-surface transition-colors cursor-pointer"
              aria-label="Back to Settings categories"
            >
              <ChevronLeft size={18} className="shrink-0" />
              <span className="text-xs font-semibold leading-none">Categories</span>
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <LaideLogo size={18} className="shrink-0 rounded-xs shadow-xs" />
              <h2 className="text-sm font-semibold text-text">Settings</h2>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area: Responsive Layout */}
      <div className="flex-1 overflow-hidden flex relative">
        {isWide ? (
          /* Persistent Two-Column Layout (>= 700px) */
          <div className="flex w-full h-full divide-x divide-border/60" data-testid="settings-wide-layout">
            {/* Left Rail (~200px) */}
            <div className="w-52 shrink-0 overflow-y-auto p-3 flex flex-col justify-between bg-surface/20" data-testid="settings-category-rail">
              <div className="flex flex-col gap-1">
                <span className="px-2.5 py-1 text-[10px] font-mono text-muted uppercase tracking-wider">
                  Categories
                </span>
                {SETTINGS_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isActive = activeCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActiveCategory(cat.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full px-3 py-2.5 rounded-lg text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                        isActive
                          ? 'bg-accent/15 border border-accent/30 text-accent font-semibold shadow-xs'
                          : 'text-muted hover:text-text hover:bg-surface/50 border border-transparent'
                      }`}
                    >
                      <Icon size={16} className={isActive ? 'text-accent' : 'text-muted'} />
                      <span className="text-xs truncate">{cat.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Brand Footer in Sidebar */}
              <div className="mt-4 pt-3 border-t border-border/50 px-1 flex items-center gap-2">
                <LaideLogo size={16} className="rounded-xs shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-mono font-bold text-text">LAIDE Studio</span>
                  <span className="text-[9px] font-mono text-muted">Local-First Sandbox</span>
                </div>
              </div>
            </div>

            {/* Right Main Pane */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4 min-w-0" data-testid="settings-category-pane">
              {renderCategoryContent(activeCategory)}
            </div>
          </div>
        ) : (
          /* Single-Column Drill-Down (< 700px) */
          <div className="w-full h-full overflow-hidden relative" data-testid="settings-narrow-layout">
            {mobileView === 'list' ? (
              /* Category List View */
              <div className="h-full overflow-y-auto p-4 flex flex-col gap-2.5" data-testid="settings-category-list">
                <p className="text-xs text-muted font-sans mb-1.5 px-0.5">
                  Select a settings category to configure preferences and integrations:
                </p>
                {SETTINGS_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleSelectCategory(cat.id)}
                      className="w-full p-3.5 rounded-xl border border-border bg-surface/40 hover:bg-surface hover:border-accent/40 text-left flex items-center justify-between gap-3 transition-all cursor-pointer group shadow-2xs"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-lg bg-surface-elevated border border-border flex items-center justify-center text-accent group-hover:scale-105 transition-transform shrink-0">
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-xs font-semibold text-text tracking-tight group-hover:text-accent transition-colors">
                            {cat.label}
                          </h3>
                          <p className="text-[11px] text-muted mt-0.5 font-sans leading-snug break-words">
                            {cat.description}
                          </p>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-muted group-hover:text-accent shrink-0 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Category Detail View */
              <div className="h-full overflow-y-auto p-4 flex flex-col gap-4 animate-in slide-in-from-right duration-200" data-testid="settings-category-detail">
                {renderCategoryContent(activeCategory)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lock Vault Confirmation Modal */}
      {showLockConfirmModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-bg border border-oxide/40 rounded-xl max-w-sm w-full p-5 shadow-2xl flex flex-col gap-4 font-sans text-left">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5 text-oxide">
                <div className="p-2 bg-oxide/10 border border-oxide/30 rounded-lg">
                  <Lock size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text">Lock Vault?</h3>
                  <p className="text-[10px] text-oxide font-semibold">Pending Patches Unreviewed</p>
                </div>
              </div>
              <button
                onClick={() => setShowLockConfirmModal(false)}
                className="text-muted hover:text-text p-1 cursor-pointer transition-colors"
                aria-label="Cancel"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 text-xs text-muted leading-relaxed border-y border-border py-3">
              <p>
                You have <span className="text-text font-bold">{pendingPatches.length} pending patch{pendingPatches.length > 1 ? 'es' : ''}</span> waiting for review.
              </p>
              <p className="text-[11px] text-text/90">
                Locking the vault will not lose your local workspace files, but you will need to re-unlock the vault to continue reviewing pending patches.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setShowLockConfirmModal(false)}
                className="px-3 py-1.5 bg-surface border border-border hover:bg-black/5 text-text rounded text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowLockConfirmModal(false);
                  performLock();
                }}
                className="px-3 py-1.5 bg-oxide hover:bg-oxide/90 text-white font-bold text-xs rounded transition-colors flex items-center gap-1.5 cursor-pointer shadow"
              >
                <Lock size={13} />
                <span>Lock Vault</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backup Restore Confirmation Modal */}
      {importValidation && importValidation.summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-surface border border-white/15 rounded-lg p-5 sm:p-6 w-full max-w-md shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2.5 text-accent">
              <FileJson size={20} />
              <h3 className="text-sm font-sans font-bold text-text">Restore Encrypted Backup</h3>
            </div>

            <div className="bg-bg/80 border border-border rounded p-3 font-sans text-xs space-y-2">
              <div className="text-muted text-[10px]">Backup Contents:</div>
              <div className="flex justify-between text-muted">
                <span>Projects:</span>
                <span className="font-bold text-text">{importValidation.summary.projectCount}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Total Files:</span>
                <span className="font-bold text-text">{importValidation.summary.fileCount}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Connection Profiles:</span>
                <span className="font-bold text-text">{importValidation.summary.profileCount}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Snapshots:</span>
                <span className="font-bold text-text">{importValidation.summary.snapshotCount}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Exported Date:</span>
                <span className="text-muted">{new Date(importValidation.summary.exportedAt).toLocaleDateString()}</span>
              </div>
            </div>

            <p className="text-xs text-muted leading-relaxed font-sans">
              Restoring will import and merge these records into your IndexedDB database. Existing projects with identical IDs will be updated.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setImportValidation(null)}
                disabled={importingBackup}
                className="px-3 py-2 text-xs font-sans text-muted hover:text-text transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={importingBackup}
                className="px-4 py-2 bg-accent text-surface font-sans font-bold text-xs rounded hover:bg-accent/90 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {importingBackup ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                <span>{importingBackup ? 'Restoring...' : 'Confirm Restore'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
