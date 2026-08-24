import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, Plus, Save, Trash2, ShieldCheck, ShieldAlert, Activity, CheckCircle2, 
  ChevronDown, Check, X, Sparkles, RefreshCw, MessageSquareCode, RotateCcw,
  Download, Upload, HardDrive, FileJson, AlertTriangle, Layers, Lock, Moon, Sun, Palette, Keyboard,
  Database, Cpu, ExternalLink, GitMerge, ToggleLeft, ToggleRight
} from 'lucide-react';
import { db, type ConnectionProfile } from '../db';
import { useAppStore } from '../store';
import { AnthropicProvider } from '../services/llm/providers/anthropic';
import { OpenAIProvider } from '../services/llm/providers/openai';
import { GoogleProvider } from '../services/llm/providers/google';
import { OpenAICompatibleProvider } from '../services/llm/providers/openaiCompatible';
import type { LLMAdapter } from '../services/llm/llmAdapter';
import { 
  fetchAvailableModels, 
  type DiscoveredModel,
  getModelContextWindow,
  formatContextWindow
} from '../services/llm/modelDiscovery';
import { 
  createEncryptedBackup, 
  downloadBackupFile, 
  validateBackupFile, 
  restoreBackup, 
  type BackupValidationResult 
} from '../services/backup';

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
    ensembleModeEnabled,
    setEnsembleModeEnabled,
    ensembleCandidateBProfileId,
    setEnsembleCandidateBProfileId
  } = useAppStore();
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [showLockConfirmModal, setShowLockConfirmModal] = useState(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [provider, setProvider] = useState('anthropic');
  const [isProviderSheetOpen, setIsProviderSheetOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const [testStatus, setTestStatus] = useState<{ id: string, loading: boolean, success?: boolean, error?: string } | null>(null);

  const [githubPatInput, setGithubPatInput] = useState('');
  const [githubPatSaved, setGithubPatSaved] = useState(false);

  const [mcpServerUrlInput, setMcpServerUrlInput] = useState('');
  const [mcpServersSaved, setMcpServersSaved] = useState(false);

  const {
    mcpServers,
    setMcpServers
  } = useAppStore();

  const handleAddMcpServer = async (e: React.FormEvent) => {
    e.preventDefault();
    const { encryptData } = await import('../services/crypto');
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
        const { encryptData } = await import('../services/crypto');
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
      const { getDependencyCacheInfo } = await import('../services/bundler/bundler');
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
        const { getDependencyCacheInfo } = await import('../services/bundler/bundler');
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

  // Load GitHub PAT
  useEffect(() => {
    let active = true;
    async function loadGithub() {
      const { decryptData } = await import('../services/crypto');
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
    }
    loadGithub();
    return () => {
      active = false;
    };
  }, [keys]);

  const handleClearDepCache = async () => {
    try {
      setClearingCache(true);
      const { clearDependencyCache } = await import('../services/bundler/bundler');
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
        const { decryptData } = await import('../services/crypto');
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
      const { encryptData } = await import('../services/crypto');
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
      const { decryptData } = await import('../services/crypto');
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
    } catch (err: any) {
      setTestStatus({ id: p.id, loading: false, success: false, error: err.message });
    }
  };

  const handleExportBackup = async () => {
    try {
      setExportingBackup(true);
      const backup = await createEncryptedBackup();
      downloadBackupFile(backup);
      setBackupExportSuccess(true);
      setTimeout(() => setBackupExportSuccess(false), 2500);
    } catch (err: any) {
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
    } catch (err: any) {
      setImportError(`Restore failed: ${err.message}`);
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

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 text-accent font-sans">
        <div className="flex items-center gap-3">
          <Settings size={20} />
          <h2>Settings & Providers</h2>
        </div>
        <button
          onClick={handleLockClick}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-surface border border-border hover:border-oxide/50 hover:bg-oxide/10 text-muted hover:text-oxide rounded text-xs font-sans transition-colors cursor-pointer"
          title="Lock Vault"
          aria-label="Lock Vault"
        >
          <Lock size={12} className="shrink-0" />
          <span>Lock Vault</span>
        </button>
      </div>

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
      
      {/* Workspace Theme & Appearance Selector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette size={16} className="text-accent" />
            <h3 className="text-sm font-mono font-bold text-text">Workspace Theme</h3>
          </div>
          <span className="font-mono text-[10px] text-muted tracking-tight uppercase">
            ACTIVE: <span className="text-accent font-bold">{theme === 'oled' ? 'OLED (Vault)' : 'Paper (Blueprint)'}</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* OLED / Vault Theme Card */}
          <button
            type="button"
            onClick={() => setTheme('oled')}
            aria-pressed={theme === 'oled'}
            className={`flex flex-col p-3 rounded-lg border text-left transition-all cursor-pointer relative overflow-hidden ${
              theme === 'oled'
                ? 'border-accent bg-[#0D0D10] text-[#F2F0EA] shadow-sm'
                : 'border-border bg-surface/50 text-muted hover:border-accent/40'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-2">
              <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-[#F2F0EA]">
                <Moon size={14} className="text-accent" />
                <span>OLED / Vault</span>
              </div>
              {theme === 'oled' && (
                <div className="w-4 h-4 rounded-full bg-accent text-accent-text-on flex items-center justify-center">
                  <Check size={10} strokeWidth={3} />
                </div>
              )}
            </div>

            <p className="text-[11px] leading-relaxed mb-3 text-[#8A8A8F] font-sans">
              True black instrument panel styling. High contrast amber accents, zero glare, optimized for battery life.
            </p>

            {/* Visual Mini Swatch */}
            <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-[#232326]">
              <div className="w-3.5 h-3.5 rounded-sm bg-[#000000] border border-[#232326]" title="Base #000000" />
              <div className="w-3.5 h-3.5 rounded-sm bg-[#0D0D10] border border-[#232326]" title="Surface #0D0D10" />
              <div className="w-3.5 h-3.5 rounded-sm bg-[#E8A33D]" title="Accent #E8A33D" />
              <div className="w-3.5 h-3.5 rounded-sm bg-[#F2F0EA]" title="Ink #F2F0EA" />
              <span className="font-mono text-[9px] text-[#8A8A8F] ml-auto">TRUE BLACK</span>
            </div>
          </button>

          {/* Paper / Blueprint Theme Card */}
          <button
            type="button"
            onClick={() => setTheme('paper')}
            aria-pressed={theme === 'paper'}
            className={`flex flex-col p-3 rounded-lg border text-left transition-all cursor-pointer relative overflow-hidden corner-ticks ${
              theme === 'paper'
                ? 'border-accent bg-[#F7F9FB] text-[#1F2E3D] shadow-sm'
                : 'border-border bg-surface/50 text-muted hover:border-accent/40'
            }`}
          >
            <div className="flex items-center justify-between w-full mb-2">
              <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-[#1F2E3D]">
                <Sun size={14} className="text-accent" />
                <span>Paper / Blueprint</span>
              </div>
              {theme === 'paper' && (
                <div className="w-4 h-4 rounded-full bg-accent text-accent-text-on flex items-center justify-center">
                  <Check size={10} strokeWidth={3} />
                </div>
              )}
            </div>

            <p className="text-[11px] leading-relaxed mb-3 text-[#5C6B78] font-sans">
              Drafting-table pale blueprint styling with paper grain texture, ink lines, and corner registration marks.
            </p>

            {/* Visual Mini Swatch */}
            <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-[#B7C4CE]">
              <div className="w-3.5 h-3.5 rounded-sm bg-[#EDF1F5] border border-[#B7C4CE]" title="Base #EDF1F5" />
              <div className="w-3.5 h-3.5 rounded-sm bg-[#F7F9FB] border border-[#B7C4CE]" title="Surface #F7F9FB" />
              <div className="w-3.5 h-3.5 rounded-sm bg-[#E8A33D]" title="Accent #E8A33D" />
              <div className="w-3.5 h-3.5 rounded-sm bg-[#1F2E3D]" title="Ink #1F2E3D" />
              <span className="font-mono text-[9px] text-[#5C6B78] ml-auto">BLUEPRINT</span>
            </div>
          </button>
        </div>
        <p className="text-[10px] text-muted font-sans flex items-center justify-between px-1">
          <span>Theme preference persists in local browser storage.</span>
          <code className="font-mono text-[9px] bg-surface px-1 py-0.5 rounded border border-border">laide_theme_preference</code>
        </p>
      </div>

      {/* Profiles List */}
      <div className="space-y-3">
        <h3 className="text-sm font-sans text-muted ">Connection Profiles</h3>
        {profiles.length === 0 ? (
          <div className="border border-dashed border-accent/30 bg-surface/30 rounded-lg p-5 text-center flex flex-col items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-bg border border-accent/30 flex items-center justify-center text-accent">
              <Sparkles size={18} />
            </div>
            <div>
              <h4 className="text-xs font-sans font-bold  text-text ">
                No Connection Profiles Configured
              </h4>
              <p className="text-xs font-sans text-muted mt-1 max-w-sm leading-relaxed">
                Connect an AI model to power chat, code generation, and patch review. Choose a provider below, enter your API key, and tap Add Profile.
              </p>
            </div>
          </div>
        ) : (
          profiles.map(p => (
            <div key={p.id} className={`border p-4 rounded flex flex-col gap-3 transition-colors ${activeProfileId === p.id ? 'border-moss bg-moss/5' : 'border-surface bg-surface/30'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-sans text-text text-sm">{p.label}</span>
                  {activeProfileId === p.id && (
                    <span className="text-[10px] bg-moss/20 text-moss px-2 py-0.5 rounded font-sans ">Default</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {activeProfileId !== p.id && (
                    <button onClick={() => handleSetDefault(p.id)} className="text-xs text-muted hover:text-text transition-colors">
                      Set Default
                    </button>
                  )}
                  <button onClick={() => handleEdit(p)} className="text-xs text-accent hover:text-accent/80 transition-colors">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(p.id)} className="text-xs text-oxide hover:text-oxide/80 transition-colors">
                    Delete
                  </button>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-sans text-muted">
                <span>Provider: {p.provider}</span>
                <span>Model: {p.model} ({formatContextWindow(getModelContextWindow(p.provider, p.model))} ctx)</span>
                <span className="flex items-center gap-1"><ShieldCheck size={12} className="text-moss" /> Encrypted Key</span>
              </div>
              
              <div className="flex items-center justify-between mt-2 pt-3 border-t border-border">
                <button 
                  onClick={() => handleTest(p)}
                  disabled={testStatus?.id === p.id && testStatus.loading}
                  title="Note: A successful test verifies basic connectivity but does not guarantee streaming or function-calling (tools) support required by the agent."
                  className="text-xs flex items-center gap-1.5 bg-surface hover:bg-surface/80 text-text px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                >
                  <Activity size={12} />
                  {testStatus?.id === p.id && testStatus.loading ? 'Testing...' : 'Test Connection'}
                </button>
                
                {testStatus?.id === p.id && !testStatus.loading && (
                  <div className={`text-xs flex items-center gap-1 ${testStatus.success ? 'text-moss' : 'text-oxide'}`}>
                    {testStatus.success ? (
                      <><CheckCircle2 size={12} /> Connection OK</>
                    ) : (
                      <><ShieldAlert size={12} /> {testStatus.error}</>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit Form */}
      <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-sans text-accent ">{editingId ? 'Edit Profile' : 'Add New Profile'}</h3>
          {editingId && (
            <button onClick={resetForm} className="text-xs text-muted hover:text-text">Cancel Edit</button>
          )}
        </div>
        
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-sans text-muted  mb-1">Provider</label>
              <button
                type="button"
                onClick={() => setIsProviderSheetOpen(true)}
                className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-sm focus:border-accent focus:outline-none flex items-center justify-between text-left hover:border-border transition-colors cursor-pointer"
              >
                <span className="truncate">
                  {PROVIDERS.find(p => p.id === provider)?.label || provider}
                </span>
                <ChevronDown size={16} className="text-muted shrink-0 ml-2" />
              </button>
            </div>
            
            <div>
              <label className="block text-xs font-sans text-muted  mb-1">Profile Label</label>
              <input 
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="e.g. Work Claude"
                required
                className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-sm focus:border-accent focus:outline-none"
              />
            </div>
          </div>
          
          {(provider === 'openai-compatible' || provider === 'openrouter') && (
            <div>
              <label className="block text-xs font-sans text-muted  mb-1">Base URL</label>
              <input 
                type="url"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder="https://openrouter.ai/api/v1"
                required
                className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-sm focus:border-accent focus:outline-none"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="relative" ref={modelDropdownRef}>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-sans text-muted ">Model Name</label>
                {discoveredModels.length > 0 && (
                  <span className="text-[10px] font-sans text-moss flex items-center gap-1">
                    <Sparkles size={10} /> {discoveredModels.length} models found
                  </span>
                )}
              </div>
              <div className="relative flex items-center">
                <input 
                  type="text"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  placeholder={`e.g. ${DEFAULT_MODELS[provider] || 'gpt-4'}`}
                  required
                  className="w-full bg-bg border border-border rounded px-3 py-2 pr-8 text-text font-sans text-sm focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                  disabled={loadingModels || (discoveredModels.length === 0 && !apiKey && provider !== 'openai-compatible' && provider !== 'openrouter')}
                  title="Select from available models"
                  aria-label="Toggle available models list"
                  className="absolute right-2 text-muted hover:text-accent disabled:opacity-30 cursor-pointer p-1 transition-colors"
                >
                  {loadingModels ? (
                    <RefreshCw size={14} className="animate-spin text-accent" />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </button>
              </div>

              {/* Dynamic Model Dropdown */}
              {showModelDropdown && discoveredModels.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-surface border border-white/15 rounded-md shadow-xl max-h-56 overflow-y-auto p-1 font-sans text-xs">
                  <div className="px-2 py-1 text-[10px]   text-muted border-b border-border font-semibold flex items-center justify-between">
                    <span>Live Provider Models</span>
                    <span className="text-moss">✓ Connected</span>
                  </div>
                  {discoveredModels.map(m => {
                    const isSelected = model === m.id;
                    const ctx = m.contextWindow || getModelContextWindow(provider, m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setModel(m.id);
                          setShowModelDropdown(false);
                        }}
                        className={`w-full px-2.5 py-1.5 rounded text-left flex items-center justify-between transition-colors cursor-pointer ${
                          isSelected ? 'bg-accent/20 text-accent font-bold' : 'text-muted hover:bg-black/5 hover:text-text'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="truncate">{m.id}</span>
                            <span className="text-[10px] text-muted shrink-0 font-normal">
                              ({formatContextWindow(ctx)})
                            </span>
                          </div>
                          {m.name && m.name !== m.id && (
                            <div className="text-[10px] text-muted truncate">{m.name}</div>
                          )}
                        </div>
                        {isSelected && <Check size={12} className="shrink-0 text-accent" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            
            <div>
              <label className="block text-xs font-sans text-muted  mb-1">
                API Key {editingId && '(Leave blank to keep existing)'}
              </label>
              <input 
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={API_KEY_HINTS[provider] || 'sk-...'}
                required={!editingId}
                className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-sm focus:border-accent focus:outline-none"
              />
            </div>
          </div>
          
          <button 
            type="submit"
            className="w-full mt-2 py-2.5 bg-accent text-surface font-sans font-bold rounded flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors"
          >
            {editingId ? <Save size={16} /> : <Plus size={16} />}
            {editingId ? 'Save Profile' : 'Add Profile'}
          </button>
        </form>
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
            <h3 className="text-sm font-sans  font-bold ">Custom Instructions</h3>
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
              className="w-full bg-bg border border-border rounded px-3 py-2.5 text-text font-sans text-xs focus:border-accent focus:outline-none placeholder:text-muted leading-relaxed resize-y min-h-[90px]"
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

      {/* GitHub Integration Form */}
      <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-sans text-accent ">GitHub Integration</h3>
        </div>
        
        <form onSubmit={async (e) => {
          e.preventDefault();
          const { encryptData } = await import('../services/crypto');
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
            <label className="block text-xs font-sans text-muted  mb-1">
              Personal Access Token
            </label>
            <input 
              type="password"
              value={githubPatInput}
              onChange={e => setGithubPatInput(e.target.value)}
              placeholder="ghp_..."
              className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-sm focus:border-accent focus:outline-none"
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

      {/* MCP Servers Integration */}
      <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-sans text-accent ">Model Context Protocol (MCP) Servers</h3>
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
              className="w-full bg-bg border border-border rounded px-3 py-2 text-text font-sans text-sm focus:border-accent focus:outline-none"
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

      {/* Encrypted Vault Backup & Restore */}
      <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded">
        <div className="flex items-center gap-2 text-accent mb-2">
          <HardDrive size={18} />
          <h3 className="text-sm font-sans  font-bold ">Encrypted Vault Backup</h3>
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
      </div>

      {/* Compiler Dependency Cache */}
      <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-accent">
            <Layers size={18} />
            <h3 className="text-sm font-sans  font-bold ">Dependency Cache</h3>
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

      {/* Keyboard Shortcuts Reference */}
      <div className="bg-surface/50 border border-border p-4 sm:p-5 rounded">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-accent">
            <Keyboard size={18} />
            <h3 className="text-sm font-sans font-bold">Keyboard Shortcuts</h3>
          </div>
          {onOpenShortcuts && (
            <button
              type="button"
              onClick={onOpenShortcuts}
              className="text-[11px] font-sans text-accent hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View All Shortcuts</span>
              <ExternalLink size={11} />
            </button>
          )}
        </div>

        <p className="text-xs text-muted font-sans mb-4 leading-relaxed">
          Speed up your development workflow with global accelerator hotkeys. On macOS, use ⌘ Command instead of Ctrl.
        </p>

        <div className="space-y-2 text-xs font-mono">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="flex items-center justify-between bg-bg border border-border/80 px-2.5 py-1.5 rounded">
              <span className="text-muted text-[11px]">Toggle Files tab</span>
              <kbd className="px-1.5 py-0.5 text-[10px] font-bold bg-surface border border-border text-accent rounded">Ctrl+B</kbd>
            </div>
            <div className="flex items-center justify-between bg-bg border border-border/80 px-2.5 py-1.5 rounded">
              <span className="text-muted text-[11px]">Toggle Terminal</span>
              <kbd className="px-1.5 py-0.5 text-[10px] font-bold bg-surface border border-border text-accent rounded">Ctrl+`</kbd>
            </div>
            <div className="flex items-center justify-between bg-bg border border-border/80 px-2.5 py-1.5 rounded">
              <span className="text-muted text-[11px]">Quick Open & Search</span>
              <kbd className="px-1.5 py-0.5 text-[10px] font-bold bg-surface border border-border text-accent rounded">Ctrl+P</kbd>
            </div>
            <div className="flex items-center justify-between bg-bg border border-border/80 px-2.5 py-1.5 rounded">
              <span className="text-muted text-[11px]">Find in File</span>
              <kbd className="px-1.5 py-0.5 text-[10px] font-bold bg-surface border border-border text-accent rounded">Ctrl+F</kbd>
            </div>
            <div className="flex items-center justify-between bg-bg border border-border/80 px-2.5 py-1.5 rounded">
              <span className="text-muted text-[11px]">Open Preview</span>
              <kbd className="px-1.5 py-0.5 text-[10px] font-bold bg-surface border border-border text-accent rounded">Ctrl+Shift+P</kbd>
            </div>
            <div className="flex items-center justify-between bg-bg border border-border/80 px-2.5 py-1.5 rounded">
              <span className="text-muted text-[11px]">Lock Vault</span>
              <kbd className="px-1.5 py-0.5 text-[10px] font-bold bg-surface border border-border text-accent rounded">Ctrl+Shift+L</kbd>
            </div>
          </div>
        </div>
      </div>

      {/* Backup Restore Confirmation Modal */}
      {importValidation && importValidation.summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-surface border border-white/15 rounded-lg p-5 sm:p-6 w-full max-w-md shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2.5 text-accent">
              <FileJson size={20} />
              <h3 className="text-sm font-sans font-bold   text-text">Restore Encrypted Backup</h3>
            </div>

            <div className="bg-bg/80 border border-border rounded p-3 font-sans text-xs space-y-2">
              <div className="text-muted  text-[10px]">Backup Contents:</div>
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
                className="px-3 py-2 text-xs font-sans  text-muted hover:text-text transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={importingBackup}
                className="px-4 py-2 bg-accent text-surface font-sans font-bold text-xs  rounded hover:bg-accent/90 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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

      {/* Provider Selector Swipe-Up Sheet */}
      {isProviderSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
            onClick={() => setIsProviderSheetOpen(false)}
          />
          
          {/* Sheet */}
          <div className="relative z-10 w-full max-w-lg mx-auto bg-surface border-t border-border shadow-2xl rounded-t-2xl overflow-hidden transition-all duration-300 animate-in slide-in-from-bottom flex flex-col max-h-[80vh]">
            {/* Grab handle */}
            <div 
              className="pt-3 pb-1 flex justify-center cursor-pointer"
              onClick={() => setIsProviderSheetOpen(false)}
            >
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>

            {/* Sheet Header */}
            <div className="h-12 flex items-center justify-between px-5 border-b border-border shrink-0">
              <span className="font-sans text-sm text-accent font-bold  ">
                Select Provider
              </span>
              <button 
                type="button"
                onClick={() => setIsProviderSheetOpen(false)}
                aria-label="Close provider selection"
                className="p-1 text-muted hover:text-text rounded transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Provider Options */}
            <div className="p-4 space-y-2.5 overflow-y-auto">
              {PROVIDERS.map((opt) => {
                const isSelected = provider === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setProvider(opt.id);
                      setModel(DEFAULT_MODELS[opt.id] || '');
                      if (opt.id === 'openrouter') {
                        setBaseUrl('https://openrouter.ai/api/v1');
                      } else if (opt.id !== 'openai-compatible') {
                        setBaseUrl('');
                      }
                      setIsProviderSheetOpen(false);
                    }}
                    className={`w-full p-3.5 rounded-lg border font-sans text-sm text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-accent/15 border-accent text-accent font-bold shadow-xs'
                        : 'bg-bg/60 border-border text-muted hover:bg-black/5 hover:text-text hover:border-white/15'
                    }`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className={isSelected ? 'text-accent font-semibold' : 'text-text'}>{opt.label}</span>
                      <span className="text-[11px] text-muted font-normal">
                        {opt.id === 'anthropic' && 'Claude models'}
                        {opt.id === 'openai' && 'GPT models'}
                        {opt.id === 'google' && 'Gemini models'}
                        {opt.id === 'openrouter' && '400+ models via OpenRouter'}
                        {opt.id === 'openai-compatible' && 'Local & custom endpoints'}
                      </span>
                    </div>
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-accent shrink-0 ml-3">
                        <Check size={14} className="stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
